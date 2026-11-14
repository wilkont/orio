import type { MasterElection } from './master-entry.ts';

export interface RouteBinding {
  intentId: string;
  sourceAssetId: string;
  sourceUnits: string;
  masterAssetId: string;
  electionId: string;
  reserveVaultId: string;
}
export interface RouteIntent extends RouteBinding {
  state: string;
}
export interface ConversionRouteQuote extends RouteBinding {
  providerId: string;
  routeId: string;
  quoteDigest: string;
  minimumMasterUnits: string;
  issuedAtMs: number;
  expiresAtMs: number;
}
export interface EligibleRoute {
  providerId: string;
  routeId: string;
  sourceAssetId: string;
  masterAssetId: string;
}
export interface IndependentRouteLimit extends RouteBinding {
  evidenceDigest: string;
  minimumMasterUnits: string;
  issuedAtMs: number;
  expiresAtMs: number;
}
const quantity = /^[1-9][0-9]{0,77}$/;
const digest = /^[0-9a-f]{64}$/;
const bindings = ['intentId', 'sourceAssetId', 'sourceUnits', 'masterAssetId', 'electionId', 'reserveVaultId'] as const;
function id(value: unknown): void {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > 512)
    throw new Error('Invalid route identifier');
}
function units(value: unknown): bigint {
  if (typeof value !== 'string' || !quantity.test(value)) throw new Error('Invalid route quantity');
  return BigInt(value);
}
function fresh(issued: number, expires: number, now: number): void {
  if (![issued, expires, now].every(x => Number.isSafeInteger(x) && x >= 0) ||
      issued > now || expires <= now || issued >= expires)
    throw new Error('Route evidence is expired, future-dated or invalid');
}

/**
 * Pure preflight, not execution authorization. Caller authenticates both evidence
 * sources, derives the independent limit under approved valuation policy, and
 * supplies current governance-approved routes and election. Recheck atomically
 * before execution; consume intent once. No fee, rounding, mint or swap occurs.
 */
export function validateConversionRoute(
  election: MasterElection,
  expected: RouteIntent,
  quote: ConversionRouteQuote,
  independent: IndependentRouteLimit,
  eligible: readonly EligibleRoute[],
  nowMs: number,
): ConversionRouteQuote {
  if (expected.state !== 'FUNDED') throw new Error('Intent is not ready for routing');
  if (election.state !== 'ACTIVE_MASTER') throw new Error('Master deposits are unavailable');
  id(election.assetId); id(election.electionId);
  for (const key of bindings) {
    id(expected[key]); id(quote[key]); id(independent[key]);
    if (expected[key] !== quote[key] || expected[key] !== independent[key])
      throw new Error('Route evidence does not match the intent');
  }
  units(expected.sourceUnits);
  if (election.assetId !== expected.masterAssetId || election.electionId !== expected.electionId)
    throw new Error('Route is for a different master election');
  id(quote.providerId); id(quote.routeId);
  if (!eligible.some(route => route.providerId === quote.providerId && route.routeId === quote.routeId &&
      route.sourceAssetId === expected.sourceAssetId && route.masterAssetId === expected.masterAssetId))
    throw new Error('Route is not eligible');
  if (typeof quote.quoteDigest !== 'string' || !digest.test(quote.quoteDigest) ||
      typeof independent.evidenceDigest !== 'string' || !digest.test(independent.evidenceDigest))
    throw new Error('Missing route evidence digest');
  fresh(quote.issuedAtMs, quote.expiresAtMs, nowMs);
  fresh(independent.issuedAtMs, independent.expiresAtMs, nowMs);
  if (units(quote.minimumMasterUnits) < units(independent.minimumMasterUnits))
    throw new Error('Route proceeds are below the independent minimum');
  // Explicit projection excludes unexpected execution payloads from untrusted adapters.
  return {
    intentId: expected.intentId, sourceAssetId: expected.sourceAssetId, sourceUnits: expected.sourceUnits,
    masterAssetId: expected.masterAssetId, electionId: expected.electionId, reserveVaultId: expected.reserveVaultId,
    providerId: quote.providerId, routeId: quote.routeId, quoteDigest: quote.quoteDigest,
    minimumMasterUnits: quote.minimumMasterUnits, issuedAtMs: quote.issuedAtMs, expiresAtMs: quote.expiresAtMs,
  };
}
