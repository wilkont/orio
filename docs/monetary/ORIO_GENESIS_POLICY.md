# Approved genesis policy

The original opening reference is $1.00 USD per ORIO. Before original genesis, outstanding supply and redemption liabilities are zero. The master initially is native USDC, valued from actual approved reserve evidence rather than assumed dollar parity.

At zero supply the entire rounded 1% purchase fee belongs to the company. No genesis appreciation escrow exists. A purchase of 1,000 USDC valued at $1,000 collects 10 USDC company fee and creates 990 ORIO backed by 990 USDC. Gas is separately authorized and paid by the user.

Only the actual first purchase at zero supply receives this exception. As soon as that transition mints supply, subsequent purchases use the ordinary company-floor/holder-remainder rule and appreciate existing holdings before minting. Platform-assigned inclusion ordinals determine sequential purchase ordering; customer-chosen request IDs must not control that sequence.

The $1 reference is original-genesis initialization only. A later zero-supply cycle retains its last valid reference, completes reconciliation and uses the zero-holder fee exception at that retained price. No automatic reset or escrow disposition is needed. See ORIO_ZERO_SUPPLY_REOPENING.md.

initialMonetaryState and planPurchaseEpoch implement this arithmetic. They do not elect the master, authenticate reserves, move assets or mint on-chain tokens. All release and actual execution prerequisites remain separate.
