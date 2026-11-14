import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gasDigest } from '../src/gas-policy.ts';
import { initialMonetaryState, planPurchaseEpoch, planRedemptionEpoch, reconcileZeroSupply, usdScale, orioScale } from '../src/monetary-engine.ts';
import type { MonetaryState, MasterValuation, Ratio } from '../src/monetary-engine.ts';

const now = '2026-11-13T12:00:00.000Z';
const valuation: MasterValuation = { masterAssetId: 'master', electionId: 'election', usd36PerToken: usdScale.toString(),
  evidenceDigest: 'a'.repeat(64), observedAt: '2026-11-13T11:59:00.000Z', expiresAt: '2026-11-13T12:01:00.000Z', issuanceAllowed: true };
const token = (whole: bigint) => (whole * orioScale).toString();
function active(supply = 100n, priceNumerator = 1n, priceDenominator = 1n): MonetaryState {
  const state = initialMonetaryState('master', 'election');
  return { ...state, phase: 'ACTIVE', supplyAtoms: token(supply),
    priceUsd36: { numerator: (usdScale * priceNumerator / priceDenominator).toString(), denominator: '1' },
    reserveMasterUnits: (supply * priceNumerator * 1_000_000n / priceDenominator).toString() };
}
function rational(value: Ratio) { return [BigInt(value.numerator), BigInt(value.denominator)] as const; }
function conservation(state: MonetaryState, price = usdScale) {
  const [pn, pd] = rational(state.priceUsd36), [rn, rd] = rational(state.roundingUsd36);
  const left = BigInt(state.reserveMasterUnits) * price * orioScale * pd * rd;
  const right = (BigInt(state.supplyAtoms) * pn * rd + rn * orioScale * pd) * 1_000_000n;
  assert.equal(left, right);
}
test('approved original genesis charges 100% company fee and mints backed ORIO with no genesis escrow', () => {
  const result = planPurchaseEpoch(initialMonetaryState('master', 'election'), valuation, [{ id: 'first', masterUnits: '1000000000' }], now);
  assert.equal(result.feeMasterUnits, '10000000'); assert.equal(result.companyMasterUnits, '10000000');
  assert.equal(result.holderMasterUnits, '0'); assert.equal(result.allocations[0]!.mintedAtoms, token(990n));
  assert.equal(result.next.reserveMasterUnits, '990000000'); assert.equal(Reflect.has(result, 'genesisEscrow'), false); conservation(result.next);
});
test('ordinary purchase appreciates old supply before minting and explicitly retains every fractional mint residual', () => {
  const result = planPurchaseEpoch(active(), valuation, [{ id: 'buyer', masterUnits: '100000000' }], now);
  assert.equal(result.companyMasterUnits, '200000'); assert.equal(result.holderMasterUnits, '800000');
  assert.equal(result.next.priceUsd36.numerator, (usdScale * 126n / 125n).toString());
  assert.equal(result.allocations[0]!.mintedAtoms, (99n * orioScale * 125n / 126n).toString());
  assert.ok(BigInt(result.roundingUsd36.numerator) > 0n); conservation(result.next);
});
test('native fee ceiling, company floor and holder remainder conserve the entire collected fee', () => {
  for (const amount of ['2', '99', '100', '101', '199', '501', '1000001']) {
    const result = planPurchaseEpoch(active(), valuation, [{ id: 'buyer', masterUnits: amount }], now);
    const fee = (BigInt(amount) + 99n) / 100n;
    assert.equal(result.feeMasterUnits, fee.toString()); assert.equal(result.companyMasterUnits, (fee / 5n).toString());
    assert.equal(BigInt(result.companyMasterUnits) + BigInt(result.holderMasterUnits), fee); conservation(result.next);
  }
});
test('redemption batches share one opening price and exclude every redeemed token from holder appreciation', () => {
  const requests = [{ id: 'b', tokenAtoms: token(20n) }, { id: 'a', tokenAtoms: token(30n) }];
  const result = planRedemptionEpoch(active(), valuation, requests, now);
  assert.deepEqual(result, planRedemptionEpoch(active(), valuation, [...requests].reverse(), now));
  assert.equal(result.payoutMasterUnits, '49500000'); assert.equal(result.companyMasterUnits, '100000'); assert.equal(result.holderMasterUnits, '400000');
  assert.equal(result.next.priceUsd36.numerator, (usdScale * 126n / 125n).toString()); conservation(result.next);
});
test('any positive remaining supply gets all holder remainder without a concentration threshold', () => {
  const result = planRedemptionEpoch(active(), valuation, [{ id: 'almost-all', tokenAtoms: (100n * orioScale - 1n).toString() }], now);
  assert.equal(result.next.supplyAtoms, '1'); assert.equal(result.holderMasterUnits, '800000');
  assert.equal(Reflect.has(result, 'withheldAppreciation'), false); conservation(result.next);
});
test('full redemption gives company the full fee and retains the valid price through reconciled reopening', () => {
  const result = planRedemptionEpoch(active(100n, 5n, 4n), valuation, [{ id: 'all', tokenAtoms: token(100n) }], now);
  assert.equal(result.companyMasterUnits, '1250000'); assert.equal(result.holderMasterUnits, '0');
  assert.equal(result.next.phase, 'ZERO_SUPPLY_PENDING'); assert.equal(result.next.priceUsd36.numerator, (usdScale * 5n / 4n).toString());
  assert.throws(() => planPurchaseEpoch(result.next, valuation, [{ id: 'reopen', masterUnits: '125000000' }], now), /reconciliation/);
  const reopened = reconcileZeroSupply(result.next, valuation, { expectedStateDigest: gasDigest(result.next), checkpointDigest: 'b'.repeat(64),
    reserveMasterUnits: result.next.reserveMasterUnits, pendingRedemptionUnits: '0', unsettledCompanyFeeUnits: '0' }, now);
  const purchase = planPurchaseEpoch(reopened, valuation, [{ id: 'reopen', masterUnits: '125000000' }], now);
  assert.equal(purchase.allocations[0]!.mintedAtoms, token(99n)); assert.equal(purchase.companyMasterUnits, '1250000');
  assert.deepEqual(purchase.next.priceUsd36, result.next.priceUsd36); assert.equal(purchase.next.cycle, '1'); conservation(purchase.next);
});
test('rounding, dust and unsupported valuations fail safely without modifying the original state', () => {
  const state = active(), copy = structuredClone(state);
  assert.throws(() => planPurchaseEpoch(state, valuation, [{ id: 'tiny', masterUnits: '1' }], now));
  assert.throws(() => planRedemptionEpoch(state, valuation, [{ id: 'tiny', tokenAtoms: '1' }], now));
  assert.throws(() => planRedemptionEpoch(state, valuation, [{ id: 'too-many', tokenAtoms: token(101n) }], now));
  for (const change of [{ issuanceAllowed: false }, { usd36PerToken: (usdScale * 9n / 10n).toString() },
    { electionId: 'stale' }, { expiresAt: now }]) assert.throws(() => planPurchaseEpoch(state, { ...valuation, ...change }, [{ id: 'p', masterUnits: '100000000' }], now));
  assert.deepEqual(state, copy);
});
test('a non-pegged master valuation changes genesis quantity instead of treating USDC as one dollar', () => {
  const depeg = { ...valuation, usd36PerToken: (usdScale * 9n / 10n).toString() };
  const result = planPurchaseEpoch(initialMonetaryState('master', 'election'), depeg, [{ id: 'first', masterUnits: '1000000000' }], now);
  assert.equal(result.allocations[0]!.mintedAtoms, token(891n)); conservation(result.next, usdScale * 9n / 10n);
  assert.throws(() => planPurchaseEpoch(initialMonetaryState('master', 'election'), { ...depeg, issuanceAllowed: false }, [{ id: 'p', masterUnits: '1000000000' }], now), /restricts issuance/);
});
test('request permutation is deterministic and splitting cannot reduce the native mandatory fee', () => {
  const state = active(), requests = [{ id: 'b', masterUnits: '101' }, { id: 'a', masterUnits: '199' }];
  const split = planPurchaseEpoch(state, valuation, requests, now), combined = planPurchaseEpoch(state, valuation, [{ id: 'one', masterUnits: '300' }], now);
  assert.deepEqual(split, planPurchaseEpoch(state, valuation, [...requests].reverse(), now));
  assert.ok(BigInt(split.feeMasterUnits) >= BigInt(combined.feeMasterUnits)); conservation(split.next);
});
test('only the first actual zero-supply purchase gets the exception; later purchases appreciate already minted supply', () => {
  const result = planPurchaseEpoch(initialMonetaryState('master', 'election'), valuation,
    [{ id: '0001', masterUnits: '100000000' }, { id: '0002', masterUnits: '100000000' }], now);
  assert.equal(result.allocations[0]!.companyMasterUnits, '1000000');
  assert.equal(result.allocations[1]!.companyMasterUnits, '200000');
  assert.equal(result.allocations[1]!.holderMasterUnits, '800000'); conservation(result.next);
});
test('seeded adversarial sizes preserve exact liabilities plus residuals for purchase and redemption plans', () => {
  let seed = 137n;
  for (let i = 0; i < 300; i++) {
    seed = (seed * 48271n) % 2147483647n;
    const supply = seed % 1000000n + 1n, state = active(supply);
    const gross = (seed * 99991n + 101n).toString();
    conservation(planPurchaseEpoch(state, valuation, [{ id: 'p', masterUnits: gross }], now).next);
    const quantity = (seed % supply + 1n) * orioScale;
    conservation(planRedemptionEpoch(state, valuation, [{ id: 'r', tokenAtoms: quantity.toString() }], now).next);
  }
});
test('repeated real transitions keep fixed-point price and conserved segregated residuals without denominator explosion', () => {
  let state = initialMonetaryState('master', 'election');
  for (let i = 0; i < 1000; i++) {
    state = planPurchaseEpoch(state, valuation, [{ id: 'purchase', masterUnits: '100000000' }], now).next;
    assert.equal(state.priceUsd36.denominator, '1'); conservation(state);
    if (i % 3 === 0) state = planRedemptionEpoch(state, valuation, [{ id: 'redemption', tokenAtoms: (BigInt(state.supplyAtoms) / 7n).toString() }], now).next;
    conservation(state);
  }
});
test('closed self-owned conversion cycles cannot create reserve value through splitting or rounding in the fixed-valuation model', () => {
  let seed = 171n;
  for (let i = 0; i < 200; i++) {
    seed = seed * 48271n % 2147483647n;
    const initial = active(seed % 1000n + 1n, 5n, 4n), deposit = seed + 202n;
    const bought = planPurchaseEpoch(initial, valuation, [{ id: '0001', masterUnits: (deposit / 2n).toString() },
      { id: '0002', masterUnits: (deposit - deposit / 2n).toString() }], now);
    const sold = planRedemptionEpoch(bought.next, valuation, [{ id: 'all', tokenAtoms: bought.next.supplyAtoms }], now);
    // Give the actor even the entire residual reserve as an upper bound on recoverable wealth.
    const end = BigInt(sold.payoutMasterUnits) + BigInt(sold.next.reserveMasterUnits);
    assert.ok(end <= BigInt(initial.reserveMasterUnits) + deposit);
    assert.equal(end + BigInt(bought.companyMasterUnits) + BigInt(sold.companyMasterUnits), BigInt(initial.reserveMasterUnits) + deposit);
  }
});
test('separate Python Fraction oracle agrees on exact fees, price, supply, liabilities and residuals over seeded vectors', () => {
  const vectors: Array<{ kind: 'PURCHASE' | 'REDEMPTION'; state: MonetaryState; value: string;
    requests: Array<{ id: string; masterUnits?: string; tokenAtoms?: string }> }> = [];
  const actual: unknown[] = [];
  let seed = 9173n;
  for (let i = 0; i < 120; i++) {
    seed = seed * 48271n % 2147483647n;
    const state = i % 5 === 0 ? initialMonetaryState('master', 'election') : active(seed % 10000n + 1n, 5n, 4n);
    const purchases = [{ id: '0001', masterUnits: (seed + 101n).toString() }, { id: '0002', masterUnits: (seed * 137n + 101n).toString() }];
    vectors.push({ kind: 'PURCHASE', state, value: valuation.usd36PerToken, requests: purchases });
    actual.push(planPurchaseEpoch(state, valuation, purchases, now));
    if (state.phase === 'ACTIVE') {
      const supply = BigInt(state.supplyAtoms), quantity = i % 4 === 0 ? supply : supply / 2n;
      const redemptions = [{ id: 'r', tokenAtoms: quantity.toString() }];
      vectors.push({ kind: 'REDEMPTION', state, value: valuation.usd36PerToken, requests: redemptions });
      actual.push(planRedemptionEpoch(state, valuation, redemptions, now));
    }
  }
  const script = fileURLToPath(new URL('../../../packages/monetary-reference/fixed_point_oracle.py', import.meta.url));
  const run = spawnSync('python', [script], { input: JSON.stringify(vectors), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  const expected: Array<Record<string, unknown>> = JSON.parse(run.stdout);
  for (const [index, result] of actual.entries()) {
    const normalized = JSON.parse(JSON.stringify(result));
    for (const field of ['feeMasterUnits', 'companyMasterUnits', 'holderMasterUnits', 'roundingUsd36', 'allocations', 'next'])
      assert.deepEqual(normalized[field], expected[index]![field], 'vector ' + index + ': ' + field);
  }
});
