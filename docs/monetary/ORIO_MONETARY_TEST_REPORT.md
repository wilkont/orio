# Monetary test report — local candidate model

Date: November 13, 2026. No monetary-policy proposal is activated by these tests.

`test/monetary-simulation.test.ts` checks the $1 genesis example and restricted 80% escrow; fractional floor mint and explicit residual; full-redemption 100% company fee and blocked automatic reopening; common-snapshot batch order independence and redeemed-token exclusion; near-zero supply concentration without withholding; strict candidate 1% threshold and oversupply refusal. All calculations use bigint rational arithmetic.

Reproduce from services/control-foundation: `node --test test/monetary-simulation.test.ts`. Six component tests passed. `npm run simulate:monetary` writes exact scenario results to docs/monetary/ORIO_MONETARY_SIMULATION_RESULTS.json. Results are simulationOnly=true and approved=false.

This does not verify live genesis, ledger escrow posting, payout-unit redemption rounding, real settlement epochs, approved reopening, smart-contract monetary execution or end-to-end reserve/supply conservation. The simulator is a reference experiment, not a separately implemented oracle. Remaining technical qualification includes contract/controller differential checks, depeg and custody failures, adversarial residual/epoch scenarios, property-based conservation and approved dust parameters. External economic/security review is advisory under ADR 0002; accountable acceptance and actual technical readiness remain required.
