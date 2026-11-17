# Private IAM metadata backend: deployed, verified and paused

The owner-approved private deployment completed in AWS account 720232346199, us-east-1, on November 17, 2026. The original RDS database now supports IAM authentication, a passwordless application reader can select only the three public registry tables, and the private Lambda passed actual IAM-authenticated reads. The function is paused with reserved concurrency zero. Temporary maintenance resources and AWS working copies were removed, and verified private evidence is retained on the owner's computer. No public endpoint or financial operation was activated.

See the [sanitized execution receipt](METADATA_IAM_DEPLOYMENT_RECEIPT_2026-11-17.json). Actual runtime source was `e737f3a3aa6f8de3976d7d3a39fa7b47a43217fa`; the separately tested administrator-bootstrap guard was `d64ee9afe901e89be001e5dafa0eb75cee621498`. Both were merged after successful CI.

## Actual changes and qualification

The original-stack change preview modified only `LedgerDatabase.EnableIAMDatabaseAuthentication`, without replacement or other database changes. Existing encryption, private networking, Multi-AZ, deletion protection, instance size, engine and fourteen-day backups were preserved. The repository's ledger template now records the enabled IAM setting.

CloudFormation reported one parameter-group difference: its actual-property response omitted the parameter override map. Direct RDS verification showed `rds.force_ssl=1` from the system source, with the correct parameter group in sync. The template's TLS declaration was retained, and the parameter group was not changed. This specific representation difference was recorded; no general drift exception or TLS bypass was introduced.

The private bootstrap verified the exact database resource/endpoint, fresh recovery coverage, isolated maintenance network, reviewed SQL checksum and the expected original catalog. It committed only the new reader role and grants at `2026-11-17T19:36:11.190Z`. Its before-catalog fingerprint was `c4d12f3655980558f8e87bc526b2e6ea630ae06cc937b6fba7efce70278c67db`; the role/grant-aware resulting fingerprint is in the receipt. The original administrator password was read only in process memory, with CLI response history disabled, and was never supplied to Lambda. Existing financial configuration remained paused.

Chrome's file-upload permission was unavailable, so the release was built inside public CloudShell from sixteen checksum-pinned source files, a verified official Node runtime, locked registry dependencies and the pinned regional RDS CA. The Linux ZIP SHA256 `34504f86dd79355025125cc2a377160815f180417061fb5f402c125fe40301d2` exactly matched GitHub's Linux build. The actual Lambda `CodeSha256` matched the checksum of its immutable S3 artifact version. No browser permission was changed.

Actual verification at `2026-11-17T19:44:01.620Z` through `19:44:14.282Z` confirmed the exact code, service-only role trust, restricted inline policy, absence of additional managed policies, private subnets and security group, and absence of a function URL or invocation resource policy. Successful registry reads ran the privilege audit as the real IAM-authenticated database reader.

| Private invocation | Actual result |
| --- | --- |
| GET `/health` | 200 |
| GET `/ready` | 200 |
| GET `/v1/protocol/policy` | 200; financial execution and live gas collection disabled |
| GET `/v1/protocol/master` | 200; actual `DEPOSIT_PAUSED`, no elected asset, financial execution disabled |
| POST `/v1/protocol/master` | 405 |
| GET `/v1/settlement` | 404 |

Minimum observed free database memory remained 2,592,743,424 bytes after IAM enablement, above the qualification floor. Test success establishes this private service's behavior and access boundary, not financial launch readiness.

## Pause, cleanup and retained evidence

The function was paused immediately after verification. A second, non-replacement change preview modified only reserved concurrency from one to zero, so the deployed stack and repository default both record the paused state. Resuming requires a separately authorized deployment; reapplying the current template does not activate it.

The temporary CloudShell environment was deleted after its receipts were downloaded and checked. While AWS released its network interface, only the two temporary database/secret-endpoint ingress rules were revoked, preserving the permanent reader rule. The three exact disposable S3 objects were then deleted and the owned ten-resource maintenance stack removed.

At `2026-11-17T19:57:24.228080+00:00`, authenticated checks confirmed `DELETE_COMPLETE`, absence of both temporary security groups, both endpoints, associated network interfaces and the temporary bucket. The original route table contained only its local route; the database accepted ingress only from the persistent metadata reader group. Database protections and current provider-advertised recovery coverage were preserved. No new restore is claimed by this recovery observation.

At `2026-11-17T20:01:59.074342+00:00`, the public CloudShell source/build/report directory and both downloaded archive copies were also removed after verifying their exact paths and hashes. Thirty evidence files remain outside Git on the owner's computer, with access checked as owner/SYSTEM only. They include the actual Linux release ZIP, bootstrap/qualification reports, source/network context and cleanup receipts. Published evidence excludes raw customer records, administrator credentials and private context contents.

The private function, restricted role, reader, IAM feature, seven-day execution logs and pinned deployment artifact remain, within the approved retention scope. The additional verification budget was $5 and retained storage/log allowance $1/month; these are authorization limits, not a claim that billing has finalized.

## Remaining deployment

The next concrete proposal is [public GET metadata access](METADATA_PUBLIC_DEPLOYMENT_PROPOSAL.md). Its eleven-resource template passes local boundary tests and CloudFormation syntax validation, but has not been deployed or approved. The informational ORIO.IO website and DNS/mail settings were not changed in this phase.

Production signing/custody, actual reserve arrangements, live financial providers/paymaster admission, user consent/recovery, operational reconciliation and accountable financial release remain unfinished. External review remains advisory. This private backend receipt does not authorize financial activation.
