# ORIO control foundation

Implemented local engineering prerequisite for SPC 3 Ledger A and financial release policy. This is not a deployed financial service. No deployed public HTTP endpoint, production chain signing, live deposit verification, or production financial activation is provided by this package.

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

`evaluateRelease` supports four modes. `production-read-only` grants only reads. `testnet` grants simulation/testnet settlement only on chain 84532 or local 31337. Financial modes require Base chain 8453 and signed accountable acceptance for legal, security, custody, financial and operations categories. One authorized owner and Ed25519 key may cover all roles; external review and distinct approver principals/keys are no longer required. Each signature binds mode, release digest, project ID, chain ID, contract-set digest, role, evidence digest, signer ID, issue time and expiry. Signing domain v2 invalidates signatures from the previous v1 policy.

The trust registry and approvals shipped here are empty. Authorized owner/role provisioning, evidence acceptance, revocation distribution, trusted time, secure signature custody and enforcement in every execution path remain integration requirements. A valid signature does not establish legal status or reserve backing. Never accept the registry, deployment identity, clock or approval policy from an end-user request. Registry changes remain privileged and auditable. Contract addresses and artifacts must match the supplied digests; this package evaluates signatures, not artifact contents. See ADR 0002 for the revised owner-approved policy.

```powershell
node scripts/check-release.ts deployment.json config/approvals.json config/trust-registry.json
```

The CLI exits 1 for denied financial release or unreadable evidence. Authorized signers obtain signing bytes via `approvalBytes` in their secure signing system; production signing keys are never generated here. A signed controlled-live approval cannot activate public-live mode. `financialEnabled` must be checked together with the specific capability at execution time; a successful read-only result must never authorize conversion.

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

## Durable entry conversion records

Migration `003_conversion_entries.sql` adds entry intents, append-only evidence events and globally consumed external settlement references. `ConversionEntries.open` creates a quoted intent idempotently and rejects reuse with different ownership, amounts, election, vault or quote metadata. `record` returns the resulting durable state and version. Calls use the schema owner in the current local verification environment. No production runtime permissions are granted by this migration. An independently authorized control writer is required before hosted integration.

The normal path is REQUESTED, FUNDED, CONVERTING, MASTER_RECEIVED. Direct master deposits can move from FUNDED to MASTER_RECEIVED when their asset and amount match the deposit. Secondary deposits require CONVERTING first. Routing starts only against an unexpired quote and the current active election. Master receipts must match that election, asset, vault and minimum proceeds. Receipt recording proves an adapter assertion about custody, while financial accounting must independently recheck eligibility, valuation, quote validity and the active election in its own atomic settlement transaction.

Verified failed conversions with recoverable source assets move to REFUND_DUE, preserving the complete source-denominated claim. Only a verified full payout to the recorded owner moves to REFUNDED. Uncertain execution remains CONVERTING until the adapter establishes custody and an authorized recovery path. Do not classify a partially executed or indeterminate swap as refundable source custody. Later recovery of master assets requires a separately authorized settlement/refund procedure.

Event IDs and expected versions fence duplicate and competing writes. An identical event retry returns its original receipt. Conflicting reuse fails and rolls back. Each finalized external reference must include chain, transaction hash and the precise event/output identity and must be canonicalized by the verified adapter. A source receipt can be reused as the direct-master custody receipt within the same intent. Source deposit evidence cannot discharge a refund. Events and external references reject mutation and truncation. The schema owner remains privileged and requires separate operating controls and independent evidence retention.

Local PostgreSQL verification covers direct master entries, secondary conversion, same-event retries, competing starts, stale elections, expired routing quotes, insufficient proceeds, numeric monetary input rejection, wrong vaults, duplicate receipts, refund claim preservation and deposit-to-refund replay refusal. The tests use isolated synthetic master metadata and the same conversion migration, with helper-schema names adjusted to avoid collisions with parallel ledger tests. This is local control-path evidence.

The finalized-chain adapter, issuer/network eligibility checks, independent quote verification, approved route execution, partial-swap recovery, accounting/mint/burn integration, user interface and hosted deployment remain open. This module records no fee, company revenue, appreciation or token issuance. Migration 003 has not been applied to AWS.

## Protocol metadata service

Runtime identity checks now qualify the dedicated metadata-only database login before listening and on every registry read. Administrator URLs, excess ORIO permissions, latent privileged membership and masked owner sessions are rejected. Initial TLS/identity failure stops startup; later unavailable or overprivileged reads return a generic503. See `PROTOCOL_READER_AUTHORITY.md` for the authorization boundary, actual isolated verification and remaining hosted provisioning work.

