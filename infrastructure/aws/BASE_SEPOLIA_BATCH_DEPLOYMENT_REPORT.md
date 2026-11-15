# Verified Base Sepolia deployment batch

Observed 2026-11-15 UTC (2026-11-14 America/Chicago). The owner explicitly approved the five fixed deployments, temporary protected signing, up to USD0.25 additional AWS cost and a 0.0015 test ETH aggregate planning ceiling. The approved manifest remains unchanged, normalized-LF SHA256 `1c49fbbdb36e527e8a40fc74aa005bc75afe34afd790f32c2ee02eb83d593d12`.

| Contract | Base Sepolia address | Transaction |
|---|---|---|
| Asset registry | 0x539aEb6B7Be6eD8B1BC154809864e71C6835CA6B | [Receipt](https://sepolia.basescan.org/tx/0x63b5bb1e03123048eea083ece78a5f075c37f908eac777350585077041aa4f04) |
| Treasury paymaster | 0x3c2E4Eb628Ad18f452546B6347A1751020C26857 | [Receipt](https://sepolia.basescan.org/tx/0xcea3cf71e5b72489015e376ea53afc262a6c342cdf1e61edd4899c7f77c91936) |
| Wallet factory | 0x5b6a0572a550899FF0468b59BDdA8FCD554cD014 | [Receipt](https://sepolia.basescan.org/tx/0x1be2290e74bfff6b23f79b22e01ec6e680009ce667000028114608dddcabc699) |
| Recovery wallet factory | 0x0B442455c6D61E95868Cbde08fe08715EDe13d84 | [Receipt](https://sepolia.basescan.org/tx/0x7417554631ba891fe9e6d3eeb4a6d93d7e4dd06e1fe276802c3421c657d4b30f) |
| Monetary controller | 0x7ebF7ca8Ea3058DfCebEd89742BcA82Dcf4dC971 | [Receipt](https://sepolia.basescan.org/tx/0xa8e846951832a94af59d68e6ddd867d29219d9d98110dce860926a4367a3bd5e) |

The controller created currency `0x8Fc29F6E452238645b4eBaa934ACf9891b0d5fB5`, reserve vault `0x7a5b5e46DD14cE3bA8240961a092320F4CA32575` and redemption locks `0xCC0349CC356D17695D61C606b06E37e62Ea8B2E9`. Existing governance remains `0x0eBa0D1802c1fC32Ed75175243893c30E120165c`.

## Verification and accounting

Each transaction used the approved key, fixed creation payload and nonce (1–5), zero value and chain 84532. The execution client verified each signature and preflight before broadcast and durably recorded its hash before network submission. After each transaction, the verifier checked successful receipt, canonical observed block, exact creation input, full runtime hashes including child contracts and deployment-specific paused/empty configuration.

Registry has no elected asset or monetary links. Paymaster execution is disabled and its reservation signer unset. Factory EntryPoint/paymaster links match the manifest. Controller execution is disabled, valuation and settlement signers are unset, supply/reserve/fee balances are zero, and its vault points to official test USDC with six decimals. No wallets, purchases, redemptions or gas sponsorship were activated.

Observed network cost (L2 execution + receipt L1 fee + operator fee at the receipt block) totaled **106569217549280 wei = 0.000106569217549280 test ETH**. Opening balance 1589743536190728 minus this cost equals observed closing balance **1483174318641448 wei**. Pending nonce is six. Individual receipts contain exact component costs. Actual AWS billing is not yet available; approval is not a claim of measured AWS spend.

These are single-public-source diagnostic observations, not independent state-proof verification. All five receipts were not finalized at their first observation; successful inclusion is not represented as finality. Subsequent finality checks must use new reports without overwriting original observations. Test tokens provide no customer backing.

## Cleanup and remaining work

Immediately after the fifth submission, Lambda reserved concurrency was set to zero and the KMS key disabled. Paused-template restoration completed with stack UPDATE_COMPLETE and function LastUpdateStatus Successful. The installed template declares keyEnabled false, concurrency zero and no batch operationId selector. AWS separately returned actual key state Disabled and ReservedConcurrentExecutions zero. Restored Lambda code SHA256 is `HF+3gE2H+PqQjvokyxfPlRoi7gmn1gpPBscz8kMnd2Y=`. Cleanup is verified; no key material was exported and no new direct human signing permission was granted.

This completes the approved deployment batch only. Hosted schema observation and upgrades 003–018, verified restore, ledger-backed operational signing, provider/runtime deployment, recovery qualification, actual reserve arrangements, geographic eligibility and accountable production acceptance remain outstanding. External review remains advisory. The informational ORIO.IO website is unchanged; real-money execution remains disabled.
