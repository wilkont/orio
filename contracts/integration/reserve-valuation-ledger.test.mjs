import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {keccak256} from 'ethers';
import {bytesToHex,createAddressFromString} from '@ethereumjs/util';
import {ValuationSigningJournal} from '../../services/control-foundation/src/valuation-signing-journal.ts';
import {MonetarySettlement} from '../../services/control-foundation/src/monetary-settlement.ts';
import {ControlLedger} from '../../services/control-foundation/src/ledger.ts';
import {prepareReserveValuation} from '../sdk/reserve-valuation.mjs';
import {observeReserve} from '../sdk/reserve-observer.mjs';
import {signCommittedReserveValuation} from '../sdk/aws-kms-valuation-signer.mjs';
import {reserveFixture} from '../test/helpers/reserve-valuation-fixture.mjs';
import {kmsFixtureClient,fixtureKeyArn} from '../test/helpers/kms-signing-fixture.mjs';
import {monetaryFixture,hash} from '../test/helpers/monetary-fixture.mjs';
const {Pool}=createRequire(new URL('../../services/control-foundation/package.json',import.meta.url))('pg');
const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test')throw Error('Use isolated PostgreSQL harness');

test('committed reserve evidence -> one KMS valuation -> real controller/vault purchase -> immutable journal; stale/revoked intents cannot sign',async()=>{
 const root=new Pool({connectionString:rootUrl.href}),name='orio_test_valuation_'+randomUUID().replaceAll('-',''),runtime=name+'_rt';let pool;
 try{
  await root.query('CREATE DATABASE '+name);const url=new URL(rootUrl);url.pathname='/'+name;pool=new Pool({connectionString:url.href});
  const migrations=new URL('../../services/control-foundation/migrations/',import.meta.url);
  for(const n of (await readdir(migrations)).filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort())await pool.query((await readFile(new URL(n,migrations),'utf8')).replaceAll('orio_ledger_runtime',runtime));
  await pool.query(await readFile(new URL('../../services/control-foundation/pending-migrations/020_reserve_valuation_signing.sql',import.meta.url),'utf8'));
  const f=await monetaryFixture();const now=Math.floor(Date.now()/1000).toString();f.setTime(now);
  const config={id:'qualification',chainId:'84532',controller:f.controller.address,vault:f.vault.address,currency:f.currency.address,
   registry:f.registry.address,master:f.master.address,masterDecimals:6,registryEpoch:'1'};
  let current;
  const reader=sourceId=>({sourceId,request:async method=>method==='eth_chainId'?'0x14a34':method==='eth_getTransactionReceipt'?structuredClone(current):{number:'0x1',hash:hash('canonical')}});
  const settlement=new MonetarySettlement(pool,reader('a'),reader('b'),config);await settlement.initialize();
  const {policy,evidence}=reserveFixture(now);
  for(const k of ['controller','vault','currency','registry','master']){
   policy[k]=config[k];policy.codeHashes[k]=keccak256(await f.vm.stateManager.getCode(createAddressFromString(config[k])));
  }
  policy.gasTreasury=f.second.address;policy.valuationSigner=f.valuer.address;policy.controllerRevision=(await f.read(f.controller,'revision'))[0].toString();
  policy.registryRevision=(await f.read(f.registry,'revision'))[0].toString();
  evidence.ledgerState=await f.state();
  const reserveReader=sourceId=>({sourceId,request:async(method,params)=>{
   if(method==='eth_chainId')return '0x14a34';
   if(method==='eth_getBlockByNumber')return {number:'0x1',hash:hash('reserve-finalized'),timestamp:'0x'+BigInt(now).toString(16)};
   assert.deepEqual(params[1],{blockHash:hash('reserve-finalized'),requireCanonical:true});
   if(method==='eth_getCode')return bytesToHex(await f.vm.stateManager.getCode(createAddressFromString(params[0])));
   assert.equal(method,'eth_call');assert.deepEqual(Object.keys(params[0]).sort(),['data','to']);
   const result=await f.vm.evm.runCall({to:createAddressFromString(params[0].to),data:Buffer.from(params[0].data.slice(2),'hex'),isStatic:true,skipNonceIncrement:true});
   assert.equal(result.execResult.exceptionError,undefined);return bytesToHex(result.execResult.returnValue);
  }});
  evidence.observations=await observeReserve(reserveReader('chain-a'),reserveReader('chain-b'),policy,()=>now);
  const material=prepareReserveValuation(policy,evidence,now),journal=new ValuationSigningJournal(pool);
  await pool.query('INSERT INTO orio_signing.authorities VALUES($1,$2,$3,$4)',['valuation-v1',fixtureKeyArn,f.valuer.address,material.policyDigest]);
  for(const id of ['purchase-valuation','stale','revoked'])await journal.stage(id,'valuation-v1',material);
  // Runtime cannot read or mutate owner signing authority or immutable intents.
  const limited=await pool.connect();try{await limited.query('SET ROLE '+runtime);
   await assert.rejects(limited.query('SELECT * FROM orio_signing.valuation_intents'),/permission denied/);
  }finally{await limited.query('RESET ROLE');limited.release();}
  const signingPolicy={keyArn:fixtureKeyArn,signer:f.valuer.address,reservePolicy:policy};let signCalls=0;
  const factory=()=>kmsFixtureClient(f.valuer,async()=>{
   signCalls++;assert.equal((await pool.query("SELECT count(*) FROM orio_signing.claims WHERE intent_id='purchase-valuation'")).rows[0].count,'1');
  });
  const results=await Promise.allSettled([1,2].map(()=>signCommittedReserveValuation(journal,signingPolicy,'purchase-valuation',()=>now,factory)));
  assert.equal(signCalls,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const signed=results.find(r=>r.status==='fulfilled').value;
  assert.equal((await f.read(f.controller,'valuationHash',[signed.value]))[0],signed.digest);
  const id=hash('protected-reserve-purchase'),result=await f.call(f.controller,'purchase',[id,0,'100000000',1,signed.value,signed.signature]);
  assert.equal(result.execResult.exceptionError,undefined);
  const transactionHash=hash('purchase-tx'),blockHash=hash('canonical');
  const logs=result.execResult.logs.map(([address,topics,data],i)=>({address:bytesToHex(address),topics:topics.map(bytesToHex),data:bytesToHex(data),
   logIndex:'0x'+i.toString(16),transactionHash,blockHash,blockNumber:'0x1',removed:false}));
  current={status:'0x1',transactionHash,blockHash,blockNumber:'0x1',logs};
  const checkpoint=logs.find(l=>l.topics[0]==='0x20898450f31a91406bb3ae22abdc1bc501e0d5f8fd28bbcbd0f334fd60381bf2');
  await settlement.import({transactionHash,operationId:id,kind:'PURCHASE',version:'1',checkpointLogIndex:BigInt(checkpoint.logIndex).toString()});
  assert.equal((await f.read(f.vault,'reserveUnits'))[0],99000000n);assert.equal((await new ControlLedger(pool).verify()).ok,true);
  // A previously staged valuation cannot be signed after the committed state changes.
  await assert.rejects(signCommittedReserveValuation(journal,signingPolicy,'stale',()=>now,factory));assert.equal(signCalls,1);
  await journal.revoke('valuation-v1',hash('owner-revocation'));
  await assert.rejects(signCommittedReserveValuation(journal,signingPolicy,'revoked',()=>now,factory));assert.equal(signCalls,1);
  await assert.rejects(pool.query('DELETE FROM orio_signing.claims'),/append-only/);
  await assert.rejects(pool.query('TRUNCATE orio_signing.completions'),/append-only/);
  await assert.rejects(pool.query("UPDATE orio_signing.authorities SET signer=signer"),/append-only/);
  assert.equal((await pool.query('SELECT count(*) FROM orio_signing.completions')).rows[0].count,'1');
 }finally{
  if(pool)await pool.end();await root.query('DROP DATABASE IF EXISTS '+name);await root.query('DROP ROLE IF EXISTS '+runtime);await root.end();
 }
});
