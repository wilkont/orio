# Live chain provider checks

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
