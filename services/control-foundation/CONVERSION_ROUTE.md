# Conversion route preflight

`src/conversion-route.ts` is a pure, local gate, not a swap executor or financial authorization. It requires a FUNDED intent, active current election, exact binding of intent/source units/assets/reserve vault, an explicitly eligible provider/route/asset pair, current quote and independent-limit evidence, and quoted minimum proceeds at least the independently supplied minimum. Monetary values are canonical positive integer strings compared using BigInt. Expiry is exclusive. Unknown/refunding/completed states fail closed. The return value excludes extra adapter execution payloads.

The caller must authenticate the quote and independently sourced limit, establish provider/network/issuer eligibility and evidence freshness policy, and derive the minimum under an approved valuation/slippage policy. Digests are identifiers, not proof of authenticity or independence. No caller boolean can substitute for adapter verification. The function does not invent pricing, bootstrap, fee, quantization or residual policy. Those unresolved decisions remain blockers.

Before any execution, integrate the gate with durable conversion records, recheck current election/intent version/allowlist and expiry atomically, consume each intent once, verify finalized receipts, and enforce separately authorized release gates. This preflight does not resolve TOCTOU, execute transactions, grant permissions, make network calls, mint/burn, charge fees, or enable financial operation. Those adapters and atomic execution boundaries remain unimplemented.

Verification: `node --test test/conversion-route.test.ts`; this test is also included in the isolated `npm run test:local` harness. Tests cover exact quantities above Number.MAX_SAFE_INTEGER, one-unit shortfall, all bindings, stale election, refund and duplicate-start states, empty/mismatched routes, expiry boundary and invalid clocks, malformed runtime inputs, and output isolation.

The supplied FUNDED state is only a preflight snapshot. This module does not read persisted state or bind persisted quote digest, minimum, expiry or version. A durable writer must verify all those stored values atomically before CONVERSION_STARTED; this function alone never authorizes that transition.

## Local verification on 2026-11-12

Strict TypeScript check passed. The new route suite passed 8/8 tests; the existing isolated PostgreSQL harness including this suite passed 64/64 tests (exit 0). No deployed database was used. These results do not establish authenticated adapter integration, deployment or financial readiness.

## Atomic durable start (local migration 004)

Migration 004 adds an empty, disabled-by-default eligible-route registry and an event-insert guard for every CONVERSION_STARTED, including generic record_event calls. It does not grant runtime permissions or seed production routes. A recorded start must be the existing funded/versioned transition and match the locked active election, exact source/intent/vault bindings, stored quote digest, minimum and millisecond expiry. The guard holds entry, election and route-policy locks before checking current database time; stale evidence after a lock wait is rejected and the entire state/event transaction rolls back. An independently authenticated limit is bound to the same intent and cannot exceed quoted minimum proceeds.

recordConversionRouteStart uses a migration-specific SQL entry point, so it fails if 004 is not installed. The existing pure preflight may reject unsuitable candidates earlier, but is not the authoritative database boundary. Identical event retries return the original receipt even after expiry or later state changes; this is historical idempotency, never permission to execute a transaction again. Competing start event IDs cannot both advance one funded version.

Trust boundaries remain unchanged: a privileged owner can change/disable database controls, and digests do not authenticate adapters, verify source independence or approve routes. Production requires a separately authorized scoped writer, governed allowlist administration, authenticated evidence and independent audit. Do not wire this control transition directly to a financial executor: release gates, provider idempotency, expiry at actual dispatch, finalized custody receipts, mint/accounting and uncertain execution recovery still require implementation/qualification. No funds, external swaps, fees or mint/burn occur here.

004 is LOCAL ONLY, as is 003; neither was applied to AWS by this work. Existing migration history is preserved. Tests apply 003 then 004 in an isolated PostgreSQL instance and verify the real SQL path, not only the pure preflight. Post-upgrade bare generic CONVERSION_STARTED evidence is intentionally rejected. Stored quote expiry must be exactly representable in integer milliseconds to match the quote API; mismatched precision fails closed, without silently rounding.

Final atomic-start verification on 2026-11-12: strict TypeScript passed; full isolated PostgreSQL suite passed 73/73 tests, exit 0, including missing-migration refusal and expiry after both election and policy lock waits. No deployed database was accessed.
