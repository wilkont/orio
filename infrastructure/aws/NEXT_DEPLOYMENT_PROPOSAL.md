# Next monetary integration deployment

The [reserve-backed signing integration](../../docs/operations/RESERVE_VALUATION_SIGNING.md) is merged in PR #30 with passing CI. Hosted SQL 001–019, metadata service and five disabled production-purpose keys are unchanged. Pending extension 020 is locally tested, not hosted-installed.

The next actual chain change is the [fixed paused Base Sepolia monetary setup](TESTNET_MONETARY_SETUP_PROPOSAL.md). Its ten transaction digests, nonce 6–15, planning bounds, executor, private Lambda allowlist and native AWS change preview are reviewable. AWS preview is AVAILABLE, unexecuted and has no replacements. The qualifier key/function remain disabled/paused. Do not enable signing or broadcast until its separate action-time approval covers this exact scope and cost. After approval, recheck nonce/configuration/fees and restore paused signing on completion or failure.

The [updated reserve risk proposal](../../docs/operations/RESERVE_OPERATING_POLICY_PROPOSAL.md) separates observation/price age from finalized-checkpoint lag. The latest founder question supersedes the earlier combined-age question; neither silence nor local test success is approval. Company-operated signing and ORIO Inc., Delaware, remain recorded choices. Actual company reserve/customer-rights arrangements, live price/issuer/proxy controls, least-privilege hosted signing, recovery and production financial qualification remain unfinished. External review stays advisory.

ORIO.IO, DNS/mail and production financial operations are unchanged by this preparation. Completed SQL/bootstrap/key creation must not be replayed.
