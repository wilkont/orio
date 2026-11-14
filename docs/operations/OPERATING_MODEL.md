# ORIO operating setup

## Owner-confirmed direction - November 14, 2026

The owner identifies the operating company as **ORIO Inc., registered in Delaware, United States**. Formation records and operating permissions have not been independently examined in this increment. The owner selected **company-operated protected signing** and a **US-based launch with intended global availability wherever USDC is available**. The country-scope and custody-model preference questions are resolved; do not ask them again.

This is the approved operating direction, not an assertion that custody, production signers, service eligibility or reserves already exist. The owner states that no reserve custodian or treasury signing arrangement currently exists. Production signing and financial execution remain unconfigured/disabled. External review remains advisory.

## Global scope and eligibility

Implement the desired global reach without equating USDC technical availability with ORIO participant eligibility. The engineering policy is the intersection of current supported asset/service availability, ORIO's applicable operating scope, participant identity/sanctions controls and the specific service requested. Unknown, stale or conflicting eligibility evidence must not silently open financial access. Do not invent a static worldwide approved-country list from the owner's market intent.

Circle's USDC terms distinguish holding USDC from Circle Mint customer access and direct redemption, impose supported-jurisdiction and restricted-person conditions, and provide separate treatment for EEA holders. These are underlying-asset terms, not an ORIO operating authorization. Source reviewed November 14, 2026: https://www.circle.com/legal/usdc-terms .

## Company-operated protected signing

Reserve backing, company conversion-fee revenue and user-funded Gas Treasury assets remain segregated. The protected-signing coordinator loads a committed gas reservation, derives the existing typed permit, commits immutable preparation and the exact permit digest, then invokes a configured typed-signing backend. Changed nonce/payload permits cannot reuse the same prepared reservation. A wrong signer or backend error produces no returned consent; the reservation remains prepared because a signature may already exist.

The implemented path is qualification-only on Base Sepolia. It creates no production key, accepts no private key, exposes no HTTP signing endpoint and cannot broadcast. Synthetic fixture wallets validate the backend interface; they are not protected production devices or services. Selecting company operation does not authorize using test keys in production.

Prepare exact governance/timelock, settlement, valuation, gas-reservation and treasury-signing authority with actual operator identities, bounded permissions, recovery/revocation, transaction limits, audit and incident response. A protected hardware/service backend and its production credentials still need concrete provisioning and qualification. The gas signing authority must not gain reserve-withdrawal authority. The company-operated choice does not itself settle the actual reserve custody and funding arrangements.

## Remaining release boundaries

Hosted upgrades, customer authentication/consent/recovery, event-specific monetary history adapters, actual provider admission/full Base cost attribution, production contracts, funded reserve/gas arrangements and accountable release acceptance remain work. No external-review waiting period is imposed. Actual missing setup cannot be relabeled as approved or inferred from USDC support.
