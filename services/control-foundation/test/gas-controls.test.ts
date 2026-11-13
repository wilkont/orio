import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Pool } from 'pg';
import { ControlLedger } from '../src/ledger.ts';
import { GasControls, gasAccounts } from '../src/gas-controls.ts';
import { quoteGas } from '../src/gas-policy.ts';
import type { GasCost, GasQuote } from '../src/gas-policy.ts';

const rootUrl = new URL(process.env.ORIO_TEST_DATABASE_URL ?? 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(rootUrl.hostname) || rootUrl.pathname !== '/orio_test')
  throw new Error('Use the isolated local PostgreSQL test harness');
const evidence = 'a'.repeat(64);
function quote(transactionId = 'purchase', kind: 'STABLECOIN' | 'ORIO' = 'STABLECOIN'): GasQuote {
  const time = Date.now();
  return quoteGas({ transactionId, ownerRef: 'owner', chainId: '84532', action: 'PURCHASE', actionDigest: evidence,
    paymentAsset: kind === 'ORIO' ? 'ORIO_TEST' : 'USDC_TEST', paymentKind: kind, paymentMethod: 'PREPAID',
    rate: { unitsNumerator: '3', weiDenominator: '7', evidenceDigest: evidence },
    estimatedAt: new Date(time - 1000).toISOString(), expiresAt: new Date(time + 60_000).toISOString(),
    operations: [{ operationId: 'call', callDigest: evidence, executionGasLimit: '100', maxFeePerGasWei: '2',
      l1DataFeeCapWei: '30', otherNetworkFeeCapWei: '10' }] }, new Date(time).toISOString());
}
function authorization(q: GasQuote) {
  return { ownerRef: q.ownerRef, quoteDigest: q.digest, actionDigest: q.actionDigest,
    maximumPaymentUnits: q.maximumPaymentUnits, authorizationDigest: evidence };
}
function cost(executionRef = 'eip155:84532:userop:one'): GasCost {
  return { operationId: 'call', executionRef, evidenceDigest: evidence, outcome: 'SUCCESS',
    executionWei: '100', l1DataWei: '20', otherNetworkWei: '5' };
}
async function fixture(run: (pool: Pool, ledger: ControlLedger, controls: GasControls) => Promise<void>, installBindings = true) {
  const root = new Pool({ connectionString: rootUrl.href });
  const name = 'orio_test_gas_' + randomUUID().replaceAll('-', ''), runtime = name + '_rt';
  const url = new URL(rootUrl); url.pathname = '/' + name;
  let pool: Pool | undefined, created = false;
  try {
    await root.query('CREATE DATABASE ' + name); created = true;
    pool = new Pool({ connectionString: url.href });
    for (const migration of ['001_ledger.sql', '008_gas_controls.sql', ...(installBindings ? ['009_gas_execution_bindings.sql'] : [])])
      await pool.query((await readFile(new URL('../migrations/' + migration, import.meta.url), 'utf8')).replaceAll('orio_ledger_runtime', runtime));
    await run(pool, new ControlLedger(pool), new GasControls(pool));
  } finally {
    if (pool) await pool.end();
    if (created) { await root.query('DROP DATABASE ' + name); await root.query('DROP ROLE IF EXISTS ' + runtime); }
    await root.end();
  }
}
async function fund(ledger: ControlLedger, q: GasQuote, userUnits = '1000', treasuryWei = '1000') {
  const accounts = gasAccounts(q);
  for (const account of [
    { id: accounts.prepaid, asset: q.paymentAsset, normalSide: 'credit' as const, allowNegative: false },
    { id: 'gas_cash_test', asset: q.paymentAsset, normalSide: 'debit' as const, allowNegative: false },
    { id: accounts.ethAvailable, asset: 'native:84532:ETH', normalSide: 'debit' as const, allowNegative: false },
    { id: 'gas_company_capital_test', asset: 'native:84532:ETH', normalSide: 'credit' as const, allowNegative: false },
  ]) await ledger.createAccount(account);
  await ledger.post({ idempotencyKey: 'fund', externalRef: 'synthetic-gas-funding', description: 'Synthetic separate gas funding only', postings: [
    { accountId: accounts.prepaid, side: 'credit', units: userUnits }, { accountId: 'gas_cash_test', side: 'debit', units: userUnits },
    { accountId: accounts.ethAvailable, side: 'debit', units: treasuryWei }, { accountId: 'gas_company_capital_test', side: 'credit', units: treasuryWei },
  ] });
}
async function balance(ledger: ControlLedger, id: string) { return (await ledger.balances()).find(item => item.id === id)?.units ?? '0'; }
async function prepareAndRecord(controls: GasControls, q: GasQuote, receipt = cost()) {
  await controls.prepare(q.transactionId, 'call', receipt.executionRef, evidence);
  return controls.recordCost(q.transactionId, receipt);
}

