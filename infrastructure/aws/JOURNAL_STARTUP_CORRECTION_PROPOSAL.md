# Private journal startup correction - prepared, not applied

## Observed problem

The approved original journal upgrade committed and the six-resource private service deployed. AWS rejected invocation before the handler with `KMSAccessDeniedException`: the execution role's blanket `kms:*` denial also denies decryption of Lambda's startup configuration. Read-only KMS metadata confirms that key `722d2b07-23f1-4fd1-bb4f-baa53d96caff` is AWS-managed `alias/aws/lambda`, with `ENCRYPT_DECRYPT` usage. It is separate from the six Disabled signing keys. Actual IAM database qualification remains unverified.

AWS documents default Lambda environment encryption and the distinction from customer-managed encryption in [Securing Lambda environment variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars-encryption.html). The observed explicit deny is the deployment blocker. The [KMS permission reference](https://docs.aws.amazon.com/kms/latest/developerguide/kms-api-permissions-reference.html) documents `kms:ViaService` and `kms:CallerAccount` conditions for cryptographic operations.

## Exact proposed change

`journal-startup-correction.mjs` accepts only the checksum-pinned deployed baseline and produces a candidate template. Only the existing journal role policy changes:

- Permit `kms:Decrypt` on `arn:aws:kms:us-east-1:720232346199:key/722d2b07-23f1-4fd1-bb4f-baa53d96caff`, only through `lambda.us-east-1.amazonaws.com` for caller account `720232346199`.
- Explicitly deny every KMS operation on every other key, including all signing keys.
- Explicitly deny every non-decrypt operation on this startup key.
- Explicitly deny direct decryption, missing service/account context, other services and other accounts.
- Preserve secret-value retrieval, data API, further function invocation and role-assumption denials. Database, networking, logging, artifact, code/version and caller permissions are unchanged.

The exception is scoped to the AWS-managed startup key and Lambda/account context. It does not assert an unverified function-specific encryption-context field. No signing, verification, grant creation, key enablement or customer reserve access is permitted.

## Native preview and verification

The unexecuted AWS change set is `orio-startup-decrypt-proposal-20261118`, ARN `arn:aws:cloudformation:us-east-1:720232346199:changeSet/orio-startup-decrypt-proposal-20261118/fee7d124-8d47-4c27-b714-b78427f01d78`.

Its API reports the JournalRole policy modification and a dependent JournalFunction Role-attribute reference refresh, both without replacement. The console displays the substantive JournalRole modification. The full candidate differs only in that role policy; it adds no resources and changes no code or concurrency. The current service remains UPDATE_COMPLETE with concurrency zero and the original policy.

AWS `SimulateCustomPolicy` verified 48 action/resource/context decisions across two keys, six KMS actions and four context scenarios. Exactly one case was allowed: the expected Lambda-routed startup decrypt. All other tested cases were explicitly denied. These simulations do not prove runtime startup, key-policy evaluation or successful database authentication. The original failed invocation is retained privately, and no live IAM qualification is claimed.

## After specific approval

In account 720232346199/us-east-1, refresh the existing session and confirm the deployed baseline, exact AWS-managed key metadata, original paused state and unchanged candidate preview. Apply only the reviewed correction. Temporarily set concurrency one, run administrator-only immutable-version invocation checks for actual IAM database login, strict payload rejection and unbound-intent denial, then immediately pause and restore declared concurrency zero. Record actual results and retain reports privately; remove temporary working files.

Use the existing $5 verification and $1/month additional retained-service allowance; no increase or new recurring resource is proposed. Actual billing remains unmeasured. No original SQL rerun, password retrieval, authority binding, signing, blockchain transaction, funding, public endpoint, website/DNS/mail change or financial activation is included. All six signing keys stay Disabled. External review remains advisory.

This is a changed encryption-key access boundary: the prior approved plan expressly denied all KMS access. Applying the exception therefore requires a specific confirmation. The original upgrade and its cleanup are already complete and must not be repeated.
