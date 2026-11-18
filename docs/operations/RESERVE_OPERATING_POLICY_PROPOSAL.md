> Founder resolution: the updated numeric risk limits, including the separate 3,600-second finalized-checkpoint age, were explicitly approved for implementation on November 17, 2026. The earlier combined-age question was superseded. See services/control-foundation/config/approved-reserve-risk-policy.json. Funding, financial activation and company legal reserve/customer-rights arrangements are not authorized or established by that decision. The remaining operating/legal proposals below retain their stated scope.

# ORIO Inc. reserve operating policy — proposed resolution

Status: numeric risk parameters approved for implementation; remaining legal/operating terms proposed for founder resolution. Company-operated protected signing is already selected; this document does not ask to change that choice. It creates no bank or custody account, customer agreement, asset transfer or financial activation. External review is advisory.

## Operating model

ORIO Inc., Delaware, operates the reserve controls. Count only finalized, reconciled master stablecoins assigned to customer backing inside the verified ORIO Reserve Vault. Maintain backing sufficient for redemption liabilities at the observed reserve-asset value; do not assume that one USDC always equals one dollar. Do not lend, stake, pledge, rehypothecate or use backing to pay operating costs under this initial plan.

The current vault separates reserve units from company conversion fees through contract accounting. Both categories can occupy the same vault address; this is not a claim of separate legal ownership or insolvency protection. Keep corresponding ledger accounts separate and verify that physical custody covers both. Donations/unassigned excess must remain disclosed and excluded from automatic backing or company revenue. No customer rounding residual becomes company revenue without an approved rule.

Gas Treasury capital is separate company operating capital, never customer backing. Initial ETH funding and later replenishment require verified recipients, bounded amounts, records and owner-performed actual funding. No funding recipient is provided until its production deployment and custody controls are verified.

The initial production master candidate is Circle-issued native USDC on Base, chain 8453, address 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913. This is a candidate asset identifier, not a deployed ORIO reserve address or payment instruction. Base Sepolia uses valueless test USDC at 0x036CbD53842c5426634e7929541eC2318f3dCF7e. They must never be confused.

## Approved explicit risk parameters

| Parameter | Proposed value |
| --- | --- |
| Purchase issuance price band | $0.995 through $1.005 per USDC, inclusive |
| Maximum disagreement between two approved price sources | 20,000 parts per million (2%), measured against the lower price |
| Valuation used for backing checks | Lower of the two acceptable observed prices |
| Maximum age of the provider observation and each price observation | 300 seconds |
| Maximum age of the finalized checkpoint itself | 3,600 seconds; never substitute an unsafe/latest checkpoint |
| Maximum signed valuation lifetime | 120 seconds, shortened to the earliest evidence expiry |
| Backing deficiency or physical custody shortfall | Refuse the valuation and contain affected monetary execution |
| Price outside issuance band | Block new issuance; no invented dollar peg or hidden loss |
| Missing/unavailable evidence | Reject; never interpret missing data as zero |

A read-only Base Sepolia diagnostic observed a finalized-checkpoint lag of 1,471 seconds. Observation acquisition time and finalized block time are distinct; the proposal therefore keeps fresh reads/prices within 300 seconds while bounding finalized checkpoint age separately. Quote expiry is shortened by either limit. This does not treat finalized state as current unfinalized state.

These values are inputs in local qualification only, not activated production defaults. A less permissive time window can be used operationally. Changing the above economic/risk limits requires a new accountable policy revision. The one-percent conversion fee, ordinary 20/80 allocation and the approved genesis/full-redemption exceptions remain unchanged.

## Signing and recovery

Keep the five production-purpose keys disabled with cryptographic use denied until separately approved purpose-bound workloads are qualified. A worker may select only a previously authorized immutable intent ID. Recompute typed data from approved evidence; check the committed ledger and cash balances before a one-shot claim, then check again before recording completion. Unknown KMS outcomes consume the claim and require reconciliation. Retain intent, claim, completion and revocation records without mutation.

Database revocation prevents future worker claims and completion but cannot invalidate a signature that has already been delivered. On-chain authority/configuration rotation and bounded quote expiry are required to contain previously issued signatures. Recovery must address loss of the AWS account, operator access, database availability and signing-key compromise; a single root administrator is not an independent recovery arrangement.

## Actual arrangement evidence still required

The company must approve customer redemption rights, reserve legal ownership and insolvency treatment, record authorized treasury operators and recovery contacts, and provide its eligible-service policy. Do not fabricate these company records. USDC availability is not blanket ORIO eligibility. Production requires the actual controller/vault/currency deployment identities, immutable runtime hashes and applicable proxy implementation/upgrade controls, accepted live price/RPC/paymaster sources, issuer pause/blacklist risk checks, monitoring/reconciliation and owner-accountable release evidence.

No reserve has been funded or financial service activated by approving internal policy parameters. Account opening, contract acceptance and actual funding must be completed through the applicable owner-controlled financial interface.

Sources checked November 17, 2026: [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Base network documentation](https://docs.base.org/get-started/connect-to-base), [Base finality derivation](https://docs.base.org/base-chain/specs/protocol/consensus/derivation). Public Base RPC is best-effort diagnostic access, not the production provider arrangement.
