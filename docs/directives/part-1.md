# ORIO-SPC 3.0 — MASTER ENGINEERING, SECURITY, COMPLIANCE & PRODUCTION DIRECTIVE

**TO:** Codex — Autonomous Principal Engineering and Deployment Agent  
**FROM:** ORIO.IO Lab  
**PROJECT:** ORIO Stable Progressive Currency  
**PRIORITY:** Critical  
**EXECUTION MODE:** End-to-end autonomous engineering with mandatory financial-security and regulatory release gates  
**PRIMARY CLOUD:** Google Cloud Platform  
**GCP ACCOUNT:** Wilfried.k@ColomboAI.com  
**DOMAIN:** ORIO.IO  
**BLOCKCHAIN CANDIDATE:** Base  
**DELIVERABLE:** A complete, audited-ready, production-deployed ORIO ecosystem.

---

# 1. EXECUTIVE MANDATE

You are assigned to build ORIO Stable Progressive Currency into a complete, secure, autonomous, scalable, and accessible digital monetary platform.

ORIO must not be delivered as merely a token, smart contract, wallet, or decentralized application.

It must be delivered as an integrated monetary and financial infrastructure system capable of supporting consumers, merchants, businesses, developers, and authorized institutional partners.

The complete platform must include:

1. ORIO monetary protocol and mathematical engine.
2. ORIO token smart contracts.
3. Autonomous minting and burning.
4. Progressive appreciation mechanism.
5. Mandatory conversion fee distribution.
6. Autonomous multi-stablecoin reserve vault.
7. Dynamic reserve-asset registry and migration.
8. Deterministic fair settlement.
9. Residual-supply manipulation protection.
10. Dual-ledger accounting and reconciliation.
11. Autonomous recovery and integrity protocol.
12. Identity, authentication, and wallet abstraction.
13. Consumer wallet and payment application.
14. Business and merchant interfaces.
15. ORIO website.
16. Mobile applications or installable progressive web application.
17. Developer APIs and SDKs.
18. Compliance and financial risk infrastructure.
19. Administrative and security operations console.
20. Monitoring, auditing, reporting, and incident response.
21. GCP infrastructure and production deployment.
22. Documentation, testing, formal verification, and launch qualification.

Build all components as real operational software.

Do not represent simulations, mock data, testnet deployments, or unaudited contracts as live financial production.

The goal is to reach the maximum technically achievable production readiness immediately, while preventing live-money issuance or public redemption until mandatory legal, custody, security, and financial controls are approved.

---

# 2. FIRST ACTION — DISCOVER AND RECOVER THE LEGACY ORIO PROJECT

Before creating new infrastructure, inspect the existing ORIO project.

Access will be provided to:

- The existing ORIO GitHub repository.
- The legacy AWS environment.
- The ORIO.IO domain in Namecheap.
- Existing source code, infrastructure, databases, and configurations.
- Existing smart contracts, if any.
- Historical ORIO monetary documentation.

## 2.1 Repository discovery

Inspect the existing GitHub repository and identify:

- Source code and application architecture.
- Smart contracts.
- Wallet implementations.
- Monetary formulas.
- Existing APIs.
- Database schemas.
- Authentication systems.
- Previous deployment pipelines.
- Tests and security controls.
- Existing website design.
- Legacy dependencies.

Produce an inventory identifying what can be reused, refactored, replaced, or retired.

Preserve the original project history.

Do not overwrite or delete historical monetary code before recording its behavior and comparing it against the confirmed ORIO-SPC rules.

## 2.2 AWS discovery

Inspect the legacy AWS environment in read-only mode initially.

Identify:

- Compute resources.
- Databases.
- Object storage.
- Secrets.
- IAM roles.
- Load balancers.
- DNS dependencies.
- Network configurations.
- Logs.
- Backup systems.
- Existing deployments.

Document the infrastructure before migration.

Do not delete or terminate legacy AWS resources without explicit authorization.

## 2.3 Namecheap discovery

Inspect ORIO.IO domain configuration.

Identify:

- DNS records.
- Registrar settings.
- DNSSEC configuration.
- Existing SSL certificates.
- Email records.
- Website hosting.
- Subdomains.
- Verification records.

Preserve existing email, DNS, and domain services.

Plan a controlled migration to GCP with rollback capability.

## 2.4 Discovery deliverables

Produce:

- `LEGACY_SYSTEM_INVENTORY.md`
- `ARCHITECTURE_GAP_ANALYSIS.md`
- `REUSABLE_COMPONENTS.md`
- `SECURITY_RISK_REGISTER.md`
- `GCP_MIGRATION_PLAN.md`
- `PROTOCOL_COMPATIBILITY_REPORT.md`

