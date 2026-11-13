import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { GasFunding } from '../src/gas-funding.ts';
import { GasControls, gasAccounts } from '../src/gas-controls.ts';
import { GasRefunds, gasRefundActionDigest } from '../src/gas-refunds.ts';
import { quoteGas } from '../src/gas-policy.ts';
import { ControlLedger } from '../src/ledger.ts';
import { ConversionEntries } from '../src/conversion-entries.ts';
import { RedemptionClaims } from '../src/redemption-claims.ts';
import type { ChainReader } from '../src/chain-evidence.ts';

const rootUrl = new URL(process.env.ORIO_TEST_DATABASE_URL ?? 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(rootUrl.hostname) || rootUrl.pathname !== '/orio_test')
  throw new Error('Use the isolated local PostgreSQL test harness');
const owner = '0x' + '1'.repeat(40), treasury = '0x' + '2'.repeat(40), token = '0x' + '3'.repeat(40);
const tx = '0x' + 'a'.repeat(64), block = '0x' + 'b'.repeat(64), evidence = 'c'.repeat(64);
const assetId = 'erc20:84532:' + token, ref = 'eip155:84532/tx:' + tx + '/log:2';
const intent = { fundingId: 'fund', ownerRef: owner, assetId, units: '1000000', authorizationDigest: evidence };
const log = { address: token, logIndex: '0x2', removed: false, transactionHash: tx, blockHash: block, blockNumber: '0xa',
  topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    '0x' + '0'.repeat(24) + owner.slice(2), '0x' + '0'.repeat(24) + treasury.slice(2)],
  data: '0x' + (1000000n).toString(16).padStart(64, '0') };
function reader(sourceId: string, logChanges: Record<string, unknown> = {}, finalized = '0xb', transactionHash = tx): ChainReader {
  return { sourceId, request: async (method, params) => {
    if (method === 'eth_chainId') return '0x14a34';
    if (method === 'eth_getTransactionReceipt') {
      const transfer = { ...log, transactionHash, ...logChanges };
      const logs = [transfer];
      if (transactionHash === payoutTx) {
        const boundary = { ...log, transactionHash, address: refundDeployment.entryPointAddress, logIndex: '0x1',
          topics: ['0xbb47ee3e183a558b1a2ff0874b079f3fc5478b7454eacf2bfc5af2ff5878f972'], data: '0x' };
        const completed = { ...boundary, logIndex: '0x3', topics: [
          '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f', refundExecution.userOperationHash,
          '0x' + '0'.repeat(24) + owner.slice(2), '0x' + '0'.repeat(24) + refundDeployment.paymasterAddress.slice(2)],
          data: '0x' + [0n, 1n, 125n, 125n].map(value => value.toString(16).padStart(64, '0')).join('') };
        logs.unshift(boundary); logs.push(completed);
      }
      return { status: '0x1', transactionHash, blockHash: block, blockNumber: '0xa', logs };
    }
    return params[0] === 'finalized' ? { number: finalized, hash: '0x' + 'd'.repeat(64) } : { number: '0xa', hash: block };
  } };
}
async function fixture(run: (pool: Pool, funding: GasFunding, ledger: ControlLedger) => Promise<void>) {
  const root = new Pool({ connectionString: rootUrl.href }), name = 'orio_test_funding_' + randomUUID().replaceAll('-', '');
  const runtime = name + '_rt', url = new URL(rootUrl); url.pathname = '/' + name;
  let pool: Pool | undefined, created = false;
  try {
    await root.query('CREATE DATABASE ' + name); created = true; pool = new Pool({ connectionString: url.href });
    for (const migration of ['001_ledger.sql', '002_master_registry.sql', '003_conversion_entries.sql',
      '004_conversion_route_start.sql', '005_redemption_claims.sql', '006_shared_receipt_claims.sql',
      '007_master_receipt_accounting.sql', '008_gas_controls.sql', '009_gas_execution_bindings.sql', '010_gas_prepayment_funding.sql',
      '011_gas_prepayment_refunds.sql'])
      await pool.query((await readFile(new URL('../migrations/' + migration, import.meta.url), 'utf8')).replaceAll('orio_ledger_runtime', runtime));
    await pool.query('INSERT INTO orio_gas.funding_assets VALUES($1,$2,$3,6,$4,$5)', [assetId, '84532', token, treasury, evidence]);
    await pool.query(`INSERT INTO orio_master.assets VALUES('master','Synthetic',84532,$1,6,'valuation','liquidity','redemption','fixture',$2)`, [token, evidence]);
    await pool.query("SELECT orio_master.activate(NULL,'election','master',$1,$1)", [evidence]);
    await run(pool, new GasFunding(pool), new ControlLedger(pool));
  } finally {
    if (pool) await pool.end();
    if (created) { await root.query('DROP DATABASE ' + name); await root.query('DROP ROLE IF EXISTS ' + runtime); }
    await root.end();
  }
}
function observe(funding: GasFunding, id = 'fund') { return funding.observe(id, tx, '2', reader('one'), reader('two')); }
async function conversion(pool: Pool) {
  const entries = new ConversionEntries(pool);
  await entries.open({ intentId: 'conversion', ownerRef: owner, sourceAssetId: 'master', sourceUnits: '1000000',
    electionId: 'election', reserveVaultId: 'vault', minimumMasterUnits: '990000', quoteDigest: evidence, quoteExpiresAt: '2099-01-01T00:00:00Z' });
  return () => entries.record({ eventId: 'deposit', intentId: 'conversion', expectedVersion: '0', kind: 'DEPOSIT_CONFIRMED',
    evidence: { intentId: 'conversion', digest: evidence, assetId: 'master', units: '1000000', externalRef: ref } });
}

