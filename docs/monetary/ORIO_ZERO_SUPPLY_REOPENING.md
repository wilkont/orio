# Approved zero-supply reopening

Full-supply redemption uses the batch opening reference price, collects the mandatory fee entirely for the company and leaves outstanding ORIO supply zero. It retains the last valid price and enters ZERO_SUPPLY_PENDING. It does not reset to $1 and does not automatically accept a new purchase.

Before reopening, record a zero-supply checkpoint bound to the exact state; reconcile every redemption obligation; confirm reserve and fee accounts; retain and cover segregated rounding obligations. Outstanding redemptions and unsettled company fees must be zero under the reconciled checkpoint. Impairment, legal restrictions or unresolved liabilities require recovery/governance instead of automatic reopening.

reconcileZeroSupply requires the expected state digest, checkpoint evidence reference, exact remaining reserve and zero outstanding-obligation assertions. It advances the cycle and enters ZERO_SUPPLY_RECONCILED while preserving the price. The next purchase uses that retained price and the 100% company zero-holder fee exception. Example: after final redemption at $1.25, a 125 USDC purchase valued at $125 pays 1.25 USDC company fee and mints 99 ORIO at $1.25, before separate gas.

The evidence object is a trusted-adapter input, not proof or a signature by itself. Actual custody, fee payment and obligation finality must be verified before the controller consumes it. Economic approval does not create that evidence. External review stays advisory.
