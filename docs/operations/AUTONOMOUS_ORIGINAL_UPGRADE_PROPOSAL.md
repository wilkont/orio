# Original database SQL022 installation

Execution update: the owner approved this exact scope and USD5. Installation and cleanup are complete; see the [actual report](../../infrastructure/aws/AUTONOMOUS_ORIGINAL_UPGRADE_REPORT_2026-11-21.md). The following text records the approved plan and does not authorize broader application/signing access.

Prepared November 21, 2026, following the owner's instruction to continue the original upgrade and production rollout. The successful private-copy rehearsal is recorded in [the actual report](../../infrastructure/aws/AUTONOMOUS_SQL_REHEARSAL_REPORT_2026-11-20.md). Its approval did not include original-database access. This plan adds only SQL022 to the original database; it does not activate financial services.

## Exact change

In AWS account 720232346199, us-east-1, create a fresh encrypted recovery checkpoint named `orio-spc-3-pre-autonomous-upgrade-20261121`. Verify the existing original database's physical identity, private encrypted Multi-AZ configuration, IAM authentication, deletion protection, fourteen-day backups, current point-in-time recovery coverage and enforced TLS.

Use the existing ten-resource `infrastructure/aws/hosted-sql-maintenance.json` unchanged, canonical SHA256 `4ebb302ea1679b9f721b8a0ce2d68144adaffe73fed2f262667b8731512bc61c`. It creates temporary private maintenance groups/ingress, a Secrets Manager endpoint, an owner-only encrypted S3 bucket and restricted S3 gateway route. The existing metadata-reader and journal client groups must remain; the temporary maintenance group is the only additional database client. Historical bucket names are labels, not freshness evidence. Stop if named temporary resources already exist or the deployed template differs.

A temporary private CloudShell environment uses only that maintenance group and isolated subnet. Retrieve the original administrator password in memory only through the private endpoint. This is broad administrator access to a database that may contain customer records; application records stay inside PostgreSQL and only bounded counts/digests enter private reports.

Apply exactly `022_autonomous_settlement.sql`, SHA256 `3fbee34530ec2a0f6e03d052ce4dcfe186f84c4daab7521d4e434488de60eb3e`. Do not rerun SQL001–021 or the earlier journal bootstrap. Installation requires the exact starting catalog `ea31f39f97fc104cbd5f4ec9be42333fbc39606f00c6af12eeee7dd744b73f3d`, issuance paused and zero existing monetary deployments. The new tables must remain empty, with no runtime/public grants or financial configuration.

The installer takes the shared maintenance lock and locks existing protocol tables. Requests that access those tables may briefly wait or fail while maintenance runs. Bounded before/after counts and digests must match. Before COMMIT, the complete staged catalog must equal the rehearsed result `1e4271134fa94268f71f055a8817f9a35d47c0bf78346d47ac6740d54f78049b`. A dedicated catalog observer reads within the installer's transaction without starting, committing or rolling it back. The ordinary standalone auditor retains its read-only transaction boundary.

## Execution evidence and failures

`autonomous-original-context.ts` pins this purpose, original endpoint/secret/resource identity, exact successful rehearsal report digest, fresh recovery checkpoint and maintenance stack, and all three expected database client groups. Clone approval and the historical journal-upgrade context do not pass. `prepare-original-autonomous-context.ts` captures authenticated metadata and verifies the complete deployed template and inventory without reading secrets.

`build-original-autonomous-inputs.sh` prepares credential-free pinned sources, official Node 24.22.1, the pinned regional RDS CA and locked production dependencies. No AWS/database operation occurs in that preparation. `install-original-autonomous-ledger.ts` requires explicit original-upgrade mode, checksum-pinned private context, strict TLS and output paths outside the source tree. Exclusive local and remote receipts are claimed before credential retrieval. Failure reports include a safe bootstrap phase without raw credential-bearing errors.

Before COMMIT, failures roll back the transaction. Unknown COMMIT acknowledgement or post-commit reporting failure requires inspection; never rerun blindly or automatically drop installed tables. A deliberate rollback after a successful upgrade would require its own verified recovery decision. Preserve failure receipts and actual database state.

## Cost, recovery and cleanup

Proposed additional verification ceiling: **USD5**, with no new retained monthly service. Keep hash-verified private reports on the owner's computer with owner/SYSTEM access. Remove the temporary private session, network/secret access, endpoints, S3 objects/bucket and remote working copies within 24 hours. Preserve both existing application client groups. Keep the new encrypted checkpoint until verified original point-in-time recovery covers the pre-upgrade checkpoint and committed state; retain fourteen-day automated backups. If recovery cannot be verified within the budget/cleanup window, preserve recovery evidence and report the exact condition rather than deleting it to force a clean status.

This approval includes a fresh recovery checkpoint, temporary private access, in-memory original administrator credential use and the atomic SQL022 change. It does not grant a persistent runtime account, publish new endpoints, enable signing keys, sign/broadcast transactions, fund reserves, deploy mainnet contracts, change website/DNS/mail, adopt legal terms or activate financial operations. Hosted service integration and production financial qualification continue as separate concrete changes. External review remains advisory.
