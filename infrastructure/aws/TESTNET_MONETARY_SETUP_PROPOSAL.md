# Fixed paused Base Sepolia monetary setup

Status: prepared, tested and AWS-previewed only. Signing and transaction submission are not authorized by the earlier disabled-key creation approval. Production financial operations remain disabled. External review is advisory.

## Exact proposed action

In AWS account 720232346199, us-east-1, temporarily enable the existing qualification key 479ae4e7-483e-4d17-8f46-232f08c5c6ee and resume its existing private fixed-digest Lambda at concurrency one. Replace only its fixed signing allowlist with the ten unsigned transaction hashes in TESTNET_MONETARY_SETUP_PLAN_2026-11-17.json (SHA256 fe2aa6e3fc4c52335b226150ff68856e63b311eb672d0044bcd1e91f7efdd7c6). No production-purpose key is used or enabled. The qualification signer is 0xB1E1d791a518931042Fed65778a2f8E11938eae1.

Five transactions schedule these exact governance actions, followed by five executions after the existing 60-second delay. Predecessor commitments enforce action order:

1. Register native Base Sepolia test USDC (0x036CbD53842c5426634e7929541eC2318f3dCF7e) as a six-decimal test candidate.
2. Approve that valueless test asset using an explicitly test-only evidence commitment.
3. Elect it as the initial test master.
4. Bind existing controller 0x7ebF7ca8Ea3058DfCebEd89742BcA82Dcf4dC971 and vault 0x7a5b5e46DD14cE3bA8240961a092320F4CA32575 to registry 0x539aEb6B7Be6eD8B1BC154809864e71C6835CA6B.
5. Configure the qualification address as test valuation signer and settlement operator, with executionEnabled=false and expected controller revision zero.

Every signed transaction targets the existing timelock 0x0eBa0D1802c1fC32Ed75175243893c30E120165c, chain 84532, native value zero, and fixed nonce 6 through 15. No token purchase, mint, burn, transfer, redemption, withdrawal, mainnet call or customer financial activation is included. The same qualification identity may exercise test roles; it is not the production authority arrangement. Registering/electing a test asset is not a valuation of test USDC at a real dollar.

## AWS change preview

AWS validated the JSON template and the currently deployed paused template exactly matched reviewed source. The qualification key was Disabled and the private function had concurrency zero. The created change set remains AVAILABLE and unexecuted:

arn:aws:cloudformation:us-east-1:720232346199:changeSet/orio-monetary-setup-20261117/69d92b90-8794-4389-8e7b-81b12266a11b

CloudFormation reports four Modify entries, all Replacement=False: the key and function, plus two dependent IAM policy reference refreshes. The IAM policy documents themselves are unchanged; details attribute the refreshes only to QualificationGasKey.Arn and QualificationFunction.Arn. No role, key replacement, public endpoint, database access or permission expansion to production keys is proposed. The console's direct resource-change view shows the two direct changes. Exact preview evidence is in TESTNET_MONETARY_SETUP_AWS_PREVIEW_2026-11-17.json.

The Lambda accepts only one known operationId, never a caller-selected digest, chain, nonce, calldata, destination or fee. It uses the existing Lambda-only qualification signing role. No secret or database password is read by this plan. Existing administrators retain their already established ability to change code/policy; this is not an independent production control.

## Bounds and verification

Propose up to $0.25 additional metered AWS costs for this session, with no new recurring resource. Existing key-storage allowances remain separate. The whole-test planning ceiling is 0.0015 test ETH. The ten fixed per-operation planning ceilings sum to 0.001125 test ETH. The observed qualification balance was 0.001483174318641448 test ETH; no top-up or real funding is requested. Each schedule has a 250,000 gas limit and each execution 1,000,000; maxFeePerGas is 100,000,000 wei (0.1 gwei), maxPriorityFeePerGas 1,000,000 wei.

Before each submission recheck exact nonce, dependency code hashes, delay, candidate/election/binding/signer state, zero supply/reserves/company fees, gas estimate, current fee parameters, complete L1/operator costs and remaining budget. Fee estimation uses unsigned transaction bytes, so the signed payload is not disclosed to RPC during preflight. L1/operator costs can change after submission; the planning ceiling is not a protocol-enforced cap on those costs. Stop after a limit, identity or configuration mismatch; do not alter payloads or regenerate nonces under this approval.

The executor verifies the pinned manifest, KMS public identity, DER signature, recovered sender and exact unsigned digest. It durably reserves an exclusive private preparation receipt containing the exact transaction hash before the broadcast flag can send to Base's official test sequencer. A timeout or lost acknowledgement is ambiguous: reconcile the same hash and nonce, never blindly retry with a new preparation. Receipt verification checks transaction input, canonical block, successful operation effect, resulting paused configuration and observed complete network cost. Finality is recorded separately and must not be invented from a mined receipt.

## Failure and cleanup

On completion or failure, disable the qualification key and pause its function, restore the reviewed paused qualification template, and verify containment. If only part of the sequence executes, preserve the actual partial state and receipts with monetary execution still false. Do not invent rollback, replace the master, cancel operations or execute new transactions outside these ten digests. A separate explicit recovery change may be needed. Never recreate or repurpose production keys.

The preview archive and four reports were downloaded/hash-verified into owner/SYSTEM-only local storage. Temporary CloudShell working files/archive were removed; only the unexecuted change set is retained for review. The prepared plan creates no additional billed resource until separately approved execution.

## Remaining financial work

This completes only the paused test-network bindings. Pending SQL extension 020, least-privilege hosted valuation worker, actual KMS valuation integration, approved live sources and issuer/proxy controls, recovery exercises, company-approved reserve/customer-rights arrangements and production release remain separate. This plan does not enable real-money financial operations or change ORIO.IO, DNS or mail.

Sources: [Circle token addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses), [Base endpoints](https://docs.base.org/get-started/connect-to-base), [OP GasPriceOracle unsigned fee estimation](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L2/GasPriceOracle.sol).
