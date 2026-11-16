# Current local readiness update - November 13, 2026

## November14 live informational website deployment

ORIO.IO and www.orio.io now serve the26-page website using the original white/blue Dot preview design. A verified59-file backup and the untouched original build support rollback. All32 static files matched the pinned source on each domain:64 local-origin HTTPS checks and64 independent public HTTPS checks passed. Browser tests confirmed design and fee behavior. The deployment helper passed six guard/rollback tests, and existing API/TLS configuration was preserved. Core and website source were pushed and merged after GitHub checks passed. Details: infrastructure/aws/WEBSITE_DEPLOYMENT_2026-11-14.md.

This does not deploy the financial workload, migrate the database beyond its historical001/002 state, create custody/reserves or enable real-money operations. No IAM, DNS, database, system-upgrade or reboot change was made. External review remains advisory; actual implementation and release acceptance still remain.

## November 14 account onboarding continuation

Alchemy, Infura and Pimlico authenticated dashboards are verified. Free/Core Free onboarding completed without cards. Alchemy app is named orio-spc-3-qualification; Pimlico key creation, Alchemy Base Sepolia enabling and memory-only local credential transfer were confirmed. Both account-owned chain readers agreed on finalized block58794597 and its hash; Pimlico advertised pinned EntryPoint v0.8. See docs/qualification/OWNED_PROVIDER_DIAGNOSTIC_2026-11-14.json. No signing, sponsorship or broadcast occurred. Vendor default networks still require narrowing and deployed workload credentials are unconfigured. The local form's Chromium POST-origin issue was corrected using same-origin referrer policy; strict origin checks, null-origin rejection and no external referrer remain. Four focused security tests pass. See infrastructure/providers/ACCOUNT_SETUP_STATUS.md for exact state. Financial execution remains disabled; external review is advisory.

Latest policy: external independent review is advisory, not a blocker, under owner-approved ADR 0002. One authorized owner/key may cover all release acceptance roles. Final monetary economics are founder-approved under ADR 0003. ORIO remains incomplete and not live because execution integrations and actual readiness evidence are outstanding. The final continuation below supersedes older test counts and policy requirements while preserving their historical context.

- Initial AWS migrations 001 (ledger) and 002 (master registry) were applied under a separately approved maintenance plan. Empty/paused, privilege, TLS and rollback-only synthetic checks passed; temporary access resources were removed by 04:06:53 UTC. See infrastructure/aws/MIGRATION_RECEIPT_2026-11-12.md for exact evidence and limits. No funds or master activation occurred. This does not establish later operator RDS visibility or a hosted application.
- Local conversion-route preflight added eight regression tests, bringing the isolated suite from the historical 56 to 64 passing tests. It validates exact bindings, active election, explicit route eligibility, evidence timing and an independently supplied minimum without executing swaps.
- Local-only migration 004 closes the generic conversion-start evidence bypass, matches persisted quote digest/minimum/expiry, and rechecks time after entry/election/policy locks. Its migration-specific recorder fails closed when absent. Idempotency/concurrency/lock-wait tests brought the isolated suite to 73 passing tests.
- Local-only migration 005 and RedemptionClaims record immutable exact redemption requests and versioned claim/preparation/uncertain/final-evidence states. They do not reserve, burn, pay or post accounting. Historical finality can reconcile an already executed payout after election pause/change. Eight additional regression tests bring the current full isolated PostgreSQL suite to 81/81 passing tests; strict TypeScript also passed (2026-11-12, exit 0).

Migrations 003, 004 and 005 remain LOCAL ONLY. No new AWS migration, deployment, security change or financial execution was performed for these local increments. See services/control-foundation/CONVERSION_ROUTE.md and REDEMPTION_CLAIMS.md for trust boundaries and remaining acceptance. Authenticated adapters, shared settlement-reference deduplication, atomic accounting/burn/payout integration, dispatch-time release enforcement, website/wallet integration and independent legal/custody/reserve/security qualification remain open. Bootstrap, rounding and residual policy remain unresolved. Local tests do not establish live-money readiness.

---
# ORIO-SPC 3.0 execution status

## Latest milestone — November 3, 2026

The PostgreSQL control-ledger and signed release-policy foundation are implemented locally in `services/control-foundation`, with a separate package lock and strict TypeScript configuration. Final verification passed 30 module tests (19 real PostgreSQL integration tests and 11 release-signature tests), strict type checking, and the existing five monetary-reference tests. The installed production dependency audit reported zero known vulnerabilities at the time of this check; that is not a security audit.

The new ledger enforces exact integer-string amounts, per-asset debit/credit balance, immutable journals and account definitions, atomic journal/outbox writes, duplicate-settlement rejection, concurrent protected-balance checks, cryptographic chain verification, external checkpoint comparison, fenced delivery leases, retry delay, and dead-letter status. Release evaluation supports testnet, production-read-only, controlled-live, and public-live, requiring five distinct declared authorized principals and keys for live modes. Trust/approval files are empty by default.

Parallel code reviews found two security/correctness issues: reuse of a privileged pre-existing PostgreSQL runtime role, and acknowledgement expiry evaluated before a database lock wait. Both were corrected and regression-tested. An optional pure-verifier extraction remains deferred; complete-history verification is documented as memory-bound and requires operating-scale qualification before deployment.

