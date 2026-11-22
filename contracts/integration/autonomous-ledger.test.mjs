import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from '../../services/control-foundation/node_modules/pg/lib/index.js';
import {bytesToHex} from '@ethereumjs/util';
import {Wallet} from 'ethers';
import {autonomousFixture,ok,hash} from '../test/helpers/autonomous-fixture.mjs';
import {autonomousWallet} from '../sdk/autonomous-wallet.mjs';
import {AutonomousSettlement} from '../../services/control-foundation/src/autonomous-settlement.ts';
import {AutonomousImportWorker} from '../../services/control-foundation/src/autonomous-import-worker.ts';
import {ControlLedger} from '../../services/control-foundation/src/ledger.ts';
import {gasDigest} from '../../services/control-foundation/src/gas-policy.ts';
import {autonomousTopics} from '../../services/control-foundation/src/finalized-autonomous.ts';
const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/orio_test')throw Error('Use isolated local PostgreSQL');
test('actual autonomous checkpoints, funded claims and later payouts reconcile atomically without double booking or receipt reuse',async()=>{
 const root=new pg.Pool({connectionString:url.href}),name='orio_test_aut_'+randomUUID().replaceAll('-',''),runtime=name+'_rt';
 const access=name+'_access',login=name+'_login',password='local-'+randomUUID();
 let pool,scopedPool,created=false;
 try{
  await root.query('CREATE DATABASE '+name);created=true;const db=new URL(url);db.pathname='/'+name;pool=new pg.Pool({connectionString:db.href});
  const migrations=new URL('../../services/control-foundation/migrations/',import.meta.url);
  for(const file of(await readdir(migrations)).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await pool.query((await readFile(new URL(file,migrations),'utf8')).replaceAll('orio_ledger_runtime',runtime));
  await pool.query(await readFile(new URL('../../services/control-foundation/pending-migrations/022_autonomous_settlement.sql',import.meta.url),'utf8'));
  const accessSql=await readFile(new URL('../../services/control-foundation/pending-migrations/023_autonomous_import_access.sql',import.meta.url),'utf8');
  await assert.rejects(pool.query(accessSql),/isolated qualification database/);
  await pool.query('ROLLBACK');
  await pool.query(accessSql.replaceAll('orio_autonomous_import',access).replaceAll('orio_control_qualification',name));
  await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'; GRANT ${access} TO ${login}`);
  const scopedDb=new URL(db);scopedDb.username=login;scopedDb.password=password;
  scopedPool=new pg.Pool({connectionString:scopedDb.href});
  const f=await autonomousFixture(),wallet=autonomousWallet(f.configuration),ledger=new ControlLedger(pool);
  let current,secondMutation=false,badFinal=false,height=0n;const history=[];
  const source=sourceId=>({sourceId,request:async(method,params)=>{
   if(method==='eth_chainId')return '0x14a34';
   if(method==='eth_getLogs'){const q=params[0];return structuredClone(history.flatMap(r=>r.logs).filter(l=>
    BigInt(l.blockNumber)>=BigInt(q.fromBlock)&&BigInt(l.blockNumber)<=BigInt(q.toBlock)&&q.address.includes(l.address)&&q.topics[0].includes(l.topics[0])));}
   if(method==='eth_getTransactionReceipt'){
    const r=structuredClone(history.find(r=>r.transactionHash===params[0]));if(secondMutation&&sourceId==='second')r.logs.find(l=>l.topics[0]===autonomousTopics.credit).data='0x'+'0'.repeat(63)+'1';return r;
   }
   const r=params[0]==='finalized'?current:history.find(r=>r.blockNumber===params[0]);return {number:r.blockNumber,hash:badFinal&&params[0]==='finalized'?hash('wrong-final-anchor'):r.blockHash};
  }});
  const maintenance=new AutonomousSettlement(pool,source('first'),source('second'),f.configuration);
  await maintenance.initialize();await maintenance.initialize();
  const other=new AutonomousSettlement(pool,source('first'),source('second'),{...f.configuration,id:'other-deployment'});
  await other.initialize();
  const importer=new AutonomousSettlement(scopedPool,source('first'),source('second'),f.configuration,'scoped');
  await assert.rejects(importer.initialize(),/cannot initialize/);
  await assert.rejects(importer.cursor(),/Unknown or changed/);
  await pool.query('INSERT INTO orio_autonomous.import_bindings VALUES($1,$2)',[login,f.configuration.id]);
  assert.equal((await scopedPool.query('SELECT id FROM orio_autonomous.deployments')).rows[0].id,f.configuration.id);
  assert.equal((await scopedPool.query("UPDATE orio_autonomous.deployments SET version=1 WHERE id='other-deployment'")).rowCount,0);
  for(const command of [
   "UPDATE orio_autonomous.deployments SET configuration='{}'",
   'DELETE FROM orio_autonomous.facts',
   'SELECT * FROM orio_ledger.balances',
   "SELECT orio_ledger.create_account('foreign','USD','debit',false)",
   'SELECT * FROM orio_autonomous.import_bindings',
   'SELECT * FROM orio_settlement.receipt_claims',
  ])await assert.rejects(scopedPool.query(command),/permission denied/);
  await assert.rejects(scopedPool.query("SELECT orio_autonomous.import_claim('eip155:8453/tx:0x' || repeat('a',64) || '/log:1')"),/outside import scope/);
  await assert.rejects(scopedPool.query("SELECT orio_autonomous.import_account('foreign','USD','backing','credit')"),/outside import scope/);
  await pool.query("SELECT orio_ledger.create_account('foreign','USD','debit',false)");
  const probe=await scopedPool.connect();
  try {
   const ref='eip155:84532/tx:'+hash('permission-probe')+'/log:0';
   await probe.query('BEGIN');
   await probe.query('SELECT orio_autonomous.import_claim($1)',[ref]);
   await assert.rejects(probe.query('SELECT orio_autonomous.import_journal($1,$2::jsonb)',[ref,JSON.stringify([
    {accountId:'foreign',side:'debit',units:'1'},{accountId:'unused',side:'credit',units:'1'}
   ])]),/accounts outside import scope/);
  }finally{
   try{await probe.query('ROLLBACK');}finally{probe.release();}
  }
  const worker=new AutonomousImportWorker(source('first'),source('second'),f.configuration,importer);
  const balance=async label=>(await ledger.balances()).find(a=>a.id==='aut_'+gasDigest([f.configuration.id,`erc20:84532:${f.master.address}`,label]))?.units??'0';
  function receipt(r){
   const blockHash=hash('block-'+ ++height),transactionHash=hash('tx-'+height),blockNumber='0x'+height.toString(16);
   current={status:'0x1',transactionHash,blockHash,blockNumber,logs:r.execResult.logs.map(([address,topics,data],i)=>({address:bytesToHex(address),topics:topics.map(bytesToHex),data:bytesToHex(data),logIndex:'0x'+i.toString(16),transactionHash,blockHash,blockNumber,removed:false}))};
   history.push(structuredClone(current));
   return {transactionHash,index:String(current.logs.findIndex(l=>l.topics[0]===autonomousTopics.checkpoint))};
  }
  async function execution(r){ok(r);const p=receipt(r);assert.equal((await worker.step()).state,'EXECUTION_IMPORTED');return p;}
  ok(await f.call(f.master,'mintFixture',[f.owner.address,1000000000n]));ok(await f.call(f.master,'approve',[f.vault.address,1000000000n]));
  const purchase=await execution(await f.call(f.controller,'purchase',[hash('genesis'),0,1000000000n,1]));
  assert.equal(await balance('reserve_cash'),'990000000');assert.equal(await balance('company_cash'),'10000000');
  const again=await importer.importExecution(purchase.transactionHash,purchase.index);assert.ok(again);
  assert.equal((await pool.query('SELECT count(*) FROM orio_autonomous.facts')).rows[0].count,'1');
  // Intentionally omit a real transfer. The next checkpoint must not overtake it.
  const destination=new Wallet(bytesToHex(f.outsiderKey)).address.toLowerCase();const moved=await f.call(f.currency,'transfer',[destination,10n**18n]);ok(moved);receipt(moved);
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
  await assert.rejects(importer.importExecution(redeemed.transactionHash,redeemed.index),/Missing preceding autonomous event/);
  assert.equal((await pool.query('SELECT version::text FROM orio_autonomous.deployments WHERE id=$1',[f.configuration.id])).rows[0].version,'1');
  assert.equal((await worker.step()).state,'TRANSFER_IMPORTED');
  await pool.query("CREATE FUNCTION public.reject_aut_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected autonomous failure'; END $$");
  await pool.query('CREATE TRIGGER reject_aut_journal BEFORE INSERT ON orio_ledger.journals FOR EACH ROW EXECUTE FUNCTION public.reject_aut_journal()');
  await assert.rejects(worker.step(),/injected autonomous failure/);
  assert.equal((await pool.query('SELECT version::text FROM orio_autonomous.deployments WHERE id=$1',[f.configuration.id])).rows[0].version,'1');
  assert.equal((await pool.query('SELECT count(*) FROM orio_autonomous.facts')).rows[0].count,'2');
  await pool.query('DROP TRIGGER reject_aut_journal ON orio_ledger.journals');
  const outcomes=await Promise.all([importer.importExecution(redeemed.transactionHash,redeemed.index),importer.importExecution(redeemed.transactionHash,redeemed.index)]);assert.equal(outcomes[0],outcomes[1]);
  assert.equal(await balance('claim_cash'),'99000000');assert.equal(await balance('claim_due:'+f.owner.address.toLowerCase()),'99000000');
  assert.equal(await balance('reserve_cash'),String((await f.read(f.vault,'reserveUnits'))[0]));
  const claim=await f.call(f.claims,'claimFor',[f.owner.address],f.outsiderKey);ok(claim);receipt(claim);
  const index=String(current.logs.findIndex(l=>l.topics[0]===autonomousTopics.claim));
  assert.equal((await worker.step()).state,'CLAIM_IMPORTED');await importer.importClaim(current.transactionHash,index);
  assert.equal(await balance('claim_cash'),'0');assert.equal(await balance('claim_due:'+f.owner.address.toLowerCase()),'0');
  // A second consumer cannot book the already consumed stablecoin payout transfer.
  const cash=current.logs.find(l=>l.topics[0]===autonomousTopics.transfer);
  await assert.rejects(pool.query('INSERT INTO orio_settlement.receipt_claims VALUES($1,$2,$3)',[`eip155:84532/tx:${current.transactionHash}/log:${BigInt(cash.logIndex)}`,'conversion','duplicate']),/duplicate key/);
  const returned=await f.call(f.currency,'transfer',[f.owner.address,10n**18n],f.outsiderKey);ok(returned);
  receipt(returned);
  assert.equal((await worker.step()).state,'TRANSFER_IMPORTED');
  const epoch = (await f.read(f.controller,'currentEpochId'))[0];
  const close = origin + epoch * 60n;
  for (let i = 0; i < 64; i++) {
   const holder = new Wallet('0x'+BigInt(1000+i).toString(16).padStart(64,'0'));
   const recipient = new Wallet('0x'+BigInt(2000+i).toString(16).padStart(64,'0')).address;
   const transfer = await f.call(f.currency,'transfer',[holder.address,10n**18n]);
   ok(transfer); receipt(transfer);
   assert.equal((await worker.step()).state,'TRANSFER_IMPORTED');
   const request = {requestId:hash('full-epoch-'+i),epochId:epoch,owner:holder.address,recipient,
    atoms:10n**18n,minimumPayout:1n,nonce:1n,deadline:close+120n};
   const digest = (await f.read(f.controller,'withdrawalHash',[request]))[0];
   ok(await f.call(f.controller,'enqueue',[request,holder.signingKey.sign(digest).serialized],f.outsiderKey));
  }
  f.setTime(close);
  const full = await f.call(f.controller,'settleEpoch',[],f.outsiderKey);
  ok(full);
  const split = receipt(full);
  const ref = `eip155:84532/tx:${split.transactionHash}/log:${split.index}`;
  await pool.query("CREATE FUNCTION public.reject_split() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_ref LIKE '%/part:2' THEN RAISE EXCEPTION 'second journal failed'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER reject_split BEFORE INSERT ON orio_ledger.journals FOR EACH ROW EXECUTE FUNCTION public.reject_split()');
  await assert.rejects(worker.step(),/second journal failed/);
  assert.equal((await pool.query('SELECT 1 FROM orio_ledger.journals WHERE external_ref=$1',[ref])).rowCount,0);
  assert.equal((await pool.query('SELECT 1 FROM orio_settlement.receipt_claims WHERE external_ref=$1',[ref])).rowCount,0);
  await pool.query('DROP TRIGGER reject_split ON orio_ledger.journals');
  assert.equal((await worker.step()).state,'EXECUTION_IMPORTED');
  const primary = await importer.importExecution(split.transactionHash,split.index);
  const parts = (await pool.query('SELECT sequence::text, jsonb_array_length(account_snapshot) AS postings FROM orio_ledger.journals WHERE external_ref=$1 OR starts_with(external_ref,$2) ORDER BY sequence',
   [ref,ref+'/part:'])).rows;
  assert.equal(parts[0].sequence,primary);
  assert.ok(parts.length>=2 && parts.every(p=>p.postings<=128));
  assert.ok(parts.reduce((total,p)=>total+p.postings,0)>128);
  assert.equal(await balance('claim_cash'),String((await f.read(f.claims,'totalOwed'))[0]));
  await queue((await f.read(f.currency,'totalSupply'))[0],2);await execution(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
  const reference=(await f.read(f.controller,'referencePriceUsd36'))[0];
  await execution(await f.call(f.controller,'reconcileZeroSupply',[],f.outsiderKey));
  assert.equal((await pool.query('SELECT state FROM orio_autonomous.deployments WHERE id=$1',[f.configuration.id])).rows[0].state.priceUsd36.numerator,String(reference));
  assert.ok(BigInt(await balance('claim_cash'))>0n); // Funded outstanding claims are separate from new-cycle backing.
  const company=(await f.read(f.vault,'companyFees',[f.master.address]))[0];await execution(await f.call(f.controller,'deliverCompanyFees',[company],f.outsiderKey));
  assert.equal(await balance('company_cash'),'0');
  const journals=(await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count;
  badFinal=true;await assert.rejects(importer.advanceEmptyHistory(String(BigInt(current.blockNumber))),/History block mismatch/);badFinal=false;
  await importer.advanceEmptyHistory(String(BigInt(current.blockNumber)));await importer.advanceEmptyHistory(String(BigInt(current.blockNumber)));
  assert.equal((await worker.step()).state,'WAITING');
  assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count,journals);
  assert.equal((await ledger.verify()).ok,true);await assert.rejects(pool.query('DELETE FROM orio_autonomous.facts'),/append-only/i);
 }finally{
  if(scopedPool)await scopedPool.end();if(pool)await pool.end();if(created)await root.query('DROP DATABASE '+name+' WITH (FORCE)');
  await root.query('DROP ROLE IF EXISTS '+login+','+access);
  await root.query('DROP ROLE IF EXISTS '+runtime);await root.end();
 }
});
