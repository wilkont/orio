# Approved provider account status

## Verified onboarding update

November 14, 2026: owner completed authentication and reported all three signed in. Authenticated dashboards and subsequent non-binding onboarding were observed. Alchemy email verification was completed using the owner's AWS WorkMail. No password was entered or inspected by the agent.

| Provider | Current observed state | Remaining configuration |
|---|---|---|
| Alchemy | Free selected; vendor-created app renamed `orio-spc-3-qualification`; saved name observed | Owner confirmed Base Sepolia enabling; enabled state observed. Base mainnet remains disabled. Vendor default Ethereum endpoints remain unused. |
| Infura | Core Free selected: 3 million credits/day, 500 credits/second; initial vendor-created key exists | Name field has `orio-spc-3-qualification`, but selector still says My First Key; persisted rename is not verified. Vendor default selections include mainnets. |
| Pimlico | Free, no payment method, $0 balance/overdraft; card enrollment skipped | Owner confirmed key creation at action time. Table shows `orio-spc-3-qualification`, masked secret, Bundler/Paymaster features, 0 requests; notification says API Key generated. |

Vendor default endpoint availability is not completed testnet isolation or financial activation. Alchemy network narrowing and Infura restrictions remain. No ORIO mainnet request, sponsorship policy, paid service or financial operation was activated. Do not record private keys here or in tracked templates.

`npm run check:provider-session` now prepares a ten-minute, single-use loopback form with masked key inputs. Credentials stay in browser/process memory and never go to files, process arguments, environment variables or reports. Fixed destinations are Alchemy/Infura Base Sepolia and Pimlico chain84532. Existing bounded read-only adapters check finality and bundler capability; no signing, sponsorship or broadcast is possible. This does not protect against a compromised local account, browser extension or memory capture.

The local form requires a random session path, exact loopback Host and POST Origin, rejects cross-site submissions, caps body size, rejects duplicate fields/replay and sets no-store/CSP/same-origin referrer headers. Chromium suppresses POST Origin with no-referrer; same-origin preserves the required origin assertion while sending no external referrer. The initial rejected submission was corrected without accepting null origins or disabling origin checks. Four tests cover fixed destinations, origin/replay/body controls, failure reporting and overlapping bodies. Strict service typecheck passes. No long-lived workload secret store is provisioned.

Owner confirmed local credential transfer and Alchemy Base Sepolia access. Account-owned credentials were used in memory, and both checks passed at 2026-11-14T18:44:58.170Z. Alchemy and Infura agreed on finalized block58794597 and its canonical hash; Pimlico advertised the pinned EntryPoint v0.8. The credential-free report is docs/qualification/OWNED_PROVIDER_DIAGNOSTIC_2026-11-14.json. Runtime credential variables were cleared, the Pimlico key was hidden again, and the browser clipboard was cleared. No keys were saved. The loopback service expires after ten minutes; durable workload connections remain unconfigured.

Remaining: historical receipt/failure drills, method/network restrictions, deployed workload secret handling, runtime EntryPoint verification, custom contract admission, recovery operations and production deployment. No card, paid upgrade, AWS deployment or live-money activation occurred. The completed checks are one-time connectivity/capability evidence, not production readiness.

## Historical signup handoff (superseded by update above)

November 14, 2026. Owner approved creating Alchemy Free, Infura Core Free and Pimlico Free test-network accounts, with no card enrollment, paid upgrade or mainnet activation. This supersedes the proposal's earlier pending-approval status; no new approval of the same free account scope is needed.

All three actual signup pages were opened in the user's Chrome session. Work email `Wilfried.k@ColomboAI.com` was entered in each form, and first name Wilfried was entered where offered. Last name was left for the owner rather than guessed. No password was generated, entered or inspected. No terms checkbox, final signup or financial enrollment was submitted.

| Provider | Observed page | Current state |
|---|---|---|
| Alchemy | https://dashboard.alchemy.com/ redirects to login.alchemy.com signup | Prepared; owner password, surname, terms submission and verification pending |
| Infura | https://app.infura.io/register | Prepared; owner password, surname, terms submission and verification pending |
| Pimlico | https://dashboard.pimlico.io/sign-up | Prepared; owner password, terms submission and verification pending |

The tabs were marked for handoff and the owner was asked once to complete these authentication steps. Browser security rules require the owner to complete new-password setup; this is an authentication handoff, not a request to approve the free-provider scope again. Account creation has not been verified and must not be reported as complete. If signup requires a card or paid plan, stop that provider's flow as the owner instructed.

Independent engineering continued during handoff. A bounded, credential-safe, read-only bundler adapter now checks chain identity and the pinned EntryPoint support list. An actual public Pimlico Base Sepolia diagnostic passed for EntryPoint v0.8 using only two read methods; see docs/qualification/PIMLICO_PUBLIC_BUNDLER_DIAGNOSTIC.json. This does not create an account or qualify ORIO's custom wallet/paymaster for bundler admission. No signing, sponsorship, deployment or broadcast occurred. No provider API key or customer funds were created or moved.
