# Original journal deployment - installed and paused; startup correction pending

The founder approved original-database installation, private journal deployment, $5 verification and $1/month additional retained costs. On November 18, tested SQL 020/021 and the restricted passwordless bootstrap committed atomically on the original database. Existing record hashes/counts were preserved and the resulting catalog matched the qualified copy. No authority binding or monetary deployment was added. Historical migrations 001-019 were not replayed.

## Actual deployment and verification limit

The immutable Linux package matched its approved checksum. The exact six-resource private service deployed with version 1. The original blanket KMS denial remains deployed.

The first read-only qualification invocation failed before the handler. Invocation permission dry-run succeeded. A controlled read-only retry with AWS retries disabled captured KMSAccessDeniedException: the execution role's explicit kms:* denial blocks Lambda startup configuration decryption. The affected key is confirmed AWS-managed, alias/aws/lambda, ENCRYPT_DECRYPT, distinct from all six disabled signing keys. Actual IAM database login and live protocol checks remain unverified. Do not report passing runtime qualification.

The function was immediately paused after each attempt, and its declared stack restored to UPDATE_COMPLETE/concurrency zero. No signing, blockchain transaction, authority binding, public endpoint or financial activation occurred.

## Correction prepared, not applied

JOURNAL_STARTUP_CORRECTION_PROPOSAL.md describes the narrow exception. Native IAM simulation checked 48 action/resource/context cases: only the expected Lambda-routed decrypt on the exact startup key was allowed. Tested direct, wrong-service, wrong-account, financial-key and signing cases were explicitly denied. Policy simulation does not prove runtime startup or database authentication. The native unexecuted preview has no replacements: its API lists the role change and dependent function Role-attribute refresh, while the console displays the substantive role change.

## Cleanup and evidence

The encrypted checkpoint was removed after retained point-in-time recovery covered the pre-upgrade moment. Temporary security groups, endpoints, interfaces, transfer bucket/objects, private CloudShell environment and working files were removed. Original database privacy, encryption, Multi-AZ, deletion protection, fourteen-day backups and IAM authentication remained intact. Ingress admits only retained metadata/journal groups on port 5432. All six signing keys remain Disabled; public metadata financial execution remains false.

The private archive was downloaded, checksum verified and restricted to owner/SYSTEM. Public receipts omit per-table hashes/counts and customer records. The $5 allowance is an approved ceiling; actual billing was not measured. External review remains advisory; reserve arrangements and production financial qualification are unfinished.

## Preparation corrections before SQL

AWS grouped the two same-port ingress sources into one permission entry. The initial context check rejected that representation before password retrieval or SQL. The corrected validator accepts grouped/separate entries while requiring exactly those two unique sources. Tests reject extra, duplicated, missing and altered sources. A local-versus-Git line-ending checksum mismatch and an overly strict archive-link guard also stopped preparation before SQL. Official runtime links were checked for containment and extracted through Python's safe data filter. The original installer ran once and committed; no unknown commit was retried.
