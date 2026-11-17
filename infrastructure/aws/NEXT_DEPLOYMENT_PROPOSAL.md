# Next AWS deployment

Completed and verified: original hosted SQL upgrades 003–019, private three-table IAM reader, public read-only metadata gateway and five disabled production-purpose keys. See [public deployment report](PUBLIC_METADATA_DEPLOYMENT_REPORT_2026-11-17.md) and [key deployment report](PRODUCTION_DISABLED_KEYS_REPORT_2026-11-17.md). Do not replay completed bootstrap or key creation.

The public metadata service is active at concurrency one. Governance, settlement, valuation, gas reservation and gas operations keys are all disabled, have zero grants and explicitly deny cryptographic use. No signing or financial operation was activated.

The next engineering stage is a concrete purpose-bound signing workload, including exact key/digest authority, committed-ledger prerequisites, replay and spend limits, recovery/revocation, failure handling and operational qualification. KMS cannot enforce Ethereum chain IDs or monetary intent itself. Do not enable keys or remove their signing deny under the completed key-creation approval. Prepare and test the complete access change before requesting its specific approval.

Actual reserve arrangements, live provider/paymaster admission, consent/recovery and operational reconciliation remain necessary for financial deployment. ORIO Inc., Delaware, US-origin/global market intent and company-operated protected signing are recorded choices; eligibility is distinct from USDC availability. External review remains advisory.

The legacy ORIO.IO website in account 710096437887, published Dot design and DNS/mail are unchanged by these phases.
