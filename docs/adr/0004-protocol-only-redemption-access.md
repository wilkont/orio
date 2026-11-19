# ADR 0004: customer-initiated redemption under protocol rules

Date: November 18, 2026. Status: founder-confirmed access intent; implementation gap identified, not activated.

The founder states that customers can take their money through a self-serving system governed by its protocol rules, with no person controlling access. Record this as a requirement for customer-initiated, rule-governed redemption without discretionary company approval. It does not supply a reserve-ownership or insolvency arrangement, approve new monetary economics, or establish that the current deployment already satisfies the requirement.

Preserve the confirmed conversion fee, user-paid separate gas, deterministic common snapshot settlement, redemption exclusion, full-redemption and reopening rules, exact rounding and backing checks. A statement about access does not authorize bypassing those rules, minting unsupported liabilities or removing customer authorization. It also cannot guarantee execution while the underlying network or payout asset cannot execute.

## Verified current gap

ORIOMonetaryController.sealRedemptionEpoch and redeemBatch are onlyOperator. Governance can change the operator/valuer and executionEnabled through configure. _valuation requires a configured valuation signature, and _operational requires executionEnabled. The vault accepts disbursement only from the controller. Company-operated signing, relay and gas infrastructure therefore remain availability/control dependencies. Customer-authorized token locking and permissionless expiry/unlocking do not themselves provide a reserve payout without the operator.

The existing contracts must not be advertised as uncontrolled, fully permissionless or unconditionally redeemable. Automation of an operator is not removal of that operator's power to withhold execution. Existing production financial operations remain disabled; no deployed permission or monetary contract is changed by this ADR.

## Required implementation direction

Provide a customer-authorized canonical redemption admission path and rule-defined settlement progress that do not depend on a company-selected batch membership or manual approval. Preserve complete epoch inclusion and common snapshot pricing, including large epochs, failed payouts, expired authorizations and tiny residual supply. A failed request must not give one participant an arbitrary veto over unrelated valid requests. Preserve auditable outstanding claims and safe lock release.

Address valuation availability and correctness, governance/disable powers, relay/gas availability and recovery as explicit parts of the access model. Specify automatic rule-based failure containment and resumption, and identify any retained human control truthfully. Do not manufacture availability by accepting stale prices, assuming a dollar peg, sweeping backing, skipping gas authorization or paying a privileged party's requests first.

Do not simply remove onlyOperator from the existing functions: an unrestricted caller could choose epoch membership and timing. First define and test canonical inclusion, bounded progress, consistent multi-chunk pricing, replay protection, failed-payout isolation, valuation withholding, governance changes and censorship by the primary operator/relayer. Concrete epoch/progress parameters and any alternative economic behavior remain subject to their applicable approval scope.

External review remains advisory under ADR 0002. The owner remains accountable for release acceptance based on the actual implemented behavior and evidence; this access requirement is not a declaration of legal status, reserve title, funded custody or launch readiness.
