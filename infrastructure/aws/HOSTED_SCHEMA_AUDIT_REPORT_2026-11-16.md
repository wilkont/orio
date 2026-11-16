# Hosted schema inspection and managed-extension qualification

The owner-approved read-only inspection completed against ORIO's private PostgreSQL 17.9 database in account 720232346199/us-east-1. No hosted schema upgrade, application-table read, monetary write, signing enablement or financial activation occurred. Detailed catalog evidence remains outside Git in an access-restricted local file; only this non-sensitive summary is published.

## Evidence and observed state

- Report SHA256: `c2ae84db16c8334934fce1e1027747076a3cd2f02c7c4c11107e999c51680978`.
- Catalog format v2 fingerprint: `8374196a216470ba79eb63c908ed801d8b0b04ba9a19859ae08919ca58a4f09d`.
- Transaction read-only setting: on. Observed schemas: orio_ledger and orio_master.
- Inventory: 24 relations (including indexes/views), 68 columns, 43 constraints, six triggers and 42 functions; pgcrypto 1.3.
- Runtime role remains NOLOGIN, with no superuser, role/database creation, replication or RLS-bypass flags, and no role memberships.
- Installed migration versions remain unknown; no history table or retroactive migration record was invented.

The exact source/runtime/CA inputs were verified at both public preparation and isolated private execution. The database password was fetched through the secret-specific private endpoint into process memory, never printed or placed in arguments/files. CLI response history was explicitly disabled. The report traversed only the approved encrypted owner-only bucket, then its downloaded checksum was verified and its retained file and directory restricted to the owner and SYSTEM on the user's computer. Privileged operating-system administrators can still override local access controls; this is not a hardware secrecy guarantee.

Initial private Secrets Manager transport checks timed out. Credential-safe DNS/TLS tests and one single-account configuration-only Reachability Analyzer run established the configured path; subsequent strict TLS checks and the audit succeeded without widening rules. The analyzer's published price was USD0.10 for this one run; actual metered session billing is not yet verified. The cumulative USD2 inspection ceiling was not replaced by a new spending approval.

## Comparison and important limitation

An isolated PostgreSQL reference used a bootstrap provider identity named rdsadmin and a non-superuser database/migration owner named orio_ledger_admin. All schema, relation, column, constraint, trigger, function-definition, owner, runtime-role, membership, RLS and extension fields match the reviewed 001/002 source. The only initial differences were ACL digests on the 36 provider-owned pgcrypto functions.

The hosted helper ACL digest corresponds exactly to the canonical grant set `rdsadmin:rdsadmin:EXECUTE:false`: execution is confined to the provider owner. Applying that same provider-owned helper ACL in the isolated reference produces the **exact hosted catalog fingerprint** above. This is an explained reference-model match, not proof of historical installation steps or provider-specific role inheritance. The old migration-002 file checksum discrepancy remains in the historical receipt; observed master-function and structural definitions match the current reviewed source, and that receipt has not been rewritten.

Under that local permission model, a synthetic journal failed with SQLSTATE 42501 (digest execution denied) and left chain sequence zero. Giving only the ledger schema/definer owner execution on the two required digest overloads allowed the synthetic journal and hash verification to succeed while direct runtime digest execution remained denied. This does **not** assert that an actual RDS journal failed: the hosted write path, migration-owner inheritance and provider-specific grant authority have not been exercised.

## Prepared correction, not deployed

Migration `019_managed_digest_permissions.sql` explicitly grants only digest(bytea,text) and digest(text,text) to the existing ledger schema/definer owner. It validates pgcrypto membership, trusted owner/grant authority, matching journal ownership and confined grants, and rejects PUBLIC/runtime or unrelated execution grants. It does not grant general extension access, change token economics, modify monetary records or create a login. Historical migrations remain unchanged.

The managed-extension regression reproduces the denied journal, verifies atomic rollback, rejects an untrusted migration caller, applies the owner-only correction locally, then checks exact/idempotent accounting, chain integrity and continued runtime primitive denial. The ordered upgrade and actual local logical restore rehearsal now include 019. Strict TypeScript and all **205** local integration tests pass. No statement of hosted qualification follows from these local results.

## Cleanup and next action

After the verified local report was retained, both temporary S3 objects and the public maintenance copy were deleted. The isolated CloudShell environment and all ten stack-managed resources were deleted. AWS returned DELETE_COMPLETE; both private endpoints, temporary groups/interfaces and bucket were absent; permanent database ingress was empty. The temporary path analysis and path were also deleted. No forced interface detachment occurred.

The next required production step is an explicitly approved private snapshot/restore qualification and upgrade procedure, first on a disposable restored copy. It must verify real RDS owner digest privileges, apply only 003–019 after a verified baseline, exercise rollback-safe synthetic accounting and preserve a restorable recovery point before any original-database upgrade. Actual workload identity, runtime deployment, reserves and accountable financial release acceptance remain separate unfinished work. External review remains advisory.

Primary references used for operational checks: [AWS gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html), [AWS Reachability Analyzer](https://docs.aws.amazon.com/vpc/latest/reachability/what-is-reachability-analyzer.html), [network-analysis pricing](https://aws.amazon.com/vpc/pricing/).
