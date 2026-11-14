# Approved monetary precision and rounding

ORIO uses 18 decimal token units. Initial native USDC uses 6. Prices are integer USD36 atoms per whole ORIO; this exceeds the approved minimum 27 decimal intermediate precision. All amounts cross persistence/API boundaries as canonical integer strings. Intermediate multiplication and division use bigint; there is no binary floating-point money arithmetic.

Persisted fields are bounded to uint256 for eventual chain compatibility. A calculation that cannot fit safely rejects the affected batch before finality. Exact residuals use reduced nonnegative numerator/denominator pairs; reference-price denominators always equal one, preventing unbounded rational price growth during repeated conversions.

Purchase:

1. Fee = ceil(gross native master units / 100).
2. Company = fee at zero supply, otherwise floor(fee / 5). Holder allocation is every remaining collected fee unit.
3. Value holder allocation with the current approved master price. Add its per-existing-token appreciation before minting. Floor the resulting USD36 reference price and explicitly record the exact holder-price quantization difference in the segregated rounding liability.
4. Mint floor(net valued deposit * 10^18 / reference price). Record its exact mint residual in the same segregated accounting pool, with separate provenance.

Redemption:

1. Every request uses the common opening epoch price. Convert exact gross value into native master units using the actual master valuation.
2. Fee = ceil(exact gross native value / 100). Payout = floor(exact gross native value - fee).
3. Company = fee if the whole batch eliminates supply, otherwise floor(fee / 5) per conversion. Holders receive the remainder. Only the remaining supply appreciates.
4. Record both payout quantization and USD36 holder-price quantization residuals. All collected native holder units remain allocated, without concentration withholding. Reject an unrepresentable positive price increment instead of silently discarding appreciation.

Every residual is explicit, segregated, included in reserve reconciliation and excluded from automatic company revenue. Native reserve valuation must cover token redemption liabilities plus these residual obligations. Price rounding does not create unsupported liabilities or a new ORIO mint. Allocation-owner/custody execution must preserve residual provenance when connecting this plan to financial journals.

Minimums are output-based: reject purchases producing less than one ORIO atomic unit and redemptions producing zero native payout. No arbitrary minimum holding is introduced; dust remains owned. Quote and enforce separate user-authorized gas limits. A gas estimate never reduces monetary backing implicitly.

Gas quantization and failed-operation cost recovery remain separate operational controls. They cannot change the monetary fee or generate holder appreciation. The monetary arithmetic engine performs no gas debit.