These are tested internal components, not a complete platform or independent qualification. No financial operations were activated. Blockchain execution, reserve verification, external checkpoint publication, identity/authentication, broker/inbox integration, compliance providers, applications, production deployment, and independent security/legal/financial acceptance remain outstanding.

GCP project `orio-spc-3-prod` exists; its attempted billing association was rejected for an overdue billing-account balance. Bank verification is pending according to the latest user update. No payment was initiated. Authenticated GitHub, AWS, and Namecheap discovery is documented in INFRASTRUCTURE_DISCOVERY.md. The older sections below preserve the initial discovery snapshot and are superseded by these milestones where stated.

Date: November 3, 2026. Initial discovery snapshot follows. Platform is not engineering-complete, audited, deployed, or authorized for live money.

## Verified resources

The GitHub CLI is authenticated as `wilkont`. The GCP CLI lists `wilfried.k@colomboai.com`. No ORIO-named project appeared in the accessible project list. Project names alone cannot establish whether an existing project is authorized for ORIO.

Four repositories were recovered under this chat's `work` directory with Git histories:

| Repository | Inspected revision | Initial finding |
|---|---|---|
| wilkont/orio | cd7f1b6c76800769d5afde4c1a6c9d5f534a0b2e | Node/Express, MongoDB, conversion controllers, legacy wallet integrations |
| wilkont/orio-php-apis | 51c0474ca1be737590e05153b07213b53b17bb7a | PHP/Laravel API source; detailed assessment pending |
| wilkont/orio-website | 2a35a784aa4b029054e30411ad520d6edf316e29 | Laravel website; detailed assessment pending |
| wilkont/Orio-Backup | ca6bc14870262ee60a662cf4efd7c4d96eeb2115 | Orio-Apis, Orio-Wallet, Orio-Witness; checkout encountered Windows long-path errors in tracked dependencies; Git objects recovered, working tree not fully verified |

Public DNS inspection: ORIO.IO uses AWS nameservers, A record `52.14.199.108`, MX `inbound-smtp.us-east-1.amazonaws.com`. This does not verify registrar configuration, DNSSEC, ownership, or AWS account access. No DNS changes were made.

AWS CLI was not found in the initial tool check; no AWS environment variable names or `.aws` directory were returned. This does not rule out browser-based access. AWS infrastructure inventory remains pending authenticated access.

## Implemented and tested

An exact rational Python monetary reference was added on local branch `codex/orio-spc-3` in the existing `orio` repository. It implements ordinary purchases, partial redemptions, and complete redemption under the supplied 1% and 20/80 rules. It rejects floating-point inputs and undefined zero-supply issuance. It is a specification oracle, not a settlement service.

Five test methods passed, including 600 purchase/redemption conservation cases across tiny and large amounts. Tests cover appreciation before minting, exclusion of redeemed tokens, full redemption fee allocation, and invalid input rejection. No contract differential tests or end-to-end platform tests have run.

## Material findings

1. `utilities/priceFormula.js` uses `0.2 * Tf` for appreciation, inconsistent with the newly confirmed 80% holder allocation. It divides by summed database balances and uses `Number` and `toFixed`.
2. `models/Balance.js` stores balances and holds as JavaScript Number values. These are unsuitable for the required exact monetary settlement.
3. `utilities/currencies/bchCase.js` contains a `0.0015` fee multiplier. Its reachability and operational status need tracing; it conflicts with the mandated 1% if used for eligible conversions.
4. No Solidity files were found in the inspected tracked source listings. The legacy backup includes witness/wallet infrastructure; migration cannot assume it is an EVM deployment.
5. The directive does not resolve bootstrap price, allocation of fees when no holders exist at first issuance, reopening state, fixed-point quantization, residual policy, or mixed purchase/redemption epoch ordering. These require a written specification before faithful production settlement can be finalized.

## Deployment and access dependencies

- Identify the authorized GCP project, billing account, region, and spending limit before provisioning billable resources.
- Establish read-only AWS account access for infrastructure, backup, DNS, and migration discovery.
- Establish registrar access to verify Namecheap settings and migration controls.
- Obtain independent legal, custody, reserve, security, and financial release evidence before live activation.

## Remaining work

Complete legacy behavior tracing and credential-exposure assessment without executing legacy services. Finish the six discovery reports. Resolve monetary policy gaps with explicit decisions. Implement fixed-point contract logic and independent differential verification, reserve and settlement modules, append-only ledger and reconciliation, recovery governance, identity and wallet infrastructure, applications, APIs, compliance integrations, GCP infrastructure, and release controls. Run adversarial, integration, recovery, and independent qualification checks before release.

No cloud resources were provisioned, funds moved, DNS edited, external messages sent, or public monetary features activated.

## Operator verification and conversion service continuation

Verified sign-in as orio-operator in account 720232346199. Direct CloudFormation stack details in us-east-1 are readable and show CREATE_COMPLETE. The console's separate ListStacks call is denied. The RDS console reports the selected database cannot be found in the restricted session. Database deletion is not established by that message, and operator RDS API inspection remains unverified. No permission expansion was performed.

