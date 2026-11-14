import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from '../../services/control-foundation/node_modules/pg/lib/index.js';
const { Pool } = pg;
import { bytesToHex } from '@ethereumjs/util';
import { monetaryFixture,hash } from '../test/helpers/monetary-fixture.mjs';
import { MonetarySettlement } from '../../services/control-foundation/src/monetary-settlement.ts';
import { ControlLedger } from '../../services/control-foundation/src/ledger.ts';
import { gasDigest } from '../../services/control-foundation/src/gas-policy.ts';

const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test')throw new Error('Use isolated PostgreSQL harness');
const ok=result=>assert.equal(result.execResult.exceptionError,undefined,bytesToHex(result.execResult.returnValue));
test('executed monetary contracts commit verified native/token/rounding journals atomically with replay and receipt protection',async()=>{
  const root=new Pool({connectionString:rootUrl.href}),name='orio_test_monetary_'+randomUUID().replaceAll('-',''),runtime=name+'_rt';
  const url=new URL(rootUrl);url.pathname='/'+name;let pool;
  try {
    await root.query('CREATE DATABASE '+name);pool=new Pool({connectionString:url.href});
    const directory=new URL('../../services/control-foundation/migrations/',import.meta.url);
    for(const migration of (await readdir(directory)).filter(name=>/^\d{3}_.*\.sql$/.test(name)).sort())
      await pool.query((await readFile(new URL(migration,directory),'utf8')).replaceAll('orio_ledger_runtime',runtime));
    const f=await monetaryFixture(),config={id:'qualification',chainId:'84532',controller:f.controller.address,currency:f.currency.address,
      vault:f.vault.address,master:f.master.address,masterDecimals:6,registryEpoch:'1'};
    let current;
    const source=sourceId=>({sourceId,request:async method=>method==='eth_chainId'?'0x14a34':
      method==='eth_getTransactionReceipt'?structuredClone(current):{number:'0x1',hash:hash('canonical')}});
    const settlement=new MonetarySettlement(pool,source('first'),source('second'),config),ledger=new ControlLedger(pool);
    await settlement.initialize();await settlement.initialize();
    function evidence(result,operationId,kind,version){
      const transactionHash=hash('tx-'+operationId),blockHash=hash('canonical');
      const logs=result.execResult.logs.map(([address,topics,data],i)=>({address:bytesToHex(address),topics:topics.map(bytesToHex),
        data:bytesToHex(data),logIndex:'0x'+i.toString(16),transactionHash,blockHash,blockNumber:'0x1',removed:false}));
      current={status:'0x1',transactionHash,blockHash,blockNumber:'0x1',logs};
      return {transactionHash,operationId,kind,version,checkpointLogIndex:BigInt(logs.find(log=>
        log.topics[0]==='0x20898450f31a91406bb3ae22abdc1bc501e0d5f8fd28bbcbd0f334fd60381bf2')?.logIndex??'0x0').toString()};
    }
    let quote=await f.valuation(),id=hash('genesis');
    let result=await f.call(f.controller,'purchase',[id,0n,100000001n,1n,quote.value,quote.signature]);ok(result);
    const first=evidence(result,id,'PURCHASE','1');
    const receipts=await Promise.all([settlement.import(first),settlement.import(first)]);assert.deepEqual(receipts[0],receipts[1]);
    assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count,'1');
    const balance=async(label,asset=`erc20:84532:${f.master.address}`)=>(await ledger.balances()).find(a=>a.id==='mon_'+gasDigest([config.id,asset.toLowerCase(),label.toLowerCase()]))?.units??'0';
    assert.equal(await balance('reserve_cash'),'99000000');assert.equal(await balance('company_cash'),'1000001');
    const epoch=await f.seal([{atoms:10n**18n}]);quote=await f.valuation();
    result=await f.call(f.controller,'redeemBatch',[epoch.requests,quote.value,quote.signature]);ok(result);
    const second=evidence(result,epoch.id,'REDEMPTION','2');
    // Force a journal failure after receipt acquisition. Neither facts nor claims may survive.
    await pool.query("CREATE FUNCTION public.fail_monetary_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected journal failure'; END $$");
    await pool.query('CREATE TRIGGER fail_monetary BEFORE INSERT ON orio_ledger.journals FOR EACH ROW EXECUTE FUNCTION public.fail_monetary_journal()');
    await assert.rejects(settlement.import(second),/injected journal failure/);
    assert.equal((await pool.query('SELECT version::text FROM orio_monetary.deployments')).rows[0].version,'1');
    assert.equal((await pool.query("SELECT count(*) FROM orio_settlement.receipt_claims WHERE operation_id='qualification:2'")).rows[0].count,'0');
    await pool.query('DROP TRIGGER fail_monetary ON orio_ledger.journals');
    await settlement.import(second);
    assert.equal(await balance('reserve_cash'),(await f.read(f.vault,'reserveUnits'))[0].toString());
    assert.equal(await balance('wallet:'+f.sender,`erc20:84532:${f.currency.address}`),(await f.read(f.currency,'balanceOf',[f.sender]))[0].toString());
    assert.equal((await ledger.verify()).ok,true);
    await assert.rejects(pool.query("DELETE FROM orio_monetary.executions"),/append-only/i);
    assert.equal((await pool.query('SELECT count(*) FROM orio_monetary.executions')).rows[0].count,'2');
    // Another component may not consume the settled cash/burn evidence.
    await assert.rejects(pool.query("INSERT INTO orio_settlement.receipt_claims SELECT external_ref,'conversion','other' FROM orio_settlement.receipt_claims LIMIT 1"),/duplicate key/i);
    result=await f.call(f.currency,'transfer',[f.second.address,10n**18n]);ok(result);
    const transfer=evidence(result,hash('transfer'),'PURCHASE','3');
    const transferInput={transactionHash:transfer.transactionHash,logIndex:'0',senderAddress:f.sender,recipientAddress:f.second.address,units:(10n**18n).toString()};
    const transferSequence=await settlement.importTransfer(transferInput);
    assert.equal(await settlement.importTransfer(transferInput),transferSequence);
    const received=await f.seal([{owner:f.second.address,atoms:10n**18n}]);quote=await f.valuation();
    result=await f.call(f.controller,'redeemBatch',[received.requests,quote.value,quote.signature]);ok(result);
    await settlement.import(evidence(result,received.id,'REDEMPTION','3'));
    assert.equal(await balance('wallet:'+f.second.address,`erc20:84532:${f.currency.address}`),'0');
    assert.equal((await ledger.verify()).ok,true);
    // A non-versioned company withdrawal cannot silently overstate company cash on the next import.
    ok(await f.govern(f.controller,'withdrawCompany',[f.master.address,f.sender,1n]));
    quote=await f.valuation();id=hash('after-withdrawal');
    result=await f.call(f.controller,'purchase',[id,3n,100000000n,1n,quote.value,quote.signature]);ok(result);
    await assert.rejects(settlement.import(evidence(result,id,'PURCHASE','4')),/Unreconciled reserve or company cash/);
    assert.equal((await pool.query('SELECT version::text FROM orio_monetary.deployments')).rows[0].version,'3');
  } finally {
    if(pool)await pool.end();await root.query('DROP DATABASE IF EXISTS '+name);await root.query('DROP ROLE IF EXISTS '+runtime);await root.end();
  }
});
