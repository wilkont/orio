# Gas abstraction architecture

Selected architecture for engineering: a smart account authorizes the business action and a separate maximum gas payment; a narrowly scoped paymaster/relayer is funded by company ETH. The controller validates complete fee/rate evidence, reserves user gas funds and company ETH, then persists the exact signed-operation reference before broadcast. This prevents circular funding and uncertain-submission retries under a new identity. No provider is provisioned and no signing key or live paymaster is included.

Base estimates must include execution and L1 data/security costs; adapters must also explicitly account for any network-specific additional component. Do not copy OP Mainnet parameters into Base automatically. Each quote operation includes execution gas limit, maximum fee per gas, L1 cap and an explicit other-network-fee cap. Those inputs must come from authenticated, current network-specific estimators. A zero extra component is an explicit adapter assertion, not a guessed default.

ERC-4337 estimates must cover account deployment when needed, validation, pre-verification/bundle overhead, paymaster validation/post-operation and all business calls. Actual costs must be attributed to one user operation. Never bill each bundled user for the entire outer transaction, or double-count a component already included in UserOperation cost. Bind canonical EntryPoint version/address, smart-account implementation, nonce, operation hash, paymaster validity window and chain in the future execution adapter.

Flow: complete quote → authenticated maximum authorization → pre-funded gas hold → deterministic preparation → broadcast → independent finalized receipt verification → actual ETH expense → reconciliation → authorized user reimbursement and unused credit. An uncertain submission queries the same operation identity; it does not automatically replace it. Replacement/failover may rebroadcast the same signed operation, but a new operation requires an independently safe nonce/replacement and authorization procedure.

Implemented: integer quote/reconciliation core; PostgreSQL prepayment/ETH holds, immutable submissions/costs/closures and final execution bindings; atomic journal/outbox integration; policy metadata. A qualification-only smart account, factory and dual-signed EIP-712 paymaster now execute through the pinned reference EntryPoint in an offline VM. The SDK binds actual reservation journals; the bridge test reconciles the final local EntryPoint debit and unused credit. These contracts reject mainnet deployment.

Before treasury signing, commit a reservation-specific prepared slot; after signing, bind the final UserOperation hash before broadcast. This closes the cancellation gap when a signer or process crashes. Migration 009 preserves the binding and refuses replacements of uncertain execution identities. See docs/qualification/PAYMASTER_QUALIFICATION.md.

Not implemented/qualified: public-network deployment, bundler validation-rule traces/staking, consumer signing/recovery, live estimator/finality and Base cost attribution, token collection/exchange conversion, automatic replenishment, UI/statement wiring or live end-to-end abstraction. Release requires these integrations plus approved economics and independent qualification.

Sources inspected November 13, 2026:

- [Base network fees](https://docs.base.org/specifications/transactions/network-fees)
- [ERC-4337 specification](https://eips.ethereum.org/EIPS/eip-4337)
- [OP Stack fee components](https://docs.optimism.io/op-stack/transactions/fees), reference only; deployment parameters must be verified for Base.