test('verified token deposit creates one segregated gas cash asset and exact customer prepayment under concurrent retries', async () => fixture(async (pool, funding, ledger) => {
  await funding.open(intent);
  const results = await Promise.all(Array.from({ length: 15 }, () => observe(funding)));
  assert.equal(new Set(results.map(result => result.sequence)).size, 1);
  const balances = await ledger.balances(); assert.equal(balances.length, 2);
  const prepaid = gasAccounts({ ownerRef: owner, paymentAsset: assetId, chainId: '84532', transactionId: 'unused' }).prepaid;
  assert.equal(balances.find(account => account.id === prepaid)?.units, '1000000');
  assert.equal(balances.find(account => account.id.startsWith('gas_cash_'))?.units, '1000000');
  assert.equal((await pool.query('SELECT consumer FROM orio_settlement.receipt_claims')).rows[0].consumer, 'gas-funding');
  assert.equal((await ledger.verify()).ok, true);
}));
test('conflicting intent, numeric units and invalid token/party/finality evidence cannot credit a gas balance', async () => fixture(async (pool, funding, ledger) => {
  await funding.open(intent);
  await assert.rejects(funding.open({ ...intent, units: '1000001' }), /conflict/);
  for (const value of [1000000, '1000000\n', '01', (1n << 256n).toString()]) {
    const malformed = { ...intent }; Reflect.set(malformed, 'units', value);
    await assert.rejects(funding.open(malformed));
  }
  for (const changes of [{ address: treasury }, { data: '0x' + '0'.repeat(64) },
    { topics: [log.topics[0], log.topics[2], log.topics[1]] }, { removed: true }])
    await assert.rejects(funding.observe('fund', tx, '2', reader('one'), reader('two', changes)));
  await assert.rejects(funding.observe('fund', tx, '2', reader('one'), reader('two', {}, '0x9')));
  assert.equal((await pool.query('SELECT * FROM orio_gas.funding_receipts')).rowCount, 0);
  assert.equal((await ledger.verify()).head.sequence, '0');
}));
test('one transfer cannot fund two different gas prepayment intents', async () => fixture(async (_pool, funding, ledger) => {
  await funding.open(intent); await funding.open({ ...intent, fundingId: 'other' });
  const results = await Promise.allSettled([observe(funding), observe(funding, 'other')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await ledger.verify()).head.sequence, '1');
}));
test('gas prepayment and ordinary conversion cannot reuse one finalized deposit in either order or concurrently', async () => {
  for (const order of ['conversion', 'gas', 'concurrent']) await fixture(async (pool, funding, ledger) => {
    await funding.open(intent); const recordConversion = await conversion(pool);
    if (order === 'conversion') { await recordConversion(); await assert.rejects(observe(funding), /another operation/); }
    else if (order === 'gas') { await observe(funding); await assert.rejects(recordConversion(), /another operation/); }
    else {
      const results = await Promise.allSettled([observe(funding), recordConversion()]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    }
    assert.equal((await pool.query('SELECT * FROM orio_settlement.receipt_claims')).rowCount, 1);
    assert.equal((await ledger.verify()).ok, true);
  });
});
test('gas prepayment cannot discharge a redemption claim using the same receipt', async () => fixture(async (pool, funding, _ledger) => {
  await funding.open(intent); await observe(funding);
  const claims = new RedemptionClaims(pool);
  await claims.open({ requestId: 'redemption', ownerRef: owner, tokenAssetId: 'orio', tokenUnits: '100',
    payoutAssetId: 'master', payoutUnits: '99', recipientRef: owner, electionId: 'election', quoteDigest: evidence, quoteExpiresAt: '2099-01-01T00:00:00Z' });
  await assert.rejects(claims.record('claim', 'redemption', '0', 'CLAIM_VERIFIED', {
    requestId: 'redemption', electionId: 'election', digest: evidence, ownerRef: owner,
    tokenAssetId: 'orio', tokenUnits: '100', claimRef: ref,
  }), /another operation/);
}));
test('failed funding receipt linkage rolls back accounts, shared claim, journal chain and outbox', async () => fixture(async (pool, funding, ledger) => {
  await funding.open(intent);
  await pool.query("ALTER TABLE orio_gas.funding_receipts ADD CONSTRAINT injected_failure CHECK(funding_id <> 'fund')");
  await assert.rejects(observe(funding), /injected_failure/);
  for (const table of ['orio_ledger.accounts', 'orio_ledger.journals', 'orio_ledger.outbox', 'orio_settlement.receipt_claims'])
    assert.equal((await pool.query('SELECT * FROM ' + table)).rowCount, 0);
  assert.equal((await ledger.verify()).head.sequence, '0');
}));
test('observed prepayment funds the existing gas hold without creating conversion revenue or reserve backing', async () => fixture(async (pool, funding, ledger) => {
  await funding.open(intent); await observe(funding);
  const now = Date.now(), quote = quoteGas({ transactionId: 'transfer', ownerRef: owner, chainId: '84532', action: 'TRANSFER',
    actionDigest: evidence, paymentAsset: assetId, paymentKind: 'STABLECOIN', paymentMethod: 'PREPAID',
    rate: { unitsNumerator: '3', weiDenominator: '7', evidenceDigest: evidence }, estimatedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), operations: [{ operationId: 'call', callDigest: evidence,
      executionGasLimit: '100', maxFeePerGasWei: '2', l1DataFeeCapWei: '30', otherNetworkFeeCapWei: '10' }] }, new Date(now).toISOString());
  const accounts = gasAccounts(quote);
  await ledger.createAccount({ id: accounts.ethAvailable, asset: 'native:84532:ETH', normalSide: 'debit', allowNegative: false });
  await ledger.createAccount({ id: 'gas_company_capital', asset: 'native:84532:ETH', normalSide: 'credit', allowNegative: false });
  await ledger.post({ idempotencyKey: 'company-fund', externalRef: 'synthetic-company-eth', description: 'Company gas funding', postings: [
    { accountId: accounts.ethAvailable, side: 'debit', units: '1000' }, { accountId: 'gas_company_capital', side: 'credit', units: '1000' }] });
  await new GasControls(pool).reserve(quote, { ownerRef: owner, quoteDigest: quote.digest, actionDigest: evidence,
    maximumPaymentUnits: quote.maximumPaymentUnits, authorizationDigest: evidence });
  assert.equal((await ledger.balances()).find(account => account.id === accounts.prepaid)?.units, '999897');
  assert.equal((await ledger.balances()).some(account => /^(reserve_|customer_|holder_)/.test(account.id)), false);
  assert.equal((await ledger.verify()).ok, true);
}));
test('gas funding source configuration and historical evidence remain append-only', async () => fixture(async (pool, funding, _ledger) => {
  await funding.open(intent); await observe(funding);
  for (const table of ['funding_assets', 'funding_intents', 'funding_receipts'])
    await assert.rejects(pool.query('DELETE FROM orio_gas.' + table), /append-only/);
  await assert.rejects(pool.query('TRUNCATE orio_gas.funding_receipts'), /append-only/);
}));
test('treasury self-transfers and zero-address sources cannot create customer prepayments', async () => fixture(async (pool, funding, ledger) => {
  for (const source of [treasury, '0x' + '0'.repeat(40)]) {
    await assert.rejects(funding.open({ ...intent, ownerRef: source }), /external customer source/);
    await assert.rejects(pool.query('INSERT INTO orio_gas.funding_intents VALUES($1,$2,$3,$4,$5)',
      ['direct', source, assetId, '1000000', evidence]), /external customer source/);
  }
  assert.equal((await ledger.verify()).head.sequence, '0');
}));

