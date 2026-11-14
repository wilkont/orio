import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from '../../services/control-foundation/node_modules/pg/lib/index.js';
const { Pool } = pg;
import { bytesToHex } from '@ethereumjs/util';
import { AbiCoder } from 'ethers';
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
      vault:f.vault.address,master:f.master.address,masterDecimals:6,registryEpoch:'1',registry:f.registry.address};
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
    const all=await f.seal([{atoms:(await f.read(f.currency,'totalSupply'))[0]}]);quote=await f.valuation();
    result=await f.call(f.controller,'redeemBatch',[all.requests,quote.value,quote.signature]);ok(result);
    await settlement.import(evidence(result,all.id,'REDEMPTION','4'));
    const zero=(await pool.query('SELECT state FROM orio_monetary.deployments')).rows[0].state;
    const reconciliation={expectedStateDigest:gasDigest(zero),checkpointDigest:hash('zero-audit').slice(2),
      reserveMasterUnits:zero.reserveMasterUnits,pendingRedemptionUnits:'0',unsettledCompanyFeeUnits:'0'};
    quote=await f.valuation();id=hash('zero-reconciled');
    result=await f.govern(f.controller,'reconcileZeroSupply',[id,4,hash('zero-audit'),quote.value,quote.signature]);ok(result);
    const checkpoint=evidence(result,id,'ZERO_SUPPLY_RECONCILIATION','5');
    await assert.rejects(settlement.import(checkpoint),/must match finalized governance checkpoint/);
    const journalCount=(await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count;
    assert.equal((await settlement.import({...checkpoint,reconciliation})).journalSequence,null);
    assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count,journalCount);
    assert.equal((await pool.query('SELECT state FROM orio_monetary.deployments')).rows[0].state.priceUsd36.numerator,zero.priceUsd36.numerator);
    quote=await f.valuation();id=hash('reopened');
    result=await f.call(f.controller,'purchase',[id,5n,100000000n,1n,quote.value,quote.signature]);ok(result);
    await settlement.import(evidence(result,id,'PURCHASE','6'));
    // A non-versioned company withdrawal cannot silently overstate company cash on the next import.
    const withdrawal=await f.govern(f.controller,'withdrawCompany',[f.master.address,f.sender,1n]);ok(withdrawal);
    evidence(withdrawal,hash('company-withdrawal'),'PURCHASE','7');const withdrawalReceipt=structuredClone(current);
    const withdrawalInput={transactionHash:current.transactionHash,
      startLogIndex:BigInt(current.logs.find(log=>log.topics[0]===f.vault.api.getEvent('CompanyWithdrawalStarted').topicHash).logIndex).toString(),
      completionLogIndex:BigInt(current.logs.find(log=>log.topics[0]===f.controller.api.getEvent('CompanyFeesWithdrawn').topicHash).logIndex).toString()};
    quote=await f.valuation();id=hash('after-withdrawal');
    result=await f.call(f.controller,'purchase',[id,6n,100000000n,1n,quote.value,quote.signature]);ok(result);
    const seventh=evidence(result,id,'PURCHASE','7'),pendingPurchase=structuredClone(current);
    await assert.rejects(settlement.import(seventh),/Unreconciled reserve or company cash/);
    assert.equal((await pool.query('SELECT version::text FROM orio_monetary.deployments')).rows[0].version,'6');
    current=withdrawalReceipt;
    const withdrawn=await settlement.importCompanyWithdrawal(withdrawalInput);
    assert.equal(await settlement.importCompanyWithdrawal(withdrawalInput),withdrawn);
    const tampered=structuredClone(current);current.logs=current.logs.filter(log=>log.address.toLowerCase()!==f.master.address.toLowerCase());
    await assert.rejects(settlement.importCompanyWithdrawal(withdrawalInput),/exact cash movement/);current=tampered;
    current=pendingPurchase;await settlement.import(seventh);
    assert.equal((await pool.query('SELECT version::text FROM orio_monetary.deployments')).rows[0].version,'7');
    assert.equal(await balance('company_cash'),(await f.read(f.vault,'companyFees',[f.master.address]))[0].toString());
    assert.equal((await ledger.verify()).ok,true);
    let currentSettlement=settlement,currentConfig=config;
    const adapter=await f.deploy('test/MonetaryFixtures.sol','MockReserveSwap',[]);
    ok(await f.govern(f.controller,'setMigrationAdapter',[adapter.address,true,(await f.read(f.controller,'revision'))[0]]));
    const originalCompanyCash=await balance('company_cash');
    const omittedWithdrawal=await f.govern(f.controller,'withdrawCompany',[f.master.address,f.sender,1n]);ok(omittedWithdrawal);
    evidence(omittedWithdrawal,hash('omitted-before-migration'),'PURCHASE','8');const omittedReceipt=structuredClone(current);
    const omittedInput={transactionHash:current.transactionHash,
      startLogIndex:BigInt(current.logs.find(log=>log.topics[0]===f.vault.api.getEvent('CompanyWithdrawalStarted').topicHash).logIndex).toString(),
      completionLogIndex:BigInt(current.logs.find(log=>log.topics[0]===f.controller.api.getEvent('CompanyFeesWithdrawn').topicHash).logIndex).toString()};
    for(const [version,delta] of [['8',1000000n],['9',-500000n]]){
      const replacement=await f.deploy('test/MonetaryFixtures.sol','MockMasterToken',[6]);await f.approveAsset(replacement);
      const before=(await pool.query('SELECT state FROM orio_monetary.deployments')).rows[0].state;
      const received=BigInt(before.reserveMasterUnits)+delta;
      ok(await f.call(replacement,'mintFixture',[adapter.address,received]));
      ok(await f.govern(f.registry,'beginMigration',[(await f.read(f.registry,'epoch'))[0],(await f.read(f.registry,'revision'))[0],
        await f.assetId(replacement),hash('migration-'+version)]));
      const outgoing=await f.valuation(currentConfig.master),incoming=await f.valuation(replacement.address);
      id=hash('replace-'+version);
      result=await f.govern(f.controller,'migrateMaster',[id,adapter.address,AbiCoder.defaultAbiCoder().encode(['uint256'],[received]),received,
        outgoing.value,outgoing.signature,incoming.value,incoming.signature]);ok(result);
      const migrationInput={...evidence(result,id,'MASTER_MIGRATION',version),
        nextDeployment:{...currentConfig,master:replacement.address,registryEpoch:(BigInt(currentConfig.registryEpoch)+1n).toString()}};
      const validReceipt=structuredClone(current);
      current.logs=current.logs.filter(log=>log.topics[0]!==f.registry.api.getEvent('MasterElected').topicHash);
      await assert.rejects(currentSettlement.importMigration(migrationInput),/atomic reserve and election evidence/);
      current=validReceipt;
      if(version==='8'){
        await assert.rejects(currentSettlement.importMigration(migrationInput),/cash does not reconcile/);
        assert.equal((await pool.query('SELECT version::text FROM orio_monetary.deployments')).rows[0].version,'7');
        current=omittedReceipt;await currentSettlement.importCompanyWithdrawal(omittedInput);current=validReceipt;
      }
      const migrated=await currentSettlement.importMigration(migrationInput);
      assert.deepEqual(await currentSettlement.importMigration(migrationInput),migrated);
      const after=(await pool.query('SELECT state FROM orio_monetary.deployments')).rows[0].state;
      assert.equal(after.supplyAtoms,before.supplyAtoms);assert.deepEqual(after.priceUsd36,before.priceUsd36);assert.deepEqual(after.roundingUsd36,before.roundingUsd36);
      currentConfig=migrated.configuration;currentSettlement=new MonetarySettlement(pool,source('first'),source('second'),currentConfig);
      await currentSettlement.initialize();
    }
    assert.equal(BigInt(await balance('company_cash')),BigInt(originalCompanyCash)-1n);
    assert.equal((await pool.query('SELECT count(*) FROM orio_monetary.master_history')).rows[0].count,'3');
    const oldWithdrawal=await f.govern(f.controller,'withdrawCompany',[f.master.address,f.sender,1n]);ok(oldWithdrawal);
    evidence(oldWithdrawal,hash('old-company-withdrawal'),'PURCHASE','10');
    await currentSettlement.importCompanyWithdrawal({transactionHash:current.transactionHash,asset:f.master.address,
      startLogIndex:BigInt(current.logs.find(log=>log.topics[0]===f.vault.api.getEvent('CompanyWithdrawalStarted').topicHash).logIndex).toString(),
      completionLogIndex:BigInt(current.logs.find(log=>log.topics[0]===f.controller.api.getEvent('CompanyFeesWithdrawn').topicHash).logIndex).toString()});
    assert.equal(BigInt(await balance('company_cash')),BigInt(originalCompanyCash)-2n);
    const memo=await ledger.balances();
    assert.equal(memo.some(a=>a.asset==='USD54_MIGRATION_MEMO'&&a.units===(500000n*10n**48n).toString()),true);
    assert.equal((await ledger.verify()).ok,true);
    // A separate empty controller may replace its master before the first purchase.
    const g=await monetaryFixture(f),emptyConfig={id:'empty_genesis',chainId:'84532',controller:g.controller.address,currency:g.currency.address,
      vault:g.vault.address,master:g.master.address,masterDecimals:6,registryEpoch:'1',registry:g.registry.address};
    const empty=new MonetarySettlement(pool,source('first'),source('second'),emptyConfig);await empty.initialize();
    const initialReplacement=await g.deploy('test/MonetaryFixtures.sol','MockMasterToken',[6]);await g.approveAsset(initialReplacement);
    ok(await g.govern(g.controller,'setMigrationAdapter',[adapter.address,true,(await g.read(g.controller,'revision'))[0]]));
    ok(await g.govern(g.registry,'beginMigration',[(await g.read(g.registry,'epoch'))[0],(await g.read(g.registry,'revision'))[0],
      await g.assetId(initialReplacement),hash('empty-migration')]));
    const initialOld=await g.valuation(),initialNext=await g.valuation(initialReplacement.address);id=hash('genesis-replacement');
    result=await g.govern(g.controller,'migrateMaster',[id,adapter.address,AbiCoder.defaultAbiCoder().encode(['uint256'],[0]),0,
      initialOld.value,initialOld.signature,initialNext.value,initialNext.signature]);ok(result);
    const emptyMigration=await empty.importMigration({...evidence(result,id,'MASTER_MIGRATION','1'),
      nextDeployment:{...emptyConfig,master:initialReplacement.address,registryEpoch:'2'}});
    assert.equal(emptyMigration.journalSequence,null);
    const reopened=new MonetarySettlement(pool,source('first'),source('second'),emptyMigration.configuration);await reopened.initialize();
    ok(await g.call(initialReplacement,'mintFixture',[g.sender,100000000n]));ok(await g.call(initialReplacement,'approve',[g.vault.address,100000000n]));
    const initialValue=await g.valuation(initialReplacement.address);id=hash('post-empty-migration-purchase');
    result=await g.call(g.controller,'purchase',[id,1,100000000n,1,initialValue.value,initialValue.signature]);ok(result);
    await reopened.import(evidence(result,id,'PURCHASE','2'));assert.equal((await ledger.verify()).ok,true);
  } finally {
    if(pool)await pool.end();await root.query('DROP DATABASE IF EXISTS '+name);await root.query('DROP ROLE IF EXISTS '+runtime);await root.end();
  }
});