test('gas reservation, actual ETH expense and refund commit once without monetary reserve or conversion postings', async () => fixture(async (_pool, ledger, controls) => {
  const q = quote(), accounts = gasAccounts(q); await fund(ledger, q);
  const reserved = await Promise.all([controls.reserve(q, authorization(q)), controls.reserve(q, authorization(q))]);
  assert.equal(reserved[0], reserved[1]);
  assert.equal(await balance(ledger, accounts.prepaid), '897'); assert.equal(await balance(ledger, accounts.ethAvailable), '760');
  await prepareAndRecord(controls, q);
  const [first, second] = await Promise.all([controls.settle(q.transactionId, evidence), controls.settle(q.transactionId, evidence)]);
  assert.deepEqual(first, second); assert.equal(first.chargeUnits, '53'); assert.equal(first.refundUnits, '50');
  assert.equal(await balance(ledger, accounts.prepaid), '947'); assert.equal(await balance(ledger, accounts.held), '0');
  assert.equal(await balance(ledger, accounts.ethAvailable), '875'); assert.equal(await balance(ledger, accounts.ethHeld), '0');
  assert.equal(await balance(ledger, accounts.expense), '125'); assert.equal(await balance(ledger, accounts.reimbursement), '53');
  assert.equal((await ledger.balances()).some(item => /^(reserve|customer|company_fee|holder)/.test(item.id)), false);
  assert.deepEqual((await ledger.verify()).issues, []);
}));
test('insufficient company ETH or user gas prepayment rolls back the entire reservation', async () => {
  for (const [user, eth] of [['102', '1000'], ['1000', '239']]) await fixture(async (pool, ledger, controls) => {
    const q = quote(); await fund(ledger, q, user, eth); const before = await ledger.verify();
    await assert.rejects(controls.reserve(q, authorization(q)), /Insufficient/);
    assert.equal((await pool.query('SELECT * FROM orio_gas.reservations')).rowCount, 0);
    assert.deepEqual((await ledger.verify()).head, before.head);
  });
});
test('concurrent different operations cannot reserve the same user gas funds twice', async () => fixture(async (_pool, ledger, controls) => {
  const q = quote('one'), other = quote('two'); await fund(ledger, q, '103');
  const results = await Promise.allSettled([controls.reserve(q, authorization(q)), controls.reserve(other, authorization(other))]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await ledger.verify()).ok, true);
}));
test('prepared execution binds exact call and reference; uncertain submission cannot charge or retry a new reference', async () => fixture(async (_pool, ledger, controls) => {
  const q = quote(); await fund(ledger, q); await controls.reserve(q, authorization(q));
  await assert.rejects(controls.prepare(q.transactionId, 'call', 'ref', 'b'.repeat(64)), /authorized/);
  await controls.prepare(q.transactionId, 'call', 'ref', evidence);
  await controls.prepare(q.transactionId, 'call', 'ref', evidence);
  await assert.rejects(controls.prepare(q.transactionId, 'call', 'another', evidence), /Uncertain/);
  await assert.rejects(controls.cancelUnsubmitted(q.transactionId), /reconciliation/);
  const result = await controls.settle(q.transactionId, evidence);
  assert.equal(result.status, 'REVIEW_REQUIRED'); assert.equal(result.chargeUnits, null);
}));
test('platform failure books actual ETH expense but cannot automatically debit a user', async () => fixture(async (_pool, ledger, controls) => {
  const q = quote(), accounts = gasAccounts(q); await fund(ledger, q); await controls.reserve(q, authorization(q));
  const receipt = cost(); receipt.outcome = 'PLATFORM_FAILURE';
  assert.equal(await prepareAndRecord(controls, q, receipt), 'REVIEW_REQUIRED');
  assert.equal((await controls.settle(q.transactionId, evidence)).status, 'REVIEW_REQUIRED');
  assert.equal(await balance(ledger, accounts.expense), '125');
  assert.equal(await balance(ledger, accounts.held), '103'); assert.equal(await balance(ledger, accounts.reimbursement), '0');
}));
test('over-cap gas evidence is preserved for review without exceeding authorization or drawing other reserves', async () => fixture(async (pool, ledger, controls) => {
  const q = quote(); await fund(ledger, q); await controls.reserve(q, authorization(q));
  const receipt = cost(); receipt.executionWei = '1000';
  assert.equal(await prepareAndRecord(controls, q, receipt), 'REVIEW_REQUIRED');
  const recorded = await pool.query('SELECT * FROM orio_gas.costs'); assert.equal(recorded.rowCount, 1);
  assert.equal(recorded.rows[0].expense_sequence, null);
  assert.equal((await controls.settle(q.transactionId, evidence)).chargeUnits, null);
  assert.equal(await balance(ledger, gasAccounts(q).ethAvailable), '760');
}));
test('cost retries do not double book; conflicting receipts and cross-user-operation reference reuse fail', async () => fixture(async (_pool, ledger, controls) => {
  const q = quote(), other = quote('other'); await fund(ledger, q);
  await controls.reserve(q, authorization(q)); await controls.reserve(other, authorization(other));
  await prepareAndRecord(controls, q); const checkpoint = (await ledger.verify()).head;
  await controls.recordCost(q.transactionId, cost()); assert.deepEqual((await ledger.verify()).head, checkpoint);
  await assert.rejects(controls.recordCost(q.transactionId, { ...cost(), executionWei: '101' }), /Conflicting/);
  await assert.rejects(controls.prepare(other.transactionId, 'call', cost().executionRef, evidence), /claimed/);
}));
test('unsubmitted cancellation refunds all gas holds once and prevents later execution', async () => fixture(async (_pool, ledger, controls) => {
  const q = quote(); await fund(ledger, q); await controls.reserve(q, authorization(q));
  await controls.cancelUnsubmitted(q.transactionId); await controls.cancelUnsubmitted(q.transactionId);
  assert.equal(await balance(ledger, gasAccounts(q).prepaid), '1000');
  assert.equal(await balance(ledger, gasAccounts(q).ethAvailable), '1000');
  await assert.rejects(controls.prepare(q.transactionId, 'call', 'ref', evidence), /closed/);
}));
test('failed closure rolls back reimbursement, refund, journal chain and outbox atomically', async () => fixture(async (pool, ledger, controls) => {
  const q = quote(); await fund(ledger, q); await controls.reserve(q, authorization(q)); await prepareAndRecord(controls, q);
  const before = await ledger.verify(), outbox = await pool.query('SELECT count(*) FROM orio_ledger.outbox');
  await pool.query("ALTER TABLE orio_gas.closures ADD CONSTRAINT test_failure CHECK (transaction_id <> 'purchase')");
  await assert.rejects(controls.settle(q.transactionId, evidence), /test_failure/);
  assert.deepEqual((await ledger.verify()).head, before.head);
  assert.deepEqual((await pool.query('SELECT count(*) FROM orio_ledger.outbox')).rows, outbox.rows);
  assert.equal(await balance(ledger, gasAccounts(q).held), '103');
}));
test('ORIO gas prepayments reimburse treasury without redemptions, minting, fees or appreciation', async () => fixture(async (pool, ledger, controls) => {
  const q = quote('orio-gas', 'ORIO'); await fund(ledger, q); await controls.reserve(q, authorization(q));
  await prepareAndRecord(controls, q); assert.equal((await controls.settle(q.transactionId, evidence)).chargeUnits, '53');
  assert.equal(await balance(ledger, gasAccounts(q).reimbursement), '53');
  assert.equal((await pool.query("SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('orio_conversion','orio_redemption')")).rows[0].count, '0');
}));
test('gas evidence is append-only and authorization changes cannot reuse a reservation', async () => fixture(async (pool, ledger, controls) => {
  const q = quote(); await fund(ledger, q);
  await assert.rejects(controls.reserve(q, { ...authorization(q), maximumPaymentUnits: '104' }), /authorization/);
  await controls.reserve(q, authorization(q));
  await assert.rejects(controls.reserve(q, { ...authorization(q), authorizationDigest: 'b'.repeat(64) }), /conflict/);
  await assert.rejects(pool.query('DELETE FROM orio_gas.reservations'), /append-only/);
  await assert.rejects(pool.query('TRUNCATE orio_gas.reservations CASCADE'), /append-only/);
}));