Proceed with implementation after discovery, without waiting for routine engineering approvals.

Escalate only for missing credentials, destructive operations, financial commitments, or required legal and security authorizations.

---

# 3. NON-NEGOTIABLE ORIO MONETARY RULES

Implement the original ORIO Stable Progressive Currency economic mechanism exactly.

## 3.1 Supply management

When an eligible stablecoin is converted into ORIO:

- Validate the deposited asset.
- Establish its eligible USD value.
- Calculate the mandatory conversion fee.
- Allocate appreciation to eligible existing holders.
- Calculate newly issuable ORIO.
- Mint the correct token quantity.
- Update the monetary supply and reserve ledgers.

When ORIO is redeemed:

- Validate and lock the redeemed tokens.
- Establish the redemption price.
- Calculate the conversion fee.
- Secure the redemption obligation.
- Burn the redeemed ORIO.
- Allocate appreciation to eligible remaining holders.
- Reconcile reserves and supply.

No discretionary company minting or burning is permitted.

## 3.2 Mandatory conversion fees

Charge a mandatory 1% fee on:

- Approved stablecoin → ORIO.
- ORIO → approved stablecoin.

Ordinary allocation:

- 20% to ORIO Company.
- 80% to eligible holders through increased dollar-denominated redemption value.

## 3.3 Holder appreciation

Existing holders receive no additional ORIO tokens.

Their existing holdings increase in dollar-denominated redemption value according to the protocol formula.

For purchases, apply appreciation before minting.

For redemptions, exclude redeemed tokens from appreciation.

## 3.4 Complete redemption

If the entire outstanding ORIO supply is redeemed:

- Burn the entire redeemed supply.
- Allocate 100% of the conversion fee to ORIO Company.
- Allocate nothing to nonexistent remaining holders.
- Enter the defined zero-supply state.

## 3.5 Transfers

ORIO-to-ORIO transfers must have zero ORIO protocol fees.

Underlying blockchain network costs may apply.

Where economically viable, implement gas sponsorship so ordinary users can transfer ORIO without manually purchasing gas tokens.

## 3.6 Immutable economic invariants

No valid transaction may:

- Create unbacked ORIO.
- Generate unsupported appreciation.
- Double count reserves.
- Pay a redemption twice.
- Mint without eligible reserve deposits.
- Redirect holder allocations without authorized protocol rules.
- Violate the established supply accounting.
- Give newly minted tokens appreciation from their own purchase.
- Give redeemed tokens appreciation from their own redemption.

---

# 4. BUILD THE ORIO MATHEMATICAL ENGINE

Implement a deterministic monetary calculation library.

Use exact integer or fixed-point arithmetic.

Never use binary floating-point arithmetic for monetary settlement.

Define:

- S = outstanding ORIO supply.
- P = current dollar redemption price.
- R = eligible reserve backing.
- D = eligible dollar value deposited.
- Q = ORIO quantity redeemed.
- f = 0.01.
- c = 0.20.
- h = 0.80.

For ordinary purchases with existing supply:

Fee = D × f

Company allocation = Fee × c

Holder allocation = Fee × h

New price = P + Holder allocation / S

Minted ORIO = (D − Fee) / New price

Updated supply = S + Minted ORIO

For ordinary redemptions:

Gross value = Q × P

Fee = Gross value × f

Net payout = Gross value − Fee

Remaining supply = S − Q

When remaining supply is positive:

New price = P + (Fee × h) / Remaining supply

When remaining supply is zero, allocate the entire fee to company revenue.

## 4.1 Special monetary cases

Implement and formally test:

- Zero-supply first issuance.
- Zero-supply reopening.
- Simultaneous conversions.
- Near-complete redemptions.
- Complete redemptions.
- Rounding residuals.
- Reserve depegging.
- Reserve freezes.
- Failed stablecoin transfers.
- Pending settlement obligations.
- Fee allocation escrow.
- Blockchain reorganizations.
- Conversion retries.

Do not invent arbitrary economic rules for unresolved cases.

Document the proposed solution, test alternatives, and flag any change to the confirmed 1% and 20/80 monetary commitments for explicit approval.

## 4.2 Solvency invariant

At all times, eligible reserve assets must support outstanding redemption obligations.

Implement continuous checks of:

Eligible reserve value ≥ outstanding token redemption liabilities + separately recognized unsettled obligations.

Ensure no liability is counted twice.

If a reserve deficiency is detected, prevent unsafe minting and activate the documented protective response.

## 4.3 Independent calculation engine

