# Hosted schema audit prerequisite

This module observes PostgreSQL catalog definitions before a separately authorized hosted upgrade. It does not apply migrations, infer installed migration versions, establish a trusted baseline, or enable financial execution.

## Authorization and execution

Use an explicitly authorized private connection to the pinned ORIO RDS endpoint, database `orio_control`, with certificate verification and a trusted RDS CA file. Configure `ORIO_SCHEMA_AUDIT_DATABASE_URL` and `ORIO_PG_CA_FILE` through the approved private execution environment; never commit or print credentials. Run `node scripts/audit-hosted-schema.ts ABSOLUTE_PRIVATE_REPORT_PATH` from this service. No access or credentials are provisioned by this command.

The output must be outside the repository, must not already exist, and should remain private. File mode 0600 is requested; Windows operators must separately verify filesystem ACLs. Report names and catalog identifiers can disclose internal architecture. Do not publish the raw report.

The audit uses a repeatable-read, read-only transaction and queries only PostgreSQL catalogs. Function bodies, view definitions, ACLs and policy expressions are hashed on the server. Application rows and raw function bodies are not returned. Runtime role names use parameterized queries. SQL identifiers in isolated tests are generated and strictly validated.

## Failure behavior and limits

Wrong target, TLS override, missing configuration, connection timeout or catalog failure aborts with a generic credential-safe CLI error. The module always rolls back its transaction. Each statement has a timeout. A report-write failure performs no database changes. An existing output is never overwritten.

The fingerprint detects observed catalog drift; it is not authentication against a privileged database administrator. PostgreSQL formatting and versions can affect hashes. It is not a comprehensive inventory of all database objects or effective privileges: inherited role chains, default privileges, database-level grants, sequence state and application data require separate examination. It does not prove reserve balances, backup restorability, migration provenance or operational readiness. `installedMigrationVersions` remains null and baseline status remains `REQUIRES_VERIFIED_BASELINE`.

## Verification and remaining work

The actual isolated PostgreSQL integration test covers read-only operation, stable fingerprints after private application-row changes, detection of column/function/role/RLS drift, exclusion of raw private content, and rollback after identity rejection. All 204 local integration tests pass, including the complete upgrade/local logical restore rehearsal and credential-identity checks. Catalog format version 2 expands default ACLs and sorts named grants to recognize equivalent explicit/default permissions after restore. Strict service and CLI typechecks are required in CI.

No hosted connection or migration has been performed by this change. Before applying migrations 003–018, obtain scoped private access, inspect current AWS backup and database metadata, collect this private observation, compare against a verified baseline and migration history, validate a restorable backup, and review a concrete upgrade and rollback procedure. Historical evidence of migrations 001–002 alone must not be represented as a verified current schema.
