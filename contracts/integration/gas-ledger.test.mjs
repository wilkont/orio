import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile,readdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { recoverAddress, sha256 } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { paymasterFixture } from '../test/helpers/paymaster-fixture.mjs';
import { monetaryFixture,hash } from '../test/helpers/monetary-fixture.mjs';
import { MonetarySettlement } from '../../services/control-foundation/src/monetary-settlement.ts';
import { attachGasConsents } from '../sdk/gas-permit.mjs';
import { signCompanyGasPermit } from '../sdk/protected-gas-signing.mjs';
import { ControlLedger } from '../../services/control-foundation/src/ledger.ts';
import { GasControls, gasAccounts } from '../../services/control-foundation/src/gas-controls.ts';
import { quoteGas } from '../../services/control-foundation/src/gas-policy.ts';
import { verifyFinalizedUserOperation } from '../../services/control-foundation/src/finalized-user-operation.ts';
const { Pool } = createRequire(new URL('../../services/control-foundation/package.json', import.meta.url))('pg');
const rootUrl = new URL(process.env.ORIO_TEST_DATABASE_URL ?? 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(rootUrl.hostname) || rootUrl.pathname !== '/orio_test')
  throw new Error('Use the isolated local PostgreSQL test harness');

test('committed user gas → real EntryPoint monetary purchase → vault/mint journal → final gas debit/refund reconcile separately', async () => {
  const root = new Pool({ connectionString: rootUrl.href }), name = 'orio_test_aa_' + randomUUID().replaceAll('-', '');
  const runtime = name + '_rt', url = new URL(rootUrl); url.pathname = '/' + name;
  let pool, created = false;
  try {
    await root.query('CREATE DATABASE ' + name); created = true; pool = new Pool({ connectionString: url.href });
    const directory=new URL('../../services/control-foundation/migrations/',import.meta.url);
    for (const migration of (await readdir(directory)).filter(name=>/^\d{3}_.*\.sql$/.test(name)).sort()) await pool.query(
      (await readFile(new URL(migration,directory), 'utf8')).replaceAll('orio_ledger_runtime', runtime));
    const f = await paymasterFixture(), monetary=await monetaryFixture(f); f.setTime(Math.floor(Date.now() / 1000));
    assert.equal((await f.call(monetary.master,'mintFixture',[f.account.address,100000000n])).execResult.exceptionError,undefined);
    const value=await monetary.valuation(),purchaseId=hash('aa-purchase');
    const callData=f.account.api.encodeFunctionData('executeBatch',[[
      {target:monetary.master.address,value:0,data:monetary.master.api.encodeFunctionData('approve',[monetary.vault.address,100000000n])},
      {target:monetary.controller.address,value:0,data:monetary.controller.api.encodeFunctionData('purchase',[purchaseId,0,100000000n,1,value.value,value.signature])}]]);
    const { operation } = await f.signOperation({callData,callGasLimit:800000n});
    operation.nonce = operation.nonce.toString(); operation.preVerificationGas = operation.preVerificationGas.toString();
    operation.paymasterAndData = operation.paymasterAndData.slice(0, 106);
    const now = new Date().toISOString(), evidence = 'a'.repeat(64);
    const quote = quoteGas({ transactionId: 'ledger-aa', ownerRef: f.account.address, chainId: '84532', action: 'PURCHASE',
      actionDigest: evidence, paymentAsset: 'USDC_SYNTHETIC', paymentKind: 'STABLECOIN', paymentMethod: 'PREPAID',
      rate: { unitsNumerator: '1', weiDenominator: '1000000000000', evidenceDigest: evidence },
      estimatedAt: now, expiresAt: new Date(Date.now() + 60_000).toISOString(), operations: [{ operationId: 'operation',
        callDigest: sha256(operation.callData).slice(2), executionGasLimit: '2600000', maxFeePerGasWei: '1000000000',
        l1DataFeeCapWei: '0', otherNetworkFeeCapWei: '0' }] }, now);
    const ledger = new ControlLedger(pool), controls = new GasControls(pool), accounts = gasAccounts(quote);
    for (const [id, asset, normalSide] of [[accounts.prepaid, quote.paymentAsset, 'credit'], ['gas_cash_fixture', quote.paymentAsset, 'debit'],
      [accounts.ethAvailable, 'native:84532:ETH', 'debit'], ['company_capital_fixture', 'native:84532:ETH', 'credit']])
      await ledger.createAccount({ id, asset, normalSide, allowNegative: false });
    await ledger.post({ idempotencyKey: 'fund', externalRef: 'synthetic-funding', description: 'Offline fixture only', postings: [
      { accountId: accounts.prepaid, side: 'credit', units: '10000' }, { accountId: 'gas_cash_fixture', side: 'debit', units: '10000' },
      { accountId: accounts.ethAvailable, side: 'debit', units: '1000000000000000000' }, { accountId: 'company_capital_fixture', side: 'credit', units: '1000000000000000000' }] });
    const quoteConsent = f.owner.signingKey.sign('0x' + quote.digest).serialized;
    assert.equal(recoverAddress('0x' + quote.digest, quoteConsent), f.owner.address);
    const reserveSequence = await controls.reserve(quote, { ownerRef: quote.ownerRef, quoteDigest: quote.digest,
      actionDigest: quote.actionDigest, maximumPaymentUnits: quote.maximumPaymentUnits,
      authorizationDigest: createHash('sha256').update(quoteConsent).digest('hex') });
    assert.ok(BigInt(reserveSequence)>0n);
    let protectedCalls=0;
    const {material,preparedRef,operatorConsent}=await signCompanyGasPermit(controls,{
      signTypedData:async(...args)=>{
        protectedCalls++;
        assert.equal((await pool.query('SELECT count(*) FROM orio_gas.signing_preparations')).rows[0].count,'1');
        return f.operator.signTypedData(...args);
      }}, {chainId:'84532',revision:'1',signer:f.operator.address,entryPoint:f.entry.address,paymaster:f.paymaster.address},
      {transactionId:quote.transactionId,operationId:'operation',userOperation:operation},now);
    assert.equal(protectedCalls,1);
    assert.equal((await f.read(f.paymaster,'permitHash',[operation,material.permit]))[0],material.digest);
    await assert.rejects(controls.cancelUnsubmitted(quote.transactionId),/reconciliation/);
    operation.paymasterAndData=attachGasConsents(material,f.owner.signingKey.sign(material.digest).serialized,operatorConsent);
    const userOpHash = (await f.read(f.entry, 'getUserOpHash', [operation]))[0];
    operation.signature = f.owner.signingKey.sign(userOpHash).serialized;
    const executionRef = 'eip155:84532:userop:' + userOpHash.slice(2);
    await controls.bindExecution(quote.transactionId, 'operation', preparedRef, executionRef,
      createHash('sha256').update(JSON.stringify(operation)).digest('hex'));
    // Bind inclusion to the actual permit, not an earlier wall-clock sample that may cross a second.
    const inclusion=BigInt(material.permit.validAfter)+1n;
    f.setTime(f.time()>inclusion?f.time():inclusion);
    const result = await f.submit(operation); assert.equal(result.execResult.exceptionError, undefined,bytesToHex(result.execResult.returnValue));
    const completed = f.logs(result, f.entry).find(event => event?.name === 'UserOperationEvent');
    assert.equal(completed.args.userOpHash, userOpHash); assert.equal(completed.args.success, true);
    assert.equal((await f.read(monetary.currency,'balanceOf',[f.account.address]))[0],99n*10n**18n);
    assert.equal((await f.read(monetary.vault,'reserveUnits'))[0],99000000n);
    const transactionHash = '0x' + 'e'.repeat(64), blockHash = '0x' + 'd'.repeat(64);
    const rpcLogs = result.execResult.logs.map(([address, topics, logData], index) => ({
      address: bytesToHex(address), topics: topics.map(bytesToHex), data: bytesToHex(logData),
      logIndex: '0x' + index.toString(16), transactionHash, blockHash, blockNumber: '0x1', removed: false,
    }));
    const finalLog = rpcLogs.find(log => log.address.toLowerCase() === f.entry.address.toLowerCase()
      && log.topics[0] === f.entry.api.getEvent('UserOperationEvent').topicHash);
    const localReader = sourceId => ({ sourceId, request: async method => {
      if (method === 'eth_chainId') return '0x14a34';
      if (method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash, blockHash, blockNumber: '0x1', logs: rpcLogs };
      return { number: '0x1', hash: blockHash };
    } });
    // The anchor/readers are synthetic fixture evidence; event bytes are from the actual VM.
    const observed = await verifyFinalizedUserOperation(localReader('vm-primary'), localReader('vm-secondary'), {
      chainId: '84532', entryPointAddress: f.entry.address, accountAddress: f.account.address, paymasterAddress: f.paymaster.address,
      userOperationHash: userOpHash, nonce: operation.nonce, transactionHash, logIndex: BigInt(finalLog.logIndex).toString(),
    });
    assert.equal(observed.entryPointDebitWei, completed.args.actualGasCost.toString());
    const importer=new MonetarySettlement(pool,localReader('vm-primary'),localReader('vm-secondary'),{
      id:'aa_monetary',chainId:'84532',controller:monetary.controller.address,currency:monetary.currency.address,
      vault:monetary.vault.address,master:monetary.master.address,masterDecimals:6,registryEpoch:'1',registry:monetary.registry.address});
    await importer.initialize();
    const checkpoint=rpcLogs.find(log=>log.topics[0]===monetary.controller.api.getEvent('MonetaryCheckpoint').topicHash);
    await importer.import({transactionHash,checkpointLogIndex:BigInt(checkpoint.logIndex).toString(),operationId:purchaseId,version:'1',kind:'PURCHASE'});
    // Offline VM has no Base L1 data publication. This is the exact final EntryPoint debit,
    // NOT a production proof of finality or complete Base/bundler network-cost allocation.
    const cost = { operationId: 'operation', executionRef, evidenceDigest: evidence, outcome: 'SUCCESS',
      executionWei: observed.entryPointDebitWei, l1DataWei: '0', otherNetworkWei: '0' };
    await controls.recordCost(quote.transactionId, cost);
    const settlement = await controls.settle(quote.transactionId, evidence);
    assert.equal(settlement.status, 'SETTLED');
    const balances = await ledger.balances(), available = balances.find(account => account.id === accounts.ethAvailable).units;
    assert.equal(BigInt(available), (await f.read(f.paymaster, 'getDeposit'))[0]);
    assert.equal((await ledger.verify()).ok, true);
    assert.equal(await f.balance(f.account.address), 0n);
    assert.equal(BigInt(settlement.chargeUnits) + BigInt(settlement.refundUnits), BigInt(quote.maximumPaymentUnits));
    assert.equal(balances.some(account => account.id.startsWith('reserve_')), false);
    assert.equal(balances.some(account=>account.asset===`erc20:84532:${monetary.master.address}`&&account.units==='99000000'),true);
  } finally {
    if (pool) await pool.end();
    if (created) { await root.query('DROP DATABASE ' + name); await root.query('DROP ROLE IF EXISTS ' + runtime); }
    await root.end();
  }
});
