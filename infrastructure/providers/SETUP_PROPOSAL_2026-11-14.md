# ORIO provider setup proposal

Prepared November 14, 2026. Status: prepared for owner approval, not provisioned. Scope is the first 30 days of Base Sepolia qualification, chain ID 84532. This does not authorize financial activation, mainnet subscriptions, card enrollment, AWS changes or real-fund transactions. External independent review remains advisory.

## Recommended services

| Role | Provider and initial plan | Published allowance used for planning | Initial service charge |
|---|---|---|---|
| Primary canonical-chain reads | Alchemy Free | 30 million compute units/month; 25 requests/second | $0 within the free plan |
| Secondary canonical-chain reads | Infura Core Free | Comparison table: 3 million credits/day; 500 credits/second; one API key | $0 within the free plan |
| ERC-4337 bundler qualification | Pimlico Free, testnets only | 1 million credits/month; 500 requests/minute | $0 within the free plan |

These units measure different provider workloads; they are not equivalent request counts. Alchemy and Infura are separate service operators, but their actual infrastructure independence still needs verification. Free tiers are suitable for initial qualification, not a production availability commitment.

Sources checked for this proposal: [Alchemy pricing](https://www.alchemy.com/pricing), [Infura pricing](https://www.infura.io/pricing), [Pimlico pricing documentation](https://docs.pimlico.io/guides/pricing). Infura's comparison table and FAQ show inconsistent free quotas; use the lower comparison-table allowance for planning and confirm the actual allowance during account creation. Provider dashboard terms govern activation. If the displayed free plan, allowance or card requirement differs, stop for a revised decision rather than accepting a paid option.

## Accounts and projects to create after approval

- Organization/account owner: ORIO.IO Lab, using `Wilfried.k@ColomboAI.com`.
- Qualification project/application name: `orio-spc-3-qualification`.
- Alchemy: create the Free organization/app and enable Base Sepolia through [its dashboard](https://dashboard.alchemy.com/).
- Infura: create Core Free, enable Base Sepolia and create the qualification API key through [its dashboard](https://app.infura.io/).
- Pimlico: create the Free testnet workspace/key through [its dashboard](https://dashboard.pimlico.io/), using its [documented key workflow](https://docs.pimlico.io/guides/create-api-key).
- Enable owner-controlled MFA/security keys where available. Keep credentials private; do not paste API keys or passwords into chat, source files, command output or screenshots.

This proposal selects the services; it does not claim that accounts already exist. Signup verification or MFA may require the owner to complete an interactive step. No invitation, email, purchase or provider-contact message has been sent.

## Connection mapping

Use separate server-side credentials for qualification. Store the resulting URLs in the trusted local/workload secret environment. Do not create AWS Secrets Manager resources under this approval; their cost and workload access belong to the separate AWS deployment plan.

| Setting | Intended value/source |
|---|---|
| `ORIO_CHAIN_ID` | `84532` |
| `ORIO_RPC_PRIMARY_OPERATOR_ID` | `alchemy` |
| `ORIO_RPC_PRIMARY_URL` | Alchemy-issued Base Sepolia URL |
| `ORIO_RPC_SECONDARY_OPERATOR_ID` | `infura` |
| `ORIO_RPC_SECONDARY_URL` | Infura-issued Base Sepolia URL |
| `ORIO_BUNDLER_URL` | Pimlico-issued Base Sepolia URL; reserved until a qualified bundler adapter is wired |

Documented URL shapes, with placeholders only:

```text
Alchemy: https://base-sepolia.g.alchemy.com/v2/<API_KEY>
Infura:  https://base-sepolia.infura.io/v3/<API_KEY>
Pimlico: https://api.pimlico.io/v2/84532/rpc?apikey=<API_KEY>
```

Endpoint references: [Alchemy supported chains](https://www.alchemy.com/docs/reference/node-supported-chains), [Infura endpoints](https://docs.infura.io/get-started/endpoints.md), [Pimlico supported chains](https://docs.pimlico.io/guides/supported-chains). Use the actual dashboard-issued endpoints, not a guessed/demo/shared key. The adjacent environment example deliberately leaves all credential-bearing URLs empty.

## Integration and acceptance sequence

1. Record the actual free plan and quota in each dashboard. Decline paid add-ons, mainnet billing and automatic plan upgrades. If free registration requires a card or a financial commitment, stop and present the actual requirement to the owner.
2. Put the two RPC connections into the trusted environment and run `npm run check:providers` in `services/control-foundation`. It must verify chain identity, fresh canonical finality, bounded height skew and agreement on a common finalized block. Save only the credential-free report.
3. Check historical receipts against both providers and exercise disagreement, timeout, throttling and credential revocation. If either source is unavailable or they disagree, pause financial reconciliation rather than silently accept one source. Provider-specific method and history limits must be recorded.
4. Qualify the Pimlico connection with read-only `eth_chainId` and `eth_supportedEntryPoints` requests. Its documented Base Sepolia EntryPoint v0.8 address is `0x4337084d9e255ff0702461cf8895ce9e3b5ff108`. Confirm deployed runtime/chain identity independently; do not treat an address listing as proof of code. The current repository's generic chain reader does not implement the bundler API; that adapter remains engineering work.
5. Test ORIO's custom account, factory and treasury paymaster against actual bundler simulation/admission rules. Public documentation listing EntryPoint v0.8 support does not qualify ORIO's custom contracts or prove ERC-7562 compliance.
6. Prepare a separately reviewed, testnet-only deployment and test-asset execution plan, with signer custody and complete gas quotation/consent/reconciliation. This provider-account approval alone does not authorize deployment, signing or broadcast.
7. Measure usage and failure behavior before proposing a paid/mainnet plan. Production also needs a second qualified bundler/failover path, workload access, operational drills and the existing accountable release evidence.

Retain the ORIO Gas Treasury/custom paymaster design. Do not enable Pimlico's managed sponsorship or ERC-20 paymaster as an unreviewed substitute. Users still pay their authorized actual network costs; unused estimates are credited/refunded. RPC/bundler API charges are company operating expenses and must not become holder appreciation, reserve deductions or undisclosed customer gas charges.

## Financial scope and later pricing

Requested approval for this phase: **$0 in provider service charges**, free plans only, with no card enrollment or paid upgrade. Stay within the included quotas; throttle/pause tests if necessary. Do not convert a quota limit into an unapproved bill. This is a qualification spending scope, not a permanent platform budget or a promise of uninterrupted service.

For a later production decision, current Alchemy list pricing is $0.525 per million compute units on PAYG; Infura Developer lists $50/month. Pimlico PAYG lists 10 million included credits, then $1 per 100,000 credits, and a 10% surcharge when its managed mainnet gas sponsorship is used. The actual ORIO custom-paymaster route needs a workload-specific quote and gas-cost attribution; no surcharge is assumed to apply or be passed through under this proposal. Recheck checkout terms and price changes before any paid activation. None of these paid services is requested now.

Rollback: remove application connections, revoke qualification keys and delete/disable the unused provider projects. Provider deletion/retention behavior must be checked in the actual dashboards. There are no DNS, blockchain-deployment or AWS changes to undo in this preparation.

## Approval decision

Approve creating the Alchemy Free, Infura Core Free and Pimlico Free testnet accounts/projects under ORIO.IO Lab for the above qualification scope, with $0 service charges, no card enrollment, no paid upgrades and no mainnet activation. This is the final decision needed to move this prepared proposal into account setup.
