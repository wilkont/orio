# ORIO SPC 3 context

Ledger A is the internal financial control ledger. It records journal entries and application entitlements. Ledger B is finalized on-chain ownership and execution. Neither a database edit nor a local test creates blockchain ownership.

A journal is an immutable, balanced set of debits and credits in explicitly named asset units. Account normal balance determines whether debits or credits increase the account. A settlement reference identifies one external economic event. Retrying the same event must not create a second journal.

An outbox event commits in the same transaction as its journal. Delivery is at least once; recipients must deduplicate. A lease token fences stale worker acknowledgements. An external checkpoint is a sequence/hash retained independently of the database administrator.

Financial activation requires release-specific, independently signed evidence for legal, security, custody, reserve/financial, and operational readiness. An engineering test is not independent qualification.

Confirmed ordinary conversions charge 1%, allocating 20% to company revenue and 80% to eligible holders. Purchases appreciate existing holdings before minting. Redemptions exclude burned tokens from appreciation. Full redemption allocates the entire fee to the company. Bootstrap, fixed-point rounding, and residual policies remain unresolved.

The November 13 revised supplemental directive confirms user-paid network gas on every purchase, redemption, ordinary ORIO transfer and other user-authorized on-chain operation. Ordinary transfers still have zero protocol fee. Company Gas Treasury fronts ETH operationally; users need no ETH. Gas charges, ETH expenditure and refunds are separate from monetary backing, conversion revenue, appreciation and token issuance. Bind all operations, complete network costs, denomination/rate, expiry and maximum charge to user authorization; credit unused charges and prevent duplicate billing. No general company gas subsidy is authorized.

The proposed $1 genesis reference, zero-holder restricted escrow, final rounding/minimums, residual-supply concentration mechanism and reopening policy remain unapproved. Simulations must not activate these policies. See docs/monetary/ORIO_MONETARY_POLICY_PROPOSAL.md and its ten companion deliverables. Live-money operations remain disabled pending monetary decisions and independent release qualification. The gas directive does not override the existing operational AWS migration choice or authorize new spending.