Commit 665d5d2 adds durable conversion intents, versioned evidence, canonical master receipt checks and preserved refund claims. Migration 003 is local only. A protocol metadata HTTP service now exposes process health, registry readiness and the actual persisted master election through a dedicated reader boundary. Production requires a scoped database reader, trusted certificate, workload identity, network path and hosting.

Docker's Linux engine recovered after restarting the previously failed desktop processes. Strict TypeScript checks and the complete isolated PostgreSQL/HTTP/startup suite passed 56 tests. Review found no actionable issues within the documented trusted-adapter boundary. Local tests do not qualify conversion execution, custody evidence or public financial release.

Remaining acceptance includes authenticated finalized-chain adapters, independent quotes and eligible routes, actual exchange execution, atomic accounting/mint/burn, redemption and payout integration, governance activation and recovery, persistent hosted reconciliation, consumer wallet/application integration, and independent release evidence. Bootstrap and integer quantization policies remain unresolved in CONTEXT.md.


## Verified local continuation - November 12, 2026

This section supersedes earlier test counts and deployment snapshots where stated. The initial AWS ledger/master migrations 001 and 002 were applied under the owner's specific revised approval, verified empty and DEPOSIT_PAUSED, and temporary access fully cleaned up at 04:06:53 UTC. See infrastructure/aws/MIGRATION_RECEIPT_2026-11-12.md. Do not rerun these migrations based on an older thread message.

Local continuation added conversion-route preflight (64-test milestone), atomic persisted conversion-start validation via migration 004 (73-test milestone), and durable redemption claims/evidence via migration 005. Migrations 003, 004 and 005 remain local-only, not applied to AWS. Strict TypeScript checking and the complete isolated PostgreSQL suite were independently rerun after the redemption increment: 81 tests passed, zero failures/skips, exit 0.

Conversion starts bind stored quote digest/minimum/expiry, intent version and current election under locks; generic event calls cannot bypass route evidence, and expiry is rechecked after blocking locks. Redemption records preserve immutable requested economics, versioned claims, unique finalized burn/payout references and uncertain-execution review state. Tests cover concurrency, replay/conflict, partial evidence rollback, duplicate references and expiry after lock waits. Historical settlement evidence may reconcile after a later pause; this does not authorize new payout execution.

These modules record trusted-adapter evidence; they do not authenticate external evidence themselves or execute swaps, reserve holds, mint/burn, payouts, or live financial operations. Runtime deployment, authenticated chain/exchange/custody adapters, atomic financial settlement, approved bootstrap/rounding/residual policies and independent legal/security/custody/reserve/operational release qualification remain open. No public financial activation or production-readiness claim follows from these local tests.

The original Codex thread's latest recorded message still showed its older 56-test completed turn when checked. Follow-up delivery has not been verified; repository files and this status reflect the independent local continuation, not a confirmed resumed Codex turn.

## Original Codex thread resumed - November 12, 2026

The original thread read Dot's current handoff and reconciled the shared repository. Dot's pending routing/redemption implementation was reviewed, independently verified with strict TypeScript checking and all 81 isolated tests, and committed as e29837c. This supersedes the earlier note that follow-up delivery to the original thread was unverified.

Continued local implementation adds verifyFinalizedTokenTransfer, a read-only ERC-20 event verifier using two configured chain readers. It validates chain ID, successful transaction status, finality height, canonical block identity, token contract, exact parties/amount/log index and agreement between the sources. It returns a canonical chain/transaction/log settlement reference. All 86 tests passed, with no failures or skipped tests. Source review found no actionable issues under the documented trust boundary.

Provider transport/authentication, independently operated sources, reserve custody verification, durable receipt consumption and financial integration remain open. This module is tested with synthetic RPC evidence. No production RPC providers were activated, no AWS migrations were applied in this turn, and no asset transactions or financial release occurred. Migrations 003-005 remain local-only. See FINALIZED_TRANSFER.md for the adapter boundary.

## Continued receipt and adapter integration

Added local migration 006 to prevent a finalized reference being assigned to both conversion and redemption operations. It serializes concurrent claims, permits the existing same-intent direct-master alias, backfills history under source-table locks and aborts on historical conflicts. Ledger-to-operation accounting linkage remains open.

Added a constrained HTTPS chain reader for the finalized-transfer verifier. It permits only chain ID, finalized/canonical block reads and transaction receipt queries, limits time/response size, refuses redirects and suppresses provider-specific error details. No production provider configuration is installed. Strict typechecking and all 95 isolated tests passed before documentation-only updates and header-construction error sanitization. Final verification follows the current work.

## Accounting, governance and packaging continuation — November 12, 2026

Local migration 007 now atomically links verified-recorded master receipts to reserve assets, customer escrow liabilities, journal hashes and outbox events. It records historical token units only, including after a later pause; it does not mint ORIO or recognize fees. Duplicate/concurrent requests commit one journal, and injected linkage failure rolls back all effects. Migrations 003–007 remain local-only; AWS migrations 001/002 are not rerun.

