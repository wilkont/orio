import { createHash } from 'node:crypto';

export type GasAction = 'PURCHASE' | 'REDEMPTION' | 'TRANSFER' | 'OTHER';
export interface GasOperation {
  operationId: string;
  callDigest: string;
  executionGasLimit: string;
  maxFeePerGasWei: string;
  l1DataFeeCapWei: string;
  otherNetworkFeeCapWei: string;
}
export interface GasQuoteInput {
  transactionId: string;
  ownerRef: string;
  chainId: '8453' | '84532';
  action: GasAction;
  actionDigest: string;
  paymentAsset: string;
  paymentKind: 'STABLECOIN' | 'ORIO';
  paymentMethod: 'PREPAID' | 'ADDITIONAL_BALANCE' | 'REDEMPTION_PROCEEDS';
  rate: { unitsNumerator: string; weiDenominator: string; evidenceDigest: string };
  estimatedAt: string;
  expiresAt: string;
  operations: GasOperation[];
}
export interface GasQuote extends GasQuoteInput {
  schemaVersion: 1;
  maximumNetworkWei: string;
  maximumPaymentUnits: string;
  digest: string;
}
export interface GasCost {
  operationId: string;
  executionRef: string;
  evidenceDigest: string;
  outcome: 'SUCCESS' | 'USER_FAILURE' | 'PLATFORM_FAILURE' | 'NETWORK_FAILURE' | 'REVERT' | 'UNKNOWN';
  executionWei: string;
  l1DataWei: string;
  otherNetworkWei: string;
}
const maxUnits = 10n ** 78n - 1n;
export function gasUnits(value: string, positive = false): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})(?![\s\S])/.test(value))
    throw new Error('Gas quantities must be canonical integer strings');
  const amount = BigInt(value);
  if (positive && amount === 0n) throw new Error('Gas quantity must be positive');
  return amount;
}
export function gasDigest(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, entry]) => [key, canonical(entry)]));
    return item;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function gasReference(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_./-]{1,180}(?![\s\S])/.test(value))
    throw new Error('Invalid gas reference');
}
function digest(value: string): void {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(value)) throw new Error('Invalid gas evidence digest');
}
function timestamp(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    throw new Error('Gas timestamp must be canonical UTC');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error('Invalid gas timestamp');
  return time;
}
function bounded(value: bigint): string {
  if (value > maxUnits) throw new Error('Gas amount exceeds ledger precision');
  return value.toString();
}

/** Deterministic estimate boundary. The caller authenticates fee/rate/call evidence. No execution. */
export function quoteGas(input: GasQuoteInput, now: string): GasQuote {
  gasReference(input.transactionId); gasReference(input.ownerRef); gasReference(input.paymentAsset);
  digest(input.actionDigest); digest(input.rate.evidenceDigest);
  if (!['8453', '84532'].includes(input.chainId) ||
      !['PURCHASE', 'REDEMPTION', 'TRANSFER', 'OTHER'].includes(input.action) ||
      !['STABLECOIN', 'ORIO'].includes(input.paymentKind) ||
      !['PREPAID', 'ADDITIONAL_BALANCE', 'REDEMPTION_PROCEEDS'].includes(input.paymentMethod))
    throw new Error('Unsupported gas quote binding');
  if (input.paymentMethod === 'REDEMPTION_PROCEEDS' && input.action !== 'REDEMPTION')
    throw new Error('Only redemption can authorize gas from proceeds');
  const estimated = timestamp(input.estimatedAt), expires = timestamp(input.expiresAt), current = timestamp(now);
  if (estimated > current || expires <= current || expires <= estimated || expires - estimated > 300_000)
    throw new Error('Gas estimate must be current and expire within five minutes');
  if (!Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > 32)
    throw new Error('Quote must include all operations, up to 32');
  const seen = new Set<string>();
  const operations = input.operations.map(operation => {
    gasReference(operation.operationId); digest(operation.callDigest);
    if (seen.has(operation.operationId)) throw new Error('Duplicate quoted gas operation');
    seen.add(operation.operationId);
    gasUnits(operation.executionGasLimit, true); gasUnits(operation.maxFeePerGasWei, true);
    gasUnits(operation.l1DataFeeCapWei); gasUnits(operation.otherNetworkFeeCapWei);
    return { operationId: operation.operationId, callDigest: operation.callDigest,
      executionGasLimit: operation.executionGasLimit, maxFeePerGasWei: operation.maxFeePerGasWei,
      l1DataFeeCapWei: operation.l1DataFeeCapWei, otherNetworkFeeCapWei: operation.otherNetworkFeeCapWei };
  });
  const total = operations.reduce((sum, operation) => sum +
    gasUnits(operation.executionGasLimit) * gasUnits(operation.maxFeePerGasWei) +
    gasUnits(operation.l1DataFeeCapWei) + gasUnits(operation.otherNetworkFeeCapWei), 0n);
  const numerator = gasUnits(input.rate.unitsNumerator, true), denominator = gasUnits(input.rate.weiDenominator, true);
  // Quote a ceiling as an authorized hold, not earned revenue. Settlement returns unused units.
  const body = { schemaVersion: 1 as const, transactionId: input.transactionId, ownerRef: input.ownerRef,
    chainId: input.chainId, action: input.action, actionDigest: input.actionDigest,
    paymentAsset: input.paymentAsset, paymentKind: input.paymentKind, paymentMethod: input.paymentMethod,
    rate: { unitsNumerator: input.rate.unitsNumerator, weiDenominator: input.rate.weiDenominator,
      evidenceDigest: input.rate.evidenceDigest }, estimatedAt: input.estimatedAt, expiresAt: input.expiresAt,
    operations, maximumNetworkWei: bounded(total),
    maximumPaymentUnits: bounded((total * numerator + denominator - 1n) / denominator) };
  return { ...body, digest: gasDigest(body) };
}

