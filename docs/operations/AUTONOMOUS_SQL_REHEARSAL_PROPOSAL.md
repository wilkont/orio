# Private rehearsal of autonomous payout accounting

November 20, 2026. Prepared for specific owner approval; no AWS resource, secret access or hosted SQL has been activated by this proposal. Founder-confirmed protocol-controlled custody is recorded in ADR 0005 and is not an unanswered technical decision.

## Exact scope

In AWS account 720232346199, us-east-1, create a fresh encrypted recovery snapshot and one disposable private copy of the existing ORIO database. Reuse the already-reviewed twelve-resource `infrastructure/aws/sql-qualification.json` template unchanged (canonical SHA256 `5c83dccbd47230a8ef56d9ffe48e04ff2a42857ca622fc9c4defda8d9c8a63e5`). Its historical resource identifiers ending in `20261116` are labels, not evidence of freshness. All named temporary resources must be absent before creation; stop if they exist. Fresh timestamps, actual account/source identities, deployed template and resource inventory must pass verification.

The original database must remain available, encrypted, private, IAM-authenticated, deletion-protected and covered by fourteen-day backups. Its only incoming database clients remain the existing metadata reader and private journal. No temporary client is added to the original database. The clone receives only the explicitly captured private maintenance source. Clone password/endpoint substitutions with the original are rejected before credential retrieval.

Use a temporary private maintenance environment/session to read only the copy's administrator password in memory and install exactly SQL022, SHA256 `3fbee34530ec2a0f6e03d052ce4dcfe186f84c4daab7521d4e434488de60eb3e`. The administrator credential has broad privileges on that copy; it is not a narrow reader credential. The copy may contain customer records. Existing records are processed inside PostgreSQL only into bounded counts/aggregate hashes; no raw customer records, passwords or keys enter reports.

The expected starting catalog is `ea31f39f97fc104cbd5f4ec9be42333fbc39606f00c6af12eeee7dd744b73f3d`, the exact qualified SQL020/021 catalog confirmed by the completed original installation. The private original report digest is `f616e3002025ab9d43c7b2228fc8b086dbaf37c75da31d79ddc3da93b50f84ac`, recorded in `ORIGINAL_JOURNAL_DEPLOYMENT_RECEIPT_2026-11-18.json`; it was hash-matched in its retained archive before extracting this catalog fingerprint. Do not rerun SQL001–021. A changed baseline stops execution for investigation.

## Execution and verification

`build-autonomous-qualification-inputs.sh` downloads only whitelisted files at a reviewed full Git commit, pinned Node.js 24.22.1 and the pinned RDS CA. It installs locked production dependencies without install scripts and verifies SQL022 before packaging. It makes no AWS API/database call. CI exercises this preparation without credentials.

`prepare-autonomous-context.ts` checks authenticated AWS metadata against the exact template, resource inventory, source protections, both existing original service groups and fresh snapshot/copy. `autonomousQualificationSession` returns only the clone endpoint/secret and the previously qualified catalog hash. Metadata captured by a privileged administrator is trusted operational evidence, not a cryptographic attestation against that administrator.

An unexecuted CREATE preview may reserve the stack identifier before owner approval and before the fresh snapshot exists. Both the preview stack and snapshot must be recent; the actual copy must be created after both. A prior historical copy cannot be paired with a newly recreated same-name snapshot. Preview creation alone provisions none of the twelve resources and creates no database credential.

`qualify-autonomous-ledger.ts` requires the explicit `--apply-approved-autonomous-rehearsal` mode, checksum-pinned private context, pinned CA and private output paths outside the repository. It reserves exclusive progress/report artifacts before retrieving the copy's password. AWS CLI history is disabled for credential operations. Remote transfer uses only the existing owner-only encrypted rehearsal S3 paths, restricted to the private route and bounded input/report objects.

`installAutonomousLedger` verifies the SQL checksum, actual database/administrator and starting catalog, acquires the shared maintenance lock, locks existing protocol tables and records bounded hashes/counts. It requires issuance paused and no configured monetary deployment. SQL022 creates only the autonomous deployment/fact tables and immutable-fact protections. Existing data must match afterward; new tables must be empty and grants owner-only. A public/default runtime grant causes rollback. No synthetic customer deposits or signing authorities are installed on the copy.

The SQL operation is transactional. Pre-commit failures roll back. Unknown commit acknowledgement or a post-commit reporting failure is classified explicitly and requires inspection; never blindly rerun. Local PostgreSQL tests cover changed SQL/baseline rejection, record preservation, rollback on reporting failure, owner-only grants, replay rejection and known post-commit failure. The existing wallet/gas/claim integration has separate isolated execution evidence; installing tables alone is not service qualification.

## Budget, retention and exclusions

Proposed additional verification authorization: up to **$5**, with no retained recurring infrastructure from this rehearsal. Actual metered AWS charges must be monitored; no measured bill is asserted by this estimate. Remove the temporary copy, snapshot, private maintenance environment, network resources and encrypted S3 working objects within 24 hours. Verify created-resource identities before deletion. Keep only private hash-verified reports on the owner's computer with owner/SYSTEM access. Preserve original backups and retained reports.

This phase does not connect to or upgrade the original database, grant persistent application access, enable keys, sign/broadcast a blockchain transaction, deploy contracts, move funds, change the website/DNS/mail, execute company agreements or enable financial operations. A successful copy rehearsal supplies review evidence for a later separately scoped original-database change; it does not authorize that change. External review remains advisory.
