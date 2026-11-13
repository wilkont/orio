import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulateGenesis, simulateRedemptionEpoch } from '../src/monetary-simulation.ts';
const usd = (whole: bigint) => (whole * 10n ** 36n).toString();
const tokens = (whole: bigint) => (whole * 10n ** 18n).toString();
test('proposed genesis reproduces 1000 USD purchase, 990 ORIO, 2 company and 8 restricted escrow', () => {
  const result = simulateGenesis(usd(1000n));
  assert.equal(result.mintedTokenUnits, tokens(990n));
  assert.deepEqual(result.companyUsd, { numerator: '2', denominator: '1' });
  assert.deepEqual(result.restrictedEscrowUsd, { numerator: '8', denominator: '1' });
  assert.equal(result.approved, false); assert.equal(result.simulationOnly, true);
});
test('fractional candidate mint rounds down, exposes every residual and rejects a zero-unit mint', () => {
  const result = simulateGenesis((2n * 10n ** 18n + 7n).toString());
  assert.equal(result.mintedTokenUnits, '1');
  assert.ok(BigInt(result.mintResidualUsd.numerator) > 0n);
  assert.throws(() => simulateGenesis('1'), /no ORIO units/);
});
test('full redemption sends the complete conversion fee to company and does not reopen automatically', () => {
  const result = simulateRedemptionEpoch({ reserveUsd36: usd(1000n), supplyTokenUnits: tokens(1000n), redemptions: [{ id: 'all', tokenUnits: tokens(1000n) }] });
  assert.deepEqual(result.companyUsd, { numerator: '10', denominator: '1' });
  assert.deepEqual(result.holderAppreciationUsd, { numerator: '0', denominator: '1' });
  assert.equal(result.postEpochPriceUsdPerOrio, null);
  assert.equal(result.reopening, 'REQUIRES_APPROVED_NEW_CYCLE_POLICY');
});
test('epoch pricing is independent of request order and redeemed tokens get no self-appreciation', () => {
  const input = { reserveUsd36: usd(1000n), supplyTokenUnits: tokens(1000n), redemptions: [{ id: 'b', tokenUnits: tokens(200n) }, { id: 'a', tokenUnits: tokens(300n) }] };
  const result = simulateRedemptionEpoch(input);
  assert.deepEqual(result, simulateRedemptionEpoch({ ...input, redemptions: [...input.redemptions].reverse() }));
  assert.deepEqual(result.holderAppreciationUsd, { numerator: '4', denominator: '1' });
  assert.deepEqual(result.postEpochPriceUsdPerOrio, { numerator: '126', denominator: '125' });
  assert.deepEqual(result.requests[0]!.netBeforeGasUsd, { numerator: '297', denominator: '1' });
});
test('near-zero supply exposes concentration without silently withholding holder allocation', () => {
  const result = simulateRedemptionEpoch({ reserveUsd36: usd(1_000_000n), supplyTokenUnits: tokens(1_000_000n), redemptions: [{ id: 'almost-all', tokenUnits: tokens(999_999n) }] });
  assert.equal(result.concentrationReview, true);
  assert.deepEqual(result.postEpochPriceUsdPerOrio, { numerator: '1000124', denominator: '125' });
  assert.deepEqual(result.withheldAppreciationUsd, { numerator: '0', denominator: '1' });
});
test('candidate one-percent concentration threshold is strict and invalid supply cannot settle', () => {
  const input = { reserveUsd36: usd(100n), supplyTokenUnits: tokens(100n), redemptions: [{ id: 'r', tokenUnits: tokens(99n) }] };
  assert.equal(simulateRedemptionEpoch(input).concentrationReview, false);
  assert.throws(() => simulateRedemptionEpoch({ ...input, redemptions: [{ id: 'r', tokenUnits: tokens(101n) }] }));
});
