# Precision and rounding specification — approval pending

ORIO uses 18 decimal token units and native USDC uses 6. All persisted/API amounts are canonical nonnegative integer strings; positive postings exclude zero. No monetary settlement uses JavaScript floating point. USD must be independently valued, not inferred from USDC units. Candidate internal USD precision is 36 decimals; simulations retain rational numerators and denominators so no economic remainder disappears.

Proposed monetary rules:

1. Compute valuation, the 1% fee and 20/80 entitlements as exact rational values before quantization.
2. Mint floor(exact ORIO units). Never round issuance upward.
3. Pay floor(exact payout units). Never round customer payout upward into unbacked units.
4. Quantize ordinary company and holder entitlements downward separately. Neither may exceed its exact entitlement. Record the remaining rational obligation independently; do not silently award it to either party.
5. Maintain per-asset, per-cycle residual accounts and exact provenance. Do not count unallocated fractions as backing, gas income or holder appreciation. Founder/legal approval must define ownership and release.

Proposed gas rules are separate: ceiling the maximum converted cost into a refundable hold; floor the actual converted cost for the final user debit; credit the full unused integer hold. Expose the rational difference as a company gas expense, never conversion revenue or holder appreciation. A positive cost that rounds to zero user units requires review rather than a silently free transaction. The final gas quantization rule also awaits approval and is not wired to a live route.

Candidate dust controls reject zero-unit minting and zero net payouts. Economically meaningful minimum purchase/payout amounts must additionally cover operating costs and be approved by denomination and risk tier; no arbitrary production minimum is selected here. Small existing balances remain owned by their holders. Consolidation or exit options must be authorized and disclosed.

Quote and ledger bounds are 78 decimal digits; multiplication/division uses bigint intermediates and rejects final ledger overflow. Quote expiry uses canonical UTC timestamps. Quote ceilings are authorization limits, not earned income. Required qualification includes boundary units, residual conservation, denominator changes, adversarial transaction partitioning and independent cross-language contract/controller comparisons.
