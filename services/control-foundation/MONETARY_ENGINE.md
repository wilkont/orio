# Approved monetary engine boundary

Policy ID: orio-final-monetary-2026-11-13-v1. Implementation: src/monetary-engine.ts. Public metadata: GET /v1/protocol/policy. Conversation approval is recorded in config/approved-monetary-policy.json. Economics are approved; financial execution is not enabled.

## Interfaces

- initialMonetaryState creates only original empty genesis at USD1, with current approved master identity and precision. It cannot initialize supply, rounding obligations or a different opening price.
- planPurchaseEpoch values native master receipts using the supplied approved valuation, charges native fee ceiling, allocates zero-holder/ordinary shares, appreciates before each mint and returns integer minted units plus exact residual records. Purchase IDs must be immutable platform-assigned inclusion ordinals; they are not customer priority choices. Only the actual first zero-supply transition uses the exception.
- planRedemptionEpoch uses one opening price for the whole immutable request set, excludes every redeemed unit from appreciation, handles any positive remaining supply without withholding and retains the reference when supply reaches zero.
- reconcileZeroSupply requires a state-bound checkpoint, matching reserve and zero unresolved redemption/company-fee assertions before the next cycle can open at the retained reference. Caller assertions are not proof by themselves.

All monetary amounts are canonical integer strings. Reference price is USD36 per whole ORIO with denominator one. Residuals are reduced fractions in USD36 units. Persisted results fit uint256; unsafe results throw before a plan is returned. No binary floating point is used for money; JavaScript numbers appear only for validated decimals/counts and UTC timestamps.

## Invariants

With a fixed validated master valuation, reserve value equals token redemption liabilities plus segregated residuals plus any pre-existing excess. Purchase reserve increases by gross deposit minus company fee; redemption reserve decreases by exact payout plus company fee. Company plus holder allocation equals every collected native fee unit. Appreciation mints no tokens. Fractional mint/payout and holder-price quantization amounts remain explicitly backed residual obligations, not revenue.

The reserve must cover both token liabilities and residual obligations. Master identity/election and valuation validity must match. Issuance requires the valuation policy's explicit permission; a USDC peg is never presumed. This boolean/evidence reference is trusted-adapter input, not an authenticated risk decision. Actual risk/price sources must be qualified and bound by the settlement controller.

## Transaction safety still required

The module is a pure deterministic planner, not an executed Monetary Controller. Caller-supplied states can be previewed repeatedly without consuming requests. Production must persist a versioned immutable snapshot, freeze epoch membership and platform inclusion order, verify user limits, bind actual converted master receipts, authenticate valuation/depeg rules, fence competing plans, consume requests once and atomically coordinate final mint/burn/payout evidence with the control ledger.

No public monetary write API or native signing is added. Approval does not permit an unsigned client to set price, supply or risk flags. On-chain vault/controller implementation must reproduce these rounding rules and preserve segregated obligations; the new qualification controller/vault reproduce the calculations and are covered by actual VM and PostgreSQL tests. See MONETARY_SETTLEMENT_INTEGRATION.md for implemented execution and remaining production/lifecycle work.

## Verification

The dedicated tests cover the approved fee exceptions, exact allocation, common redemption pricing, pre-mint appreciation, tiny residual supply, quantization/dust, impaired reserves, depeg inputs, retained-price reopening and input immutability. They include 300 seeded size checks, 1,000 chained transitions, 200 closed self-owned splitting/rounding cycles and 216 vectors compared with a Python Fraction oracle. The threat model for closed cycles uses constant valuation, immutable inclusion order and no external market/MEV effects; success is not a claim that all economic attacks are eliminated.

Commands: npm run typecheck; node --test test/monetary-engine.test.ts; npm run test:local; npm run simulate:monetary. Python must be installed for the differential suite. The generated scenarios remain simulationOnly=true even though their economics are approved.
