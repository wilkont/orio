# Residual supply analysis — candidate protections

For an epoch with backing B, supply S and total burned R, use one independently verified snapshot price B/S. Gross redemption value is G=B*R/S. Fee F=G/100. If R<S, company receives F/5 and the surviving supply receives 4F/5. Remaining backing is B-G+4F/5. Redeemed units receive none of this epoch's appreciation. If R=S, all F goes to company and no holder allocation remains.

These calculations use exact rationals in `simulateRedemptionEpoch`. Inputs are sorted by unique request ID; reversing arrival order does not change results. This is a candidate batch model, not a production epoch scheduler. Membership, cutoffs, snapshot finality, cancellation, request eligibility, competing purchases and operational fallback must be approved and implemented before deterministic fair settlement can execute.

| Snapshot | Burned | Remaining | Result |
| --- | --- | --- | --- |
| 1,000 ORIO, $1,000 backing | 500 ORIO | 500 ORIO | $4 appreciation; post-price $1.008 |
| 1,000 ORIO, $1,000 backing | 1,000 ORIO | zero | $10 company fee; reopening blocked |
| 1,000,000 ORIO, $1,000,000 backing | 999,999 ORIO | 1 ORIO | $7,999.992 appreciation; post-price $8,000.992 |

The candidate concentration alert is strictly remaining/S < 1%; exactly 1% does not trigger. Zero supply follows full redemption, not dust concentration. The simulator only flags concentration and withholds zero appreciation.

Alternatives for approval:

- Keep the confirmed allocation unchanged; disclose concentration and monitor economic manipulation. Preserves allocation but leaves strategic dust incentives.
- Delay the affected epoch for governed review. Avoids arbitrary reallocation but imposes an explicit, disclosed exit delay; request rights and timeout need approval.
- Place the affected holder entitlement in a restricted, legally defined escrow. Requires explicit beneficiary, entitlement, timing, loss and distribution rules; cannot silently turn the 80% allocation into company income.
- Adopt a governed floor/concentration formula only through a separately approved economic revision and independent analysis. This changes economics and is not an engineering default.

Recommendation pending approval: alert and block automatic execution for the affected epoch, preserve all redemption claims and the full holder allocation, and require an approved deterministic disposition. No production threshold or confiscation rule is activated. Further simulations must examine split identities, microbalances, MEV, epoch boundary attacks, purchase/redemption interleaving and aggregate versus sequential settlement.
