# Dedicated ORIO operator

Created under the owner's explicit approval of the migration access proposal and dedicated non-root operator.

AWS account 720232346199 contains user arn:aws:iam::720232346199:user/orio/orio-operator, tagged Project=ORIO-SPC-3. Inline policy OrioLedgerInspection grants inspection of the ORIO ledger CloudFormation stack and the specific RDS instance. The policy source is operator-read-policy.json. Credentials, deployment rights and secret retrieval are outside this inspection policy.

Fresh checks returned no access keys and NoSuchEntity for the console login profile. The account owner must create the console password and configure MFA before operator use. No working non-root session has been established.

The shared migration receipt MIGRATION_RECEIPT_2026-11-12.md reports installation of SQL migrations 001 and 002, TLS connectivity and empty/paused verification. Its checksums match the current SQL files. This turn independently verified CloudFormation CREATE_COMPLETE, empty database ingress and absence of the receipt's temporary Secrets Manager endpoint. It did not reopen database access or rerun the SQL migrations. Actual incremental billing remains unverified. The approved budget remains USD 2 for the temporary migration work.

The operator's initial inspection-only scope avoids leaving permanent administrator-secret access after the completed maintenance. Any future deployment workload needs its own scoped permissions and review.

Owner completed console password and passkey registration. Fresh IAM Security credentials view shows a Passkeys and security keys entry for orio-operator-mfa. Browser also confirmed Passkey saved. A non-root sign-in and permission test remain unverified.

Operator session verified in the in-app browser as orio-operator in account 720232346199. The operator successfully read the direct CloudFormation stack details and CREATE_COMPLETE status in us-east-1. CloudFormation ListStacks is denied by the scoped policy. The RDS console direct page reports that the selected database cannot be found; the restricted session has not independently verified DescribeDBInstances success, so do not infer deletion from that UI message or claim database inspection is fully qualified. API verification remains pending. Console listing permission has not been added.