Added a separate Solidity governance package using pinned OpenZeppelin contracts: a minimum-delay timelock and master registry with one elected asset, paused migration, atomic designation replacement and abort recovery. Epoch and revision checks prevent queued actions from an earlier attempt affecting a later one. These are governance components, not a monetary token or reserve execution engine. No contracts were deployed.

Final local verification: strict TypeScript passes, 99 backend/PostgreSQL tests pass, Solidity compilation and 6 signed-transaction VM tests pass. The actual pinned metadata-service container passes TLS, hostname rejection, unprivileged execution, paused-state and restricted-reader checks. Backend production dependencies and the full contract dependency tree report zero known npm audit advisories after pinning the compiler's patched tmp dependency.

Still required: approved bootstrap/rounding/residual/epoch policy; monetary contracts and differential verification; authenticated custody/exchange execution; reconciliation and recovery integration; identity, wallet and consumer applications; hosted operational qualification; independent legal, custody, reserve, security and operational release evidence. All financial execution remains disabled. No new AWS resources, migrations, public deployment or spending were performed in this continuation.

## Revised monetary/gas directive — November 13, 2026

Incorporated the founder-confirmed user-paid gas policy for purchases, redemptions, ordinary transfers and other user-authorized on-chain actions. Ordinary transfers retain zero protocol fee. Public policy metadata now distinguishes confirmed requirements, pending proposals and disabled live collection. No earlier gas-free implementation was found in the new control/contracts modules; historical directives remain preserved.

Added exact-integer multi-operation gas quotes, L1/other component caps, denomination/rate and call bindings, maximum authorization, candidate floor reconciliation with unused credits and explicit rational remainders. Local migration 008 and GasControls atomically reserve funded user gas prepayments plus company ETH, persist one prepared execution identity, record in-cap actual network expenses and close successful settlements without monetary-reserve/fee/appreciation postings. Duplicate receipts, competing holds, expired quotes and uncertain retries are contained. All failure classes and over-cap/unbooked expenses require review. Positive actual expenses beyond reserved ETH are retained as evidence, not falsely reported as fully booked. Automatic recovery of those obligations remains open.

Added exact-rational, explicitly unapproved genesis and redemption-epoch simulations, reproducible JSON results, and all eleven requested policy/architecture/test deliverables under docs/monetary. Candidate zero-holder escrow, rounding/minimums, concentration disposition and reopening remain pending founder/legal approval. The concentration experiment flags but does not withhold the confirmed holder entitlement.

Final verification: strict TypeScript passes; all 130 integrated backend/PostgreSQL tests pass with no failures/skips; actual container TLS/restricted-reader/non-root/paused-state tests pass, including the new policy endpoint. Production backend npm audit reports zero known vulnerabilities. Two review findings were fixed and covered: partial small-operation precision must not block later operations, and verified zero expenditure needs no zero-valued expense journal. Both review axes reported no remaining actionable issues within this local scope.

No AWS resources, IAM changes, paid providers, migrations or financial transactions were executed in this continuation. AWS retains only migrations 001/002; 003–008 remain local-only. Remaining work includes authenticated signatures/fee and custody adapters, live smart-account/paymaster and relayer execution, non-prepaid collection, actual denomination conversion/refunds, replenishment/alerts/failover, deterministic epoch scheduling, monetary contracts/controller and user flows, approved economics, continuous dual-ledger reconciliation and independent release qualification. The platform is not complete or production-ready.

## Paymaster and production qualification continuation — November 13, 2026

Added qualification-only ORIOGasAccount, CREATE2 factory and ORIOTreasuryPaymaster against the exact ERC-4337 reference package 0.8.0. Actual signed UserOperations execute through its real EntryPoint in an isolated VM, including zero user/account ETH, counterfactual account creation, successful and reverted business calls and final paymaster-deposit debit. EIP-712 gas permits require independent user-account and reservation-operator consent, bind operation/quote/journal/network/payment limits, reject replay and use governance configuration revisions. All three new contracts reject Base mainnet deployment; no public network was used.

Added a signing-material SDK with canonical owner/sender matching, complete account/paymaster/bundle gas coverage checks and actual contract-domain digest agreement. Local migration 009 commits an immutable prepared permit reference before treasury signing and binds the final UserOperation hash before broadcast, preventing cancellation of a potentially executable permit. A shared execution-claim registry spans direct preparations and final bindings, with locked historical backfill and cross-path concurrent replay protection.

The integrated PostgreSQL/VM test now drives committed funding/hold → prepared reference → dual gas consent → signed UserOperation → final binding → real EntryPoint execution → final debit → balanced ledger expense/refund. VM observations are synthetic local evidence, not Base finality or L1 network-cost attribution. Over-cap/failure obligations remain subject to approved recovery policies.

Verification: strict TypeScript and all 135 integrated backend/PostgreSQL/VM tests pass. All 15 contract/SDK tests pass. No failures/skips; suites overlap and are not 150 independent production scenarios. Locked contract dependencies report zero known npm advisories. Internal review fixes include sender ownership binding and cross-table execution replay, each covered by regressions.

