# Original database and paused private journal — prepared approval package

Status: this original-database/private-service scope was subsequently approved and executed on November 18. SQL committed and the service is deployed/paused. Actual runtime qualification is blocked before the handler by the blanket KMS denial. See ORIGINAL_JOURNAL_DEPLOYMENT_REPORT_2026-11-18.md and JOURNAL_STARTUP_CORRECTION_PROPOSAL.md. The original proposal below records the approved scope; it does not authorize the new startup-key exception. External review is advisory.

## Qualified inputs

The actual private-copy rehearsal committed extensions 020/021 and `valuation-journal-bootstrap.sql` as one checked transaction. Existing record hashes/counts matched, the new login had exactly three executable ORIO functions and no direct table/column privileges, and no signing authority was created. Its private report SHA-256 is `6256c62186b44397370a1df6a8f8242fdf1d8c2a900e20621c5f25aabf0b16af`. The qualified resulting catalog fingerprint is `ea31f39f97fc104cbd5f4ec9be42333fbc39606f00c6af12eeee7dd744b73f3d`.

The same three SQL sources and their checksum manifest remain unchanged. The original's expected pre-install fingerprint is `141a8c8aedd1ea45af794d2de847c836798e19d21cf1223334b740e9082b33f7`. A mismatch stops the procedure; it does not authorize adopting an unknown schema or occupied login.

## Proposed scope after separate approval

In AWS account 720232346199/us-east-1:

1. Verify original database identity, encryption/private access, active IAM authentication, forced TLS, current recovery coverage and absence of old temporary resources. Create a fresh encrypted recovery checkpoint named `orio-spc-3-pre-journal-upgrade-20261118`.
2. Reuse the unchanged ten-resource `hosted-sql-maintenance.json` boundary: temporary private access, an original-secret-only endpoint and owner-only encrypted transfer/report storage. Use the existing administrator session for at most one hour. Read the **original** administrator password only in memory for its pinned TLS database connection. No customer records or passwords enter the transfer store; private reports contain only metadata, hashes and counts.
3. Capture fresh evidence with `prepare-original-journal-context.ts`. `journalOriginalContext` requires the exact prior rehearsal, current recoverable checkpoint, original host/resource/secret, and exactly two actual ingress sources: retained metadata reader `sg-035e5f2d33504884b` and the new temporary maintenance group. An original-only action flag, `--apply-approved-original-journal`, is distinct from the clone command. Unpack source into a `source` subdirectory and keep exclusive receipts outside it; never place reports inside the source root.
4. Run `install-original-valuation-journal.ts` with an explicit context digest and pinned CA. The checked installer locks existing application tables, applies the three bodies atomically and verifies record preservation. This can briefly block database writes. Require the committed catalog to match the qualified copy. Unknown commit acknowledgement or an occupied role requires inspection, never a blind replay.
5. Remove temporary maintenance access and transfer resources. Verify recovery coverage includes the pre-upgrade point before removing the temporary checkpoint. Preserve the existing fourteen-day backup policy and database protections.
6. Build the private journal ZIP on Linux from the reviewed source and require SHA-256 `8692186852a85a5dcacf8e21ec0b90de7249612169d06cf520ef60a236d61926`. Upload it as an owner-only versioned artifact to the existing ORIO artifact bucket. Inspect a native CREATE preview containing exactly the six resources in `valuation-journal-private-lambda.json`, with no replacement or additional access.
7. Deploy the private journal and its immutable code-pinned version. Its AWS role can connect only as `orio_valuation_journal` to the exact original database resource ID, write its seven-day logs, and support Lambda-managed networking. Application code is denied network-management permissions. KMS, secret retrieval, further function invocation and role assumption are explicitly denied. There is no public endpoint or new operator/caller grant.
8. Temporarily use reserved concurrency one for administrator-only verification of real IAM database authentication, strict request rejection and rejection of unbound intents. Then restore concurrency zero through the declared template and verify the paused state. No authority binding, signing request or monetary deployment is created.

The original SQL extension and restricted login persist. The six-resource private service and its versioned artifact/logs persist, paused. Remove all temporary access, transfer objects/storage, working files and the temporary checkpoint within 24 hours after verification. Preserve private reports on the owner's computer. Do not infer the original's state from the disposable copy; check the actual result.

## Budget and exclusions

Proposed additional allowance: **up to $5 for verification and $1/month for retained private service/artifacts/logs**. These are planning ceilings, not a claim of measured billing. Existing metadata-service and protected-key allowances remain separate.

This phase performs no KMS signing, key enablement, blockchain transaction, public endpoint, website/DNS/mail change, asset transfer, reserve funding or financial activation. All six existing keys remain disabled. The version-pinned journal transport is implemented and tested locally, but the outside-VPC valuation worker and its signing permission are not included in this proposal. Actual reserve arrangements and production financial qualification remain unfinished.

## Verification and failure behavior

Strict tests reject clone-purpose approval, changed source/rehearsal, stale checkpoint or recovery window, mismatched database/secret, extra ingress and altered account/region/maintenance resources before credential retrieval. The actual SQL transaction/record preservation and final-stage rollback have local and disposable AWS evidence. Transport tests pin the exact function version and endpoint, disable SDK retries and prove a lost claim acknowledgement prevents KMS signing and requires reconciliation. The private Lambda ZIP is rebuilt and compared to its Linux code pin in CI.

`build-original-journal-inputs.sh FULL_REVIEWED_COMMIT` prepares only credential-free source/runtime/CA inputs. It makes no AWS API or database call. All access-changing steps above remain pending the specific approval.
