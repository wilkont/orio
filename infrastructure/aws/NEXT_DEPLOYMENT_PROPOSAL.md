# Next AWS deployment preparation

Target account: 720232346199, us-east-1. The dedicated non-root orio-operator session was freshly verified November 14. It can read the ledger stack and its outputs; broader listing/key-management actions are denied. This plan grants no IAM, network, migration, spending or deployment permission.

Historical and current stack boundary: orio-spc-3-ledger reports CREATE_COMPLETE. The existing installation receipt verifies initial SQL migrations 001/002 only. No new inspection establishes later schema versions. Migrations 003-018 remain unapplied by this work. Do not rerun initial migrations, infer resource deletion from denied listing, or use the administrator secret as an application login.

## First protected-key change

The exact initially disabled qualification key/alias template and scoped existing-operator key management are prepared in protected-signing-key.json. See PROTECTED_SIGNER_BOOTSTRAP.md for costs, permission changes, validation limits and the one-time administrator requirement. No key is created or enabled and no cryptographic signing access is granted by that preparation. The earlier USD2 temporary migration approval is not approval for recurring keys or an application workload.

## Hosted service/database change

Before execution, finalize a pinned application image, concrete workload/network change set, resource-specific deploy role, separate migration identity and least-privilege workload logins. Verify TLS/hostname and the installed schema/checksums, establish and verify recoverable backup/restore evidence, then apply only unapplied migrations. No public database ingress, old administrator-secret runtime use or fabricated migration-version record is permitted.

The first hosted candidate remains financially read-only, without public signing or money routes. Demonstrate private database connectivity, immutable journals, bounded observers, retries and restoration before financial activation. Existing website hosting in legacy account 710096437887 remains separate; no DNS or financial database cutover is performed by publishing a website.

Actual custody/signing authority, production contracts, customer consent/recovery, event-specific monetary history adapters, full Base fee attribution, provider admission and accountable release evidence remain outstanding. The owner selected ORIO Inc., US-origin/global market intent and company-operated protected signing; do not ask those preference questions again. Actual ORIO eligibility is still distinct from USDC availability. External independent review is advisory, not a waiting requirement.
