# Next AWS hosted application deployment

Target account: 720232346199, us-east-1. The original private ledger database completed its owner-approved atomic 003-019 upgrade on November 17, 2026. Existing history and rollback-only accounting probes passed, the resulting catalog matched the qualified RDS rehearsal, and temporary maintenance resources were removed after recovery coverage acceptance. See [the actual upgrade report](ORIGINAL_SQL_UPGRADE_REPORT_2026-11-17.md) and its sanitized receipt. Historical 001/002 installation versions were not invented or rewritten.

## First hosted workload

The next deployment needs a dedicated application identity, private database connectivity and a pinned workload artifact. It must read only public protocol metadata and remain financially disabled. Never supply the original administrator secret to an application. The existing metadata reader checks the authenticated session, reachable privileges and each actual registry read; its restricted Linux/TLS container qualification and local tests are recorded separately.

Prepare a concrete, reviewable workload/IAM/network change and limited database grant, with source/target checks, bounded resource use, credential-safe failure behavior, rollback/cleanup and actual hosted qualification. Creating a permanent database login, AWS role, public endpoint or recurring workload is outside the completed SQL-only approval. Do not activate those changes until separately authorized. The existing orio-operator permissions do not imply authority for a new workload identity.

Existing informational website hosting in legacy account 710096437887 is separate. Preserve the published Dot design and mail/DNS settings. Website publication does not authorize financial database access or financial activation.

## Financial production qualification

Base Sepolia contract deployment and protected-key qualification have their own receipts; they are not mainnet or customer financial authorization. Actual production signing/custody authority, reserve arrangements, live provider/paymaster admission, consent/recovery, operational reconciliation and accountable financial release evidence remain unfinished. Qualification signing was last recorded disabled/paused; this SQL maintenance did not enable signing or move funds.

The owner selected ORIO Inc., Delaware, US-origin/global market intent and company-operated protected signing. Actual ORIO eligibility is distinct from USDC availability. Do not ask these preference questions again or fabricate legal/reserve readiness. External review remains advisory, not a waiting requirement.
