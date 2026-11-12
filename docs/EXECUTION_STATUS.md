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
