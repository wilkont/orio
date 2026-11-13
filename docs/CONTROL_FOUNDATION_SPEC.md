# Control ledger and release-gate implementation slice

Current-policy notice (November 13): ADR 0002 supersedes the independent-review and distinct-release-approver requirements described below. External review is advisory; signed accountable acceptance and actual readiness evidence remain required.

Source requirements: master directive sections 9, 10.2, 21, and 22. This slice is a prerequisite to the full platform; it does not constitute its completion.

## Acceptance

1. PostgreSQL append-only double-entry journals; debits equal credits for each asset, with positive canonical integer-string units (maximum 78 digits), no cross-asset netting, immutable account identity and accounting classification.
2. Atomic journal, cryptographic chain head, postings, and durable outbox commit. Concurrent writes cannot fork the chain, overspend protected balances, or finalize the same external settlement reference twice.
3. Idempotency replays return the original receipt only for the same normalized request. Conflicting reuse fails. Account creation replays likewise reject different definitions.
4. Runtime role cannot mutate or truncate accounting tables directly. Administrative migrations use separate credentials. Database-owner compromise requires independently stored checkpoints to detect rewritten history.
5. Outbox claims use expiring leases, fresh fencing tokens, bounded retries, retry delay, acknowledgement, and dead-letter state. Stale acknowledgements fail. Outbox delivery is at least once, not exactly once.
6. Read-consistent verification recomputes request/event hashes, postings and per-asset balance, sequence continuity, chain head, and optionally an externally retained checkpoint. Corrections are new compensating journals.
7. Release policy distinguishes testnet, production-read-only, controlled-live, and public-live. Financial modes require unexpired Ed25519 attestations bound to a specific release digest, target mode, deployment identity, evidence digest, and gate role. Five distinct authorized principals and keys are required. Untrusted/malformed/expired evidence fails closed. No production trust keys or approvals are supplied by default.
8. Run strict type checking, meaningful PostgreSQL integration and concurrency tests, and signature/adversarial tests. Record reproducible commands and honest limitations.

## Boundaries

This package runs inside trusted services; it is not a public API or end-user authorization system. Chain finality, reserve eligibility, identity, compliance providers, external checkpoint publication, broker delivery, and GCP deployment remain separate workstreams. Recorded accounting is not proof of a stablecoin deposit. No bootstrap/rounding economics are invented here. All protected accounts must be provisioned with explicit asset units and normal-balance semantics before integration.
