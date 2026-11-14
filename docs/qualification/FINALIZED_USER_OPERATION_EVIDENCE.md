# Finalized UserOperation debit evidence

The read-only verifier in services/control-foundation/src/finalized-user-operation.ts checks the exact final EntryPoint UserOperationEvent through two configured chain readers. It binds chain, EntryPoint, account, paymaster, nonce, UserOperation hash, outer transaction and log index. Both sources must agree on the canonical finalized block, execution result, debit and gas used. The shared chain-evidence helpers also preserve the ERC-20 verifier's existing finality/log checks.

It rejects an unsuccessful outer bundle, missing/duplicated/removed logs, substituted parties, malformed event ABI or boolean, unfinalized blocks and source disagreement. A successful outer transaction containing a reverted user operation returns success=false with the exact paid EntryPoint debit. It does not assign failure responsibility or authorize a customer debit. All amounts remain exact integer strings, including values above JavaScript's safe integer range.

The output includes a canonical execution reference compatible with immutable gas bindings, a distinct transaction/log evidence reference, block identity and a digest of the normalized evidence. It exposes entryPointDebitWei, not a purported final user gas bill. EntryPoint's final debit includes the operation's internal charging model; complete Base L1/bundler attribution, surplus/shortfall policy and denomination conversion still need separate evidence. Never add the full bundle's L1 charge to every user or use an earlier paymaster postOp cost-so-far observation as a final bill.

The PostgreSQL/VM bridge now passes real reference-EntryPoint event bytes through this verifier before recording its local debit. The RPC/finality anchors in that test are synthetic, with no public network or independent provider connection. Unit tests cover malformed and conflicting evidence; the bridge ensures the parser matches the actual pinned contract event ABI. No production provider, continuous observer or automated customer-billing route is activated.

For exact payout attribution the verifier also returns executionBoundaryLogIndex, the latest preceding BeforeExecution or UserOperationEvent from the same trusted EntryPoint. A withdrawal transfer must fall strictly after that boundary and before its own final UserOperationEvent, with the same canonical block and transaction. This prevents using a different operation's payout within one bundle. Caller inputs are snapshotted before asynchronous verification; comparisons use verified observation fields.

External reviewers are optional under ADR 0002. The two-source technical verification, user/treasury consent and actual evidence requirements remain intact; they are not independent-review mandates.

Source: the locked @account-abstraction/contracts 0.8.0 interfaces/IEntryPoint.sol and [upstream v0.8 event interface](https://github.com/eth-infinitism/account-abstraction/blob/releases/v0.8/contracts/interfaces/IEntryPoint.sol).
