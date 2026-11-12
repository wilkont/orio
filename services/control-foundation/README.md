# ORIO control foundation

Implemented local engineering prerequisite for SPC 3 Ledger A and financial release policy. This is not a deployed financial service. No public HTTP endpoint, real chain signing, live deposit verification, or production financial activation is provided by this package.

## Run verification

Requires Node 24+, npm, and Docker Desktop using Linux containers.

```powershell
npm ci
npm run typecheck
npm run test:local
```

`test:local` creates its own uniquely named PostgreSQL 17 container from a pinned image digest, binds only a random loopback port, stores synthetic test data on tmpfs, and removes that container in its finally block. It does not touch AWS/GCP or existing containers. Integration tests refuse to reset any database except loopback `orio_test`; do not put production data in such a database. Test administrative credentials are fixed, disposable local-test credentials, never production secrets.

## Database installation and roles

Apply `migrations/001_ledger.sql` once to a **new dedicated database** using a migration owner. The migration creates its own schema and pgcrypto extension, append-only accounting tables, posting functions, outbox lease functions, and the NOLOGIN role `orio_ledger_runtime`. It refuses to reuse an existing runtime role with elevated attributes, LOGIN, inherited role memberships, or current database ownership; it also refuses execution as that role. It never silently modifies an existing cluster role. A deployment administrator must grant membership to a dedicated workload login. Runtime application sessions must use that role, not the migration owner. No production users or IAM permissions are created here. Maintain these role restrictions after migration; later privileged role changes can invalidate the boundary.

Use a PostgreSQL TLS connection with verified server identity in hosted environments. Configure a `pg.Pool` outside this package with the dedicated runtime identity and appropriate limits/timeouts. The caller must authenticate and authorize users, establish account ownership, and validate external settlement evidence. The runtime identity is an internal accounting-service identity with access to all ledger accounts; it is not an end-user or merchant database login.

## Accounting interface

`ControlLedger.createAccount` provisions immutable identifiers, asset-unit labels, normal debit/credit side, and explicit negative-balance permission. Use one canonical unit definition per asset; for example `USD_MICRO` means millionths of a dollar and is distinct from `ORIO_ATOMIC`. Registry/valuation integration must establish those definitions before live use.

`ControlLedger.post` accepts a unique idempotency key, an independent unique settlement reference, a description, and 2–128 postings. Each posting uses a different account, `debit` or `credit`, and a positive canonical integer string up to 78 digits. Debits must equal credits separately for every asset. This prevents netting dollars against ORIO quantities. Do not infer that a balanced entry proves economic solvency, asset eligibility, or receipt of funds.

The database serializes writes through one chain-head row. This favors simple correctness and balance protection over throughput; load qualification is still required. Invalid journals and failures anywhere in the atomic write roll back postings, head changes, and the outbox event. Repeating the same normalized request returns the original receipt; reusing either economic identity with different data fails. A correction is a new journal with an explicit compensating settlement reference.

`balances` returns exact normal-side integer strings. The package does not decide monetary bootstrap price, rounding, appreciation eligibility, or settlement-epoch ordering.

## Verification and checkpoint integrity

`verify` reads the journal, postings, account definitions, outbox membership, and head in one repeatable-read snapshot. It recomputes SHA-256 over PostgreSQL's stored JSONB text for request, account-snapshot, and event-header hashes; checks posting equality, per-asset conservation, protected balances, identities, sequence continuity and linkage. Receipts use decimal strings for sequence numbers.

Pass a previously exported `{sequence,eventHash}` to check that an independently retained checkpoint still exists unchanged. Retain the most recent checkpoint outside the database administrator's control, ideally via the future proof registry and independent storage. A database owner can disable triggers and rewrite all history; local hash verification alone cannot prove that this did not happen. An older checkpoint authenticates only its prefix and cannot reveal deletion of a later, never-anchored suffix. Standalone zero-balance account provisioning is not a separately anchored chain event.

Verification currently loads the complete history into memory; pagination/streaming and operating-scale load qualification are required before production deployment. PostgreSQL JSONB text is the documented hashing representation of version 1, not a cross-language JSON canonicalization standard. Preserve original serialized text for independent replay/export and test database major-version migrations before use.

## Durable delivery

`claim(limit,leaseSeconds)` atomically leases events with `SKIP LOCKED`, returns journal content and receipt, and issues a new random token on every claim. `finish(sequence,token,true)` acknowledges only a current unexpired lease. `finish(...,false,retrySeconds)` schedules retry, with a maximum of ten deliveries before dead-letter state. Expired tenth attempts are dead-lettered on the next claim sweep.

Publication can succeed before a worker crashes without acknowledging. Consumers therefore must deduplicate using journal sequence within the deployment identity. A separate inbound event store, broker publisher, dead-letter investigation/replay procedure, and chain-finality processing are not implemented in this slice. Events are accounting receipts, not instructions to move reserves. Retrying a failed delivery does not create another journal.

## Release verification

