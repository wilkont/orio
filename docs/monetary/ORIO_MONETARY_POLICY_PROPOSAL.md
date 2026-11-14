# Approved ORIO monetary policy

Status: founder-approved for implementation on November 13, 2026. Explicit confirmation: "Approve economics; external review stays advisory". Policy ID: orio-final-monetary-2026-11-13-v1. The filename is retained for existing links; this is no longer an unapproved proposal. Earlier drafts remain in Git history.

| Rule | Approved behavior |
| --- | --- |
| Original genesis reference | $1.00 USD per ORIO; not a permanent peg |
| Purchase/redemption fee | 1%, rounded up to the applicable settlement unit |
| Positive eligible supply | Company entitlement rounded down from 20% of the collected fee; holders receive the remainder |
| Zero-holder purchase | Entire collected fee to company; no genesis appreciation escrow |
| Full-supply redemption batch | Entire collected fee to company; no holder appreciation |
| Purchase ordering | Appreciate existing supply before minting each purchase |
| Redemption batch | Common opening price; every redeemed token excluded from its own appreciation |
| Positive residual supply | Full ordinary holder allocation regardless of concentration; no threshold withholding or residual escrow |
| Precision | ORIO 18 decimals, initial USDC 6; USD36 integer price with exact rational residual accounting |
| Mint/payout | Round down; reject zero output; do not confiscate dust |
| Reopening | Retain last valid reference price after zero-supply reconciliation; never automatically reset to $1 |
| Network gas | User-paid, company ETH intermediary, separate from monetary fees/backing/appreciation |

USDC must be valued under the approved reserve valuation controls. Material depeg restricts issuance rather than assuming dollar parity. Secondary assets settle into the active master before minting. Master replacement does not change supply, holder balances or reference price, invent appreciation, levy conversion fees or conceal losses.

The approved precision implementation uses a 36-decimal integer USD reference price. Fractional appreciation below that price unit is explicitly retained as a segregated holder-price rounding liability, never company revenue. All collected native holder units remain allocated; an unrepresentable positive increment or unsafe bound rejects the batch before finality. See ORIO_ROUNDING_SPECIFICATION.md.

Approval is recorded in services/control-foundation/config/approved-monetary-policy.json. It is not a signature or authorization for live financial release. The current monetary engine computes exact plans; durable epoch/request consumption, actual contracts/vault execution, custody/risk adapters, accounting integration and deployment qualification must still be completed. External review is advisory under ADR 0002.
