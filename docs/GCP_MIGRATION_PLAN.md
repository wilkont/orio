# GCP migration plan — discovery stage

1. Select the authorized ORIO project, billing account, region, and budget. Do not repurpose unrelated accessible projects by inference.
2. Inventory AWS resources and DNS with read-only access; verify backups, dependencies, data ownership, and export scope.
3. Define isolated development, staging, and production environments with least-privilege access, reproducible infrastructure, secret management, database recovery, and monitoring.
4. Characterize legacy balances and transaction states; rehearse migration against copies and reconcile before accepting traffic.
5. Deploy qualified nonfinancial and read-only services first; financial activation requires its separate evidence gates.
6. Verify full DNS zone and email records, prepare certificates and health checks, rehearse rollback, and execute an authorized cutover.
7. Retain legacy resources until explicit retirement authorization and successful recovery verification.

No migration or production provisioning has executed. Resource sizing, cost estimates, recovery objectives, and tested deployment configuration remain pending.