export function validateGasQuote(quote: GasQuote, now: string): void {
  const rebuilt = quoteGas(quote, now);
  if (gasDigest(rebuilt) !== gasDigest(quote)) throw new Error('Gas quote has changed');
}

export function validateGasCost(quote: GasQuote, cost: GasCost): bigint {
  const operation = quote.operations.find(item => item.operationId === cost.operationId);
  if (!operation) throw new Error('Unquoted gas operation');
  gasReference(cost.executionRef); digest(cost.evidenceDigest);
  if (!['SUCCESS', 'USER_FAILURE', 'PLATFORM_FAILURE', 'NETWORK_FAILURE', 'REVERT', 'UNKNOWN'].includes(cost.outcome))
    throw new Error('Unknown gas outcome');
  return gasUnits(cost.executionWei) + gasUnits(cost.l1DataWei) + gasUnits(cost.otherNetworkWei);
}

/** Candidate final rounding: floor the user debit, leave its rational remainder to company expense.
 * This is simulation/control code; policy approval and accountable release gates remain required. */
export function reconcileGas(quote: GasQuote, costs: GasCost[]): {
  status: 'SETTLED' | 'REVIEW_REQUIRED'; actualNetworkWei: string; chargeUnits: string | null;
  refundUnits: string | null; remainderNumerator: string; remainderDenominator: string; reasons: string[];
} {
  // Revalidate at estimation time so historical reconciliation survives quote expiration.
  validateGasQuote(quote, quote.estimatedAt);
  const seenOperations = new Set<string>(), seenRefs = new Set<string>(), reasons: string[] = [];
  let actual = 0n;
  for (const cost of costs) {
    const units = validateGasCost(quote, cost);
    if (seenOperations.has(cost.operationId) || seenRefs.has(cost.executionRef)) throw new Error('Duplicate gas cost');
    seenOperations.add(cost.operationId); seenRefs.add(cost.executionRef);
    actual += units;
    const operation = quote.operations.find(item => item.operationId === cost.operationId)!;
    if (gasUnits(cost.executionWei) > gasUnits(operation.executionGasLimit) * gasUnits(operation.maxFeePerGasWei) ||
        gasUnits(cost.l1DataWei) > gasUnits(operation.l1DataFeeCapWei) ||
        gasUnits(cost.otherNetworkWei) > gasUnits(operation.otherNetworkFeeCapWei)) reasons.push('COMPONENT_CAP_EXCEEDED');
    if (cost.outcome !== 'SUCCESS') reasons.push('FAILURE_POLICY_REQUIRES_APPROVAL');
  }
  if (seenOperations.size !== quote.operations.length) reasons.push('INCOMPLETE_EXECUTION');
  const numerator = actual * gasUnits(quote.rate.unitsNumerator), denominator = gasUnits(quote.rate.weiDenominator);
  const charge = numerator / denominator;
  if (seenOperations.size === quote.operations.length && actual > 0n && charge === 0n)
    reasons.push('GAS_CHARGE_BELOW_PAYMENT_PRECISION');
  if (actual > gasUnits(quote.maximumNetworkWei) || charge > gasUnits(quote.maximumPaymentUnits))
    reasons.push('AUTHORIZATION_CAP_EXCEEDED');
  const review = reasons.length > 0;
  return { status: review ? 'REVIEW_REQUIRED' : 'SETTLED', actualNetworkWei: bounded(actual),
    chargeUnits: review ? null : bounded(charge),
    refundUnits: review ? null : bounded(gasUnits(quote.maximumPaymentUnits) - charge),
    remainderNumerator: (numerator % denominator).toString(), remainderDenominator: denominator.toString(),
    reasons: [...new Set(reasons)] };
}
