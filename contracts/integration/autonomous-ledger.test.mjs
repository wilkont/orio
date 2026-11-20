import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from '../../services/control-foundation/node_modules/pg/lib/index.js';
import {bytesToHex} from '@ethereumjs/util';
import {autonomousFixture,ok,hash} from '../test/helpers/autonomous-fixture.mjs';
import {autonomousWallet} from '../sdk/autonomous-wallet.mjs';
import {AutonomousSettlement} from '../../services/control-foundation/src/autonomous-settlement.ts';
import {ControlLedger} from '../../services/control-foundation/src/ledger.ts';
import {gasDigest} from '../../services/control-foundation/src/gas-policy.ts';
import {autonomousTopics} from '../../services/control-foundation/src/finalized-autonomous.ts';
const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/orio_test')throw Error('Use isolated local PostgreSQL');
test('actual autonomous checkpoints, funded claims and later payouts reconcile atomically without double booking or receipt reuse',async()=>{
 const root=new pg.Pool({connectionString:url.href}),name='orio_test_aut_'+randomUUID().replaceAll('-',''),runtime=name+'_rt';
 let pool,created=false;
 try{
  await root.query('CREATE DATABASE '+name);created=true;const db=new URL(url);db.pathname='/'+name;pool=new pg.Pool({connectionString:db.href});
  const migrations=new URL('../../services/control-foundation/migrations/',import.meta.url);
  for(const file of(await readdir(migrations)).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await pool.query((await readFile(new URL(file,migrations),'utf8')).replaceAll('orio_ledger_runtime',runtime));
  await pool.query(await readFile(new URL('../../services/control-foundation/pending-migrations/022_autonomous_settlement.sql',import.meta.url),'utf8'));
  const f=await autonomousFixture(),wallet=autonomousWallet(f.configuration),ledger=new ControlLedger(pool);
  let current,secondMutation=false,height=0n;
  const source=sourceId=>({sourceId,request:async method=>{
   if(method==='eth_chainId')return '0x14a34';
   if(method==='eth_getTransactionReceipt'){
    const r=structuredClone(current);if(secondMutation&&sourceId==='second')r.logs.find(l=>l.topics[0]===autonomousTopics.credit).data='0x'+'0'.repeat(63)+'1';return r;
   }
   return {number:current.blockNumber,hash:current.blockHash};
  }});
  const importer=new AutonomousSettlement(pool,source('first'),source('second'),f.configuration);await importer.initialize();await importer.initialize();
  const balance=async label=>(await ledger.balances()).find(a=>a.id==='aut_'+gasDigest([f.configuration.id,`erc20:84532:${f.master.address}`,label]))?.units??'0';
  function receipt(r){
   const blockHash=hash('block-'+ ++height),transactionHash=hash('tx-'+height),blockNumber='0x'+height.toString(16);
   current={status:'0x1',transactionHash,blockHash,blockNumber,logs:r.execResult.logs.map(([address,topics,data],i)=>({address:bytesToHex(address),topics:topics.map(bytesToHex),data:bytesToHex(data),logIndex:'0x'+i.toString(16),transactionHash,blockHash,blockNumber,removed:false}))};
   return {transactionHash,index:String(current.logs.findIndex(l=>l.topics[0]===autonomousTopics.checkpoint))};
  }
  async function execution(r){ok(r);const p=receipt(r);await importer.importExecution(p.transactionHash,p.index);return p;}
  ok(await f.call(f.master,'mintFixture',[f.owner.address,1000000000n]));ok(await f.call(f.master,'approve',[f.vault.address,1000000000n]));
  const purchase=await execution(await f.call(f.controller,'purchase',[hash('genesis'),0,1000000000n,1]));
  assert.equal(await balance('reserve_cash'),'990000000');assert.equal(await balance('company_cash'),'10000000');
  const again=await importer.importExecution(purchase.transactionHash,purchase.index);assert.ok(again);
  assert.equal((await pool.query('SELECT count(*) FROM orio_autonomous.facts')).rows[0].count,'1');
  const origin=(await f.read(f.controller,'origin'))[0];
  async function queue(atoms,nonce){
   const epoch=(await f.read(f.controller,'currentEpochId'))[0],close=origin+epoch*60n;
   const consent=wallet.withdrawal({requestId:hash('request-'+nonce),epochId:String(epoch),owner:f.owner.address,recipient:f.owner.address,atoms:String(atoms),minimumPayout:'1',nonce:String(nonce),deadline:String(close+120n)},
    {origin:String(origin),period:'60',now:String(f.time())});
   ok(await f.call(f.controller,'enqueue',[consent.message,f.owner.signingKey.sign(consent.digest).serialized],f.outsiderKey));f.setTime(close);
  }
  await queue(100n*10n**18n,1);
  const result=await f.call(f.controller,'settleEpoch',[],f.outsiderKey);ok(result);const redeemed=receipt(result);
  secondMutation=true;await assert.rejects(importer.importExecution(redeemed.transactionHash,redeemed.index));secondMutation=false;
  await pool.query("CREATE FUNCTION public.reject_aut_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected autonomous failure'; END $$");
  await pool.query('CREATE TRIGGER reject_aut_journal BEFORE INSERT ON orio_ledger.journals FOR EACH ROW EXECUTE FUNCTION public.reject_aut_journal()');
  await assert.rejects(importer.importExecution(redeemed.transactionHash,redeemed.index),/injected autonomous failure/);
  assert.equal((await pool.query('SELECT version::text FROM orio_autonomous.deployments')).rows[0].version,'1');
  assert.equal((await pool.query('SELECT count(*) FROM orio_autonomous.facts')).rows[0].count,'1');
  await pool.query('DROP TRIGGER reject_aut_journal ON orio_ledger.journals');
  const outcomes=await Promise.all([importer.importExecution(redeemed.transactionHash,redeemed.index),importer.importExecution(redeemed.transactionHash,redeemed.index)]);assert.equal(outcomes[0],outcomes[1]);
  assert.equal(await balance('claim_cash'),'99000000');assert.equal(await balance('claim_due:'+f.owner.address.toLowerCase()),'99000000');
  assert.equal(await balance('reserve_cash'),String((await f.read(f.vault,'reserveUnits'))[0]));
  const claim=await f.call(f.claims,'claimFor',[f.owner.address],f.outsiderKey);ok(claim);receipt(claim);
  const index=String(current.logs.findIndex(l=>l.topics[0]===autonomousTopics.claim));
  await importer.importClaim(current.transactionHash,index);await importer.importClaim(current.transactionHash,index);
  assert.equal(await balance('claim_cash'),'0');assert.equal(await balance('claim_due:'+f.owner.address.toLowerCase()),'0');
  // A second consumer cannot book the already consumed stablecoin payout transfer.
  const cash=current.logs.find(l=>l.topics[0]===autonomousTopics.transfer);
  await assert.rejects(pool.query('INSERT INTO orio_settlement.receipt_claims VALUES($1,$2,$3)',[`eip155:84532/tx:${current.transactionHash}/log:${BigInt(cash.logIndex)}`,'conversion','duplicate']),/duplicate key/);
  await queue((await f.read(f.currency,'totalSupply'))[0],2);await execution(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
  const reference=(await f.read(f.controller,'referencePriceUsd36'))[0];
  await execution(await f.call(f.controller,'reconcileZeroSupply',[],f.outsiderKey));
  assert.equal((await pool.query('SELECT state FROM orio_autonomous.deployments')).rows[0].state.priceUsd36.numerator,String(reference));
  assert.ok(BigInt(await balance('claim_cash'))>0n); // Funded outstanding claims are separate from new-cycle backing.
  const company=(await f.read(f.vault,'companyFees',[f.master.address]))[0];await execution(await f.call(f.controller,'deliverCompanyFees',[company],f.outsiderKey));
  assert.equal(await balance('company_cash'),'0');
  assert.equal((await ledger.verify()).ok,true);await assert.rejects(pool.query('DELETE FROM orio_autonomous.facts'),/append-only/i);
 }finally{
  if(pool)await pool.end();if(created)await root.query('DROP DATABASE '+name+' WITH (FORCE)');
  await root.query('DROP ROLE IF EXISTS '+runtime);await root.end();
 }
});
