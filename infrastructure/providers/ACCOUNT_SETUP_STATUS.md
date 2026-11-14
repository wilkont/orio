# Approved provider signup status

November 14, 2026. Owner approved creating Alchemy Free, Infura Core Free and Pimlico Free test-network accounts, with no card enrollment, paid upgrade or mainnet activation. This supersedes the proposal's earlier pending-approval status; no new approval of the same free account scope is needed.

All three actual signup pages were opened in the user's Chrome session. Work email `Wilfried.k@ColomboAI.com` was entered in each form, and first name Wilfried was entered where offered. Last name was left for the owner rather than guessed. No password was generated, entered or inspected. No terms checkbox, final signup or financial enrollment was submitted.

| Provider | Observed page | Current state |
|---|---|---|
| Alchemy | https://dashboard.alchemy.com/ redirects to login.alchemy.com signup | Prepared; owner password, surname, terms submission and verification pending |
| Infura | https://app.infura.io/register | Prepared; owner password, surname, terms submission and verification pending |
| Pimlico | https://dashboard.pimlico.io/sign-up | Prepared; owner password, terms submission and verification pending |

The tabs were marked for handoff and the owner was asked once to complete these authentication steps. Browser security rules require the owner to complete new-password setup; this is an authentication handoff, not a request to approve the free-provider scope again. Account creation has not been verified and must not be reported as complete. If signup requires a card or paid plan, stop that provider's flow as the owner instructed.

Independent engineering continued during handoff. A bounded, credential-safe, read-only bundler adapter now checks chain identity and the pinned EntryPoint support list. An actual public Pimlico Base Sepolia diagnostic passed for EntryPoint v0.8 using only two read methods; see docs/qualification/PIMLICO_PUBLIC_BUNDLER_DIAGNOSTIC.json. This does not create an account or qualify ORIO's custom wallet/paymaster for bundler admission. No signing, sponsorship, deployment or broadcast occurred. No provider API key or customer funds were created or moved.
