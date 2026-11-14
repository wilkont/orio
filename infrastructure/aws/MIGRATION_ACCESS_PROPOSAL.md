# AWS database migration access proposal

Prepared for approval. Target account 720232346199, region us-east-1, stack orio-spc-3-ledger, logical database LedgerDatabase. Resolve its physical DB identifier and master-secret ARN from CloudFormation and RDS immediately before use, refusing any account, VPC or stack mismatch.

## Verified target

The stack is CREATE_COMPLETE. RDS returned available, PubliclyAccessible false, StorageEncrypted true, MultiAZ true and master-secret status active. The VPC is vpc-05613af21236d6911. The database security group is sg-030c057c133762083. Use the existing subnets identified by CloudFormation logical resources DatabaseSubnetA and DatabaseSubnetB. Resolve their physical IDs through the stack before applying approved changes.

Migration and connectivity remain unverified. Local verification currently passes 40 tests. The master registry and reserve/supply comparator have local coverage only.

## Proposed access

Create one temporary CloudShell VPC environment in DatabaseSubnetA, tagged for ORIO migration, using a dedicated migration security group. Create a single-AZ Secrets Manager interface endpoint in that subnet with private DNS and a dedicated endpoint security group.

Add TCP 5432 ingress to the existing database security group solely from the migration security group. Permit migration egress solely to that database security group on TCP 5432 and to the endpoint security group on TCP 443. Permit endpoint ingress on TCP 443 solely from the migration security group. VPC DNS resolution is required.

Proposed operator role is arn:aws:iam::720232346199:role/orio-spc-3-migration. The current CloudShell principal is arn:aws:iam::720232346199:root. A named non-root operator must be designated before a least-privilege role session can be established. Its trust must name that designated principal after approval, with a one-hour session duration and no persistent access keys. Its secret policy grants secretsmanager:GetSecretValue and secretsmanager:DescribeSecret only for the RDS master-secret ARN resolved from LedgerDatabase. Endpoint policy limits secret access to that same role and secret. The existing AWS-managed Secrets Manager key is used. A customer-managed KMS key would require a separately reviewed, key-specific decrypt permission.

Before execution, verify CloudShell can use that assumed role for its VPC session. Provisioning permission is a separate operator concern and must be scoped to the named CloudShell environment, new security groups, endpoint and existing database group. An unexpected identity or service requirement blocks execution pending a revised proposal.

## Intended migration

Upload the reviewed SQL migrations and checksum manifest to the temporary session. Use PostgreSQL with certificate and hostname verification against the RDS CA bundle. Read the secret directly in memory and avoid shell history, command-line credentials, logs and persistent files. Confirm the target database is orio_control and its ORIO schemas are absent. Apply 001_ledger.sql and 002_master_registry.sql with their transactional boundaries. Verify schema versions, zero balances, paused master registry, append-only privileges and an empty journal chain. Perform synthetic journal checks in a transaction that is rolled back.

No master election or monetary settlement is part of this database installation. Creating a long-lived application database login requires a later workload-identity proposal.

## Duration and cleanup

Proposed maintenance window is one hour, with a hard maximum of 24 hours for temporary AWS resources if recovery is needed. Remove the temporary ingress rule, endpoint, CloudShell environment, endpoint/migration groups and role after verification. Preserve an independent deployment record and checksums. A failed SQL transaction rolls back. If 001 succeeds and 002 fails, leave the schema paused and diagnose. Do not drop committed schemas or delete the database as an automatic rollback.

## Costs and approval

AWS documents no additional CloudShell charge. A single-AZ interface endpoint in us-east-1 is approximately USD 0.01 per hour plus USD 0.01 per GB processed. One day is approximately USD 0.24 plus data processing, taxes and any incidental applicable charges. Existing RDS, backups, secret and log costs continue separately. Proposed incremental maintenance budget is USD 2, with removal of the endpoint within 24 hours. This is an approval request, not an approved spending limit.

Approval is required for the temporary billable endpoint and CloudShell VPC environment, new role and secret access, database/network rules and database schema installation. No proposed access changes have been executed.

Sources

- https://docs.aws.amazon.com/cloudshell/latest/userguide/using-cshell-in-vpc.html
- https://docs.aws.amazon.com/cloudshell/latest/userguide/creating-vpc-environment.html
- https://aws.amazon.com/privatelink/pricing/
- https://docs.aws.amazon.com/secretsmanager/latest/userguide/vpc-endpoint-overview.html

## Remaining engineering acceptance

| Component | Local evidence | Deployment evidence |
| --- | --- | --- |
| Ledger A and signed release checks | Passing suite | Migration pending |
| Master entry checks | Passing suite | Chain adapter pending |
| Master registry | Concurrency and rollback tests | Governance executor pending |
| Circle USDC selection | Chain-specific identity tests | Eligibility and election pending |
| Reserve and supply reconciliation | Finalized-snapshot mismatch tests | Adapter, containment and scheduling pending |
| Conversion and redemption | Exact rational monetary reference | Routing, receipt verification, payout and mint/burn pending |
| Master migration | Registry replacement serialization | Evidence verification, execution and loss accounting pending |
| Website, wallets, operations console | Legacy discovery | New integrated application pending |
| Independent qualification | Empty release approval registry | Legal, custody, financial, reserve and security evidence pending |
