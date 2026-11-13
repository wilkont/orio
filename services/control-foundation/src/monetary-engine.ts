import { gasDigest, gasReference, gasUnits } from './gas-policy.ts';

export const monetaryPolicyId = 'orio-final-monetary-2026-11-13-v1';
export const usdScale = 10n ** 36n, orioScale = 10n ** 18n;
export interface Ratio { numerator: string; denominator: string }
interface Fraction { n: bigint; d: bigint }
export interface MonetaryState {
  policyId: typeof monetaryPolicyId;
  masterAssetId: string; electionId: string; masterDecimals: number;
  supplyAtoms: string; priceUsd36: Ratio; reserveMasterUnits: string; roundingUsd36: Ratio;
  cycle: string; phase: 'GENESIS' | 'ACTIVE' | 'ZERO_SUPPLY_PENDING' | 'ZERO_SUPPLY_RECONCILED';
}
export interface MasterValuation {
  masterAssetId: string; electionId: string; usd36PerToken: string;
  evidenceDigest: string; observedAt: string; expiresAt: string; issuanceAllowed: boolean;
}
export interface PurchaseRequest { id: string; masterUnits: string }
export interface RedemptionRequest { id: string; tokenAtoms: string }
const limit = (1n << 256n) - 1n;
function fraction(n: bigint, d = 1n): Fraction {
  if (n < 0n || d <= 0n) throw new Error('Invalid nonnegative monetary fraction');
  let a = n, b = d; while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
const div = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n);
const floor = (a: Fraction) => a.n / a.d;
const ceil = (a: Fraction) => (a.n + a.d - 1n) / a.d;
const compare = (a: Fraction, b: Fraction) => a.n * b.d - b.n * a.d;
function units(value: bigint): string {
  if (value < 0n || value > limit) throw new Error('Monetary accounting precision exceeded; reject batch before finality');
  return value.toString();
}
function packed(value: Fraction): Ratio { return { numerator: units(value.n), denominator: units(value.d) }; }
function ratio(value: Ratio): Fraction {
  const n = gasUnits(value.numerator), d = gasUnits(value.denominator, true), result = fraction(n, d);
  units(n); units(d);
  if (result.n.toString() !== value.numerator || result.d.toString() !== value.denominator)
    throw new Error('Monetary ratios must be canonical reduced fractions');
  return result;
}
function time(value: string): number {
  if (typeof value !== 'string') throw new Error('Invalid monetary clock');
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString() !== value) throw new Error('Monetary clock requires canonical UTC');
  return result;
}
function validate(state: MonetaryState, valuation: MasterValuation, now: string) {
  if (state.policyId !== monetaryPolicyId || !Number.isInteger(state.masterDecimals) || state.masterDecimals < 0 || state.masterDecimals > 77)
    throw new Error('Invalid monetary policy or master precision');
  gasReference(state.masterAssetId); gasReference(state.electionId);
  units(gasUnits(state.cycle)); const supply = gasUnits(state.supplyAtoms), reserve = gasUnits(state.reserveMasterUnits);
  units(supply); units(reserve);
  const price = ratio(state.priceUsd36), rounding = ratio(state.roundingUsd36);
  if (price.n === 0n || price.d !== 1n || !['GENESIS', 'ACTIVE', 'ZERO_SUPPLY_PENDING', 'ZERO_SUPPLY_RECONCILED'].includes(state.phase) ||
      (state.phase === 'ACTIVE' ? supply === 0n : supply !== 0n)) throw new Error('Inconsistent monetary state');
  if (state.phase === 'GENESIS' && (state.cycle !== '0' || reserve !== 0n || rounding.n !== 0n || compare(price, fraction(usdScale)) !== 0n))
    throw new Error('Original genesis must start empty at one USD');
  if (valuation.masterAssetId !== state.masterAssetId || valuation.electionId !== state.electionId ||
      typeof valuation.evidenceDigest !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(valuation.evidenceDigest) ||
      typeof valuation.issuanceAllowed !== 'boolean' || time(valuation.observedAt) > time(now) ||
      time(valuation.expiresAt) <= time(now) || time(valuation.expiresAt) <= time(valuation.observedAt))
    throw new Error('Missing current master valuation evidence');
  const masterScale = 10n ** BigInt(state.masterDecimals), value = gasUnits(valuation.usd36PerToken, true);
  units(value);
  const assetUsd = (amount: bigint) => fraction(amount * value, masterScale);
  const liability = mul(fraction(supply, orioScale), price);
  if (compare(assetUsd(reserve), add(liability, rounding)) < 0n)
    throw new Error('Reserve impairment: monetary liabilities and residuals are not covered');
  return { supply, reserve, price, rounding, masterScale, value, assetUsd };
}
function ordered<T extends { id: string }>(requests: T[]): T[] {
  if (!Array.isArray(requests) || !requests.length || requests.length > 10000) throw new Error('Invalid monetary epoch size');
  const seen = new Set<string>();
  for (const item of requests) {
    gasReference(item.id); if (seen.has(item.id)) throw new Error('Duplicate monetary request'); seen.add(item.id);
  }
  return [...requests].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function initialMonetaryState(masterAssetId: string, electionId: string, masterDecimals = 6): MonetaryState {
  gasReference(masterAssetId); gasReference(electionId);
  if (!Number.isInteger(masterDecimals) || masterDecimals < 0 || masterDecimals > 77) throw new Error('Invalid master precision');
  return { policyId: monetaryPolicyId, masterAssetId, electionId, masterDecimals,
    supplyAtoms: '0', priceUsd36: { numerator: usdScale.toString(), denominator: '1' },
    reserveMasterUnits: '0', roundingUsd36: { numerator: '0', denominator: '1' }, cycle: '0', phase: 'GENESIS' };
}

/** Pure exact monetary planning; no custody, signatures, journal writes or blockchain execution.
 * Caller must bind valuation and an immutable epoch snapshot before consuming this result. */
export function planPurchaseEpoch(state: MonetaryState, valuation: MasterValuation, requests: PurchaseRequest[], now: string) {
  const before = validate(state, valuation, now);
  if (!valuation.issuanceAllowed) throw new Error('Reserve valuation policy restricts issuance');
  if (state.phase === 'ZERO_SUPPLY_PENDING') throw new Error('Zero-supply reconciliation must complete before reopening');
  let fee = 0n, company = 0n, holders = 0n, gross = 0n;
  let mintedTotal = 0n, residual = fraction(0n), supply = before.supply, price = before.price;
  // IDs here must be immutable platform-assigned inclusion ordinals. Purchase transitions
  // are sequential: only the actual zero-supply purchase gets the zero-holder exception.
  const allocations = ordered(requests).map(request => {
    const amount = gasUnits(request.masterUnits, true), charge = ceil(fraction(amount, 100n));
    units(amount);
    if (amount <= charge) throw new Error('Purchase cannot produce positive net backing');
    const companyShare = supply === 0n ? charge : charge / 5n, holderShare = charge - companyShare;
    let holderRounding = fraction(0n);
    if (supply > 0n) {
      const exactPrice = add(price, div(mul(before.assetUsd(holderShare), fraction(orioScale)), fraction(supply)));
      const quantized = fraction(floor(exactPrice));
      if (holderShare > 0n && compare(quantized, price) === 0n) throw new Error('Holder appreciation is below reference precision; pause batch');
      holderRounding = mul(sub(exactPrice, quantized), fraction(supply, orioScale));
      price = quantized;
    }
    const netValue = before.assetUsd(amount - charge);
    const exact = div(mul(netValue, fraction(orioScale)), price), minted = floor(exact);
    if (minted === 0n) throw new Error('Purchase cannot produce one ORIO atomic unit');
    const remainder = sub(netValue, mul(fraction(minted, orioScale), price));
    gross += amount; fee += charge; company += companyShare; holders += holderShare;
    mintedTotal += minted; supply += minted; residual = add(residual, add(remainder, holderRounding));
    return { id: request.id, grossMasterUnits: units(amount), feeMasterUnits: units(charge),
      companyMasterUnits: units(companyShare), holderMasterUnits: units(holderShare), priceUsd36: packed(price),
      mintedAtoms: units(minted), roundingUsd36: packed(add(remainder, holderRounding)),
      mintRoundingUsd36: packed(remainder), holderPriceRoundingUsd36: packed(holderRounding) };
  });
  const next: MonetaryState = { ...state, phase: 'ACTIVE', supplyAtoms: units(before.supply + mintedTotal),
    reserveMasterUnits: units(before.reserve + gross - company), priceUsd36: packed(price),
    roundingUsd36: packed(add(before.rounding, residual)) };
  validate(next, valuation, now);
  return { policyId: monetaryPolicyId, kind: 'PURCHASE' as const, beforeDigest: gasDigest(state), valuationDigest: valuation.evidenceDigest,
    feeMasterUnits: units(fee), companyMasterUnits: units(company), holderMasterUnits: units(holders),
    roundingUsd36: packed(residual), allocations, next };
}

export function planRedemptionEpoch(state: MonetaryState, valuation: MasterValuation, requests: RedemptionRequest[], now: string) {
  const before = validate(state, valuation, now);
  if (state.phase !== 'ACTIVE') throw new Error('Redemption requires positive active supply');
  const batch = ordered(requests); let burned = 0n;
  for (const request of batch) burned += gasUnits(request.tokenAtoms, true);
  if (burned > before.supply) throw new Error('Redemption batch exceeds outstanding supply');
  const remaining = before.supply - burned;
  let fees = 0n, company = 0n, holders = 0n, payouts = 0n, residual = fraction(0n);
  const allocations = batch.map(request => {
    const atoms = gasUnits(request.tokenAtoms, true);
    const grossUsd = mul(fraction(atoms, orioScale), before.price);
    const grossMaster = mul(grossUsd, fraction(before.masterScale, before.value));
    const fee = ceil(div(grossMaster, fraction(100n)));
    if (compare(grossMaster, fraction(fee)) <= 0n) throw new Error('Redemption cannot produce positive payout after fee');
    const exactPayout = sub(grossMaster, fraction(fee)), payout = floor(exactPayout);
    if (payout === 0n) throw new Error('Redemption cannot produce one payout atomic unit');
    const companyShare = remaining === 0n ? fee : fee / 5n;
    const remainder = mul(sub(exactPayout, fraction(payout)), fraction(before.value, before.masterScale));
    fees += fee; company += companyShare; holders += fee - companyShare; payouts += payout; residual = add(residual, remainder);
    return { id: request.id, burnedAtoms: units(atoms), grossUsd36: packed(grossUsd), feeMasterUnits: units(fee),
      companyMasterUnits: units(companyShare), holderMasterUnits: units(fee - companyShare),
      payoutMasterUnits: units(payout), roundingUsd36: packed(remainder) };
  });
  if (payouts + company > before.reserve) throw new Error('Insufficient actual reserve for redemption');
  const exactPrice = remaining === 0n ? before.price : add(before.price,
    div(mul(before.assetUsd(holders), fraction(orioScale)), fraction(remaining)));
  const price = fraction(floor(exactPrice));
  if (remaining > 0n && holders > 0n && compare(price, before.price) === 0n)
    throw new Error('Holder appreciation is below reference precision; pause batch');
  const holderRounding = mul(sub(exactPrice, price), fraction(remaining, orioScale));
  residual = add(residual, holderRounding);
  const next: MonetaryState = { ...state, phase: remaining === 0n ? 'ZERO_SUPPLY_PENDING' : 'ACTIVE',
    supplyAtoms: units(remaining), reserveMasterUnits: units(before.reserve - payouts - company),
    priceUsd36: packed(price), roundingUsd36: packed(add(before.rounding, residual)) };
  validate(next, valuation, now);
  return { policyId: monetaryPolicyId, kind: 'REDEMPTION' as const, beforeDigest: gasDigest(state), valuationDigest: valuation.evidenceDigest,
    feeMasterUnits: units(fees), companyMasterUnits: units(company), holderMasterUnits: units(holders),
    payoutMasterUnits: units(payouts), roundingUsd36: packed(residual), holderPriceRoundingUsd36: packed(holderRounding), allocations, next };
}

export interface ZeroSupplyReconciliation {
  expectedStateDigest: string; checkpointDigest: string; reserveMasterUnits: string;
  pendingRedemptionUnits: string; unsettledCompanyFeeUnits: string;
}
/** Evidence is a trusted-adapter assertion, not a signature or proof by itself. */
export function reconcileZeroSupply(state: MonetaryState, valuation: MasterValuation, evidence: ZeroSupplyReconciliation, now: string): MonetaryState {
  validate(state, valuation, now);
  if (state.phase !== 'ZERO_SUPPLY_PENDING' || evidence.expectedStateDigest !== gasDigest(state) ||
      typeof evidence.checkpointDigest !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(evidence.checkpointDigest) ||
      evidence.reserveMasterUnits !== state.reserveMasterUnits || evidence.pendingRedemptionUnits !== '0' || evidence.unsettledCompanyFeeUnits !== '0')
    throw new Error('Zero-supply checkpoint or obligations remain unresolved');
  return { ...state, phase: 'ZERO_SUPPLY_RECONCILED', cycle: units(gasUnits(state.cycle) + 1n) };
}
