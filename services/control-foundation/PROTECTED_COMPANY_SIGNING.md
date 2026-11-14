# Company-operated protected gas signing

Owner-selected direction: company-operated protected signing. This implementation is a qualification integration, not a provisioned production signing service.

`GasControls.signingReservation` reads the real reserved quote and journal identity from the trusted database and rejects closed/expired reservations. The SDK reconstructs the existing EIP-712 Gas Permit rather than accepting an arbitrary digest. `prepare` commits the execution reference; migration 018 then binds one exact typed digest to that transaction/operation before the backend sees it. Concurrent/repeated preparation agrees on that digest; a new nonce or changed permit rejects before a second payload can be signed.

The backend receives only the Gas Permit typed domain/types/value through `signTypedData`. The coordinator accepts only the configured Base Sepolia EntryPoint, paymaster, operator address and revision. It verifies the resulting signature against the configured company signer. No key material is requested/exported and no generic transaction or broadcast method is exposed. These are application interface restrictions, not proof that a real backend has protected hardware, restricted IAM or operator controls. Those deployment facts remain unconfigured.

Backend failure is ambiguous: a signature may exist even if its response is lost or invalid. Keep the funded reservation and immutable preparation; do not automatically cancel or refund it. Final UserOperation binding, user consent and receipt-based cost reconciliation remain separate existing steps. The signing boundary does not prove complete Base fee attribution or release readiness.

The local PostgreSQL/reference EntryPoint integration now uses the coordinator for actual fixture permit signing, purchase execution and gas reconciliation. Tests also cover wrong keys, opaque errors, mainnet/deployment rejection, prepare-before-sign ordering, concurrent immutable digest pinning, changed-payload rejection and closed-reservation rejection. All signing keys/funds in those tests are synthetic. Migration 018 is local only and grants no runtime role new permissions.


## AWS protected backend continuation

The contracts SDK now includes an official AWS SDK v3 binding, a strict KMS public-key/DER-signature adapter and a bounded owner-only sign:company-gas command. The client fixes the AWS endpoint/Region and uses the workload identity's credential chain without accepting credentials in a financial request. The adapter accepts only the pinned key ARN in the target account and the configured Base Sepolia Gas Permit domain/type/values. It verifies secp256k1 SPKI metadata and address, signs the precomputed typed digest in DIGEST mode, canonicalizes low-S and recovers the expected Ethereum signer. Aliases, wrong curves/keys/algorithms, unexpected domains, malformed DER and numeric monetary values reject. Errors remain opaque.

The CLI requires the trusted policy file, a separate TLS-verified gas-signing database login/CA and AWS workload credentials. It reads at most 64 KiB through a trusted stdin pipe; output contains authorization material and is not a public log. No HTTP endpoint or generic key-signing API is exposed. No AWS call was made during local tests: synthetic SDK clients generate test signatures, including high-S results accepted through the real EntryPoint after normalization. The actual key, workload authority and cloud deployment are still unconfigured. See infrastructure/aws/PROTECTED_SIGNER_BOOTSTRAP.md and protected-signing-key.json before any cloud change.