`evaluateRelease` supports four modes. `production-read-only` grants only reads. `testnet` grants simulation/testnet settlement only on chain 84532 or local 31337. Financial modes require Base chain 8453 and five distinct declared principals and distinct Ed25519 public keys for legal, security, custody, financial, and operations gates. Each signature binds mode, release digest, project ID, chain ID, contract-set digest, role, evidence digest, signer ID, issue time, and expiry.

The trust registry and approvals shipped here are empty. Trust provisioning, reviewer independence and legal authority, evidence review, revocation distribution, trusted time, external signature custody, and enforcement in every future execution path remain operational/integration requirements. Five configured identities do not by themselves prove independence, audit quality, legal approval, or reserve backing. Never accept the registry, deployment identity, clock, or approval policy from an end-user request. Treat registry changes as separately reviewed privileged changes. Contract addresses and artifacts must be verified to match the supplied digests; this package evaluates signatures, not artifact contents.

```powershell
node scripts/check-release.ts deployment.json config/approvals.json config/trust-registry.json
```

The CLI exits 1 for denied financial release or unreadable evidence. Signers obtain signing bytes via `approvalBytes` in their own independently controlled system; production signing keys are never generated here. A signed controlled-live approval cannot activate public-live mode. `financialEnabled` must be checked together with the specific capability at execution time; a successful read-only result must never authorize conversion.

## Source references

- Requirements and boundaries: `../../docs/CONTROL_FOUNDATION_SPEC.md`, directive parts 1–3.
- PostgreSQL locking: https://www.postgresql.org/docs/17/explicit-locking.html
- Transaction/client isolation: https://node-postgres.com/features/transactions
- Signature verification: https://nodejs.org/docs/latest-v24.x/api/crypto.html

## Master stablecoin entry check

`validateMasterEntry` compares an authenticated quote and independently verified, finalized receipt with the current election and expected reserve vault. It rejects stale elections, paused or migrating elections, secondary assets, wrong vaults, missing settlement references, invalid quantities and receipts below the quoted minimum. It uses exact integer strings for master-asset quantities.

The function is a precondition for future settlement. The caller must authenticate and bind the quote, verify finality and reserve credit against the chain, recheck the election in the same transaction as accounting, and consume each settlement reference once. The master registry, elections, routing, valuation, migration, payout, minting and chain reconciliation remain separate implementation work.

## Master election registry

Migration `002_master_registry.sql` creates a separate PostgreSQL schema for asset metadata, election evidence, and the current master designation. It starts paused with zero elected assets. Initial activation and replacement lock the same singleton row, reject stale predecessor IDs, and update the designation and election history in one transaction. Replacement requires migration state. This schema grants no access to the ledger runtime role or PUBLIC.

Local tests exercise simultaneous elections, failed activation rollback, preservation of the predecessor and refusal of unprivileged writes. The owner-only migration functions consume preverified evidence digests. They do not establish signer independence, decide regulatory eligibility or validate that a reserve transfer settled. Before deployment, add a separately authorized governance executor and an auditable transition mechanism for migration and emergency states. Live settlement also needs a finalized-chain adapter and an atomic election recheck with posting.

### Initial master selection

ORIO selected Circle-issued native USDC as its initial Master Elected Stablecoin. The deployment configuration records the six-decimal token by chain and contract address. Base Mainnet (8453) uses `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Base Sepolia (84532) uses `0x036CbD53842c5426634e7929541eC2318f3dCF7e` for test-only evidence. Match chain and address together. Symbols, wrappers, USDbC and bridged variants cannot establish the selected asset identity.

`initialMasterAsset` supplies bootstrap metadata for governance review. It does not seed or activate a master. The persisted current election governs settlement and can move to another independently approved asset. Six token decimals define atomic units. USD reserve valuation still requires approved pricing, liquidity, redemption and impairment policies. Deployments start paused until the verified eligibility and election evidence is recorded through the approved process.

Sources: [Circle native USDC on Base](https://www.circle.com/blog/usdc-now-available-natively-on-base), [Circle contract and decimal reference](https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-usdc/SKILL.md), [Base chain identifiers](https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_chainId).

## Master reserve reconciliation

`reconcileMaster` compares Ledger A and chain-adapter snapshots at the same finalized block, requiring identical chain, election, asset, reserve vault, ORIO supply and master reserve quantities. It reports every differing field and performs no mutations. Quantities remain canonical integer strings. The adapter must authenticate snapshots, establish finality independently and trigger containment on divergence. USD solvency, pricing, account-by-account ownership, event completeness and independent checkpoint anchoring require additional checks.

## Reserve migration accounting check

`assessReserveMigration` compares authenticated pre/post migration checkpoints and independently verified valuations. It rejects changed ORIO supply, changed ownership commitments, new company fees, and new holder allocations. It exposes realized reserve loss and the deficiency against outstanding USD liabilities using exact integer values.

The caller must verify checkpoint provenance, reserve ownership, finality, valuation timing and units, governance authorization, legal eligibility and execution evidence. The result alone cannot authorize activation or prove that a migration fully settled. Pending redemptions and other obligations must be included in the supplied liabilities under an approved accounting policy.