Generated docs/qualification/PAYMASTER_CANDIDATE_MANIFEST.json and PAYMASTER_QUALIFICATION.md. The report binds source/lockfile/compiler/artifact digests, records no deployed addresses and remains BLOCKED with financialExecutionEnabled=false. All five independent release gates are still missing. Public-network EntryPoint/bundler qualification, staking/fee/finality attribution, authenticated custody/collection/conversion/refunds, consumer signing/recovery, treasury operations, hosted deployment and approved economics remain open. Independent review/audits and legal/custody/reserve/operational evidence cannot be substituted by this local work. Migrations 003–009 remain local-only; AWS retains only 001/002. No spending, external transactions or access expansion occurred.


## Owner-accountable release and finalized fee evidence — November 13, 2026

At the owner's explicit direction, removed the mandatory external independent-review requirement. Release policy owner-accountable-v2 permits one authorized accountable principal and Ed25519 key to approve multiple/all legal, security, custody, financial and operations roles. Role authorization, actual evidence, valid signatures, exact release/deployment/contract bindings, revocation, expiry and missing-category rejection remain. Signing domain v2 rejects old-policy signatures. No real approval/key was manufactured; production trust/approval files remain empty. ADR 0002 supersedes prior mandatory-review and distinct-approver statements. Public protocol metadata and qualification reporting expose externalReviewRequired=false.

Continued implementation adds read-only final UserOperation-event verification through two configured chain readers. It checks the expected EntryPoint/account/paymaster/nonce/operation, canonical finalized receipt/log and exact final per-operation debit/gas usage. Reverted business calls in successful bundles are explicitly preserved as failed operations with paid gas. It returns an EntryPoint debit observation, not an inferred final Base network charge or customer-failure decision. The existing ERC-20 verifier shares the same finality/log helpers. The real PostgreSQL/VM bridge now verifies actual reference-contract event bytes before local expense/refund bookkeeping; its network/finality anchors remain synthetic.

Verification: strict TypeScript and all 144 integrated backend/PostgreSQL/VM tests pass; no failures/skips. The packaged container passes TLS/hostname, restricted-reader, non-root, paused-state and revised external-review metadata checks. Retry digests are stable across reordered/extra input fields, and malformed trailing-whitespace evidence is rejected. External review is optional; it is not a reason to stop development or a current release blocker.

No live-money activation, public deployment, cloud resource changes, spending or new production permissions occurred. Only initial migrations 001/002 are on AWS; 003–009 remain local-only. Remaining implementation includes actual public-network fee attribution/observation, collection/conversion/refunds, treasury automation, consumer signing/recovery/application flows, monetary contracts/controller and deterministic epochs. Founder approval of proposed economic parameters plus actual legal/custody/financial/security/operational readiness acceptance remain outstanding; this change does not fabricate that evidence or declare the full platform complete.


## Gas prepayment funding and withdrawals - November 13, 2026

Continued implementation adds migrations 010 and 011, GasFunding, GasRefunds and exact custody-accounting integration. Verified ERC-20 deposits credit only segregated gas cash/customer prepaid liabilities. One shared receipt claim spans conversion, redemption, gas funding and gas payout, preventing double-credit across obligations. Treasury self-transfers and zero-address sources cannot create unsupported prepayment.

Withdrawals require exact owner/asset/units and a dedicated funded user-paid gas action. Their prepaid hold cannot consume network-fee reserves. Finalized payout must match the exact amount and recipient inside the bound successful UserOperation; same-bundle transfers from other operations are rejected by canonical execution-log boundaries. Caller execution inputs are snapshotted to close asynchronous mutation races. Never-prepared withdrawals can cancel atomically with both user gas and company ETH holds. Separate cancellation of a linked gas reservation is refused. Once preparation may have produced a signature, recovery is required instead of automatic cancellation.

Verification: strict TypeScript and all 161 integrated backend/PostgreSQL/VM tests pass, zero skips/failures. Coverage includes concurrent funding/refunds, shared receipt races, invalid finality/parties, self-transfer rejection, gas/reserve segregation, exact payout attribution, delayed-RPC mutation, coupled cancellation and injected all-or-nothing rollback. Docs/qualification/GAS_PREPAYMENT_CUSTODY.md records boundaries and remaining integration. No broadcast, public deployment, cloud changes, new permissions or spending occurred. AWS still has only 001/002; 003-011 are local-only.

External review remains advisory. Final economic choices from the founder's earlier proposed directive remain unapproved; an asynchronous question requests those decisions while independent engineering continues. The complete platform is not live or complete. Actual custody onboarding, fully abstracted first funding, authenticated consumer routes, payout dispatch, live network fee attribution, treasury automation, monetary settlement and deployed operational acceptance remain outstanding. No fabricated approvals or production-readiness claim follows from these local tests.


## Final economics approved and monetary arithmetic implemented - November 13, 2026

The founder explicitly approved the final monetary rules with external review staying advisory. No further economics confirmation is pending. Recorded policy orio-final-monetary-2026-11-13-v1 in config/approved-monetary-policy.json and ADR 0003. Removed the old genesis-escrow and concentration-withholding experiments from active code; history remains in Git. Original genesis is $1; zero-holder and full-supply fees go entirely to company. Native fees ceil, ordinary company shares floor and holders get the complete collected remainder. Any positive remaining supply receives that allocation. Reopening preserves the last valid price after reconciliation.

