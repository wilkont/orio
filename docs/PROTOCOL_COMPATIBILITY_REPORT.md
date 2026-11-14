# Protocol compatibility — initial findings

The inspected legacy monetary implementation cannot be reused unchanged. `utilities/priceFormula.js` applies `0.2 * Tf` to appreciation, whereas SPC 3.0 requires 80% of the ordinary conversion fee. It uses summed MongoDB balances, binary floating point, and ten-digit string rounding. `models/Balance.js` stores balances and holds as Number. The BCH conversion utility contains a 0.15% multiplier; operational reachability is not yet verified.

The rational reference implements only the confirmed ordinary formulas and complete redemption. First issuance and reopening fail explicitly until approved policy exists. Full redemption returns no next price, preventing an accidental reopening assumption. Fixed-point rounding, residual supply, bootstrap allocation, and mixed epoch ordering require specification decisions. No migration balance or conversion compatibility is certified.
