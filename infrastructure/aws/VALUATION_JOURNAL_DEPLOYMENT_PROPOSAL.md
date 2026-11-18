# Private valuation journal — prepared deployment and rehearsal

Status: source prepared and locally tested; **no hosted SQL, role, network or signing change has been applied**. The completed ten-call testnet approval does not authorize this new database access. External review remains advisory.

## Next approval: disposable private SQL rehearsal only

In account 720232346199/us-east-1, create a fresh encrypted checkpoint of the existing ORIO database and restore a disposable private copy. Reuse the exact already-reviewed `sql-qualification.json` network/transfer boundary and its named resources only after verifying that all old temporary resources are absent. The historical date in those fixed disposable names is an identity guard, not permission to adopt an existing database or old snapshot. Record actual new creation timestamps.

The fresh copy may contain customer records and remains inside this AWS account. Create temporary private maintenance access, owner-only encrypted S3 transfer storage and a one-hour administrator maintenance session. Read only the copy's newly managed administrator password, in memory, for the private TLS database connection. Never retrieve the original database password. No original database SQL connection is included.

Run only these checksum-pinned sources through `qualify-valuation-journal.ts`:

1. Pending extension 020: empty append-only signing authorization/request/claim/completion tables.
2. Pending extension 021: immutable authority bindings and three restricted definer functions.
3. `valuation-journal-bootstrap.sql`: one passwordless IAM database login, schema usage and execution on those three functions. It creates no authority binding or signing intent.

`valuation-journal-bootstrap-checksums.json` pins all three exact sources. `installValuationJournal` acquires the shared maintenance lock, checks the fresh catalog against the known hosted reader-aware fingerprint, locks existing application tables, records bounded counts/digests, and applies all three bodies in one transaction. It requires paused issuance, no monetary deployment, unchanged existing records and empty signing configuration before COMMIT. It reports unknown commit acknowledgements for inspection; it never blindly retries.

The clone-only context validates the original's encrypted/private/protected state, retains only its existing metadata-reader ingress, rejects original endpoint/secret substitution, requires a snapshot no older than two hours and metadata no older than fifteen minutes. Current baseline `141a8c8aedd1ea45af794d2de847c836798e19d21cf1223334b740e9082b33f7` comes from the retained metadata-reader bootstrap report. A changed baseline stops the rehearsal for inspection; it is not silently accepted. Authenticated administrator metadata is not an independent attestation against that administrator.

Prepare credential-free sources with `build-valuation-journal-qualification-inputs.sh FULL_REVIEWED_COMMIT`, then capture fresh private context using `prepare-valuation-journal-context.ts --capture-approved-metadata /absolute/private/context.json`. Transfer the pinned package through the temporary owner-only bucket and run the clone-only command with an explicit context digest, pinned RDS CA and exclusive private report path. Its action flag is `--apply-approved-journal-rehearsal`; no original-upgrade flag exists.

Proposed budget: up to **$5 additional** for the disposable rehearsal. Retain only private reports containing metadata, hashes and counts on the owner's computer. Remove temporary database, snapshot, clone secret, private access, transfer objects/bucket and working files within 24 hours, verifying original protections and the retained public metadata service afterward. No original upgrade, retained journal service, protected signing, blockchain transaction, funding or financial activation is included in this phase.

## Later, separate hosted deployment

The actual private journal service is implemented and packages as `src/valuation-journal-lambda-entry.handler` on Node 24. It uses a pinned RDS CA and short-lived IAM database tokens; there is no password/administrator fallback. Each leased connection rechecks actual login, current identity and absence of broader ORIO/database/server privileges. The strict synchronous request protocol permits qualify/load/claim/complete only, returns generic errors and rejects caller-supplied SQL, keys, policy and evidence. Event fields are not authentication.

The six-resource `valuation-journal-private-lambda.json` adds a private Lambda, its immutable code-pinned version, exact database-login role, seven-day logs, a private security group and its single PostgreSQL ingress rule. Default concurrency is zero. No public endpoint, caller invocation grant, operator grant, NAT, KMS permission, secret access or function chaining is included. Network permissions necessary for Lambda provisioning are explicitly denied to application code; the runtime role also explicitly denies KMS, secret retrieval, further Lambda invocation and role assumption. Approved verification would temporarily use concurrency one and restore zero.

This later phase requires its own recovery checkpoint, checked original SQL bootstrap, native AWS preview, access/budget approval and real IAM connection verification. Passing the clone rehearsal does not authorize it. The outside-VPC KMS valuation worker and its version-bound invocation permission remain a further separate access change; production-purpose keys stay disabled.

## Verification

Local real PostgreSQL tests reproduce managed extension ownership, verify passwordless bootstrap and actual restricted login, reject occupied names and unauthorized loads, and inject a failure after the role is created to prove full transactional rollback and unchanged baseline. Separate runtime tests cover replay, revocation, stale state and privilege leakage. Protocol tests reject malformed/oversized requests without leaking backend errors. Template tests enforce private networking, no signing/secret access, zero default concurrency and the pinned version. The actual production-dependency ZIP is compiled and smoke-tested without contacting AWS or the database. Automated CI repeats packaging, typechecking and the complete qualification suite.

Actual protected valuation signing, live source admission, production signing recovery, customer reserve arrangements and financial launch qualification remain unfinished. No test result establishes customer legal rights or funded reserves.
