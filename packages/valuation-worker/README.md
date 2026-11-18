# Private valuation worker runtime package

This directory locks only the runtime AWS KMS/Lambda SDK and ethers dependencies. It contains no credentials, deployment approval, authority binding, live-source admission or financial activation. The private handler accepts only an already staged intent ID; caller-selected keys, evidence, policy, digests, SQL and mainnet reject.

From the repository root, build with `node contracts/scripts/build-valuation-worker.mjs <configuration.json> <reviewed-sha256> <new-output.zip>`. The reviewed checksum must cover the exact UTF-8 configuration bytes. Configuration is deployment-owned and embedded into the artifact; it is never taken from a Lambda request or an environment override. Only source identifiers belong in the policy, not provider credentials or endpoints.

The builder verifies the configuration checksum, restricts its schema, copies the required SDK modules, compiles monetary accounting dependencies to JavaScript, installs this exact lock with package scripts disabled, tests the actual packaged entry's rejection path without a credential environment and writes a hash receipt. Existing output ZIPs are not overwritten. Failures remove only the checked temporary build directory. No AWS API or signing call is made by the builder.

Run `node contracts/scripts/qualify-valuation-worker-package.mjs` for credential-free synthetic qualification: wrong-checksum rejection, two identical package builds and the actual packaged rejection check. Synthetic fixture policy and key identifiers must never be deployed as an admitted operational policy. Source-level worker tests separately verify journal claim, one recovered signature, completion and replay rejection.

The next hosted deployment still needs a reviewed actual configuration, exact artifact/version pin, purpose-bound worker/key and journal invocation permissions, installed authority binding, authenticated observations and recovery evidence. This packaging work provisions none of them. The live journal runtime denial result is recorded in `infrastructure/aws/JOURNAL_RUNTIME_DENIAL_REPORT_2026-11-18.md`; it does not authorize this worker to sign.
