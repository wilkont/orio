> November 17 update: the separately owner-approved five disabled production-purpose keys were created and verified. See [actual key deployment report](PRODUCTION_DISABLED_KEYS_REPORT_2026-11-17.md) and receipt. Earlier pending-creation descriptions below are historical; do not replay creation. Signing and financial operations remain disabled.

# Next protected-key preparation

Prepared only. No production-purpose key has been created, enabled or granted signing access by this proposal. The owner selected company-operated protected signing; governance, settlement, valuation, gas reservation and gas operations must have explicit, separate authority. Existing Base Sepolia qualification keys must not become production keys.

## Exact proposed change

In AWS account 720232346199, us-east-1, create the ten resources in `production-disabled-keys.json`: five distinct AWS KMS asymmetric keys and five purpose-specific aliases. Use AWS-generated `ECC_SECG_P256K1` material and `SIGN_VERIFY` key usage, single Region, disabled on creation. Keep policy-lockout protection enabled and retain keys on stack deletion/replacement. This establishes protected material only; it is not authority to activate a signer or financial service.

The existing account-owner administrator can inspect and administer each key, including later enabling or changing its policy. The existing `orio-operator` user receives only DescribeKey and GetPublicKey for these new keys. An explicit all-principal deny blocks Sign, Verify and CreateGrant, even if a key is accidentally enabled. There is no application signing role, public endpoint, caller-selected message, new human login, private-key export, customer-data access, network change, blockchain transaction or funds movement.

Aliases are `alias/orio-spc-3/production-` followed by `governance`, `settlement`, `valuation`, `gas-reservation` and `gas-operations`. Stop if any alias is occupied or the expected operator identity is missing. Do not adopt existing keys or reuse qualification material.

## Verification and failure handling

Review a CREATE change set with exactly five key and five alias additions. After separately approved creation, verify actual key state Disabled, correct spec/usage/origin, exact policies, no grants, alias ownership and distinct public-key fingerprints. Inspect public metadata only and leave every key disabled; do not call Sign or Verify. Record protected receipts and publish sanitized fingerprints/state evidence.

On partial failure, inspect owned stack resources before retrying. Retain any created keys disabled and blocked from cryptographic use; do not create duplicate replacement keys or schedule deletion under this approval. Retention avoids accidental loss of future key material and means storage charges continue until a separately approved deletion completes.

## Approval and budget

Request up to $1 additional metered cost for initial metadata verification and $5/month additional key storage. AWS lists $1 per customer-managed key per month, prorated hourly; asymmetric public-key requests are metered separately. This allowance is separate from the public API and retained-log budgets. No paid provider signup, mainnet activation, reserve funding, signing access or live customer operations is included.

Creating these persistent security resources and recurring cost needs separate approval. Later signing must be bound to exact governance/settlement/valuation/gas purposes, ledger evidence, limits, replay controls, recovery and revocation, followed by the actual applicable release qualification. The company-operated choice does not create reserve arrangements or legal/financial readiness. External review remains advisory.

Sources: [AWS KMS key resource and disabled state](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-kms-key.html), [AWS KMS pricing](https://aws.amazon.com/kms/pricing/).