test('partial low-unit costs do not block later operations and final rounding happens once', async () => fixture(async (_pool, ledger, controls) => {
  const input = quote(); input.rate.unitsNumerator = '1'; input.rate.weiDenominator = '100';
  input.operations = ['first', 'second'].map(operationId => ({ operationId, callDigest: evidence,
    executionGasLimit: '60', maxFeePerGasWei: '1', l1DataFeeCapWei: '0', otherNetworkFeeCapWei: '0' }));
  const q = quoteGas(input, new Date().toISOString()); await fund(ledger, q); await controls.reserve(q, authorization(q));
  for (const operationId of ['first', 'second']) {
    await controls.prepare(q.transactionId, operationId, operationId + '-ref', evidence);
    await controls.recordCost(q.transactionId, { ...cost(operationId + '-ref'), operationId, executionWei: '60', l1DataWei: '0', otherNetworkWei: '0' });
  }
  const result = await controls.settle(q.transactionId, evidence);
  assert.equal(result.chargeUnits, '1'); assert.equal(result.refundUnits, '1');
}));
test('authenticated zero-expenditure success credits the entire hold without a zero-valued journal', async () => fixture(async (_pool, ledger, controls) => {
  const q = quote(); await fund(ledger, q); await controls.reserve(q, authorization(q));
  const receipt = { ...cost(), executionWei: '0', l1DataWei: '0', otherNetworkWei: '0' };
  assert.equal(await prepareAndRecord(controls, q, receipt), 'RECORDED');
  const result = await controls.settle(q.transactionId, evidence);
  assert.equal(result.status, 'SETTLED'); assert.equal(result.chargeUnits, '0'); assert.equal(result.refundUnits, '103');
  assert.equal(await balance(ledger, gasAccounts(q).ethAvailable), '1000');
}));
test('expiry after waiting for the ledger head rolls back reservation and all journal effects', async () => fixture(async (pool, ledger, controls) => {
  const original = quote(); await fund(ledger, original); const checkpoint = (await ledger.verify()).head;
  original.expiresAt = new Date(Date.now() + 150).toISOString();
  const q = quoteGas(original, new Date().toISOString());
  const blocker = await pool.connect(); let pending: Promise<string> | undefined;
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT * FROM orio_ledger.chain_head FOR UPDATE');
    pending = controls.reserve(q, authorization(q));
    // Attach a handler immediately so rejection while releasing the lock is not unhandled.
    const result = assert.rejects(pending, /expire/);
    await setTimeout(200); await blocker.query('COMMIT'); await result;
    assert.deepEqual((await ledger.verify()).head, checkpoint);
    assert.equal((await pool.query('SELECT * FROM orio_gas.reservations')).rowCount, 0);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); if (pending) await pending.catch(() => {}); }
}));
test('non-prepaid quotes cannot imply an unimplemented collection mechanism has funded gas', async () => fixture(async (_pool, ledger, controls) => {
  const request = quote(); request.paymentMethod = 'ADDITIONAL_BALANCE';
  const q = quoteGas(request, new Date().toISOString()); await fund(ledger, q);
  await assert.rejects(controls.reserve(q, authorization(q)), /collection adapter/);
}));

