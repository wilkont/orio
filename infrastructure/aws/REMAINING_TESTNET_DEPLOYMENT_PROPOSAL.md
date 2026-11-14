# Remaining Base Sepolia deployment batch

Status: prepared, not signed or submitted. Existing governance contract: 0x0eBa0D1802c1fC32Ed75175243893c30E120165c. Production financial operations remain disabled. No external-review waiting requirement is imposed.

## Concrete proposed scope

Five zero-value creation transactions from the existing qualification signer 0xB1E1d791a518931042Fed65778a2f8E11938eae1, nonces 1 through 5, chain 84532:

1. MasterAssetRegistry, controlled by the existing test governance timelock.
2. ORIOTreasuryPaymaster, owned by that governance, pointing to EntryPoint v0.8.
3. ORIOGasAccountFactory, pointing to that EntryPoint and the predicted paymaster.
4. ORIORecoverableGasAccountFactory, pointing to the same EntryPoint and paymaster.
5. ORIOMonetaryController, pointing to governance, registry and Circle's Base Sepolia USDC. Its constructor creates ORIOCurrency, ORIOReserveVault and ORIORedemptionLocks.

Exact creation data, transaction hashes to be signed, predicted addresses, runtime hashes, child identities and fee parameters are in REMAINING_SEPOLIA_PLAN_2026-11-14.json. The normalized-LF SHA256 is b2f2578395ac575732fe95d67ad1c5bee2f81921829a5f508ba76cc6327d1246. The client refuses any changed manifest. All contracts remain unconfigured/paused: no asset election, valuation signer, settlement operator, issuance, paymaster activation, gas prepayment or wallet creation is included. The existing 60-second governance delay is unchanged.

## Simulation and meaningful checks

An isolated local EVM executed all five constructors using ordinary Base Sepolia account/code/storage reads pinned to one observed block. No mock USDC, synthetic contract dependency, private key or signed transaction was used. Nonces and runtime hashes were recorded, including the three child contracts. Fresh EVM instances reset transaction-local warm/transient state while sharing simulated writes; source storage reads stay pinned. This is a trusted single-source diagnostic, not authenticated state-root/proof verification or a production provider qualification.

The public node restricted account-proof requests. A compatibility reader now uses ordinary read methods at one request per second; it does not request proofs or claim to authenticate them. The planner is bounded by RPC timeouts and a four-minute process watchdog. A later reorg invalidates planning evidence; constructors must pass fresh live simulation before submission. Independent live estimates for the two presently deployable constructors fit their approved gas limits. CI binds the plan to current compiled source and constructor data, rejects altered manifests and unrelated signatures, and tests every permitted handler selector with synthetic AWS responses.

## Restricted signing update

protected-remaining-deployment.json reuses the existing key, private Lambda, Lambda-only role and operator invoke policy in account 720232346199/us-east-1. It temporarily enables the qualification key and private function with concurrency one. The handler accepts exactly one operationId from the five listed operations, maps it to its compiled-in unsigned digest and rejects extra fields, unknown selectors and arbitrary payloads. IAM still restricts the exact key, DIGEST and ECDSA_SHA_256; it cannot interpret financial semantics. No new key, role, public URL, direct human Sign grant or generic signing endpoint is proposed. Existing administrators can change code/policies, so this is not an independent production control.

## Test funding and cost proposal

The conservative whole-batch planning estimate at the captured block is 0.000240508884040408 test ETH. The proposed aggregate planning ceiling is 0.00035 test ETH; each operation is additionally limited to 125% of its recorded planning budget, whose ceilings sum below that aggregate ceiling. The execution client rechecks nonce, balance, dependency code hashes, gas estimate, L2 fee cap, L1 fee and operator fee before each submission. L1/operator fees can change after submission and are not hard-capped by the EIP-1559 execution cap. Stop the batch if actual receipt costs or configuration checks exceed authorization; do not silently alter payloads or budgets.

Three free CDP top-ups of 0.0001 test ETH each were claimed for the same qualification address. Successful distributor receipts and the aggregate balance change were observed; see BATCH_FAUCET_TOPUPS_2026-11-14.json. The balance is now 0.000389743536190728 test ETH, and the sender nonce remains one. These are valueless test tokens, not company reserves or customer backing. No card, new API key, wallet or paid upgrade was created.

Propose up to USD0.25 additional metered AWS Lambda/KMS verification costs for the five-operation session and cleanup. No new recurring workload or storage subscription is added; the existing key's previously approved storage charge continues. Actual billing is not yet available. The earlier first-contract approval does not authorize this new signing allowlist.

## Execution after action-time approval

Apply only the reviewed change set after confirming account, no key replacement and unchanged IAM scope. For each operation in nonce order, invoke the private function with that operationId, preserve the returned public proof, run execute-remaining-sepolia.ts without its broadcast flag, then use --broadcast-approved-base-sepolia only for the approved test transaction. The command records the exact signed hash with exclusive file creation before the network write. A timeout is ambiguous; reconcile that hash and nonce before any retry. Never replace a preparation or manufacture a new nonce to retry.

After each receipt, run verify-remaining-sepolia.ts. It checks creation input, address, full runtime hashes including children, governance/EntryPoint/master links, zero supply/reserves, closed execution and unset monetary signers. It records receipt execution/L1/operator fees and whether finality was reached at observation. Verification receipts use exclusive file creation; subsequent observations need new filenames. Stop after any failed transaction, changed dependency, code/config mismatch or unaccounted cost. Disable the key and pause the function on completion or failure, then restore protected-signing-qualification.json as the paused deployment configuration.

This batch does not deploy mainnet contracts or complete the hosted financial platform. Hosted upgrades 003-018, ledger-backed runtime signing, operational providers, recovery qualification, reserve/funding arrangements and accountable production acceptance remain separate work.

Sources checked: https://developers.circle.com/stablecoins/usdc-contract-addresses ; https://docs.base.org/specifications/transactions/network-fees ; https://docs.cdp.coinbase.com/faucets/introduction/quickstart . Test USDC has no financial value or real-dollar backing.