`npm start` runs the HTTP metadata service on 127.0.0.1 and port 8080 by default. Configure `ORIO_DATABASE_URL` with a PostgreSQL URL containing no query parameters, `ORIO_PG_CA_FILE` with the trusted CA bundle path and optionally `PORT`. Workload networking, database login, secret distribution, proxy/TLS ingress and hosted deployment require separate integration. Use a dedicated metadata reader granted SELECT on the master registry only. The application additionally enables read-only PostgreSQL transactions and bounded connection/query timeouts.

GET /health reports process health. GET /ready requires a successful master registry read and reports metadata-service readiness. GET /v1/protocol/master returns the persisted master election and asset metadata, with financialExecutionEnabled false. A paused or empty registry remains visible as paused or empty. The initial USDC selection is never substituted for a persisted election. Registry read failures return a generic 503 response and client responses are not cached. This service exposes no customer accounts or settlement writes.

HTTP verification covers empty/paused metadata, unavailable registry behavior, process versus database readiness, method restrictions and absent routes. The database reader uses a single joined query for one consistent registry view. Hosted workload permissions and the production endpoint remain unverified. All financial execution requires the separately signed release process and its future execution-path integration.

## Shared receipt ownership (local migration 006)

Migration 006 binds conversion and redemption receipt references to one operation in orio_settlement.receipt_claims. Before installing the guards it locks both source receipt tables and backfills their history in one transaction. An existing conflict aborts the entire upgrade, preserving the previous schemas and evidence for investigation. Conflicts require governed investigation and correction, rather than silent reassignment.

New source inserts trigger the shared claim check in their existing recording transaction. Same-operation direct master aliases remain valid, while competing claims from different modules serialize on the receipt key and only one can commit. Shared claim rows reject mutation and truncation. No runtime role grants are added. The existing privileged-owner and independent-adapter trust boundaries still apply.

Canonical references must come from the finalized adapter and include chain, transaction and event/output identity. String uniqueness cannot detect two spellings of the same event or establish authenticity. The shared registry currently coordinates conversion and redemption observations. Ledger accounting still needs a reviewed operation-to-journal linkage that permits accounting for the same observation without allowing reuse for a different obligation. This migration does not change financial journals, execute any settlement or resolve independent chain custody.

Local integration tests apply migrations 001-006 to dedicated databases inside the disposable test container. Tests cover concurrent cross-module claims, replay rollback, direct master aliases, immutable claims, clean historical backfill and conflicting-history upgrade rollback. Migration 006 is local-only.

## Master receipt accounting (local migration 007)

`MasterReceiptAccounting.credit` binds a MASTER_RECEIVED conversion's expected version, historical master asset/vault, recorded custody event and shared receipt owner to one balanced journal. It debits the reserve asset and credits that customer's escrow liability for the exact received token units. Accounts, journal, receipt linkage and outbox commit together. Concurrent retries return the original journal; a failure rolls back the complete operation. A later protocol pause does not erase historical custody or prevent its bookkeeping.

This is historical receipt accounting, not ORIO issuance, valuation or fee recognition. It neither authenticates custody independently nor moves assets. Monetary settlement must separately enforce approved eligibility, fees, appreciation, rounding and release authorization before minting. No runtime grants are introduced. Migration 007 is local-only; AWS still has only migrations 001 and 002.

## Container verification

The Dockerfile pins its Node base by digest, installs locked production dependencies, runs as the unprivileged node user and exposes metadata only. Set ORIO_DATABASE_URL and mount a trusted certificate at ORIO_PG_CA_FILE. Never embed database credentials or private keys in an image. ORIO_BIND_ADDRESS defaults to loopback outside the image; the image uses 0.0.0.0 within its container. Restrict external ingress separately.

`npm run test:container` builds and runs the actual image against disposable PostgreSQL with TLS and a dedicated registry-only reader. It checks empty/paused readiness, a read-only filesystem, unprivileged execution, ledger access denial and certificate-hostname failure. Test resources are removed afterward. Passing this test does not deploy the image or qualify production networking, workload credentials, monitoring or release controls.

## User-paid gas controls and approved monetary scenarios

The revised gas directive requires user-paid gas for all user-authorized on-chain operations, including ordinary transfers with zero protocol fee. GET /v1/protocol/policy exposes the founder-approved economics and gas requirements; execution remains false. This endpoint describes policy, not readiness or implemented transaction capabilities.