Implemented monetary-engine.ts with actual-valued master units, USD36 fixed-point price, ORIO atomic18 mint flooring, native payout flooring, explicit mint/payout/holder-price residual liabilities, reserve coverage checks and precision-bound rejection before finality. Purchases appreciate eligible supply before each mint in immutable platform order; redemptions use one common opening batch price and exclude all redeemed tokens. A zero-supply checkpoint blocks reopening until reserve and outstanding-obligation assertions reconcile. These are trusted-adapter inputs, not fabricated proof.

Long-run verification found and fixed exact-rational price denominator growth: USD36 integer prices now retain every quantization difference in segregated residual liabilities rather than overflow after a few transitions. Every native holder fee unit remains allocated, no residual becomes automatic company revenue, and unrepresentable appreciation rejects the batch. Tests include 300 seeded size cases, 1000 chained purchase/redemption transitions, 200 closed self-owned conversion/splitting cycles and 216 vectors independently computed using Python Fraction. The tested threat model does not establish safety against all market/MEV or multi-user attacks.

Final checks: strict TypeScript and all 172 integrated backend/PostgreSQL/VM tests pass with zero failures/skips. Six unquantized Python reference tests also pass. The actual packaged service passes TLS/hostname, restricted-reader, unprivileged execution, paused-state and approved-policy metadata checks. Generated approved-policy scenarios remain simulationOnly=true. Approval and current semantics are reflected in public metadata and the monetary documentation; financialExecutionEnabled remains false.

The engine is an exact planning kernel, not a completed deployed Monetary Controller. Actual contract/vault execution, durable epoch/request consumption, user limits, validated custody/valuation, replay-safe ledger integration, consumer flows and operational deployment still require implementation. Economic approval does not substitute for actual legal/custody/reserve/operational readiness. External review is advisory. No production changes, real-money operations, cloud resources, IAM expansion or new spending occurred. AWS retains only migrations 001/002; 003-011 remain local-only.

## November 13 monetary execution continuation

Implemented qualification controller, actual ORIO currency, reserve vault, signed redemption locks and atomic registry/vault replacement. Actual purchase/redemption receipts replay against the approved TypeScript engine and commit double-entry journals, global receipt ownership and immutable monetary versions atomically. Ordinary ownership transfers, full-redemption zero-supply reconciliation, retained-price reopening and current-master company withdrawals are integrated. The real EntryPoint/paymaster test executes a smart-account approval/purchase with separate user gas reservation, actual debit and unused-charge credit. Tests use synthetic funding, finality anchors and local databases; they establish no public network qualification.

Verification: 173 isolated control/PG/EntryPoint tests and 30 contract VM tests pass; strict TypeScript and container TLS/non-root/restricted-reader checks pass. Migrations 003–014 are local only; AWS remains at initial 001/002, and no paid deployment, IAM expansion or live financial activation occurred. External review remains advisory. The complete platform is not finished; see services/control-foundation/MONETARY_SETTLEMENT_INTEGRATION.md for outstanding canonical indexing, intent/migration adapters, actual provider/custody/valuation integrations, UX and production acceptance.

## November 13 migration, recovery and provider continuation

Added finalized reserve migration accounting, immutable master history and historical company-fee withdrawal observations, including empty-genesis replacement, gain/covered-loss recording and omitted-old-fee detection. Added a separate guardian-quorum recoverable wallet/factory and offline signing SDK. Actual recovered-owner EntryPoint/paymaster execution, revision replay defense, mid-batch freeze and mainnet rejection are tested. Verification now covers 176 control/service tests and 39 contract tests; typecheck/container checks pass. A live read-only Base Sepolia canonical-finality diagnostic passed; the two-provider production check remains BLOCKED due to missing connection configuration. AWS SQL remains at initial001/002;003–015 are local only. No public deployment, provider subscription, signer funding, DNS or financial-activation change was performed. Recovery consumer enrollment/notifications/compromise/estate policy and user-paid recovery relayer remain incomplete; production provider, infrastructure and accountable release qualification still remain. External review is advisory.

## November 14 approved provider setup and read-only bundler continuation

Free account scope is owner-approved. Alchemy, Infura and Pimlico signup forms are open in Chrome with the approved work email; password/terms/email verification is handed off to the owner, and all three remain on signup pages. No account creation, API key, card enrollment, paid upgrade or mainnet activation is verified. Independent engineering added separate runtime method allowlists for settlement/bundler readers, shared bounded HTTPS transport, exact pinned-chain/EntryPoint capability checks and a credential-safe CLI. A live public Pimlico Base Sepolia diagnostic advertised the expected EntryPoint v0.8 using only eth_chainId and eth_supportedEntryPoints; no operation was submitted.181 service/PG/VM tests, strict TypeScript and container checks passed. The prior39 contract tests are unchanged. Financial execution and production qualification remain disabled; external review is advisory.


## November 14 finalized history discovery