Implement the same monetary specification in two independent forms:

1. Production smart-contract logic.
2. Independent reference implementation for verification.

Use differential testing to compare results.

The implementations must not share the same unverified arithmetic assumptions.

---

# 5. SMART CONTRACT ARCHITECTURE

Build modular, security-focused smart contracts.

Required modules:

- ORIOToken.
- ORIOMonetaryController.
- ORIOConversionRouter.
- ORIOAppreciationEngine.
- ORIOReserveVault.
- ORIOAssetRegistry.
- ORIOFairSettlement.
- ORIORecoveryController.
- ORIOGovernance.
- ORIOEmergencyGuardian.
- ORIOFeeAccounting.
- ORIOProofRegistry.

Use established, audited libraries where appropriate.

## 5.1 Token contract

Support:

- Standard token transfers.
- Accurate balances and supply.
- Authorized protocol minting.
- Authorized protocol burning.
- Event emissions.
- Wallet compatibility.
- Smart-account compatibility.

## 5.2 Monetary controller

The controller must enforce all monetary formulas and settlement invariants.

It must not expose unrestricted minting, burning, or price-setting functions.

## 5.3 Reserve vault

Deploy a dedicated autonomous smart-contract vault.

Do not use the conventional blockchain zero address as a reserve wallet.

The vault must:

- Hold approved stablecoin assets.
- Restrict withdrawals to valid protocol operations.
- Separate company revenue from customer backing.
- Maintain reserve accounting.
- Support asset migration.
- Support emergency containment.
- Expose verifiable reserve information.

## 5.4 Upgrade governance

Use tightly controlled upgrade procedures.

Require:

- Independent authorization.
- Timelocks for ordinary upgrades.
- Public disclosure.
- Security review.
- Compatibility testing.
- Emergency limitations.
- Rollback or recovery plans where technically feasible.

No single company key may unilaterally rewrite monetary economics.

---

# 6. BLOCKCHAIN DEPLOYMENT — BASE

Evaluate Base as the initial blockchain.

Build the system using Ethereum-compatible tooling.

Evaluate:

- Network security.
- Transaction finality.
- Gas economics.
- Stablecoin availability.
- Smart-account support.
- RPC reliability.
- Sequencer dependencies.
- Bridge risks.
- Operational monitoring.

## 6.1 Development environments

Establish:

- Local deterministic chain.
- Automated contract test environment.
- Base Sepolia testnet.
- Mainnet deployment pipeline.

Mainnet contracts may be prepared and audited, but public monetary activation must remain gated until all release requirements are satisfied.

## 6.2 Blockchain verification

Publish verified contract source code and contract addresses when deployed.

Maintain deployment manifests and reproducible build artifacts.

---

# 7. AUTONOMOUS MULTI-STABLECOIN RESERVE MANAGEMENT

Build ORIO-ARAG: Autonomous Reserve Asset Governance Protocol.

The protocol must support adding, restricting, suspending, replacing, migrating, and removing reserve stablecoins.

## 7.1 Asset registry

Each asset must include:

- Blockchain identifier.
- Contract address.
- Issuer.
- Decimals.
- Risk classification.
- Approved status.
- Maximum exposure.
- Valuation source.
- Liquidity requirements.
- Legal eligibility.
- Migration procedures.

Supported lifecycle states:

CANDIDATE → APPROVED → ACTIVE → RESTRICTED → EXIT_ONLY → REMOVED

Also support QUARANTINED and DEPOSIT_PAUSED emergency states.

## 7.2 Initial candidate assets

Evaluate:

- USDC.
- USDT.
- USD1.
- Other legally eligible, liquid dollar-denominated stablecoins.

Do not automatically approve any asset based solely on market capitalization or brand.

## 7.3 Risk monitoring

Continuously monitor:

- Stablecoin depegging.
- Issuer restrictions.
- Redemption availability.
- Smart-contract exploits.
- Liquidity deterioration.
- Reserve concentration.
- Sanctions and regulatory restrictions.
- Blockchain incidents.

## 7.4 Autonomous migration

When an asset becomes unsafe:

1. Verify the risk event.
2. Suspend new deposits when appropriate.
3. Determine lawful migration options.
4. Validate replacement assets.
5. Execute authorized migration.
6. Reconcile reserves.
7. Update asset status.
8. Publish an audit record.

Internal reserve migration must not trigger the ordinary 1% user conversion fee or artificial holder appreciation.

## 7.5 Asset impairment

If a stablecoin loses value, calculate its actual eligible reserve value conservatively.

Do not treat impaired assets as automatically worth $1.

Never conceal a reserve deficiency by changing accounting classifications.