async function refundFixture(pool: Pool, funding: GasFunding, ledger: ControlLedger, units = '500000') {
  await funding.open(intent); await observe(funding);
  const request = { refundId: 'withdrawal', ownerRef: owner, assetId, units,
    gasTransactionId: 'withdrawal-gas', authorizationDigest: evidence };
  const now = Date.now(), quote = quoteGas({ transactionId: request.gasTransactionId, ownerRef: owner, chainId: '84532',
    action: 'OTHER', actionDigest: gasRefundActionDigest(request), paymentAsset: assetId, paymentKind: 'STABLECOIN', paymentMethod: 'PREPAID',
    rate: { unitsNumerator: '3', weiDenominator: '7', evidenceDigest: evidence },
    estimatedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60000).toISOString(),
    operations: [{ operationId: 'withdrawal', callDigest: evidence, executionGasLimit: '100', maxFeePerGasWei: '2',
      l1DataFeeCapWei: '30', otherNetworkFeeCapWei: '10' }] }, new Date(now).toISOString());
  const accounts = gasAccounts(quote);
  await ledger.createAccount({ id: accounts.ethAvailable, asset: 'native:84532:ETH', normalSide: 'debit', allowNegative: false });
  await ledger.createAccount({ id: 'gas_company_capital', asset: 'native:84532:ETH', normalSide: 'credit', allowNegative: false });
  await ledger.post({ idempotencyKey: 'company-fund', externalRef: 'synthetic-company-eth', description: 'Company gas funding', postings: [
    { accountId: accounts.ethAvailable, side: 'debit', units: '1000' }, { accountId: 'gas_company_capital', side: 'credit', units: '1000' }] });
  await new GasControls(pool).reserve(quote, { ownerRef: owner, quoteDigest: quote.digest, actionDigest: quote.actionDigest,
    maximumPaymentUnits: quote.maximumPaymentUnits, authorizationDigest: evidence });
  return { request, refunds: new GasRefunds(pool, refundDeployment), accounts };
}
const payoutTx = '0x' + 'e'.repeat(64);
const refundDeployment = { entryPointAddress: '0x' + '4'.repeat(40), paymasterAddress: '0x' + '5'.repeat(40) };
const refundExecution = { operationId: 'withdrawal', userOperationHash: '0x' + '6'.repeat(64), nonce: '0', userOperationLogIndex: '3' };
async function preparePayout(pool: Pool) {
  const controls = new GasControls(pool), prepared = 'eip155:84532:reservation:' + '7'.repeat(64);
  await controls.prepare('withdrawal-gas', 'withdrawal', prepared, evidence);
  await controls.bindExecution('withdrawal-gas', 'withdrawal', prepared, 'eip155:84532:userop:' + '6'.repeat(64), evidence);
}
const payoutChanges = { topics: [log.topics[0], log.topics[2], log.topics[1]], data: '0x' + (500000n).toString(16).padStart(64, '0') };
function payout(f: GasRefunds) { return f.observe('withdrawal', payoutTx, '2', refundExecution,
  reader('one', payoutChanges, '0xb', payoutTx), reader('two', payoutChanges, '0xb', payoutTx)); }

