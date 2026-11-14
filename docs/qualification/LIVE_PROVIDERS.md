# Live chain provider checks

## Latest account-owned evidence — November 14, 2026

The owner completed signup and confirmed in-memory credential transfer and Alchemy Base Sepolia access. Free/Core Free plans were selected without cards or paid upgrades. Actual Alchemy and Infura credentials returned the same canonical finalized Base Sepolia block58794597; Pimlico's account-owned endpoint advertised expected EntryPoint v0.8. Credential-free evidence is OWNED_PROVIDER_DIAGNOSTIC_2026-11-14.json, observed at 2026-11-14T18:44:58.170Z. Keys were not saved to files or environment configuration. This supersedes historical pending-account statements below.

The one-time local session is not durable workload provisioning or a guarantee of availability. Historical receipt/failure drills, network/method restrictions, EntryPoint bytecode verification, actual custom-contract admission, deployed workload secret configuration and production acceptance remain outstanding. Financial execution stays disabled. No signing, sponsorship, broadcast, mainnet operation or AWS deployment occurred.

## Historical public diagnostics and setup preparation

The owner has authorized continuing provider integration. No paid subscription, third-party wallet, API key, funded signer or transaction was created. Provider discovery through Stripe Directory was attempted using its current CLI/plugin; the service rejected the request as an invalid user agent. Official Base documentation was used for the public diagnostic instead.

The read-only check in `services/control-foundation/scripts/check-base-public.mjs` reached Base's documented public Sepolia endpoint, checked chain ID 84532, read a finalized block and checked its canonical identity by height. The exact timestamp/block evidence is in BASE_PUBLIC_RPC_DIAGNOSTIC.json. This is a single-source live diagnostic with financialExecutionEnabled=false and productionQualified=false. Base explicitly describes public endpoints as free, rate limited, best effort and unsuitable for production apps: https://docs.base.org/get-started/connect-to-base . No signed transaction or token movement occurred.

Production source configuration is deliberately absent. Set these in the trusted workload secret/environment configuration, never commit them or paste keys into chat:

- ORIO_RPC_PRIMARY_URL and ORIO_RPC_SECONDARY_URL: HTTPS endpoints on distinct origins.
- ORIO_RPC_PRIMARY_OPERATOR_ID and ORIO_RPC_SECONDARY_OPERATOR_ID: distinct verified provider/operator identifiers.
- Optional ORIO_RPC_PRIMARY_HEADERS and ORIO_RPC_SECONDARY_HEADERS: JSON string-to-string header maps from secret storage.
- ORIO_CHAIN_ID: expected network; the checker defaults to qualification chain 84532.

`npm run check:providers` performs bounded HTTPS reads against both sources. It checks chain identity, finalized freshness, canonical self-consistency, height skew and agreement on a common finalized block. Credentials, endpoint paths/query tokens, headers and provider exception bodies never appear in the CLI report. Missing configuration returns BLOCKED. A passing report is READ_ONLY_PROBE_PASSED and never authorizes financial execution.

Distinct origins and labels do not prove operational independence. The deployment owner must verify the actual independent organizations/infrastructure, contract support, historical receipt availability, monitoring, SLA and failover. These checks do not qualify a bundler, paymaster, actual gas quotation, oracle, customer custody, complete Base fee attribution or signer. Dedicated provider accounts and their approved connection configuration are still needed. Do not substitute two labels for the same public endpoint.

The source uses the existing read-only transport, retaining method restrictions, timeouts, response limits, no redirects and credential-safe errors. Unit tests cover chain mismatch, stale finality, conflicting histories and duplicate operators/origins. The probe reads only block metadata; successful connectivity is not an availability guarantee.

## New provider setup proposal — November 14, 2026

The owner requested preparation of a new provider setup for approval. The concrete proposal is infrastructure/providers/SETUP_PROPOSAL_2026-11-14.md: Alchemy Free primary RPC, Infura Core Free secondary RPC, and Pimlico Free Base Sepolia bundler qualification, with a $0 service-charge scope and no paid/card/mainnet activation. Credentials remain empty in the adjacent qualification.env.example. Account creation is pending owner approval; no provider account, subscription, AWS secret or transaction was created. Provider selection does not complete custom-paymaster/bundler qualification.

## Approved signup and bundler probe continuation

The owner subsequently approved the exact free/testnet scope. All three Chrome signup forms were prepared with the approved work email; password, terms submission and verification are handed to the owner. No provider account or key creation has been verified. This is an authentication handoff, not a renewed request to approve the same scope. See infrastructure/providers/ACCOUNT_SETUP_STATUS.md.

The separate HttpsBundlerReader now permits only eth_chainId and eth_supportedEntryPoints. It shares the bounded HTTPS transport without widening the settlement reader's original three-method allowlist. Neither reader can sign, sponsor, estimate or submit a transaction. The bundler qualification check pins expected chain and EntryPoint before waiting on network responses, rejects malformed/duplicate support lists and reports capabilities only.

Run npm run check:bundler with trusted ORIO_BUNDLER_URL, optional ORIO_BUNDLER_HEADERS and an explicitly pinned ORIO_ENTRYPOINT_ADDRESS. Defaults use chain 84532; no expected address is inferred from a provider response. CLI failures omit endpoints, headers and raw provider exceptions. A live two-read diagnostic against Pimlico's documented public Base Sepolia endpoint advertised the expected v0.8 address. Exact evidence is in PIMLICO_PUBLIC_BUNDLER_DIAGNOSTIC.json; no account key was used and no transaction was sent. Source: https://docs.pimlico.io/references/bundler/public-endpoint . Public endpoint support is not authenticated-account availability, deployed-code verification, ERC-7562 admission or production qualification.
