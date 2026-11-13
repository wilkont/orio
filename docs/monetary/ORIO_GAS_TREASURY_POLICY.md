# Gas Treasury policy

The company owns and operates a dedicated ETH execution treasury. It must never use customer monetary backing, genesis escrow, rounding residuals or holder appreciation to replenish gas. User gas prepayments and pending refunds remain separately identifiable obligations. Collected non-ETH denominations must be reconciled independently from ETH expenditures; a bookkeeping reimbursement does not perform an exchange.

Use separate custody, scoped signer permissions, explicit EntryPoint/paymaster/relayer allowlists, call and per-user limits, nonce management and independently monitored expenditure caps. Separate routine replenishment authority from treasury withdrawal and emergency governance. Legal and custody arrangements, signer technology and operational limits require qualification before use; no production values or wallets are created here.

The local controller earmarks company ETH at the full quoted cap, preventing competing operations from reserving the same liquidity. It refuses execution preparation without a funded reservation. Low treasury balances block new reservations; customer claims are preserved. Actual spent ETH becomes an expense, including known failures, without automatic customer charging.

Required operational integration: measured runway and low-balance/critical alerts; bounded auto-replenishment from approved company funds through authenticated swap/custody adapters; independent quotes/slippage policy; pending-funding finality; relayer and RPC failover; aggregate spend and abuse controls; emergency reserve; on-call procedures and recovery rehearsal. Limits, thresholds, counterparties and failure charges must be approved. Automatic replenishment is not implemented or claimed by the local tests.

If actual fees exceed reserved ETH, retain evidence, stop automatic settlement and create a reconciliation/recovery obligation. Do not silently borrow from other reserves. Review resolves the actual company expenditure, cap shortfall, user consent and compensating journals. Network outages can interrupt service; no uninterrupted-execution guarantee is made.