test('permit preparation prevents cancellation before signing; final execution binds exactly once', async () => fixture(async (pool, ledger, controls) => {
  const q = quote(), prepared = 'eip155:84532:reservation:' + evidence;
  const execution = 'eip155:84532:userop:' + 'b'.repeat(64);
  await fund(ledger, q); await controls.reserve(q, authorization(q));
  await assert.rejects(controls.bindExecution(q.transactionId, 'call', prepared, execution, evidence), /not prepared/);
  await controls.prepare(q.transactionId, 'call', prepared, evidence);
  await assert.rejects(controls.cancelUnsubmitted(q.transactionId), /reconciliation/);
  await assert.rejects(controls.recordCost(q.transactionId, cost(execution)), /does not match/);
  await controls.bindExecution(q.transactionId, 'call', prepared, execution, evidence);
  await controls.bindExecution(q.transactionId, 'call', prepared, execution, evidence);
  await assert.rejects(controls.bindExecution(q.transactionId, 'call', prepared, 'eip155:84532:userop:' + 'c'.repeat(64), evidence), /Conflicting/);
  await assert.rejects(pool.query('DELETE FROM orio_gas.execution_bindings'), /append-only/);
  await controls.recordCost(q.transactionId, cost(execution));
  assert.equal((await controls.settle(q.transactionId, evidence)).status, 'SETTLED');
}));

