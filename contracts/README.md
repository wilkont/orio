# ORIO on-chain master designation

These contracts implement the Ledger B master designation component in the existing ORIO repository. They compile with pinned Solidity 0.8.38 and OpenZeppelin Contracts 5.6.1, targeting Cancun bytecode. This is a local implementation awaiting Base qualification, independent audit and release evidence.

Run npm ci, npm run build and npm test in this directory with Node 24 or later. Build writes ABI, creation bytecode, runtime bytecode and compiler metadata to ignored artifacts files. Tests execute signed synthetic transactions in an in-memory EthereumJS VM with chain ID 31337. No RPC connection or real asset transaction occurs.

## Governance and authorization

ORIOGovernanceTimelock uses the OpenZeppelin timelock with self-administration, a nonzero immutable delay floor and no external bootstrap administrator. Proposer and executor arrays are deployment inputs. Production qualification must verify the actual authority bytecode, expected delay and role assignments, independently controlled multisig/DAO proposers and their thresholds. Contract addresses and nonzero delays alone do not prove independent governance. Tests use synthetic fixture accounts and five seconds solely to exercise the delay mechanism.

MasterAssetRegistry accepts only its configured governance contract for mutation. Constructor checks are interface sanity checks, not proof of authentic governance code. The deployment manifest and independent release process must bind the authority artifact and approved configuration. No company withdrawal, reserve transfer, token mint, token burn or arbitrary-call function exists in this registry.

## Asset identity and transitions

Asset IDs are keccak256 of ABI-encoded chain ID and token address. The backend must map that identity to its canonical chain/address asset identifier. Candidate registration requires deployed token code, a matching decimals getter and a nonzero policy digest. Governance then approves the candidate and elects the initial master. Additional approved assets can be designated secondary assets.

A migration freezes issuance eligibility, retains one current designation and records one pending replacement. Completion atomically retires the old asset, activates the replacement and advances the election epoch. Aborting preserves the outgoing designation in DEPOSIT_PAUSED, requiring a separately authorized resume. Every master state transition advances a revision. Governance calls bind the expected epoch and revision, preventing an old queued completion or resume from applying to a later attempt with the same asset and epoch.

The policy/evidence digests identify independently reviewed issuer, eligibility, pricing, liquidity, custody, migration and liability evidence. The contract does not validate that off-chain evidence or execute a reserve migration. The monetary engine must enforce issuanceAllowed at the actual execution boundary. Complete settlement/custody/valuation verification, dual-ledger reconciliation and atomic accounting integration remain open. The registry currently covers candidate, approval, secondary, active, migrating, retired and deposit-paused states. Quarantine, exit-only/removal workflows and independent emergency-guardian wiring remain future work.

## Verification and release

Local tests cover unauthorized callers, token metadata mismatch, one initial election, competing/stale migration actions, issuance freeze, atomic designation replacement, abort/pause recovery, timelock waiting and minimum-delay enforcement. A regression queues a completion, aborts its attempt and starts another migration to the same asset, then proves that the old completion is rejected.

These are component tests, with synthetic metadata contracts and no monetary token or reserve vault. Supply conservation across the complete platform, actual swap settlement, custody proof, loss valuation, emergency response, migrations during pending redemptions, adversarial qualification and independent legal/security/reserve/financial approvals remain necessary. No deployment script, public financial activation or live signer is included.

Source references

- https://docs.openzeppelin.com/contracts/5.x/api/governance
- https://docs.openzeppelin.com/contracts/5.x/access-control
- The pinned EthereumJS VM package README documents the in-memory signed-transaction execution API.

The compiler's transitive tmp dependency is overridden to exact version 0.2.7 to resolve GHSA-7c78-jf6q-g5cm. The locked compiler remains solc 0.8.38; compilation and all VM tests pass with the patched dependency. npm audit reports no known advisories for this dependency tree at verification time.
