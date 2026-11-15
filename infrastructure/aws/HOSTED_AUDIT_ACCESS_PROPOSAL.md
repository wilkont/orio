# Private hosted audit access proposal

Prepared 2026-11-15. Not approved or applied. This supersedes the historical initial-installation access proposal for this inspection only. Initial migrations 001–002 must not be rerun.

## Exact proposed change

In account 720232346199, us-east-1, create stack `orio-spc-3-hosted-audit` using `hosted-audit-access.json`. It creates two temporary security groups, three security-group rules and one single-subnet Secrets Manager interface endpoint. It opens database port 5432 solely from the temporary audit group; endpoint port 443 solely from that group. Session egress is limited to that database group and endpoint. The endpoint policy permits only the existing account administrator principal to read/describe the one pinned RDS administrator secret. It grants no IAM permission and changes no database setting, key, existing account identity or public route.

Use one temporary CloudShell VPC environment in subnet `subnet-074b44d8936032ab9`, VPC `vpc-05613af21236d6911`, with the created audit group. Before creating resources, resolve the ledger stack's current physical identifiers, verify account/region and secret ARN, confirm no conflicting Secrets Manager endpoint, and obtain an AWS change preview with no database replacement. A changed identifier or unexpected service dependency stops execution.

This is a one-time administrator maintenance session. It does not deploy or operate the application as root, give administrator credentials to the application, or change orio-operator permissions. The administrator secret has broad database privileges even though the inspection command uses a read-only transaction; this is a consequential access boundary requiring explicit approval. It is not a read-only database credential. A dedicated least-privilege application login must be provisioned separately.

## Permitted inspection and data handling

Prepare and verify the pinned audit bundle and dependencies before entering the isolated environment. Read the RDS secret from Secrets Manager into process memory only and use it solely to connect to `orio_control` at the pinned RDS endpoint over verified TLS using the official trusted RDS CA. Never print the secret, place it in command-line arguments/history, save it to disk, copy it into chat, or transmit it outside this AWS maintenance session. Node's audit connection must not be configured through an exposed shell command containing a password.

Run the existing schema-audit module using read-only, repeatable-read transactions and bounded timeouts. Retrieve catalog metadata and server-side definition/ACL hashes only; no customer application rows or raw function bodies. Keep the detailed report private outside Git; publish only a non-sensitive summary and digests after inspection. If a private report cannot be retained through an approved mechanism, stop rather than upload it to an unrelated service. Current SQL versions and a trusted baseline remain unproven until evidence is compared; the audit deliberately does not invent migration history.

No schema upgrade, migration-history backfill, restore, snapshot deletion, issuance, financial activation, signing enablement, funds transfer, new credential or public endpoint is authorized by this proposal. Inspect backup configuration and existing snapshot/restore metadata only. Actual restore validation and upgrades require the next concrete procedure based on observed state.

## Duration, cost and cleanup

Propose up to USD2 additional temporary maintenance cost, a one-hour working window and removal within 24 hours. This is a proposed maximum, not measured spend or a technical billing cap. Verify current endpoint pricing before activation. Existing RDS and previously approved key costs continue separately; no new recurring application workload is included.

After inspection or failure, delete the temporary CloudShell environment, remove the stack-managed database ingress and endpoint, then delete the temporary groups after ENIs release. Verify that original database ingress and permanent resources are preserved. Never force-detach ENIs or delete the permanent database. Record cleanup even if inspection fails. Temporary root maintenance authority ends with this scoped session; it does not authorize future changes.

## Verification available now

The complete local ordered migration chain 001–018 was rehearsed with a pinned checksum manifest. A synthetic large-integer journal survived the upgrade and a real local pg_dump/psql restore with balances, idempotency and ledger hash verification intact. Equivalent default/explicit ACLs are normalized; real grants remain detectable. This is isolated local restore evidence, not proof that an RDS snapshot is restorable. The hosted audit has not run, and no new network or secret access has been created.

All 204 local integration tests and strict typechecking pass. A credential-free audit archive containing only the selected audit modules, package metadata and 14 locked production dependency directories was prepared outside Git: `orio-audit-bundle-1Y8sSX.tar.gz`, SHA256 `22115856cd0154e7a63b501a1f3689157d7cf9ff6107a5f475b3a71ee8319a6a`. Its 144-file checksum manifest is included. Imports were verified in the existing pinned Linux Node 24 container with networking disabled. No RDS credential is in this bundle. Verify archive and per-file hashes after upload and verify the maintenance environment's Node runtime before execution; unavailable compatible runtime blocks the audit.

The in-process `audit-hosted-from-secrets.ts` wrapper invokes the official AWS CLI for the exact secret, validates returned identity and encodes password punctuation safely, then calls the audit without passing the password to a child process. Its memory is transient; no claim of guaranteed cryptographic memory erasure is made. A secret-supplied host or database cannot redirect the connection.

The current normalized-LF checksum for migration 002 differs from the historical installation receipt, and neither LF nor CRLF serialization reproduces that old recorded checksum. Migration 001 matches the old receipt. This is an unresolved provenance discrepancy, not proof of hosted schema drift. Do not adopt the current local baseline as installed, rewrite the old receipt, or rerun 002. Compare the hosted catalog with preserved historical inputs and reconcile the discrepancy before any upgrade is approved.