Added migration 016, dual-source complete-block discovery, append-only normalized watched-receipt evidence and a transactional resumable cursor. Canonical parent/transaction membership, every receipt, contiguous global log order and post-read block identity are verified before commit. Restart, empty blocks, concurrent replay, cursor skips, injected rollback and runtime-permission isolation are tested. A bounded owner-only TLS observer command is packaged; it cannot sign, broadcast, post journals or enable finances.

Validation: strict TypeScript and 193 isolated backend/PostgreSQL/local execution tests pass with zero failures/skips. The packaged service passes TLS/hostname, non-root, paused-state and restricted-reader checks. These are local synthetic qualification results. No AWS migration, provider transaction, paid resource or new production access occurred. Hosted migrations 003-016, ordered accounting dispatch, authenticated intent linkage, actual customer recovery/signing, complete Base costs, custody/reserve arrangements and production release acceptance remain outstanding. External review remains advisory.

The public ORIO.IO website separately serves the 28-page white/blue design and version 3.0.1 whitepaper (19 pages, 7,800 words). Website PRs 5/6 merged; final release 9d32ffc086ddbe13949f89a467dc560b8d9e109b passed 82 origin and 82 public HTTPS file checks, branded 404 checks and phone width verification. The public financial state remains disabled.


## November 14 ordered history consumer continuation

Added local migration 017 and a separate ordered consumer cursor with immutable receipt acknowledgements and block completion records. The pinned trusted handler runs outside a database transaction; failed acknowledgements retry the same deterministic delivery ID. Actual synthetic ledger posting followed by an injected ACK failure produces one journal after retry. Unsupported transitions, revision drift, skipped receipt acknowledgements and missing predecessor completions prevent progress. Concurrent workers report busy rather than invoke the same consumer twice.

Strict TypeScript and 198 integrated service/PostgreSQL/local execution tests pass with no failures/skips. This is a generic trusted-handler dispatcher, not a completed production monetary event adapter. Hosted upgrades 003-017 remain unapplied. The owner clarified ORIO Inc. (Delaware, US) as operator and explicitly confirmed no reserve custodian or treasury signing arrangement exists. Launch countries remain unspecified. See docs/operations/OPERATING_MODEL.md; no custody, signer, financial account, funds or legal approval was fabricated.


## November 14 owner-selected company-operated signing

The owner resolved geographic direction: US-origin launch with intended global availability wherever USDC is available, and selected company-operated protected signing. These preference questions are no longer pending. Underlying USDC support remains separate from ORIO service/participant eligibility; no global financial eligibility approval is inferred. ORIO Inc., Delaware, is owner-stated; actual custody, operating arrangements, production keys and signer backend remain unprovisioned.

Added immutable signing preparations in local migration 018. The coordinator loads the real funded reservation/journal, derives the typed Gas Permit, commits its unique digest before invoking a configured typed-signing backend, and verifies the configured company operator signature. A changed payload cannot obtain another permit against the same reservation. Closed reservations, mainnet/deployment substitution, wrong keys and backend failures reject. Ambiguous signing preserves prepared funds instead of refunding a potentially signed operation.

The actual local PostgreSQL/reference EntryPoint purchase/gas-reconciliation test now uses this coordinator with synthetic keys. All 200 backend/PG/local execution tests, 42 contract/SDK tests, strict TypeScript and container TLS/non-root/paused/restricted-reader checks pass. No production signer, key, funds, public-network transaction, IAM permission, paid service or hosted migration was created. The SDK is a qualification integration, not a deployed protected signer. See PROTECTED_COMPANY_SIGNING.md and the approved operating intent configuration.


## November 14: protected AWS signer and bootstrap preparation

Implemented official AWS KMS client binding, strict secp256k1 public-key/DER signature verification, low-S Ethereum recovery, and trusted-pipe signing CLI. Local integration exercises the adapter with synthetic KMS responses: 200 backend/integration tests and 50 contract/SDK/template tests pass; contract dependency audit reports zero vulnerabilities. No live AWS signing occurred.

Administrator STS verified account 720232346199, the existing operator principal exists, and the proposed alias is available. AWS ValidateTemplate succeeded against pinned commit ba7b484. One disabled qualification key plus scoped key administration remains pending action-time approval and recurring key cost authorization. No key, signing grant, funded reserve, production workload or financial activation was created.


November 14 approved bootstrap completed: owner approved the disabled qualification key, scoped operator administration and recurring cost. Stack orio-spc-3-protected-signing is CREATE_COMPLETE; key 479ae4e7-483e-4d17-8f46-232f08c5c6ee is Disabled (ECC_SECG_P256K1/SIGN_VERIFY/AWS_KMS). Policy and operator public-key inspection verified; derived public signer 0xB1E1d791a518931042Fed65778a2f8E11938eae1. No Sign grant, enablement, funding or financial activation. This evidence supersedes earlier pending-bootstrap statements. See infrastructure/aws/PROTECTED_KEY_DEPLOYMENT_2026-11-14.json.


