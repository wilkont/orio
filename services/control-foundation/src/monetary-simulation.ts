import { gasUnits } from './gas-policy.ts';

/** Exact rational economic experiments only. These proposed policies are NOT settlement APIs. */
interface Rational { numerator: bigint; denominator: bigint }
function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator <= 0n || numerator < 0n) throw new Error('Invalid nonnegative rational');
  let a = numerator, b = denominator;
  while (b !== 0n) [a, b] = [b, a % b];
  return { numerator: numerator / a, denominator: denominator / a };
}
function multiply(a: Rational, b: Rational) { return rational(a.numerator * b.numerator, a.denominator * b.denominator); }
function add(a: Rational, b: Rational) { return rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator); }
function subtract(a: Rational, b: Rational) { return rational(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator); }
function divide(a: Rational, b: Rational) { return rational(a.numerator * b.denominator, a.denominator * b.numerator); }
function serialize(value: Rational) { return { numerator: value.numerator.toString(), denominator: value.denominator.toString() }; }
const hundredth = rational(1n, 100n), fifth = rational(1n, 5n), fourFifths = rational(4n, 5n);
const usdScale = 10n ** 36n, tokenScale = 10n ** 18n;

export function simulateGenesis(grossUsd36: string) {
  const gross = rational(gasUnits(grossUsd36, true), usdScale);
  const fee = multiply(gross, hundredth), company = multiply(fee, fifth), escrow = multiply(fee, fourFifths);
  const backing = subtract(gross, fee), exactTokenUnits = multiply(backing, rational(tokenScale));
  const minted = exactTokenUnits.numerator / exactTokenUnits.denominator;
  if (minted === 0n) throw new Error('Candidate purchase creates no ORIO units');
  return { simulationOnly: true as const, approved: false as const, initialPriceUsd: serialize(rational(1n)),
    grossUsd: serialize(gross), conversionFeeUsd: serialize(fee), companyUsd: serialize(company),
    restrictedEscrowUsd: serialize(escrow), backingUsd: serialize(backing), mintedTokenUnits: minted.toString(),
    mintResidualUsd: serialize(subtract(backing, rational(minted, tokenScale))) };
}

export function simulateRedemptionEpoch(input: { reserveUsd36: string; supplyTokenUnits: string; redemptions: Array<{ id: string; tokenUnits: string }> }) {
  const supply = gasUnits(input.supplyTokenUnits, true), reserve = rational(gasUnits(input.reserveUsd36, true), usdScale);
  if (!input.redemptions.length || input.redemptions.length > 10_000) throw new Error('Invalid simulated epoch');
  const ids = new Set<string>(); let burned = 0n;
  const requests = [...input.redemptions].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(request => {
    if (!/^[A-Za-z0-9:_-]{1,100}$/.test(request.id) || ids.has(request.id)) throw new Error('Invalid simulated redemption identity');
    ids.add(request.id); const units = gasUnits(request.tokenUnits, true); burned += units;
    const gross = multiply(reserve, rational(units, supply)), fee = multiply(gross, hundredth);
    return { id: request.id, grossUsd: serialize(gross), feeUsd: serialize(fee), netBeforeGasUsd: serialize(subtract(gross, fee)) };
  });
  if (burned > supply) throw new Error('Redemptions exceed snapshot supply');
  const remaining = supply - burned, gross = multiply(reserve, rational(burned, supply)), fee = multiply(gross, hundredth);
  const company = remaining === 0n ? fee : multiply(fee, fifth), appreciation = remaining === 0n ? rational(0n) : multiply(fee, fourFifths);
  const remainingBacking = add(subtract(reserve, gross), appreciation);
  return { simulationOnly: true as const, approved: false as const,
    snapshotPriceUsdPerOrio: serialize(multiply(divide(reserve, rational(supply)), rational(tokenScale))), requests,
    remainingTokenUnits: remaining.toString(), feeUsd: serialize(fee), companyUsd: serialize(company),
    holderAppreciationUsd: serialize(appreciation), remainingBackingUsd: serialize(remainingBacking),
    postEpochPriceUsdPerOrio: remaining === 0n ? null : serialize(multiply(divide(remainingBacking, rational(remaining)), rational(tokenScale))),
    concentrationReview: remaining > 0n && remaining * 100n < supply,
    withheldAppreciationUsd: serialize(rational(0n)),
    reopening: remaining === 0n ? 'REQUIRES_APPROVED_NEW_CYCLE_POLICY' : 'NOT_APPLICABLE' };
}