---

# 8. DETERMINISTIC FAIR SETTLEMENT

Build ORIO-DFSP.

Its purpose is to prevent conversion ordering from creating unfair advantages.

Implement:

- Deterministic settlement epochs.
- Price snapshots.
- Batch redemption pricing.
- Purchase appreciation before minting.
- Redemption appreciation after excluding redeemed tokens.
- Protected transaction submission.
- Deterministic inclusion rules.
- Public settlement receipts.
- Replayable settlement calculations.

Use a configurable short settlement epoch for eligible on-chain transactions.

Do not promise that off-chain financial settlement occurs at blockchain speed.

## 8.1 Residual supply protection

Build and test protection against disproportionate appreciation capture through tiny residual holdings.

The final policy must preserve legitimate holder rights and the confirmed full-supply redemption rule.

If a proposed safeguard changes who receives the ordinary 80% allocation, require explicit economic and governance approval.

Do not silently redirect allocations to ORIO Company.

## 8.2 Adversarial testing

Test:

- Front-running.
- Back-running.
- Transaction splitting.
- Sybil wallets.
- Conversion loops.
- Dust holdings.
- Rounding attacks.
- Validator ordering.
- Simultaneous full redemptions.
- High-volume transaction bursts.

---

# 9. ORIO DUAL-LEDGER ARCHITECTURE

Build two continuously reconciled records.

**Ledger A — ORIO Control Ledger**

The internal, high-integrity financial accounting system.

**Ledger B — Base Blockchain**

The public execution and token ownership layer.

## 9.1 Control Ledger

Implement using a transactional database with append-only accounting.

Recommended foundation:

- PostgreSQL or AlloyDB.
- Immutable journal.
- Double-entry accounting.
- Transaction identifiers.
- Versioned monetary state.
- Cryptographic event hashes.
- Point-in-time recovery.
- Independent backups.

## 9.2 Blockchain Ledger

Maintain:

- Token balances.
- Supply changes.
- Smart-contract events.
- Settlement commitments.
- Reserve movements.
- Governance events.

## 9.3 Reconciliation

Continuously reconcile:

- Outstanding supply.
- Minted quantities.
- Burned quantities.
- Reserve assets.
- Fee allocations.
- Pending settlements.
- Customer entitlements.
- Finalized blockchain transactions.

## 9.4 Authority rules

The internal ledger is authoritative for internal accounting and legally established application entitlements.

The blockchain remains authoritative for finalized on-chain token state.

Discrepancies must trigger investigation and controlled recovery.

Never silently overwrite legitimate blockchain ownership through a database update.

## 9.5 Failure handling

Implement:

- Idempotent settlement.
- Outbox/inbox transaction patterns.
- Durable event processing.
- Reconciliation checkpoints.
- Replayable journals.
- Compensating entries.
- Dead-letter queues.
- Incident escalation.

No conversion may be marked final until its required settlement conditions are satisfied.

---

# 10. AUTONOMOUS RECOVERY & INTEGRITY PROTOCOL

Build ORIO-ARIP.

The objective is to detect malicious activity, preserve legitimate transactions, reconstruct valid monetary states, and coordinate authorized recovery.

## 10.1 Detection

Monitor:

- Unauthorized minting.
- Unauthorized burning.
- Reserve vault anomalies.
- Smart-contract exploits.
- Suspicious transfers.
- Ledger divergence.
- Compromised administrative credentials.
- Abnormal settlement patterns.

## 10.2 Recovery checkpoints

Maintain cryptographically verifiable checkpoints containing:

- Supply.
- Redemption price.
- Reserve liabilities.
- Settlement state.
- Accounting state hash.
- Blockchain reference.
- Protocol version.

## 10.3 Recovery workflow

1. Detect.
2. Contain.
3. Preserve evidence.
4. Identify the last valid checkpoint.
5. Reconstruct legitimate activity.
6. Isolate suspected malicious activity.
7. Produce a recovery proposal.
8. Obtain independent authorization.
9. Execute permitted recovery operations.
10. Reconcile and publish evidence.

## 10.4 Blockchain limitation

Do not claim ORIO can independently fork Base and erase finalized Base transactions.

Implement recovery through authorized ORIO-layer contracts and accounting mechanisms.

## 10.5 Recovery governance

No unilateral company recovery authority.

Use independent approval, narrowly defined powers, public audit trails, and appropriate dispute procedures.

Protect innocent third parties.

---

# 11. ORIO IDENTITY AND ACCOUNT ABSTRACTION

ORIO must be usable by people who have never interacted with cryptocurrency.

Users should not need to understand:

-