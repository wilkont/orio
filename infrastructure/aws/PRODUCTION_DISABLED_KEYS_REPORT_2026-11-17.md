# Disabled production-purpose keys — November 17, 2026

Completed under the owner's explicit approval in AWS account 720232346199, us-east-1. CloudFormation stack `orio-spc-3-production-disabled-keys` reached CREATE_COMPLETE. The reviewed CREATE change set contained exactly five key and five alias additions, sourced from merged commit 69208c469103975423353e2e55516e77fac1a9f9. The downloaded template SHA256 matched 76c18f55d9b87c31980b62317896c8e7da6e31c2147f85fd10a55d223cd15ce8.

## Verified authority boundary

Governance, settlement, valuation, gas reservation and gas operations each have a distinct AWS-generated ECC_SECG_P256K1 / SIGN_VERIFY key and purpose alias. All five actual states are Disabled, single Region, with zero grants. Each actual key policy exactly matches the approved template: account-owner administration is restricted to the root principal; the existing /orio/orio-operator user has DescribeKey and GetPublicKey only; all principals are explicitly denied Sign, Verify and CreateGrant. Root administration could later change policy or enable a key; no such later change is authorized or performed here. Key retention on deletion/replacement is recorded in the retained template.

Verification used the authenticated administrator for DescribeKey, GetKeyPolicy, ListGrants, GetPublicKey and alias inspection. It did not impersonate the operator or claim an actual operator invocation test. Local public-key parsing verified secp256k1, DER fingerprints and five distinct Ethereum identities. Qualification key material was not reused. The receipt records exact public identities; these are not funded wallets or production activation authorization.

No Sign or Verify request, key enablement, application role, grant, database permission, public endpoint, blockchain transaction or funds movement occurred. Website, DNS and mail were unchanged. Financial operations remain disabled. The existing public read-only metadata service remains the deployed application scope.

## Evidence and cleanup

Five private reports/template files and their archive were downloaded and hash-verified. Archive SHA256: 01fb183a70ba43edddde84a8966840c987b1d6b18e96a60259e716772ceed93b. Original metadata verification SHA256: d9c79890ad1e5efa1d5d4cb486deea8180e3804c345bc87f3a98629ce3a8a41d. Local evidence has owner/SYSTEM access only. Temporary CloudShell directory and archive were removed after local verification; the five approved disabled keys and aliases are retained. There were no temporary network or storage services to remove.

Approved allowance: up to $1 initial verification and $5/month additional key storage, separate from API/log allowances. This is an allowance, not a measured bill. Retention means storage charges continue until separately authorized deletion completes.

## Remaining integration

Actual protected key material is now established. Purpose-bound signing workloads, replay/limit enforcement, recovery and revocation, operational qualification, actual reserve arrangements and production financial deployment remain unfinished. These keys must remain disabled with cryptographic use denied until a concrete signing-access change is separately approved. External review remains advisory. No completed key creation or earlier database bootstrap should be replayed.
