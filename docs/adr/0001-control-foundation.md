# ADR 0001 — isolate exact control accounting from legacy execution

Status: implemented and undergoing local review; production integration pending.

The legacy service uses floating-point monetary storage and database-driven price updates. Preserve it unchanged while introducing a separate strict TypeScript package backed by PostgreSQL. SQL functions enforce balanced per-asset postings and protected normal balances under a serialized chain-head lock. Runtime sessions receive only read and narrowly scoped function execution permissions. The outbox shares the journal transaction and uses fenced leases for at-least-once delivery.

Use cryptographic journal checkpoints and release-specific Ed25519 approvals as engineering controls. External checkpoint retention and trusted signer provisioning are indispensable deployment dependencies; no in-database hash can prevent an administrator from replacing unanchored history. Require five distinct declared gate principals/keys and separate controlled/public modes. These controls do not establish legal qualification or artifact provenance by themselves.

Tradeoffs: one serialized writer limits throughput; complete-history verification is currently memory-bound; JSONB serialization is a database-specific versioned representation. No services are exposed publicly. Monetary rounding/bootstrap decisions, chain ownership, reserve eligibility, compliance providers, and identity remain separate requirements.
