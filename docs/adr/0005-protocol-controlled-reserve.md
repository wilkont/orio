# ADR 0005: protocol-controlled reserve, separate company fee entitlement

Date: November 20, 2026. Status: founder-confirmed custody/control intent; no new deployment or financial activation.

The founder clarified that the USDC reserve is controlled by a "smart zero address wallet," with ORIO Inc. receiving only its allocated fees in the company's wallet. Record the intended engineering model as protocol-controlled reserve custody without a company spending key. Do not infer a company right to use backing for operating expenses.

## Meaning of the reserve address

The master directive, part 1 section 5.3, requires a dedicated autonomous smart-contract vault and explicitly states: "Do not use the conventional blockchain zero address as a reserve wallet." Read the founder's wording consistently with that requirement: a real, nonzero contract address executes the fixed protocol rules without a private-key owner or discretionary company withdrawal authority. The literal all-zero address is not a programmable reserve wallet and must not be used as a reserve recipient or as a substitute for the deployed vault.

This records technical custody and authority. The phrase "no one owns" is not used as an established legal classification, insolvency protection, trust arrangement or waiver of customers' rights. Describe the actual protocol access, reserve accounting and retained external dependencies in customer disclosures. Do not repeatedly ask the founder to restate this technical custody decision as though it remained unanswered.

## Enforced financial boundary

- Master-stablecoin backing supports valid protocol redemptions and permitted protocol reserve operations. It is not company working capital.
- ORIO Inc.'s fee wallet receives only recognized company conversion-fee units. Preserve the confirmed zero-holder and complete-redemption exceptions as well as ordinary company-floor-20%/holder-remainder allocation.
- Company fee cash, customer backing, funded outstanding payout claims and rounding obligations remain separately accounted. Co-location of fee and backing units in a contract does not permit spending backing as fees.
- The Gas Treasury remains separate. Authorized user gas reimbursements and company-funded operational ETH are not conversion-fee revenue or backing, and unused gas estimates remain refundable under the approved rules.
- No company officer, recovery contact or gas signer receives reserve spending permission merely through appointment. Company-key recovery does not imply an administrative sweep of the reserve.

## Current implementation and limits

The separate `ORIOAutonomousController` candidate creates a real `ORIOReserveVault` contract. The vault accepts only calls from its immutable controller, and that candidate exposes no owner, upgrade, discretionary pause, reserve sweep or reserve-migration forwarding method. Its public company-fee delivery function sends only accrued company-fee units to an immutable company recipient; the existing tests reject excess delivery and verify backing preservation. Public customer-authorized admission, deterministic settlement and funded claims provide the withdrawal path.

Existing deployments retain their prior governance/operator/valuation controls. The autonomous candidate is not deployed. Its fixed-master design still lacks the broader required autonomous master-migration integration. Feed providers, stablecoin issuers, network availability, backing sufficiency and relay/gas service availability remain relevant dependencies; this decision does not justify an unconditional withdrawal guarantee. Production company fee recipients must be verified before funding instructions. No production recipient or legal title is invented by this ADR.
