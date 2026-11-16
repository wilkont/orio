# Disposable RDS restore qualification

Prepared 2026-11-16. The owner subsequently approved this scope; execution and cleanup are complete. See `PRIVATE_RESTORE_REPORT_2026-11-16.md` and its exact verification receipts.

Subsequent execution note, 2026-11-16: the owner approved the named restore and USD5 additional ceiling. PR18 merged at `8e3f5935b444c0a720ae37e167f9549caae5b297`. The original proposal text below records its scope; completed verification and cleanup must be recorded separately rather than inferred from approval.

## Concrete next action

In AWS account 720232346199, us-east-1, create one encrypted manual snapshot named `orio-spc-3-restore-checkpoint-20261116` from the existing database `orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc`. Restore it through a new stack `orio-spc-3-restore-qualification`, using `restore-qualification.json` at the reviewed commit. The clone is `orio-spc-3-restore-qualification-20261116`: private, Single-AZ, db.t4g.medium, with a new security group having no client ingress. AWS manages a separate clone administrator password; do not retrieve it in this phase.

The snapshot and clone contain an encrypted copy of the existing database contents, potentially including customer records. They remain in the same AWS account and region. No contents, credentials or raw records are exported. No secret retrieval, SQL connection, schema migration, original database mutation, application routing, signing or financial activation is included in this phase. Later private SQL access and upgrade execution require a concrete access amendment, prepared while the restore runs.

## Execution gates

1. Verify STS account and region. Read source metadata and require: available, PostgreSQL 17.9, encrypted, private, 20 GiB, master `orio_ledger_admin`, expected VPC/subnet group/parameter group, and unchanged empty original database ingress. Reject any conflicting existing snapshot, stack or clone rather than adopting it.
2. Create the fixed-name snapshot from the exact source. Verify its returned source identifier, account/region ARN, manual type and encryption; wait until available. Do not share, copy across accounts, change its KMS key or delete any existing backup.
3. Validate the template with AWS, then create a CREATE change set for the new stack. Require exactly two Add actions: `CloneSecurityGroup` and `QualificationClone`; reject changes to any existing resource or an empty/wrong-target stack. Execute only the reviewed change set after owner approval is recorded.
4. Wait for restoration without a long blocking call. Verify exact clone/source snapshot identity, PostgreSQL 17.9, 20 GiB, encryption, private endpoint, Single-AZ, expected TLS-required parameter group, and the new empty-ingress security group. Inspect managed-secret metadata only, never its value. Availability proves provisioning and restore completion, not monetary correctness or application recovery.
5. Record sanitized identifiers, states and timestamps. Continue preparing the guarded clone-only SQL qualification separately. Do not upgrade the original database on the strength of clone availability.

## Budget, duration and cleanup

Request up to USD5 additional temporary cost, a two-hour working window and cleanup within 24 hours. This is an authorization ceiling, not a technical AWS billing cap or a claim about measured spend. It covers the clone, temporary snapshot and AWS-managed clone secret; existing source database and key charges are separate. No application workload or ongoing service is added.

After verification or failure, delete only the new qualification stack and the exact temporary manual snapshot. The template explicitly deletes its disposable clone rather than generating another final snapshot. Confirm that the clone, its managed secret and security group are removed and that the original database, automated backups, source secret and empty original ingress remain intact. Never force-detach an interface or delete the source. If a later approved qualification needs this clone, its additional scope must be recorded before cleanup is deferred, within the approved time/cost window.

## Evidence and remaining work

The actual read-only hosted inspection and cleanup are documented in `HOSTED_SCHEMA_AUDIT_REPORT_2026-11-16.md`. PR17 merged migration019 and a managed-extension regression; 205 local tests and typechecking pass. No hosted migration has run. The current hosted catalog matches the 001–002 structural reference after accounting for provider-owned pgcrypto permissions, but historical migration002 file provenance remains unresolved. Do not fabricate applied-version history or rerun initial migrations.

AWS restore properties follow the [official DBInstance reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbinstance.html): encryption and database identity are inherited from the snapshot; the template omits conflicting restore-time creation properties. This is a recovery qualification step, not production financial launch approval.

The side-effect-free `qualificationTarget` helper validates authenticated pre-access metadata for the fixed clone, source snapshot and isolated security group. It rejects the original database/secret, other accounts, public or unencrypted copies, different engine/storage/backup settings and unexpected ingress. Its synthetic tests do not establish actual restore lineage; the reviewed CloudFormation snapshot property and execution evidence remain required. It retrieves no credential and makes no connection or permission change. All 207 local tests pass; strict typechecking passes. A later SQL access procedure must preserve and verify this pre-access observation before separately approved network changes.

`services/control-foundation/scripts/verify-private-restore.ts --verify-approved-private-restore` performs metadata-only verification using the existing authenticated AWS CLI session and Node24. It pins this execution's exact stack ARN, verifies the deployed template against the approved source checksum, requires exactly the two intended completed resources, validates clone and snapshot identity, checks inherited encryption and original database protections, and confirms the TLS parameter. The helper uses no external package, secret-value API or SQL connection. Missing explicit invocation fails before AWS access; other failures produce a generic error without dumping AWS responses. Successful output establishes provisioned restore configuration only, and does not qualify journal execution, migration authority, recovery correctness or production financial readiness.
