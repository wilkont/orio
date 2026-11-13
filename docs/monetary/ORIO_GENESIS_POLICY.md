# Genesis policy — proposed, not approved

Before issuance, supply and redemption liabilities are zero. The candidate opening redemption reference is $1.00 per ORIO. This reference is not a permanent peg and does not establish that USDC equals one dollar. Independent reserve valuation must determine actual USD proceeds; a depeg must affect valuation and eligibility controls.

For a purchase valued at $1,000, the exact proposed allocation is $990 ordinary backing, $2 company conversion revenue and $8 restricted genesis escrow, producing 990 ORIO at the opening reference. Gas is an additional authorized payment outside those amounts. The first buyer receives no appreciation from its own conversion fee. No token mint distributes appreciation.

`simulateGenesis` uses exact rationals and labels every result simulationOnly=true, approved=false. It demonstrates fractional mint flooring and reports its entire remaining USD fraction. It neither elects USDC nor posts backing, fee or escrow journals.

Before implementation may mint: approve opening price, escrow ownership/disposition, backing valuation, rounding and minimums; bind the election, vault, price evidence, authorization and release to one atomic settlement. An unapproved or incomplete genesis policy blocks issuance. Treasury ETH must be funded independently.
