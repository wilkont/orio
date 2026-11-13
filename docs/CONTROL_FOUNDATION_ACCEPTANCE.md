# ORIO control foundation — local engineering acceptance

Current-policy notice (November 13): ADR 0002 supersedes the independent-review and distinct-release-approver requirements described below. External review is advisory; signed accountable acceptance and actual readiness evidence remain required.

Date: November 3, 2026. Scope: `docs/CONTROL_FOUNDATION_SPEC.md`, implementing prerequisites from directive sections 9, 10.2, 21, and 22. The full ORIO platform is not engineering-complete or deployed.

## Implemented evidence

| Requirement | Evidence |
|---|---|
| Exact append-only double entry | SQL functions reject numeric JSON/floats, fractional/exponent/signed/noncanonical units, duplicate/unknown accounts, and cross-asset netting; runtime cannot UPDATE/DELETE/TRUNCATE/INSERT accounting tables directly |
| Atomic settlement accounting | Journal, postings, account-definition snapshot, hash-chain head and outbox commit together; injected outbox failure rolls all of them back |
| Duplicate protection | 25 concurrent retries produce one receipt/journal; different idempotency key cannot reuse external settlement reference; conflicting data fails |
| Concurrent balances | Two simultaneous 80-unit withdrawals against 100 units admit only one; 30 concurrent independent postings form an unbroken chain |
| Verifiable checkpoints | Snapshot-consistent SHA-256 replay detects changed payload/account metadata and mismatched external checkpoint; compensating journals preserve originals |
| Durable delivery | Concurrent claims are disjoint; expired leases get new tokens; stale/duplicate acknowledgement fails; retry delay and tenth-attempt dead-letter behavior tested |
| Expiry under contention | Test confirms acknowledgement actually waits on a locked row beyond lease expiry and remains unaccepted/undelivered afterward |
| Database role policy | Installation refuses six elevated role attributes and inherited role membership without modifying existing cluster policy |
| Financial activation policy | Eleven tests exercise five distinct-role signatures, controlled/public separation, deployment binding, revoked keys, repeated identities/keys, tampered evidence, malformed input, and expiration |

## Reproducible verification

In `services/control-foundation`:

```powershell
npm ci
npm run typecheck
npm run test:local
npm audit --omit=dev --audit-level=high
```

Observed: strict typecheck PASS; module tests **30 passed, 0 failed, 0 skipped**; production dependency audit **0 known vulnerabilities**. The local runner creates and removes its own synthetic PostgreSQL container using pinned image `postgres@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1`. Inspected server version: PostgreSQL 17.11. Node: 24.22.1. TypeScript: 7.0.2. pg: 8.23.1. Complete outputs and evidence are local; no cloud service was provisioned for these tests.

At repository root:

```powershell
python -m unittest discover -s packages/monetary-reference -v
git diff --check
```

Observed: **5 reference tests passed**, including 600 conservation scenarios. Diff whitespace check passed. Total current automated test methods: **35**. These are not end-to-end wallet/chain/reserve/compliance acceptance tests.

## Standards

Review fixed point: `0e75bad35f3632911e8943464e6b922fb1ecd0ac`; initial implementation: `a09ed48`. A separate review agent checked repository rules and the code-review smell baseline. It found one concrete permission-boundary issue: the migration could reuse an existing privileged runtime role. This is fixed by rejecting elevated attributes, LOGIN, inherited memberships, current database ownership, or execution as the runtime role. Six attribute cases and membership rejection are regression-tested. The reviewer confirmed the focused correction resolves the finding.

Optional judgment-call feedback: separate snapshot acquisition and pure verification within `ControlLedger.verify`. Deferred because the current interface is small, behavior is covered, and the complete-history memory limitation is explicit. This remains a maintainability opportunity, not a documented-standard breach.

Standards summary: one concrete finding corrected; one optional maintainability finding retained. No unresolved blocking standards finding identified.

## Spec

A separate requirements review agent checked the local implementation slice against the directive. It found the same privileged-role issue and independently reproduced a stale acknowledgement accepted after waiting beyond its lease expiry on an unchanged locked row. `finish_outbox` now acquires the row lock before checking token, expiry and terminal state. The regression test synchronizes on an actual PostgreSQL lock wait, holds it past expiry, then asserts rejection and preserved undelivered state.

The review identified no scope-creep finding and found the documented integration exclusions accurate. The original 27 passing tests did not catch these issues; the final 30-test suite includes their regressions.

Spec summary: two concrete findings corrected; full-platform requirements outside this slice remain incomplete. These agent reviews are not an independent external security audit.

## Operating limits and remaining release work

- Ledger package is a trusted internal service boundary; it does not authenticate users or establish ownership, deposit finality, valuation, reserve sufficiency, or entitlement eligibility.
- Single-row serialization limits posting throughput. Full-history verification is memory-bound. No availability/load qualification has been performed.
- Database administrators can disable triggers and rewrite unanchored history. Independently retained checkpoints must be integrated; old checkpoints protect only their recorded prefix.
- Outbox delivery is at least once. Inbound durable event processing, broker publication, deduplicating consumers, dead-letter operations, reorganization handling, and recovery workflows need integration.
- Signature verification binds supplied deployment/evidence digests; trusted configuration and independent artifact/evidence review must establish their provenance. Reviewer independence is a governance obligation, not established by declaring distinct IDs.
- No production signer or trust registry is configured, and no live financial mode is activated. GCP deployment remains blocked by billing. Legal, custody, financial and independent security qualification remain required.

Next implementation seams: durable finalized-chain inbox/reconciliation; checkpoint export/publication; conversion service integration after unresolved monetary policies are explicitly resolved; identity and wallet authorization; applications and qualified cloud deployment.
