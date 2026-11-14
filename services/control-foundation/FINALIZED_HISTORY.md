# Finalized history discovery

This read-only-chain observer discovers complete blocks in a qualification deployment (Base Sepolia or local chain). It neither signs nor submits transactions, credits a customer, posts a journal, or enables financial execution. Migration 016 is local only and grants no runtime permissions.

## Verification and persistence

An explicit first block, preceding block hash, chain and sorted watched-contract set identify a stream. Use the actual deployment block; an arbitrary recent start does not establish complete history. Stream identity/configuration cannot be reused with different parameters. Master migrations or new watched contracts require a deliberately versioned stream and overlapping, reconciled history; they cannot silently change an existing stream.

Both configured sources must identify the selected chain and consider the requested height finalized. They must agree on the block hash, parent hash and complete ordered transaction-hash list. The predecessor must match the committed cursor (or explicit initial anchor). Both sources are queried for every transaction receipt, including receipts with no watched events and reverted transactions. Missing receipts, inconsistent indices, removed logs, failed transactions with logs, noncontiguous global log indices or conflicting normalized receipt/log content stop the scan. The block is checked again after receipt collection. Empty blocks are committed as explicit evidence rather than skipped.

Only receipts containing a watched address are retained; their entire log context remains available for bounded execution verification. All transaction hashes are retained for discovery provenance. This uses provider-reported block bodies and receipts, not an independently verified transaction/receipt-trie proof. Agreement is not protection against colluding or equivalently faulty providers. Provider identity and organizational independence remain deployment responsibilities. This baseline scans receipts sequentially and is intentionally not advertised as production throughput qualification. Bounded RPC responses and a maximum 10,000 transactions/logs per object, 100,000 total block logs and 8 MiB retained evidence per block stop oversized inputs rather than partially persist them.

Each block's normalized evidence, SHA-256 digest and cursor update commit in one database transaction. A locked cursor prevents competing workers from appending the same height twice. Exact replays return the committed identity. Configuration drift, changed evidence, missing predecessor records and skipped cursors stop ingestion. Append-only table triggers reject update, delete and truncate. A database administrator can still replace the database; externally retained checkpoints and restoration verification remain necessary.

## Operator command

`npm run scan:history` reads an owner-managed `ORIO_HISTORY_CONFIG_FILE` containing `HistoryConfiguration`; never put credentials in that JSON. It uses the existing primary/secondary RPC environment settings and requires distinct configured provider operators/origins. It first runs the provider freshness/canonical-head check. `ORIO_HISTORY_DATABASE_URL` is a separate observer login and `ORIO_PG_CA_FILE` supplies the trusted database CA. URL TLS overrides are refused, certificate/hostname validation stays enabled, and errors do not print secrets. `ORIO_HISTORY_MAX_BLOCKS` is 1 by default, at most 25 per invocation. An external supervisor may schedule bounded invocations after hosted qualification. No public HTTP route exists.

Use a migration owner to install 016 after verified earlier migrations and backup. Grant the observer only stream select/insert, UPDATE(next_block,parent_hash), and block select/insert through an approved deployment role. It needs no accounting, reserve, signing, runtime-user management or schema-owner authority. Hosted migration/role changes have not been executed.

## Accounting boundary and remaining work

Discovery is not ledger import. A separate ordered dispatcher must interpret retained controller checkpoints, transfers, company withdrawals, registry replacements and state-bound reconciliation assertions through existing finalized verifiers. It must maintain its own durable accounting progress; a discovered block must never imply all of its financial events have been imported. Historical user ownership mapping, authenticated intent linkage, reconciliation attestations, production freshness/throughput/failure drills and independent checkpoint retention remain integration work. No live provider credentials or deployed controller addresses are invented by this implementation.

## Validation

Discovery tests cover complete enumeration, empty blocks, lagging finality, missing receipts, source disagreement, parent/hash/chain failures, changed history during reads, log gaps/removals, reverted logs and caller mutation. PostgreSQL tests cover restart, concurrent ingestion, injected cursor-write rollback, replay, immutable evidence and cursor-skip rejection. All fixtures are synthetic; tests establish no real reserve balances or public-network settlement.


## Ordered consumer checkpoint (migration 017)

HistoryDispatch provides a separate receipt-delivery cursor for each pinned handler revision. It serializes a consumer with a session advisory lock, calls the trusted handler outside a database transaction, then commits its acknowledgement and cursor together. A positive acknowledgement identifies IMPORTED or NO_FINANCIAL_EFFECT and durable evidence references; an unsupported required transition must throw. Empty observed blocks receive explicit immutable completion records. A missing predecessor completion or receipt acknowledgement rejects cursor advancement.

A handler's financial side effects and the delivery acknowledgement are **not** one distributed transaction. If the process fails after a journal commits, the same deterministic delivery ID is retried. The actual financial handler must use the existing immutable settlement receipt ownership and semantic replay checks. A PostgreSQL integration test injects that exact failure and verifies one real synthetic journal after retry. Consumers cannot infer that a discovered block was financially processed. Block evidence, delivery acknowledgements and completion records are distinct.

The handler digest is owner-configured release identity, not an automatic attestation of a JavaScript callback. Deploy only the corresponding pinned adapter; do not allow customer-defined handlers, revisions or acknowledgement data. The generic dispatcher is locally tested but is not yet connected to production event-specific monetary adapters. No supervisor, financial HTTP route or hosted migration is enabled by this module. Session loss permits replay; a stuck handler requires operational cancellation/restart and idempotent recovery. Restore, historical mapping, production throughput and actual deployment remain separate qualification work.
