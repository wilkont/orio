import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateConversionRoute } from '../src/conversion-route.ts';
import type { ConversionRouteQuote, IndependentRouteLimit } from '../src/conversion-route.ts';
const election = { assetId: 'chain:master', electionId: 'e1', state: 'ACTIVE_MASTER' } as const;
const binding = { intentId: 'i1', sourceAssetId: 'chain:source', sourceUnits: '9007199254740993', masterAssetId: 'chain:master', electionId: 'e1', reserveVaultId: 'vault' };
const intent = { ...binding, state: 'FUNDED' };
const quote = { ...binding, providerId: 'provider', routeId: 'route', quoteDigest: 'a'.repeat(64), minimumMasterUnits: '9007199254740993', issuedAtMs: 1000, expiresAtMs: 2000 };
const limit = { ...binding, evidenceDigest: 'b'.repeat(64), minimumMasterUnits: '9007199254740993', issuedAtMs: 1000, expiresAtMs: 2000 };
const routes = [{ providerId: 'provider', routeId: 'route', sourceAssetId: 'chain:source', masterAssetId: 'chain:master' }];
const run = (q: ConversionRouteQuote = quote, l: IndependentRouteLimit = limit) => validateConversionRoute(election, intent, q, l, routes, 1500);

test('exact quoted proceeds satisfy independent bound without aliasing or execution fields', () => {
  const result = run({ ...quote, executionPayload: 'not accepted' } as ConversionRouteQuote);
  assert.deepEqual(result, quote);
  assert.notEqual(result, quote);
  result.sourceUnits = '1';
  assert.equal(quote.sourceUnits, '9007199254740993');
});
test('one-unit shortfall above safe-number range is rejected', () => {
  assert.throws(() => run({ ...quote, minimumMasterUnits: '9007199254740992' }), /independent minimum/);
});
test('all route bindings match intent and independent evidence', () => {
  for (const key of ['intentId', 'sourceAssetId', 'sourceUnits', 'masterAssetId', 'electionId', 'reserveVaultId'] as const) {
    assert.throws(() => run({ ...quote, [key]: 'different' }));
    assert.throws(() => run(quote, { ...limit, [key]: 'different' }));
  }
});
test('only active current election and funded intent permit preflight', () => {
  for (const state of ['DEPOSIT_PAUSED', 'MIGRATING', 'QUARANTINED'] as const)
    assert.throws(() => validateConversionRoute({ ...election, state }, intent, quote, limit, routes, 1500));
  assert.throws(() => validateConversionRoute({ ...election, electionId: 'new' }, intent, quote, limit, routes, 1500));
  for (const state of ['REQUESTED', 'CONVERTING', 'MASTER_RECEIVED', 'REFUND_DUE', 'REFUNDED', 'unknown'])
    assert.throws(() => validateConversionRoute(election, { ...intent, state }, quote, limit, routes, 1500), /not ready/);
});
test('route allowlist matches provider, route and both assets exactly', () => {
  assert.throws(() => validateConversionRoute(election, intent, quote, limit, [], 1500), /not eligible/);
  for (const key of ['providerId', 'routeId', 'sourceAssetId', 'masterAssetId'] as const)
    assert.throws(() => validateConversionRoute(election, intent, quote, limit, [{ ...routes[0]!, [key]: 'other' }], 1500), /not eligible/);
});
test('expiry boundary, future evidence and invalid clocks fail closed for both sources', () => {
  for (const patch of [{ expiresAtMs: 1500 }, { issuedAtMs: 1501 }, { issuedAtMs: -1 }, { expiresAtMs: NaN }, { issuedAtMs: 1.5 }, { issuedAtMs: 2000, expiresAtMs: 1000 }]) {
    assert.throws(() => run({ ...quote, ...patch }));
    assert.throws(() => run(quote, { ...limit, ...patch }));
  }
  for (const clock of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => validateConversionRoute(election, intent, quote, limit, routes, clock));
});
test('malformed monetary quantities never coerce into numbers', () => {
  for (const value of [0, 1, 9007199254740992, null, undefined, '', '0', '01', '-1', '1.5', '1e3', ' 1', '9'.repeat(79)]) {
    assert.throws(() => run({ ...quote, minimumMasterUnits: value } as ConversionRouteQuote));
    assert.throws(() => run(quote, { ...limit, minimumMasterUnits: value } as IndependentRouteLimit));
    const altered = { ...binding, sourceUnits: value };
    assert.throws(() => validateConversionRoute(election, { ...altered, state: 'FUNDED' } as typeof intent, { ...quote, ...altered } as ConversionRouteQuote, { ...limit, ...altered } as IndependentRouteLimit, routes, 1500));
  }
});
test('malformed identifiers, evidence digests and untyped inputs fail closed', () => {
  for (const value of ['', ' ', ' route', null, undefined, 1])
    assert.throws(() => run({ ...quote, routeId: value } as ConversionRouteQuote));
  for (const value of ['', 'A'.repeat(64), 'a'.repeat(63), null, 1]) {
    assert.throws(() => run({ ...quote, quoteDigest: value } as ConversionRouteQuote));
    assert.throws(() => run(quote, { ...limit, evidenceDigest: value } as IndependentRouteLimit));
  }
  for (const value of [null, undefined, {}, []]) assert.throws(() => validateConversionRoute(election, intent, value as ConversionRouteQuote, limit, routes, 1500));
});
