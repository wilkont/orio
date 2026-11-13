# Final monetary resolution received — confirmation pending

Received November 13, 2026 as the founder's response to the outstanding policy question. The supplied resolution explicitly describes itself as proposed and requires explicit founder confirmation before implementation. It is recorded here without activating it or overwriting the earlier design history.

## Proposed authoritative rules after confirmation

- Original genesis reference: $1 USD per ORIO. Value USDC using approved reserve valuation; restrict issuance during material depeg rather than presuming dollar parity.
- At zero outstanding supply, allocate the entire collected purchase conversion fee to the company. Create no genesis appreciation escrow. The $1,000 example yields $10 company fee and 990 ORIO backed by $990, with separate gas.
- With positive eligible supply, retain the 1% fee, company allocation rounded down from its ordinary 20% entitlement, and remaining collected fee allocated to holders. Appreciate existing holdings before purchase minting; redeemed tokens do not receive their own batch appreciation.
- ORIO precision: 18 decimals. USDC precision: 6 decimals. Integer fixed-point intermediates have at least 27 decimals where appropriate. Mint and payout round down; conversion fee rounds up to its applicable settlement unit. Record residuals explicitly in segregated rounding accounts; they are not automatically company revenue.
- Reject purchases producing zero ORIO units and redemptions producing zero net payout. Respect authorized gas limits; no dust confiscation or arbitrary minimum holdings.
- All redemptions in an eligible batch use the common opening price. For positive remaining supply, preserve its complete ordinary holder allocation, however small the supply. Do not introduce a concentration withholding threshold or residual-supply escrow. If precision makes a batch unsafe, reject/pause it before finality.
- At full-supply redemption, allocate the entire fee to the company, burn the redeemed supply, record zero supply and reconcile obligations.
- Reopening retains the last valid redemption reference price. Original genesis alone uses $1. Reopen only after zero-supply reconciliation and reserve/fee checks; impairment, restrictions or unresolved liabilities require recovery/governance.
- All user-authorized on-chain actions have separate user-paid network gas, operationally fronted by the company Gas Treasury. No user ETH requirement. Ordinary ORIO transfers have zero protocol fee. Refund unused gas; require renewed consent for excess charges. ORIO-denominated gas payments do not trigger redemption appreciation.
- Secondary stablecoins must settle into the active master before minting. Master replacement does not mint/burn ORIO, charge conversion fees, alter token balances or hide losses.

## Confirmation and integration

An explicit founder approval question is pending. The resolution's Section 10 calls for independent verification and financial/security review, while the previous explicit owner instruction made external review advisory. Confirmation must specify whether that language reinstates the external-review gate. Until resolved, owner-accountable-v2 remains the active release policy and this monetary resolution remains proposed.

After confirmation, version the monetary policy and update controller, fixed-point accounting, appreciation/conversion logic, common-snapshot settlement, zero-supply checkpoints, contract/vault interfaces and public metadata together. Preserve previous proposals and simulation results as historical artifacts, clearly superseded. Do not silently retain the old genesis escrow, concentration withholding proposal or reset-to-$1 reopening assumption.

The resolution specifies economic behavior, but approved valuation/depeg parameters and deterministic epoch inclusion details still need concrete implementation/configuration. It provides no custody evidence, deployment credentials or permission to fabricate release acceptance. Real-money activation remains separate from policy approval and engineering tests.
