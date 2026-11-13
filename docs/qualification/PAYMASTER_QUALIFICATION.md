# Paymaster candidate and production qualification

November 13, 2026. Status: local qualification candidate, not production-qualified. No public testnet/mainnet deployment, paid provider, treasury funding or external transaction was performed. Proposed economics remain unapproved. The candidate account, factory and paymaster constructors accept only chain IDs 84532 and 31337 and reject Base mainnet 8453.

## What now runs

The pinned ERC-4337 reference EntryPoint 0.8.0 executes actual signed UserOperations in an isolated EthereumJS VM. ORIOGasAccount is non-upgradeable, owned by an immutable fixture user key, supports ERC-1271 consent, restricts execution to its EntryPoint and refuses user ETH prefunding. It requires the approved paymaster in every UserOperation. The CREATE2 factory can create the account inside the funded operation.

ORIOTreasuryPaymaster uses company ETH deposited at EntryPoint. It starts paused, is owned by the governance timelock and advances its configuration revision on every signer/pause change. Each EIP-712 gas permit requires both the sending account's consent and the reservation operator's attestation. It binds EntryPoint, chain/paymaster domain, sender, nonce, init code, call data, account/fee limits, paymaster header, journal-derived reservation ID, quote digest, payment denomination, maximum payment/network limits and validity window. EntryPoint's required prefund may not exceed the signed network cap. A consumed reservation cannot be replayed, and old revision permits cannot survive pause/resume.

Post-operation handling emits only an observation of cost so far. It neither collects tokens nor finalizes a bill. Final EntryPoint UserOperationEvent includes post-operation cost and must be distinguished from that earlier observation. Failed business calls still expend ETH; local ledger policy routes their customer charge to review.

The SDK builds signing material without accessing production keys. It requires the quote owner to equal the canonical sending smart-account address; opaque customer IDs need an authenticated identity adapter before quote creation. It checks exact call digest, aggregate account/paymaster/bundle gas coverage, fee caps, committed journal hashes and uint sizes. Tests verify that its digest equals the deployed candidate contract's digest.

## Durable signing and execution sequence

1. Authenticate the customer, wallet ownership, complete quote and maximum consent. Establish independently verified prepaid gas funds and separate company ETH funding.
2. Commit the gas reservation and obtain its journal sequence/request/event hashes.
3. Construct the quote/operation-specific reservation ID and unsigned permit material.
4. Commit `prepare` with `eip155:<chain>:reservation:<id>` BEFORE requesting a treasury signature. This prevents cancellation after a signer might issue an executable permit. A crash here requires reconciliation, not release of funds.
5. Obtain independent user and operator gas consent, then the account's signature on the full EntryPoint UserOperation hash. Production signing must use qualified external signing systems.
6. Commit `bindExecution` with the final `eip155:<chain>:userop:<hash>` and signed-payload digest before broadcast. Migration 009 makes this binding append-only. One shared execution-reference claim registry covers both legacy direct preparations and new final bindings, preventing the same execution being charged through two paths. It backfills prior preparations while holding the source table lock. A different signed reference cannot replace an uncertain attempt automatically.
7. Broadcast/query the same operation. Independently authenticate finality and complete fee attribution. Record the final expense and reconcile the authorized charge and unused credit.

The bridge test follows this entire local sequence using real PostgreSQL and the reference EntryPoint. It confirms customer gas funds, company ETH, zero wallet ETH, exact deposit/ledger matching and one refund. Its fee evidence is an offline VM observation, not authenticated Base finality. VM tests have no L1 data-publication cost, exchange market or actual customer custody.

## Evidence inventory and release status

Run `npm run qualification:report` in contracts. It compiles the current sources and writes PAYMASTER_CANDIDATE_MANIFEST.json with source/dependency-lock digests, compiler/artifact digests, runtime-template sizes and a prospective release identity. Artifact templates contain immutable placeholders; they are not deployed runtime-code hashes. Addresses and deployed-runtime hashes remain null.

The report evaluates the existing independent release-signature checker using current empty approval/trust registries. All five independent gates remain missing. The overall result is BLOCKED and financialExecutionEnabled=false. Creating an inventory is not approval and never grants execution. Source changes require regeneration; no source digest authorizes a deployment.

## Required production acceptance

| Area | Evidence required before production |
| --- | --- |
| Economics | Explicit approved genesis, escrow ownership/disposition, rounding/minimums, concentration/epoch rules, failure charges, FX shortfalls and reopening; simulation cannot approve these |
| Security | Independent audit of exact production account/paymaster/controller/signing code; adversarial and recovery qualification; closure of findings |
| Network/EntryPoint | Exact Base-supported EntryPoint address/version/runtime, bundler ERC-7562 validation trace, staking/deposit requirements, simulation and fee-oracle qualification |
| Cost attribution | Actual Base execution/L1/additional costs, attributable UserOperation overhead and surplus/shortfall treatment without charging the entire bundle per user or double-counting L1 |
| Identity and keys | Verified user-account mapping, consumer signing/passkeys and recovery, isolated treasury signer/HSM or qualified equivalent, rotation/revocation and compromise drills |
| Collection and refunds | Authenticated prepaid funding, non-prepaid collection if offered, authorized denomination conversion, credits/refunds and failed/uncertain execution recovery |
| Treasury operations | Segregated custody, reserve exclusions, bounded replenishment, spend/abuse controls, low-balance alerts, RPC/bundler failover and incident coverage |
| Hosted deployment | Approved IAM/workloads/networking/secrets/ingress, reviewed change set, actual constructor/roles/code, rollback, logs and backup restoration |
| Dual ledger | Independent finalized receipts/custody, immutable checkpoints, discrepancy queue, journal/outbox delivery and reconciliation of unbooked over-cap expenses |
| Independent release | Legal, security, custody, financial and operations evidence signed for the exact release/deployment/contract set by qualified distinct principals |

A separately reviewed mainnet-compatible candidate is required after these controls are approved. This testnet-only implementation must not be patched or redeployed as an implied live-money authorization. No statement here claims bundler validation-rule compliance, a live sponsor service, customer recovery or an independent audit.

## Reproduction

Use Node 24 or later. Run npm ci in both contracts and services/control-foundation. In contracts run npm run build, npm test, npm run qualification:report and npm audit. In the control service run npm run typecheck and npm run test:local; the latter now also invokes contracts/integration/gas-ledger.test.mjs against its disposable PostgreSQL container. Tests use only published synthetic fixture keys; never fund or reuse them on a public network.

Latest checks: 15 contract/SDK tests and 135 integrated backend/PostgreSQL/VM tests pass, with zero skips/failures. The two suites overlap in exercised components and are not 150 independent end-to-end scenarios. Contract npm audit reports zero known advisories. Internal source review is not independent security qualification.

Primary references: [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337), [reference implementation](https://github.com/eth-infinitism/account-abstraction), [Base fees](https://docs.base.org/specifications/transactions/network-fees). The exact implementation used by tests is the locked npm package 0.8.0, not the moving upstream develop branch.