`gas-policy.ts` binds owner/action/call digests, chain, every operation's execution/L1/other caps, denomination, rate evidence, expiry and maximum hold using exact integers. The caller must authenticate estimates and user consent. `gas-controls.ts` and local migration 008 reserve independently funded prepaid gas liabilities and company-owned ETH in separate accounts, prepare one deterministic execution reference before broadcast, book actual known in-cap ETH expenses, and atomically close successful reconciliations with unused credits. They do not broadcast, collect new funds, convert assets or authenticate evidence. No runtime grants or public mutation endpoints are added.

Only PREPAID is accepted by the durable controller; non-prepaid quote methods require future collection adapters. Failure/uncertain/incomplete/over-cap cases retain obligations for review without automatic final user charges. Known zero expenditure needs no expense journal. Positive over-cap expenditure remains preserved but unbooked until independent recovery; it cannot draw other reserves. Cancellation is automatic only before any prepared execution. User authorization and settlement policy digests are trusted references, not verified signatures or independent approval evidence. Final gas rounding is candidate code, not an approved live rule.

`monetary-engine.ts` implements the approved integer/native-unit monetary calculations, zero/full-supply exceptions, pre-mint appreciation, common-snapshot redemptions, USD36 quantization with exact residuals and retained-price reconciled reopening. `monetary-simulation.ts` now uses that engine for approved-policy scenarios; old genesis escrow and concentration threshold experiments were removed from active code and remain in Git history. npm run simulate:monetary reproduces the JSON artifact. It remains simulation-only and never posts or mints. See MONETARY_ENGINE.md and ADR 0003 for authorization and integration boundaries. Actual monetary contracts, durable settlement, custody/valuation adapters, consumer flows and accountable release acceptance remain open.

Qualification continuation: the contracts package now contains a testnet-only account, deterministic factory, dual-signed EIP-712 paymaster and signing-material SDK. Migration 009 supports a durable prepared permit identity before treasury signing and one final UserOperation hash binding before broadcast. A crash leaves a reconciliation hold instead of permitting cancellation after signing. All migrations 003–009 remain local-only.

The complete test:local suite now includes the real PostgreSQL/reference-EntryPoint bridge. Run npm ci in contracts as well as this package before the suite. No public chain connection or real asset transaction is made. The SDK uses canonical smart-account addresses as quote owner references and authenticates both user and operator consent on-chain; other control APIs still require independently trusted authentication/evidence adapters. Actual Base fee/finality attribution, live providers, consumer flows and release qualification remain open. See docs/qualification/PAYMASTER_QUALIFICATION.md and the machine-readable BLOCKED candidate inventory.

`verifyFinalizedUserOperation` now authenticates the expected final EntryPoint debit event against two configured readers, including exact account/paymaster/nonce/operation identity and canonical finalized block agreement. The bridge feeds actual VM event bytes through it before local expense recording. It returns an EntryPoint debit observation, not a final Base network bill or failure-responsibility decision. See docs/qualification/FINALIZED_USER_OPERATION_EVIDENCE.md. External reviewer independence is not required under owner-accountable release policy v2; technical chain/custody verification remains required.

## Gas prepayment custody

GasFunding and local migration 010 turn exact verified token deposits into segregated gas cash/prepayment journals, with shared conversion/redemption receipt ownership and rejection of treasury self-transfers. GasRefunds and migration 011 hold requested prepaid withdrawals against a dedicated funded gas action, then require the exact payout inside its bound successful UserOperation before discharging the claim. The EntryPoint verifier now exposes its execution-log boundary to prevent claiming another operation's transfer in the same bundle.

Only never-prepared withdrawals can cancel automatically; withdrawal, customer gas and company ETH holds return together. A linked gas reservation cannot cancel separately. These are owner-only accounting/verification components without token dispatch or authenticated customer routes. Custody, token semantics, first-funding abstraction, live providers and recovery operations remain integration requirements. See docs/qualification/GAS_PREPAYMENT_CUSTODY.md. Migrations 003-011 remain local-only; do not rerun 001/002 or apply the new migrations to AWS under the expired initial-maintenance approval.

Monetary policy approval is recorded in config/approved-monetary-policy.json. It resolves the earlier founder-policy question while external review remains advisory. The public metadata reports approved economics and disabled financial execution; it does not claim deployed monetary settlement.
