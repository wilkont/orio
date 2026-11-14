# Approved monetary engine verification

Policy: orio-final-monetary-2026-11-13-v1. Founder confirmation: "Approve economics; external review stays advisory". Tests verify implementation and do not authorize live financial execution.

monetary-engine.test.ts covers original genesis, zero-holder and full-supply exceptions, exact native fee conservation, pre-mint appreciation, redeemed-token exclusion, shared redemption price, mint/payout dust refusal, tiny positive supply, retained-price reconciled reopening, non-pegged master valuation and risk refusal. It exercises 300 seeded purchase/redemption sizes, 1,000 chained purchase/redemption steps with exact liabilities-plus-residual conservation, and 200 closed self-owned splitting/rounding cycles.

A separate Python Fraction implementation computes 216 seeded vectors and agrees on fees, company/holder shares, all output allocations, reference price, supply, reserve and exact residuals. It is computational verification in another language, not an external reviewer. The unquantized Python reference also reflects the approved zero-holder and retained-price rules.

Reproduce from services/control-foundation: npm run typecheck, node --test test/monetary-engine.test.ts, npm run test:local and npm run simulate:monetary. The generated JSON contains approved-policy synthetic scenarios, explicitly simulationOnly=true. It uses a stated $1 synthetic master valuation; the engine itself never assumes a USDC dollar peg.

Not completed by these tests: actual monetary contracts/vault execution, durable epoch/request consumption, asset custody, authenticated valuation and depeg configuration, gas/cash settlement, chain/ledger atomic integration, live double-redemption prevention and deployed recovery. Request permutation tests assume immutable platform-assigned inclusion order. Constant-valuation closed-cycle tests are not proof against all market/MEV or multi-user economic attacks. Production activation remains disabled pending actual implementation and accountable qualification; external review is advisory.

## Executed settlement qualification — November 13

The qualification monetary controller now executes actual collection, mint, locked batch burn/payout, fee segregation, retained-price reopening and coupled vault/registry replacement in the local EVM. Finalized synthetic-source proofs feed real PostgreSQL journals. The current verification passes 173 control-service tests and 30 contract tests, including standard EIP-712 hash comparisons, transfer-then-recipient-redemption, complete-redemption reconciliation/reopening, company withdrawal observation, failed-write rollback and an actual smart-account EntryPoint purchase with separately reconciled user gas. These tests extend the arithmetic tests above; they do not constitute mainnet deployment, actual custody evidence or production authorization. See services/control-foundation/MONETARY_SETTLEMENT_INTEGRATION.md.
