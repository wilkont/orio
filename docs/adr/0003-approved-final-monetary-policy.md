# ADR 0003: approved final monetary policy

Date: November 13, 2026. Status: accepted. Explicit owner confirmation: "Approve economics; external review stays advisory".

Policy ID orio-final-monetary-2026-11-13-v1 replaces the prior unresolved proposals. Original genesis reference is $1. Zero-holder purchases allocate the entire collected conversion fee to company, without genesis escrow. Positive eligible supply uses the ordinary floored company entitlement and complete collected-fee remainder for holders. Full-supply redemption allocates the full fee to company. No concentration threshold or residual-supply escrow changes allocation. Reopening retains the last valid reference after zero-supply reconciliation.

The precision implementation uses ORIO atomic18, native USDC atomic6, USD36 integer reference prices and exact rational residual accounting. Native conversion fees round up; company shares round down; minted tokens and payouts round down. Price quantization residuals are recorded explicitly alongside mint/payout residuals and remain excluded from automatic company revenue. Unsafe precision pauses/rejects a batch before finality. This avoids denominator growth without losing accounted value or changing native holder allocation.

The record at services/control-foundation/config/approved-monetary-policy.json records conversation authorization, not a fabricated cryptographic signature. It does not approve a live deployment, establish custody or waive actual readiness evidence. ADR 0002's owner-accountable release policy remains active; external review stays advisory. Separate-language verification is engineering evidence, not an outside reviewer requirement.

The implemented engine produces exact deterministic plans and reconciled zero-supply transitions. It does not execute token contracts, persist monetary epochs, consume customer requests or post monetary financial journals. Those integrations must use the same approved rules and actual validated custody/execution evidence before live activation.
