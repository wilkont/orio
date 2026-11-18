# Private journal startup verification — November 18, 2026

The founder-approved startup correction is applied in AWS account 720232346199, us-east-1. The existing six-resource stack is UPDATE_COMPLETE. The immutable journal version 1 passed all four live private checks, including actual passwordless IAM database login and privilege qualification. The function was then paused with reserved concurrency zero. All six signing keys remain Disabled and financial execution remains false.

## Observed failure and correction

The first approved candidate required kms:ViaService. An actual failed startup authorization trace contained the exact Lambda function ciphertext context and caller account, but no ViaService condition. That attempt failed before application execution and is retained in private evidence rather than reported as a successful check.

The final policy permits only Decrypt on the identified AWS-managed startup key, for this function's ciphertext context and account. It preserves explicit denials for every other key, other startup-key operations, other function ciphertext, other accounts and runtime-code decryption. The role trust remains Lambda-only. Encryption context is a data restriction, not caller authentication. Only the existing role policy changed; code, version, caller permissions and database schema did not change.

## Verification and material limitation

Four live checks passed: IAM database qualification; rejection of an unsupported signing request; rejection of an unbound request through the database journal function; rejection of an extra SQL field. The version-pinned service returned financial execution false. No signing or blockchain transaction occurred.

A separate 72-case key/function/account/action simulation passed: only the exact startup decryption case was allowed. However, simulations of the lambda:SourceFunctionArn runtime-code denial unexpectedly returned allowed, including standalone diagnostics. This discrepancy is unresolved. The denial remains in the deployed policy, but its effectiveness is **not verified**; do not represent the simulation suite as full runtime-denial qualification.

Independent deployed network inspection verified PostgreSQL-only egress to the original database security group, a local-only route table and no VPC endpoints: application code has no network route to KMS. This observed network restriction does not resolve the permission-simulation discrepancy. Future network changes must requalify the boundary before resuming the service.

## Evidence and closure

The sanitized JSON receipt records exact candidate/live-report and private-archive hashes. Private reports were downloaded, hash-verified and restricted to the workstation owner and SYSTEM. Remote working files were removed after verification. No temporary infrastructure was created for this correction. No original SQL rerun, secret-value retrieval, signing-key enablement, financial activation or budget increase occurred. Existing $5 verification and $1/month allowance applies.

Source verification passed in GitHub Actions run 44389412194 at code commit 5fe3414fc64d2f89779f041112f75f942ec0b331. Subsequent evidence documentation is separate from that code result.

## Remaining work

Resolve the runtime permission-simulation discrepancy before qualifying any wider network boundary. Hosted valuation-worker integration, authority binding, admitted live price providers, actual reserve arrangements, recovery qualification and production financial deployment remain unfinished. External review remains advisory. This milestone does not establish a fully live financial platform.
