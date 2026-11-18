# Live runtime denial verified and temporary resources removed

The owner-approved isolated test completed in account 720232346199, us-east-1. The actual KMS authorization-only dry run was rejected by the intended identity-policy statement, **DenyRuntimeCodeDecryption**. AWS supplied the Lambda source-function identity and reported an EXPLICIT_DENY for the exact startup key. The resource policy and session policy allowed the request; the intended identity guard was the sole matched denial. No actual ciphertext, decryption, signing, key enablement, blockchain transaction or financial activation occurred.

## Evidence and attribution

The temporary role copied all six deployed journal KMS statements exactly. Before execution, the native unexecuted template, actual role policy and actual Lambda source were compared against the reviewed candidate. The fixed handler accepted only the approved event and used Decrypt with DryRun=true and DryRunModifiers=IGNORE_CIPHERTEXT. Its invocation completed at 21:56:55Z; reserved concurrency was restored to zero in a finally path.

The KMS request was `6ab868ff-1988-46a1-9fbf-a1cc42986bf9`. Its matching CloudTrail event supplied authorization ID `3qxykznd5mqnoz2g0a9qroe16`. The correct inspection command is **aws iam-toolbox get-request-authorization-details**, not the previously attempted iam subcommand. The historical evaluation and policy were also inspected in AWS's Access Troubleshooter console.

The trace names DenyRuntimeCodeDecryption as the only matched DENY statement. Its requestContext includes lambda:SourceFunctionArn for the temporary probe, the expected account and the original journal ciphertext context. The original journal policy remained identical before and after the test. This verifies the copied policy boundary with actual Lambda runtime credentials; it does not certify future code, wider roles, future network changes or a financial release.

## Resolution of the simulation finding

The 24-case native differential remains a reproducible resource-scoped simulation inconsistency. Its internal AWS implementation cause is not confirmed, and no AWS simulator defect has been represented as fixed. The security concern is resolved by authoritative live enforcement evidence rather than by weakening the deployed policy or accepting a contradictory simulation as a pass. Preserve the simulator regression reproducer and the historical unverified reports as history.

## Cleanup and retained state

At 22:04:11Z the temporary stack was DELETE_COMPLETE, and separate API checks confirmed the function, role and disposable log group absent. The original private journal remained paused. All six signing keys were verified Disabled before cleanup, and no subsequent key operation enabled them.

The eight private JSON records were archived, downloaded, SHA-256 verified and retained with owner/SYSTEM-only access. Archive SHA-256: `46e2cb9d4f1de825741a1ea7a48d139e27271798cd53512a39abf840169d80e7`. Remote working files and the transfer archive were removed after local verification. The sanitized receipt records the individual trace/event hashes and bounded scope. Raw request contexts, temporary credential identifiers and private corporate records are excluded from the public engineering report.

The approved $0.10 verification ceiling applies within the existing allowance; actual billing is not measured here. No recurring probe resource remains. The original database, journal code, public API and ORIO.IO were unchanged.

## Next signing-service work

The private worker entry and committed-intent transport are integrated in source. Its local packager now emits a compiled Node.js 24 Lambda ZIP with a checksum-pinned configuration and locked AWS SDK/ethers dependencies, without credentials or AWS calls. Two builds of the synthetic qualification configuration produced identical ZIP bytes and passed the packaged rejection check. This is a packaging qualification, not an admitted live configuration or a hosted signing deployment.

Purpose-bound worker/key permissions, an approved actual deployment policy, authority binding, admitted observation sources, actual protected valuation execution and recovery qualification remain to be completed under concrete deployment scopes. The owner designated himself as treasury approver and recovery contact; actual reserve/customer terms, capital authorization and production reserve arrangements are still unresolved. External review remains advisory.

Sources: [AWS authorization details](https://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot_access-denied-authorization-id.html), [KMS permission dry runs](https://docs.aws.amazon.com/kms/latest/developerguide/testing-permissions.html). The specific result above is the observed ORIO test, not an inference from documentation.
