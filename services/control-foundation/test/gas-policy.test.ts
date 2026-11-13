import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quoteGas, reconcileGas, validateGasQuote } from '../src/gas-policy.ts';
import type { GasQuoteInput, GasCost } from '../src/gas-policy.ts';

const now = '2026-11-13T12:00:00.000Z';
function input(): GasQuoteInput {
  return { transactionId: 'transaction', ownerRef: 'owner', chainId: '84532', action: 'TRANSFER',
    actionDigest: 'a'.repeat(64), paymentAsset: 'USDC_TEST', paymentKind: 'STABLECOIN', paymentMethod: 'PREPAID',
    rate: { unitsNumerator: '3', weiDenominator: '7', evidenceDigest: 'b'.repeat(64) },
    estimatedAt: now, expiresAt: '2026-11-13T12:01:00.000Z', operations: [{ operationId: 'transfer',
      callDigest: 'c'.repeat(64), executionGasLimit: '100', maxFeePerGasWei: '2', l1DataFeeCapWei: '30', otherNetworkFeeCapWei: '10' }] };
}
function cost(): GasCost {
  return { operationId: 'transfer', executionRef: 'eip155:84532:userop:one', evidenceDigest: 'd'.repeat(64),
    outcome: 'SUCCESS', executionWei: '100', l1DataWei: '20', otherNetworkWei: '5' };
}
test('gas quote includes every operation, L1 data and other network components with exact ceiling hold', () => {
  const request = input(); request.operations.push({ ...request.operations[0]!, operationId: 'approval' });
  const quote = quoteGas(request, now);
  assert.equal(quote.maximumNetworkWei, '480'); assert.equal(quote.maximumPaymentUnits, '206');
  assert.equal(quote.operations.length, 2);
});
test('successful gas reconciliation credits all unused units and exposes rational rounding remainder', () => {
  const result = reconcileGas(quoteGas(input(), now), [cost()]);
  assert.deepEqual(result, { status: 'SETTLED', actualNetworkWei: '125', chargeUnits: '53', refundUnits: '50',
    remainderNumerator: '4', remainderDenominator: '7', reasons: [] });
});
test('all supported transaction types require positive gas and ORIO payment is a separate denomination', () => {
  for (const action of ['PURCHASE', 'REDEMPTION', 'TRANSFER', 'OTHER'] as const) {
    const request = input(); request.action = action; request.paymentKind = 'ORIO'; request.paymentAsset = 'ORIO_TEST';
    const quote = quoteGas(request, now);
    assert.equal(quote.maximumPaymentUnits, '103'); assert.equal(quote.paymentKind, 'ORIO');
    assert.equal(Reflect.has(quote, 'conversionFee'), false); assert.equal(Reflect.has(quote, 'appreciation'), false);
  }
});
test('expired, future, overlong and noncanonical fee quotes fail closed', () => {
  for (const expiry of [now, '2026-11-13T13:00:00.000Z', '2026-11-13T12:01:00Z']) {
    const request = input(); request.expiresAt = expiry; assert.throws(() => quoteGas(request, now));
  }
  const request = input(); request.estimatedAt = '2026-11-13T12:00:01.000Z'; assert.throws(() => quoteGas(request, now));
});
test('canonical integer validation refuses floating point, leading zeros, zero execution and overflow', () => {
  for (const value of [100, '1.5', '01', '-1', '0', '1\n', '1' + '0'.repeat(78)]) {
    const request = input(); Reflect.set(request.operations[0]!, 'executionGasLimit', value);
    assert.throws(() => quoteGas(request, now));
  }
  const request = input(); request.operations[0]!.executionGasLimit = '9'.repeat(78);
  assert.throws(() => quoteGas(request, now), /precision/);
});
test('quote binds owner, action, denomination, conversion rate and exact call evidence', () => {
  const quote = quoteGas(input(), now);
  for (const field of ['ownerRef', 'actionDigest', 'maximumPaymentUnits']) {
    const tampered = structuredClone(quote); Reflect.set(tampered, field, 'different');
    assert.throws(() => validateGasQuote(tampered, now));
  }
  const persisted = Object.fromEntries(Object.entries(quote).reverse());
  assert.equal(JSON.stringify(persisted) === JSON.stringify(quote), false);
  // PostgreSQL JSONB key order does not change a quote's identity.
  validateGasQuote(JSON.parse(JSON.stringify(persisted)), now);
});
test('missing, duplicate and unquoted execution costs cannot settle', () => {
  const quote = quoteGas(input(), now);
  assert.equal(reconcileGas(quote, []).status, 'REVIEW_REQUIRED');
  assert.throws(() => reconcileGas(quote, [cost(), cost()]), /Duplicate/);
  const unknown = cost(); unknown.operationId = 'not-quoted'; assert.throws(() => reconcileGas(quote, [unknown]));
});
test('fee spikes, per-component overruns and every failure cause require review without a user debit', () => {
  const quote = quoteGas(input(), now);
  for (const outcome of ['USER_FAILURE', 'PLATFORM_FAILURE', 'NETWORK_FAILURE', 'REVERT', 'UNKNOWN'] as const) {
    const receipt = cost(); receipt.outcome = outcome;
    const result = reconcileGas(quote, [receipt]);
    assert.equal(result.status, 'REVIEW_REQUIRED'); assert.equal(result.chargeUnits, null); assert.equal(result.refundUnits, null);
  }
  for (const receipt of [{ ...cost(), executionWei: '1000' }, { ...cost(), l1DataWei: '31' }]) {
    const result = reconcileGas(quote, [receipt]); assert.equal(result.status, 'REVIEW_REQUIRED'); assert.equal(result.chargeUnits, null);
  }
});
test('no USDC dollar peg or ORIO price is inferred and old finalized costs can reconcile after expiry', () => {
  const request = input(); request.rate.unitsNumerator = '9007199254740993';
  const quote = quoteGas(request, now); const result = reconcileGas(quote, [cost()]);
  assert.equal(result.chargeUnits, (125n * 9007199254740993n / 7n).toString());
  assert.throws(() => validateGasQuote(quote, '2026-11-13T13:00:00.000Z'));
});
test('redemption proceeds cannot finance another action and duplicate/empty operations are rejected', () => {
  const request = input(); request.paymentMethod = 'REDEMPTION_PROCEEDS'; assert.throws(() => quoteGas(request, now));
  request.action = 'REDEMPTION'; assert.doesNotThrow(() => quoteGas(request, now));
  request.operations.push(request.operations[0]!); assert.throws(() => quoteGas(request, now));
  request.operations = []; assert.throws(() => quoteGas(request, now));
  for (const field of ['transactionId', 'ownerRef', 'paymentAsset']) {
    const malformed = input(); Reflect.set(malformed, field, 'valid\n');
    assert.throws(() => quoteGas(malformed, now));
  }
  const malformed = input(); malformed.rate.evidenceDigest += '\n';
  assert.throws(() => quoteGas(malformed, now));
});
