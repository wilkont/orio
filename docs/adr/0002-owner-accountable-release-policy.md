# ADR 0002: owner-accountable release acceptance

Date: November 13, 2026. Status: accepted by explicit user instruction to remove the independent-review requirement.

External independent review is advisory, not a release prerequisite. Legal, security, custody, financial and operations readiness remain separate evidence categories, but one authorized accountable owner may approve multiple or all categories. Neither distinct principals nor distinct release-signing keys are required. Role authorization, evidence digests, actual readiness, signature validity/revocation/expiry and exact release/deployment/contract binding remain mandatory.

The release signing domain advances from ORIO-SPC-RELEASE-APPROVAL/v1 to /v2. Previous-policy signatures cannot silently authorize this changed policy. Trust and approval files remain empty; this decision creates no keys, fabricated approvals, legal determinations, reserve evidence or execution capabilities. Duplicate signatures for one category cannot substitute for a missing category.

This supersedes the external-review and distinct-release-approver requirements in ADR 0001, the original control specification/acceptance report and historical directives/status entries. Historical files record what was previously required; current code, this ADR and updated operational guidance control the revised policy.

The change does not waive founder approval of proposed economic rules, legal obligations, authenticated customer consent, reserve/custody verification, security testing, network finality, gas accounting or deployment authorization. Separate user and treasury consent on a gas permit is transaction authorization, not independent review. Two-source chain verification and off-database checkpoints are technical verification controls, not reviewer requirements, and remain in place.

No mainnet activation follows from removing a review requirement. Qualification-only contracts still reject mainnet because production functionality/configuration and operational acceptance remain unfinished. Work can proceed without waiting for an external reviewer. The owner can provide release acceptance once the actual remaining work and evidence are complete; an unsigned global enable flag is not an acceptance record.
