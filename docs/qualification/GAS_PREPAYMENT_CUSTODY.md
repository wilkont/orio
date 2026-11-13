# Gas prepayment funding and withdrawals

Status: implemented owner-only accounting and read-only chain verification. Not a public funding API, token sender, live custody deployment or monetary release. External review remains advisory under ADR 0002. Local migrations 010 and 011 have not been applied to AWS.

## Funding

An authorized operator registers the approved chain/token, exact decimals, separate gas treasury address and policy digest. The canonical payment asset is erc20:<chain>:<lowercase token>. The registry and funding intents are append-only. All real deployment registries remain unconfigured; tests register synthetic assets and addresses.

GasFunding.open records an authenticated customer's exact source account, asset, units and authorization reference. GasFunding.observe verifies the expected finalized ERC-20 transfer through two configured readers, then atomically posts the matching gas cash asset and customer prepayment liability. Shared receipt ownership prevents reuse for another gas deposit, ordinary conversion or redemption obligation. Journal, receipt, claim and outbox roll back together on failure. Identical concurrent retries return one journal.

Funding from the treasury to itself is rejected because an ERC-20 self-transfer increases no custody. Zero source, token or treasury addresses are rejected. A Transfer event still does not independently establish approved custody or token behavior: production must qualify non-rebasing/non-fee-on-transfer asset semantics, custody ownership and aggregate balances. Third-party attribution, arbitrary source-to-customer mappings and unverified payer claims are unsupported.

No conversion fee, company fee revenue, holder appreciation, ORIO mint or customer monetary reserve is involved. The resulting prepaid account uses the exact identifier expected by GasControls. Company ETH funding remains separate.

## Withdrawals and network costs

GasRefunds.open requires its own funded user gas quote: OTHER action, exact owner/asset/amount/refund identifier digest, correct chain and unexpired authorization. It moves only available prepaid units into a refund liability. Funds already held for gas cannot be withdrawn. The network cost remains a separate gas reservation; this is not an ORIO redemption.

Before any treasury signature, prepare the deterministic gas reservation reference. Bind the final UserOperation hash before broadcast. GasRefunds.observe verifies both the exact treasury-to-owner token payout and the bound successful EntryPoint UserOperation, using trusted deployment addresses and two chain readers. They must share the canonical finalized block and outer transaction. The transfer log must lie after the previous EntryPoint execution boundary and before this operation's completion. A payout from a different operation in the same bundle cannot satisfy the withdrawal.

The exact payout discharges the refund liability and gas-only cash asset atomically with its receipt/claim/outbox. Missing, partial, wrong-recipient, unrelated-operation or unfinalized evidence leaves the full claim pending. Fee responsibility and final gas charging still follow GasControls and the approved cost-allocation policy; this method does not infer a Base network bill from the payout alone. Calling code must authenticate customer ownership and consent; evidence/authorization digests are not signatures by themselves.

## Safe cancellation

A gas reservation attached to a withdrawal cannot cancel on its own. GasRefunds.cancelUnsubmitted returns the refund hold, user gas hold and company ETH reservation together, only before any prepared execution/signing barrier. Both compensating journals and both cancellation records commit or roll back as one transaction. Duplicate cancellation has no additional effect. Once prepared, possibly signed, settled or paid, cancellation is refused and recovery/reconciliation is required. No tiny balance is confiscated.

Historical requests, receipts, claims and cancellation records remain append-only. Unknown execution, over-cap expenses and unexpected post-cancellation transfers need a separately authorized discrepancy/recovery workflow; these routines do not silently rewrite balances.

## Verification and integration boundaries

The full suite applies migrations 001-011 in isolated databases and verifies funding retries, cross-module receipt competition, wrong parties/amounts/finality, self-transfer rejection, spendable prepaid balances, refund/gas segregation, exact payout, bounded execution association, mutation during delayed RPC, coupled cancellation and injected rollback failures. Current integrated suite: 161 passing tests, zero skips/failures, strict TypeScript passing.

Still required: authenticated customer endpoints, treasury custody and approved production asset registration; actual deposit/withdrawal dispatch and fully abstracted first-funding workflow; live RPC/provider/finality qualification; Base cost allocation, exchange and refunds; continuous custody monitoring/reconciliation and recovery operations. The tests use synthetic RPC evidence and do not claim public-network deposit or withdrawal execution. No user is instructed to obtain ETH, and no complete gas-abstraction onboarding flow is claimed here.
