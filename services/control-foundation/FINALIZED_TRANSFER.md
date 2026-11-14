# Finalized token-transfer verification

verifyFinalizedTokenTransfer verifies one exact ERC-20 Transfer event using two configured ChainReader sources. It checks chain ID, transaction success, finalized height, canonical block hash, log index, token contract, sender, recipient, removal status and the exact uint256 amount. Both sources must agree on the selected event's block. Its canonical settlement reference includes chain, transaction hash and log index for later deduplication.

This module reads evidence and has no transaction-signing or asset-moving methods. The caller must configure trusted readers, enforce RPC transport timeouts and authenticate any provider credentials outside customer requests. Distinct source IDs do not establish independent operators, and RPC answers are trusted observations rather than a locally verified consensus or receipt Merkle proof. RPC availability, canonical-chain correctness and source independence need operating qualification.

An ERC-20 event alone does not establish spendable reserve ownership, issuer eligibility, asset integrity, ownership authorization, sanctions compliance or user intent. Validate the token against the elected registry, bind the expectation to an authenticated intent, verify custody/balance changes, and consume its canonical settlement identity atomically with the applicable accounting. A compromised token can emit misleading logs.

The module can verify a deposit, payout or zero-recipient burn event when given the exact expected parties. It does not infer event purpose from the log. Source, vault and recipient expectations must come from approved operations. USDC metadata remains sourced from the chain-specific initial-master configuration and the governed active election. No production providers or funding are configured by this change.

Local tests exercise native-USDC-shaped synthetic events, chain and asset substitutions, failed/unfinalized/noncanonical receipts, removed or mismatched logs, amount precision and size limits, duplicate source IDs and independent block disagreements. Hosted adapter integration remains pending.

Sources

- https://ethereum.org/developers/docs/apis/json-rpc/
- https://eips.ethereum.org/EIPS/eip-20
- https://docs.base.org/base-chain/api-reference/ethereum-json-rpc-api/eth_getTransactionCount

## HTTPS transport

HttpsChainReader provides the three required read-only Ethereum RPC methods over a configured HTTPS endpoint. It validates method/parameter shapes before sending, forbids redirects, sets a 100-30000 ms request timeout (5000 ms default), limits response bodies to 2 MiB, validates the JSON-RPC envelope and replaces provider errors with a generic failure. API headers and endpoint paths can contain secrets and must be injected through trusted deployment configuration. They are never accepted from customer requests or included in returned error messages.

Transport tests use synthetic fetch responses to verify request selection, redirect/timeout options, envelope validation, oversized responses and credential-safe errors. No production endpoints, provider accounts, stored credentials or paid services are configured. Production endpoint independence, availability, authorization and latency must be verified separately.
