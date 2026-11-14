# AWS deployment for ORIO Ledger A

Target account 720232346199 in us-east-1. The stack creates its own VPC in us-east-1a and us-east-1b. The template creates a private, encrypted Multi-AZ PostgreSQL 17 database with 14-day backups, TLS enforcement, and an RDS-managed administrator secret. AWS charges apply to RDS, backups, Secrets Manager, and logs. Review the CloudFormation change set before execution.

From an authenticated AWS CLI or CloudShell session, verify the account, validate the template, and create a change set:

```powershell
$account = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0 -or $account -ne '720232346199') { throw 'Wrong AWS account' }
aws cloudformation validate-template --region us-east-1 --template-body file://infrastructure/aws/ledger.yaml
if ($LASTEXITCODE -ne 0) { throw 'Template validation failed' }
aws cloudformation deploy --region us-east-1 --stack-name orio-spc-3-ledger --template-file infrastructure/aws/ledger.yaml --no-execute-changeset
```

After the stack is available, connect from a dedicated migration workload in the VPC using its own security group, narrowly scoped secret access, and the RDS CA bundle. Before migration, provision a Secrets Manager interface endpoint or approved routed egress, and allow TCP 5432 from the migration workload security group only. The database security group starts with zero inbound rules. Apply the existing Ledger A migration to the new database, then grant its runtime role to a separate workload login as described in the control foundation README. Verify connectivity, backup restoration, journal integrity and least-privilege access before using any persistent environment. Deletion protection requires an explicit stack update before deletion. CloudFormation snapshots the instance on deletion or replacement.

Legacy EC2, backups, DNS, and GCP resources are outside this stack. This stack has no public application, monetary execution, or release approvals.
