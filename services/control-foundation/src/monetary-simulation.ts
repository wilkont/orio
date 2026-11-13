import { gasDigest } from './gas-policy.ts';
import { initialMonetaryState, planPurchaseEpoch, planRedemptionEpoch, reconcileZeroSupply, usdScale, orioScale, monetaryPolicyId } from './monetary-engine.ts';
import type { MonetaryState, MasterValuation } from './monetary-engine.ts';

/** Reproducible approved-policy scenarios only; no custody, ledger or network effects. */
export function monetaryScenarios() {
  const now = '2026-11-13T12:00:00.000Z';
  const valuation: MasterValuation = { masterAssetId: 'synthetic-usdc', electionId: 'synthetic-election',
    usd36PerToken: usdScale.toString(), evidenceDigest: 'a'.repeat(64), observedAt: '2026-11-13T11:59:00.000Z',
    expiresAt: '2026-11-13T12:01:00.000Z', issuanceAllowed: true };
  const initial = initialMonetaryState(valuation.masterAssetId, valuation.electionId);
  const ordinary: MonetaryState = { ...initial, phase: 'ACTIVE', supplyAtoms: (1000n * orioScale).toString(), reserveMasterUnits: '1000000000' };
  const genesis = planPurchaseEpoch(initial, valuation, [{ id: 'first', masterUnits: '1000000000' }], now);
  const ordinaryPurchase = planPurchaseEpoch(ordinary, valuation, [{ id: 'buyer', masterUnits: '100000000' }], now);
  const ordinaryEpoch = planRedemptionEpoch(ordinary, valuation, [{ id: 'a', tokenAtoms: (300n * orioScale).toString() },
    { id: 'b', tokenAtoms: (200n * orioScale).toString() }], now);
  const finalState: MonetaryState = { ...ordinary, priceUsd36: { numerator: (usdScale * 5n / 4n).toString(), denominator: '1' }, reserveMasterUnits: '1250000000' };
  const fullRedemption = planRedemptionEpoch(finalState, valuation, [{ id: 'all', tokenAtoms: finalState.supplyAtoms }], now);
  const reopened = reconcileZeroSupply(fullRedemption.next, valuation, { expectedStateDigest: gasDigest(fullRedemption.next),
    checkpointDigest: 'b'.repeat(64), reserveMasterUnits: fullRedemption.next.reserveMasterUnits, pendingRedemptionUnits: '0', unsettledCompanyFeeUnits: '0' }, now);
  const reopening = planPurchaseEpoch(reopened, valuation, [{ id: 'reopened', masterUnits: '125000000' }], now);
  const concentrationState: MonetaryState = { ...ordinary, supplyAtoms: (1000000n * orioScale).toString(), reserveMasterUnits: '1000000000000' };
  const concentration = planRedemptionEpoch(concentrationState, valuation, [{ id: 'almost-all', tokenAtoms: (999999n * orioScale).toString() }], now);
  return { policyStatus: 'FOUNDER_APPROVED', policyId: monetaryPolicyId, simulationOnly: true,
    genesis, ordinaryPurchase, ordinaryEpoch, fullRedemption, reopening, concentration };
}