test('direct and bound execution references share one claim namespace in either insertion order', async () => {
  for (const directFirst of [true, false]) await fixture(async (pool, ledger, controls) => {
    const direct = quote('direct'), bound = quote('bound'), prepared = 'eip155:84532:reservation:' + evidence;
    const execution = 'eip155:84532:userop:' + 'b'.repeat(64);
    await fund(ledger, direct); await controls.reserve(direct, authorization(direct)); await controls.reserve(bound, authorization(bound));
    await controls.prepare(bound.transactionId, 'call', prepared, evidence);
    if (directFirst) {
      await controls.prepare(direct.transactionId, 'call', execution, evidence);
      await assert.rejects(controls.bindExecution(bound.transactionId, 'call', prepared, execution, evidence), /claimed/);
      assert.equal((await pool.query('SELECT * FROM orio_gas.execution_bindings')).rowCount, 0);
      await controls.recordCost(direct.transactionId, cost(execution));
    } else {
      await controls.bindExecution(bound.transactionId, 'call', prepared, execution, evidence);
      await assert.rejects(controls.prepare(direct.transactionId, 'call', execution, evidence), /claimed/);
      assert.equal((await pool.query('SELECT * FROM orio_gas.submissions WHERE transaction_id=$1', [direct.transactionId])).rowCount, 0);
      await controls.recordCost(bound.transactionId, cost(execution));
    }
    assert.equal((await pool.query('SELECT * FROM orio_gas.costs')).rowCount, 1);
    assert.equal((await ledger.verify()).ok, true);
  });
});
test('concurrent direct preparation and final binding cannot own the same execution', async () => fixture(async (_pool, ledger, controls) => {
  const direct = quote('direct'), bound = quote('bound'), prepared = 'eip155:84532:reservation:' + evidence;
  const execution = 'eip155:84532:userop:' + 'b'.repeat(64);
  await fund(ledger, direct); await controls.reserve(direct, authorization(direct)); await controls.reserve(bound, authorization(bound));
  await controls.prepare(bound.transactionId, 'call', prepared, evidence);
  const results = await Promise.allSettled([controls.prepare(direct.transactionId, 'call', execution, evidence),
    controls.bindExecution(bound.transactionId, 'call', prepared, execution, evidence)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await ledger.verify()).ok, true);
}));
test('binding migration backfills existing direct executions and retains immutable claim ownership', async () => fixture(async (pool, ledger, controls) => {
  const q = quote(); await fund(ledger, q); await controls.reserve(q, authorization(q));
  await controls.prepare(q.transactionId, 'call', cost().executionRef, evidence);
  await pool.query(await readFile(new URL('../migrations/009_gas_execution_bindings.sql', import.meta.url), 'utf8'));
  const claims = await pool.query('SELECT * FROM orio_gas.execution_claims');
  assert.equal(claims.rowCount, 1); assert.equal(claims.rows[0].transaction_id, q.transactionId);
  await assert.rejects(pool.query('DELETE FROM orio_gas.execution_claims'), /append-only/);
  await controls.recordCost(q.transactionId, cost());
  assert.equal((await controls.settle(q.transactionId, evidence)).status, 'SETTLED');
}, false));
