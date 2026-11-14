# Approved residual-supply policy and analysis

For common opening price P, opening supply S, total redemption Q and remaining T=S-Q: compute each redemption's 1% fee with approved native-unit quantization. If T>0, the company receives its floored ordinary entitlement and every remaining collected fee unit goes to eligible remaining supply. New reference price is P plus that holder value divided by T, with USD36 price quantization recorded separately under the rounding specification.

There is no discretionary concentration threshold, residual-supply escrow, company redirection or withholding. If precision/accounting limits make a settlement unsafe, reject or pause the batch before finality. Zero supply instead follows the full-redemption exception.

| Example at $1 snapshot | Result |
| --- | --- |
| 500 of 1,000 ORIO redeemed | $4 holder appreciation; remaining reference $1.008 |
| All 1,000 ORIO redeemed | $10 company fee; retain $1 reference pending reconciliation |
| 999,999 of 1,000,000 ORIO redeemed | $7,999.992 holder appreciation; one remaining ORIO reference $8,000.992 |

The extreme concentration is an approved consequence of the allocation rule, not evidence that strategic dust incentives disappear. Tests cover tiny positive remaining supply, request permutations, native rounding, conservation and closed self-owned purchase/redemption cycles. In the tested constant-valuation model, company fees are nonnegative and even assigning all residual custody to the actor cannot create positive net reserve wealth through a closed cycle.

That result does not prove safety against changing market prices, liquidity conditions, collusion across users, execution ordering, quote manipulation, MEV or implementation defects. Production needs immutable platform-assigned inclusion ordinals, frozen epoch membership, authentic snapshots, user-bound minimum outputs and actual reserve/contract execution. Customer IDs must not control purchase priority. The current engine consumes supplied immutable request sets; it is not a deployed epoch coordinator.
