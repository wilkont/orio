# Next monetary integration deployment

Completed infrastructure: hosted SQL 003–019, private IAM metadata reader, public read-only metadata gateway and five disabled production-purpose keys. Do not replay those operations.

The new reserve-backed valuation integration is locally qualified: authenticated canonical-block observation, exact backing checks, persistent one-shot signing intent and KMS-protocol signature, controller/vault execution and finalized ledger import. See [integration authority and failure behavior](../../docs/operations/RESERVE_VALUATION_SIGNING.md). Pending extension 020 has no runtime grants and is not installed on the hosted database. The existing SQL upgrade manifest remains unchanged. Local KMS responses are synthetic and no AWS signing call was made.

A current [single-source diagnostic](MONETARY_INTEGRATION_READINESS_2026-11-17.json) confirms the deployed testnet controller/registry runtime hashes but also confirms unset signers, execution false, no active master and missing registry monetary bindings. The next actual on-chain stage requires a reviewed fixed Base Sepolia governance plan: register/approve/elect native test USDC, bind the existing controller/vault and configure qualification signing identities. Keep production-purpose keys disabled. Scheduling/execution transactions and any signing access require their own concrete change and approval; the completed disabled-key approval does not authorize them.

Resolve the [proposed reserve operating/risk parameters](../../docs/operations/RESERVE_OPERATING_POLICY_PROPOSAL.md); then prepare the narrow hosted SQL/workload bootstrap and least-privilege grants, admitted live price sources, issuer pause/blacklist/proxy-upgrade checks, recovery drills and bounded test-network execution. Qualify each actual environment and record results before production deployment. No production funds or customer activity are authorized by test success.

ORIO Inc., Delaware, and company-operated protected signing are established owner choices. Actual company-approved customer rights, reserve ownership/insolvency terms and eligible-service policy must be recorded without fabricating legal arrangements. External review stays advisory; it is not a waiting requirement. Any actual financial account setup, binding acceptance or funding requires the applicable owner-controlled action.

ORIO.IO, DNS/mail, public metadata and the five disabled keys are unchanged by this local engineering phase.
