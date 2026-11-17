# Reserve-backed monetary valuation signing

## Authority and integration

This qualification slice connects authenticated reserve observations, exact backing assessment, immutable PostgreSQL intents, one protected KMS valuation signature, the monetary controller/vault and finalized ledger import. It supports Base Sepolia only; no mainnet switch or environment variable activates finance.

`contracts/sdk/reserve-observer.mjs` uses two configured reserve readers. It selects the lower finalized height, verifies the same block hash/timestamp, pins every eth_call and eth_getCode with EIP-1898 requireCanonical, checks bytecode and controller/vault/currency/registry/master bindings, elected master metadata, revisions and valuation signer, then rechecks the canonical block. `HttpsReserveReader` permits only tightly bounded read methods and no state override, latest call, value/from field or transaction submission. Existing chain/bundler reader permissions remain narrow.

`reserve-valuation.mjs` checks provider agreement, configured source identities, evidence ages, prices, deployment/revision/code identities, exact ledger state and rounding, physical custody and reserve value against liabilities. Company fees and unassigned assets cannot count as customer backing. Gas Treasury identity must be separate. Price limits are mandatory explicit qualification policy, not hidden production defaults. DEPOSIT_PAUSED or out-of-band prices disable issuance; an actual shortfall rejects the valuation entirely. Evidence is canonically committed into the contract-compatible EIP-712 valuation hash.

The owner-only `ValuationSigningJournal` stages authorized evidence against the actual committed deployment/state and cash ledger. Authority and deployment row locks fence claim/completion against revocation and settlement. The private worker selects only an intent ID, recomputes the full valuation, pins the immutable KMS ARN/public signer, claims once, uses DIGEST/ECDSA_SHA_256 with SDK retries disabled and verifies recovered Ethereum identity. A completion check occurs before returning the signature. No arbitrary digest, transaction-signing or broadcast API is exported.

Pending SQL extension 020 is deliberately outside the deployed 001–019 migration directory and checksum manifest. It adds owner-only append-only authorities, revocations, intents, claims and completions. No runtime grants are added. Do not replay the original hosted upgrade or claim this extension is installed there. Hosted least-privilege bootstrap and service deployment require a concrete separate change.

## Failure and recovery

Missing/stale/disagreeing observations, changed code/revisions, ledger/cash mismatch, insufficient custody/backing, unknown/revoked authority, expiry and a previously consumed intent fail closed. A Sign error, wrong public signature, completion failure or unknown acknowledgement after a claim requires reconciliation; never blindly resubmit or invent a new authorization. The worker does not disclose provider/credential/backend errors.

Revocation is serialized with worker claim/completion. It cannot cryptographically revoke an already returned signature: short validity and on-chain authority rotation remain essential. Previously emitted signatures may remain usable until expiry or contract configuration changes. Unknown data is never a zero balance. Canonical provider agreement is not a cryptographic state proof or independent financial review.

## Verification and remaining work

Local tests use a disposable PostgreSQL database, actual compiled contracts in an isolated EVM and a deterministic KMS-protocol fixture. They verify one concurrent claimant, an accepted valuation/purchase, reserve/currency results, finalized journal import, stale-state rejection, revocation and append-only/permission boundaries. Synthetic keys and test funds never leave the local VM. Focused tests cover expiry, depeg/shortfalls, source substitution, EIP-1898 restrictions, opaque errors and uncertain KMS outcomes.

Live price-source authentication/admission, issuer freeze/blacklist checks, proxy implementation upgrade verification, purpose-bound least-privilege hosted roles, actual KMS valuation execution, recovery drills, production contract deployment and actual reserve arrangements remain outstanding. Public testnet diagnostics are labeled single-source only. Existing production-purpose keys remain disabled; the public read-only metadata service and ORIO.IO are unchanged.
