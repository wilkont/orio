# Hosted SQL upgrade rehearsal

The owner-approved private rehearsal committed migrations 003â€“019 on an encrypted disposable restore of ORIO's PostgreSQL 17.9 ledger in AWS account 720232346199, us-east-1. Completion was acknowledged at 2026-11-17T01:38:28.233Z (November 16 local time). **The original database was not upgraded and financial operations were not activated.**

## Actual result

The deployed twelve-resource template matched the reviewed source. Preparation and private execution verified the source, locked dependencies, official Node runtime, regional RDS certificate bundle, fresh target context and complete transfer archive. The private database connection used certificate and hostname verification. Only the restored copy's generated administrator secret was retrieved, in process memory; no password was printed or persisted. The original secret was not retrieved.

The starting catalog fingerprint matched the earlier read-only inspection: `8374196a216470ba79eb63c908ed801d8b0b04ba9a19859ae08919ca58a4f09d`. The seventeen reviewed migrations executed in one transaction. Existing history passed its integrity checks, preservation checks passed, and the large-integer/idempotency journal probe under the restricted runtime role was rolled back without retaining its synthetic records. This also qualified migration 019's narrow managed-pgcrypto dependency grants on actual RDS. Monetary issuance remained paused with no monetary or signing configuration activated.

The resulting catalog fingerprint is `c4d12f3655980558f8e87bc526b2e6ea630ae06cc937b6fba7efce70278c67db`. The successful private report SHA256 is `91e47bdf44367d7fcd90d5720980a35dfd52004a2596796d50d996534e571fe5`. Exact committed filenames/checksums and safe result flags are in [the sanitized receipt](SQL_QUALIFICATION_RECEIPT_2026-11-16.json). Historical 001/002 installation versions and file provenance were not invented or rewritten.

## Transport interruption and retained evidence

The first attempt claimed its progress receipt but timed out reaching the private Secrets Manager endpoint before any secret value or database connection was obtained. Protected receipts were retained. DNS, security groups, subnet rules and clone connectivity were checked without widening access. Restarting the same approved CloudShell VPC environment after endpoint readiness restored connectivity. Its inputs were authenticated again, and only after establishing the pre-SQL outcome were the owned receipt slots reset for the successful retry. No ambiguous SQL commit was retried.

Both attempts' receipts and the target context were downloaded in one archive, SHA256 `fe017ec6cf2bed140685c40333adaa8b443441b4633a745c8b1740650fa5175d`. Archive members and the individual successful report checksum were verified on the owner's computer. The retained folder and all files permit only the owner and Windows SYSTEM. Raw preservation counts and data hashes stay outside Git in `outputs/private-sql-qualification-20261116`; this repository contains no customer records or administrator password.

## Cleanup and limits

Cleanup completed at 2026-11-17T01:48:33.511652+00:00. AWS confirmed DELETE_COMPLETE; the clone, its managed secret, manual snapshot, temporary groups/interfaces/endpoints, bucket and gateway route were absent. The private CloudShell environment was deleted without forced interface detachment. Original ingress was empty and the original available/private/encrypted/Multi-AZ/deletion-protected database, TLS requirement, secret identity and 14-day automated backups were preserved. The verified cleanup report SHA256 is `f5df5a78c64e17edf32765f4067f3bdf60c9798ed7b9818e1704293444fc2654`. The authorization ceiling is USD5 additional, not a measured bill or a technical spending cap.

This result supports preparing the original database's maintenance change, including a fresh recovery checkpoint and separately authorized temporary access to the original. It does not authorize silently switching this clone-only procedure to the original. Hosted application identities, private workload deployment, operational integration, reserve arrangements, production signing and accountable financial release qualification remain unfinished. External review remains advisory.

Original maintenance preparation: the separate guarded original-only procedure and ten-resource template are prepared in [ORIGINAL_SQL_UPGRADE_PROPOSAL.md](ORIGINAL_SQL_UPGRADE_PROPOSAL.md). All **229** local tests and strict typechecking pass. This preparation made no original-database access change or SQL upgrade.
