# Protected signing bootstrap - reviewable change

Target account 720232346199; Region us-east-1; proposed stack orio-spc-3-protected-signing. No resource has been created by this plan.

## Fresh access evidence

On November 14, 2026 the connected console identified arn:aws:iam::720232346199:user/orio/orio-operator. It read the orio-spc-3-ledger stack as CREATE_COMPLETE and read its existing network/database outputs. ListStackResources, kms:ListAliases and tag:GetResources were denied. List failures are permission evidence, not proof that resources or keys are absent. The existing operator remains inspection-scoped; it cannot authorize its own bootstrap.

AWS multi-session support was enabled to preserve that operator session while the owner requested administrator sign-in. An additional administrator login is open; its account-owner email field is empty and no saved administrator sign-in was available. No password/MFA was bypassed. An authenticated administrator is still required.

## Exact first change

Apply protected-signing-key.json only after an administrator confirms the account, existing operator principal, alias availability and template validation.

| Resource/access | Proposed effect |
| --- | --- |
| One AWS KMS key | ECC_SECG_P256K1, SIGN_VERIFY, AWS-generated, single Region, initially disabled |
| Alias | alias/orio-spc-3-gas-qualification, points only to that key |
| Existing orio-operator | Administration/public-key inspection of this key through its key policy; no signing permission |
| Account administration | Management and key-side alias creation for this key; no signing grant |
| Wrong account/Region | Template conditions omit all key resources outside 720232346199/us-east-1 |
| Removal | Key retained on stack deletion/replacement; no automatic key-material deletion |

The Resource '*' entries inside the key policy apply to the key carrying that policy; no account-wide IAM wildcard policy is attached. Key administration includes PutKeyPolicy and EnableKey, so it is a real security-sensitive expansion that needs explicit approval. A key administrator could later change the policy; these are not independent production approval controls. No signing role, public service, customer wallet or reserve withdrawal permission is created. The template preserves the key-policy lockout safety check.

## Cost

AWS publishes USD1 per stored KMS key per month, prorated hourly, plus applicable API requests. Its ECC-256 example totals USD2.50 for one key and 100,000 signing requests. Asymmetric requests are outside the general free-request tier. This first disabled-key change grants no Sign permission. No recurring AWS key expense is approved by the old USD2 temporary migration-access authorization. Hosting/network/logging/database costs are separate and not estimated by this key-only plan.

Before the action, show the authenticated administrator the exact template/policy, confirm the recurring charge and scoped management grant, then obtain approval. Do not silently use root or expand the operator to AdministratorAccess. This document does not grant permission or accept a service agreement.

## Validation and execution

Local security tests check disabled state, account/Region constraints, retention, lockout protection and absence of signing/deletion/key-import/grant permissions. AWS-native ValidateTemplate and principal/alias existence checks remain pending administrator access. The local cfn-lint executable was blocked by Windows Application Control; no bypass was attempted and no successful CloudFormation validation is claimed.

If approved, use the administrator only for the one-time named stack operation and read-only verification. Confirm key identity/spec/usage, disabled state, complete policy and alias; obtain the public key through the authorized operator and record the derived Ethereum address. Never print key material or credentials. Public-key metadata is not a signing qualification. Keep the key disabled until a separate concrete workload/signing-access plan is approved. The first key is for qualification and must not be quietly repurposed for production funds.

The tested AWS adapter pins the immutable key ARN/public signer, official endpoint, network/domain/types and one signed digest. It normalizes canonical Ethereum signatures and rejects substituted identities or opaque backend failures. KMS itself does not enforce Ethereum chain IDs, quote limits or ledger preparation; the broker and least-privilege workload boundary must enforce those controls.

Sources reviewed November 14, 2026:
- https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html
- https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html
- https://docs.aws.amazon.com/kms/latest/APIReference/API_CreateAlias.html
- https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-kms-key.html
- https://aws.amazon.com/kms/pricing/