November 14 protected-key verification: owner approved restricted Lambda signing access and USD0.10 verification budget. AWS stack UPDATE_COMPLETE; private Lambda rejected a caller digest and signed the fixed non-monetary challenge using its exact-key service role. Public response independently verified against 0xB1E1d791a518931042Fed65778a2f8E11938eae1. Key subsequently Disabled and reserved concurrency zero, verified through AWS. No blockchain broadcast or monetary permit was produced. See infrastructure/aws/KEY_QUALIFICATION_RECEIPT_2026-11-14.json. Source now declares paused state; stack cleanup alignment follows.


November 14 faucet continuation: owner completed CDP sign-in. Free Base Sepolia faucet claim mined successfully in transaction 0xb0b1eaf7df9229bec19183043b81665946840d88f971f3fab52a60b0787b631f; latest qualification balance is 100000000000000 wei (0.0001 test ETH). No wallet/API key/card/paid upgrade was created. A fresh compiled unsigned zero-value timelock deployment plan now binds chain 84532, nonce zero, code and proposed 60-second single-qualification-operator governance. Strict deployment preflight includes L2/L1/operator fees. Exact private fixed-digest signing update and default verification-only submit command are prepared; signing enablement, test deployment and additional USD0.10 AWS budget remain unapproved. See infrastructure/aws/BASE_SEPOLIA_DEPLOYMENT_PROPOSAL.md. No ORIO contract or UserOperation was broadcast.


November 14 approved testnet deployment: ORIOGovernanceTimelock deployed on Base Sepolia at 0x0eBa0D1802c1fC32Ed75175243893c30E120165c, transaction 0x1b636bb1f2ba0b4ccc70ccf1f83b586fc80f53bec01bcccbdde2eeb35a18bc20. Actual protected KMS signature matched the pinned zero-value/nonce-zero transaction. Successful mined receipt, exact creation input, 60-second delay floor/minimum, qualification proposer/executor/canceller, self-admin and closed execution verified. Observed L2+L1+operator fees total 10256463809272 wei and reconcile exactly to the remaining faucet balance; nonce is now one. Finality was not yet reached at observation. See infrastructure/aws/BASE_SEPOLIA_TIMELOCK_RECEIPT_2026-11-14.json. No currency/vault/registry/paymaster/UserOperation or mainnet deployment is implied. Signing disable/pause and paused-template restoration were submitted after verification; final cleanup confirmation follows.


November 14 remaining deployment preparation: successful paced read-only EVM fork of all five remaining constructor transactions; child identities/runtime hashes recorded. Three extra free test ETH claims mined and aggregate balance reconciled. Strict TypeScript, three targeted authorization/source tests and zero-vulnerability dependency audit pass. Proposed private selector allowlist and submission/receipt verification tools remain unapplied/unapproved; no mainnet or batch transaction occurred. Hosted financial platform completion remains outstanding.


Batch reproducibility correction: CI detected Windows/Linux Solidity metadata differences. Compiler source inputs now normalize line endings and an LF-versus-CRLF regression passes. No signing/deployment occurred before the correction. Canonical batch data and the private selector allowlist were regenerated; a fixed 0.05 gwei execution cap and 0.0015 test ETH aggregate planning ceiling are proposed. Twelve additional free claims reconcile to a 1589743536190728 wei wallet balance. Old unapplied AWS previews are obsolete.

November 14/15 approved remaining Base Sepolia batch: all five zero-value deployments and three controller-created children succeeded and their exact runtime/configuration checks passed. See infrastructure/aws/BASE_SEPOLIA_BATCH_DEPLOYMENT_REPORT.md and receipt/cleanup files. Batch fee 106569217549280 wei reconciles to closing balance 1483174318641448 and nonce six. Paused restoration UPDATE_COMPLETE; actual KMS Disabled and Lambda concurrency zero; temporary selector removed. No mainnet or customer execution enabled. PR12 hosted schema audit merged with 201 local tests and remote CI green; hosted upgrade remains outstanding.

November 16 hosted schema inspection completed read-only with a privately retained checksum-verified report; all temporary access, endpoints, bucket/objects and diagnostic resources were removed. See infrastructure/aws/HOSTED_SCHEMA_AUDIT_REPORT_2026-11-16.md. Observed ledger/master catalog matches a provider-owned crypto ACL reference; no historical migration versions were fabricated. A local model exposes a missing explicit definer-owner digest dependency; additive migration 019 and a managed-extension regression now qualify the narrow owner-only grant without runtime/PUBLIC primitive access. Strict TypeScript and 205 actual local integration tests pass, including full ordered local upgrade/logical restore through 019. No hosted upgrade, original journal write, snapshot restoration or financial activation is implied. Next action requires a separately reviewed private restore/upgrade qualification plan.

## Private restore qualification completed, 2026-11-16

AWS completed the approved private encrypted snapshot restore; exact metadata and cleanup receipts are retained. All temporary resources, including the separate managed clone secret, were independently confirmed absent after deletion. The original database remains protected with six automated snapshots present. No SQL connection or hosted migration was included. Local verification now passes 207 tests plus strict typechecking. Next: qualify the SQL upgrade on an explicitly authorized disposable copy before any original database upgrade. The financial platform is not yet live; external review remains advisory. See `infrastructure/aws/PRIVATE_RESTORE_REPORT_2026-11-16.md`.