test('gas withdrawal reserves exact funds once and finalized payout discharges the hold once', async () => fixture(async (pool, funding, ledger) => {
  const { request, refunds, accounts } = await refundFixture(pool, funding, ledger);
  await Promise.all(Array.from({ length: 10 }, () => refunds.open(request)));
  assert.equal((await pool.query('SELECT * FROM orio_gas.refund_requests')).rowCount, 1);
  assert.equal((await ledger.balances()).find(account => account.id === accounts.prepaid)?.units, '499897');
  await preparePayout(pool);
  const receipts = await Promise.all(Array.from({ length: 10 }, () => payout(refunds)));
  assert.equal(new Set(receipts.map(receipt => receipt.sequence)).size, 1);
  assert.equal((await ledger.balances()).find(account => account.id.startsWith('gas_cash_'))?.units, '500000');
  assert.equal((await ledger.balances()).find(account => account.id.startsWith('gas_refund_'))?.units, '0');
  assert.equal((await ledger.verify()).ok, true);
}));
test('gas withdrawal cannot spend reserved network charges or reuse a quote for different economics', async () => fixture(async (pool, funding, ledger) => {
  const { request, refunds } = await refundFixture(pool, funding, ledger, '1000000');
  const before = (await ledger.verify()).head;
  await assert.rejects(refunds.open(request), /Insufficient/);
  assert.deepEqual((await ledger.verify()).head, before);
  await assert.rejects(refunds.open({ ...request, units: '100' }), /own authorized gas/);
  assert.equal((await pool.query('SELECT * FROM orio_gas.refund_requests')).rowCount, 0);
}));
test('wrong payout amount, source or unfinalized evidence preserves the full pending refund', async () => fixture(async (pool, funding, ledger) => {
  const { request, refunds } = await refundFixture(pool, funding, ledger); await refunds.open(request);
  for (const changes of [{ ...payoutChanges, data: '0x' + (499999n).toString(16).padStart(64, '0') },
    { ...payoutChanges, topics: log.topics }])
    await assert.rejects(refunds.observe('withdrawal', payoutTx, '2', refundExecution, reader('one', changes, '0xb', payoutTx), reader('two', changes, '0xb', payoutTx)));
  await assert.rejects(refunds.observe('withdrawal', payoutTx, '2', refundExecution, reader('one', payoutChanges, '0xb', payoutTx), reader('two', payoutChanges, '0x9', payoutTx)));
  assert.equal((await ledger.balances()).find(account => account.id.startsWith('gas_refund_'))?.units, '500000');
  assert.equal((await pool.query('SELECT * FROM orio_gas.refund_receipts')).rowCount, 0);
}));
test('payout receipt linkage failure rolls back the discharge, shared reference and journal/outbox', async () => fixture(async (pool, funding, ledger) => {
  const { request, refunds } = await refundFixture(pool, funding, ledger); await refunds.open(request);
  await preparePayout(pool);
  const before = (await ledger.verify()).head, count = (await pool.query('SELECT count(*) FROM orio_ledger.outbox')).rows;
  await pool.query("ALTER TABLE orio_gas.refund_receipts ADD CONSTRAINT injected_failure CHECK(refund_id <> 'withdrawal')");
  await assert.rejects(payout(refunds), /injected_failure/);
  assert.deepEqual((await ledger.verify()).head, before);
  assert.deepEqual((await pool.query('SELECT count(*) FROM orio_ledger.outbox')).rows, count);
  assert.equal((await pool.query("SELECT 1 FROM orio_settlement.receipt_claims WHERE consumer='gas-refund'")).rowCount, 0);
}));
test('a withdrawal protects its gas hold and requires its own bound successful operation before payout finalization', async () => fixture(async (pool, funding, ledger) => {
  const { request, refunds } = await refundFixture(pool, funding, ledger); await refunds.open(request);
  await assert.rejects(new GasControls(pool).cancelUnsubmitted('withdrawal-gas'), /pending withdrawal/);
  await assert.rejects(payout(refunds), /not bound/);
  await preparePayout(pool);
  const foreign = (id: string): ChainReader => {
    const base = reader(id, payoutChanges, '0xb', payoutTx);
    return { sourceId: id, request: async (method, params) => {
      const value = await base.request(method, params);
      if (method !== 'eth_getTransactionReceipt') return value;
      const receipt = JSON.parse(JSON.stringify(value));
      const final = receipt.logs.find((item: { logIndex: string }) => item.logIndex === '0x3');
      final.logIndex = '0x5';
      receipt.logs.push({ ...final, logIndex: '0x3', topics: [final.topics[0], '0x' + '8'.repeat(64), ...final.topics.slice(2)] });
      return receipt;
    } };
  };
  await assert.rejects(refunds.observe('withdrawal', payoutTx, '2', { ...refundExecution, userOperationLogIndex: '5' }, foreign('one'), foreign('two')), /not inside/);
  assert.equal((await ledger.balances()).find(account => account.id.startsWith('gas_refund_'))?.units, '500000');
  await payout(refunds); assert.equal((await ledger.verify()).ok, true);
}));
test('never-prepared withdrawal cancellation releases all customer/company holds together exactly once', async () => fixture(async (pool, funding, ledger) => {
  const { request, refunds, accounts } = await refundFixture(pool, funding, ledger); await refunds.open(request);
  await Promise.all([refunds.cancelUnsubmitted('withdrawal'), refunds.cancelUnsubmitted('withdrawal')]);
  assert.equal((await ledger.balances()).find(account => account.id === accounts.prepaid)?.units, '1000000');
  assert.equal((await ledger.balances()).find(account => account.id === accounts.ethAvailable)?.units, '1000');
  await assert.rejects(payout(refunds), /cancelled/);
  assert.equal((await ledger.verify()).ok, true);
}));
test('cancellation is refused after preparation and a failed coupled cancellation rolls every balance back', async () => {
  await fixture(async (pool, funding, ledger) => {
    const { request, refunds } = await refundFixture(pool, funding, ledger); await refunds.open(request); await preparePayout(pool);
    await assert.rejects(refunds.cancelUnsubmitted('withdrawal'), /reconciliation/);
  });
  await fixture(async (pool, funding, ledger) => {
    const { request, refunds } = await refundFixture(pool, funding, ledger); await refunds.open(request);
    const before = await ledger.verify(), balances = await ledger.balances();
    await pool.query("ALTER TABLE orio_gas.refund_closures ADD CONSTRAINT injected_failure CHECK(refund_id <> 'withdrawal')");
    await assert.rejects(refunds.cancelUnsubmitted('withdrawal'), /injected_failure/);
    assert.deepEqual((await ledger.verify()).head, before.head); assert.deepEqual(await ledger.balances(), balances);
    assert.equal((await pool.query('SELECT 1 FROM orio_gas.closures')).rowCount, 0);
  });
});
test('changing caller execution metadata during RPC verification cannot claim a later operation payout', { timeout: 5000 }, async () => fixture(async (pool, funding, ledger) => {
  const { request, refunds } = await refundFixture(pool, funding, ledger); await refunds.open(request); await preparePayout(pool);
  let release = () => {}, notify = () => {}, waiting = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const bothWaiting = new Promise<void>(resolve => { notify = resolve; });
  const delayed = (sourceId: string): ChainReader => {
    const base = reader(sourceId, { ...payoutChanges, logIndex: '0x4' }, '0xb', payoutTx); let receipts = 0;
    return { sourceId, request: async (method, params) => {
      if (method === 'eth_getTransactionReceipt' && ++receipts === 2) {
        waiting++; if (waiting === 2) notify(); await gate;
      }
      const value = await base.request(method, params);
      if (method !== 'eth_getTransactionReceipt') return value;
      const receipt = JSON.parse(JSON.stringify(value));
      const earlier = receipt.logs.find((item: { logIndex: string }) => item.logIndex === '0x3');
      receipt.logs.push({ ...earlier, logIndex: '0x5', topics: [earlier.topics[0], '0x' + '8'.repeat(64), ...earlier.topics.slice(2)] });
      return receipt;
    } };
  };
  const mutable = { ...refundExecution };
  const result = assert.rejects(refunds.observe('withdrawal', payoutTx, '4', mutable, delayed('one'), delayed('two')), /not inside/);
  await bothWaiting; mutable.userOperationLogIndex = '5'; release(); await result;
  assert.equal((await pool.query('SELECT * FROM orio_gas.refund_receipts')).rowCount, 0);
}));
