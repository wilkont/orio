# ORIO monetary policy proposal

Recorded November 13, 2026 from the founder's revised supplemental monetary directive. This document distinguishes confirmed requirements from proposals. The latest user-paid gas instruction supersedes earlier conflicting gas assumptions. Historical directives remain preserved.

| Rule | Status | Engineering treatment |
| --- | --- | --- |
| 1% purchase/redemption conversion fee | Confirmed | Preserve |
| Ordinary fee: 20% company, 80% eligible holders | Confirmed | Preserve; no dilution from appreciation |
| Appreciate existing holdings before purchase mint | Confirmed | Mandatory execution ordering |
| Exclude redeemed tokens from their own appreciation | Confirmed | Mandatory eligible-supply boundary |
| Full redemption: all conversion fee to company | Confirmed | Preserve |
| Ordinary transfer: zero protocol fee, user pays network gas | Confirmed | Publish separately in protocol metadata |
| Company Gas Treasury fronts ETH; user pays quoted gas | Confirmed | Segregated gas controls; no general subsidy |
| ORIO 18 decimals; native USDC 6 decimals | Directed representation | Exact integer boundaries |
| Genesis redemption reference $1 per ORIO | Proposed | Simulation only |
| Zero-holder 80% fee in restricted escrow | Proposed | Simulation only, no company reclassification |
| Final rounding/minimums, residual-supply protection, reopening | Awaiting approval | No live monetary settlement |

Recommended review package: $1 opening reference; restricted zero-holder escrow; exact rational intermediates with a proposed USD scale of 36 decimals; floor mint/payout quantization; segregated residuals; common-snapshot redemption epochs; concentration alerts initially, with no automatic withholding; new issuance cycles only after an explicit reopening decision. Each recommendation is independently reviewable, not an inferred approval.

The revised directive names GCP, while the later operational migration mandate selected AWS account 720232346199. This policy change does not move infrastructure back to GCP or expand spending authorization. Only initial AWS migrations 001/002 were previously applied. All new gas/control migrations remain local.

Approval must identify policy version/digest, jurisdiction/legal ownership determinations, rounding and dust parameters, epoch membership/cutoff, disposition of escrow/residuals, failure charges, exchange-rate risk and new-cycle treatment. Legal/security/custody/financial/operational evidence and accountable release acceptance remain necessary, but external review is advisory under ADR 0002. One authorized owner may cover multiple release roles. Policy approval does not by itself establish actual reserves or custody.

Implementation map: services/control-foundation/src/{monetary-policy,gas-policy,gas-controls,monetary-simulation}.ts; migration 008; the other ten documents in this directory. GET /v1/protocol/policy publishes confirmed policy alongside explicit pending proposals and disabled execution.
