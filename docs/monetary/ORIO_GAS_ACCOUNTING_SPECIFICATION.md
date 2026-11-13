# Gas accounting specification

Migration 008 creates owner-only append-only reservations, submissions, costs and closures under orio_gas. It grants no public or workload permissions. GasControls is a trusted internal writer, not an authenticated customer API. The schema owner remains privileged; independent checkpoints and operator controls are still required. Native-chain and payment-asset journals must each balance independently.

| Stage | Debit | Credit |
| --- | --- | --- |
| Independently verified prepayment funding | Segregated gas cash/asset | Customer gas prepayment liability |
| Independently verified company ETH funding | Gas ETH available asset | Company funding source |
| Reserve user maximum | Customer gas prepayment liability | Transaction gas hold liability |
| Reserve company network maximum | Transaction ETH earmark asset | Gas ETH available asset |
| Actual network expenditure | Network expense | Transaction ETH earmark asset |
| Successful settlement | Entire user gas hold liability | Treasury reimbursement clearing plus unused customer prepayment credit |
| Release unused ETH earmark | Gas ETH available asset | Transaction ETH earmark asset |

Opening funding rows in tests are synthetic. Production funding must independently establish ownership, finality and no receipt reuse across protocol obligations. No gas routine can create a prepayment balance, debit a customer monetary-reserve account or assume prepayment collection occurred. Reimbursement clearing is neither company conversion revenue nor independently realized FX profit. Converting the collected payment asset into ETH requires its own authorized execution and reconciled asset journals.

Each reservation retains the exact hashed quote, owner, ORIO transaction identifier, authorization digest, chain, payment denomination, rate evidence, operations and reserve-journal sequence. Each prepared operation has one globally unique execution reference. Each actual cost retains outcome, component amounts, finalized-evidence digest and expense journal. Closure links the charge/refund/remainder result, candidate policy reference and journal. Journal and outbox commit with each control transition; corrections require compensating records.

Same-ID identical reservations/costs/closures replay their prior result. Conflicting retries fail. A reservation row lock serializes preparation, expense and closure; the existing journal head lock serializes balance checks across reservations. Quote expiry is rechecked after reserve journal locks. Only a never-prepared reservation can cancel automatically. Once prepared, ambiguity requires reconciliation.

Over-cap evidence is retained with no expense journal when available reserved ETH cannot cover it; settlement reports UNBOOKED_NETWORK_EXPENSE and holds funds for reviewed recovery. This is an explicit outstanding accounting obligation, not a claim that all expenditure is already booked. Positive fees below payment-unit precision, all failures, missing operations and component/cumulative cap overruns prevent automatic final user charging. No final failure disposition is approved.

Dual-ledger integration still needs authenticated finalized fee adapters, canonical UserOperation/transaction mapping, independent cost allocation, custody balances, outbox delivery/checkpoints and a continuous discrepancy queue. A digest supplied by the owner-only caller is a reference to evidence, not cryptographic proof of authentic user authorization, policy approval or network cost.

Qualification extension: migration 009 adds append-only execution bindings. Before requesting a treasury signature, prepare the deterministic permit reservation reference; once signed, bind the final UserOperation hash and payload digest exactly once before broadcasting. This prevents cancellation of a hold after a permit could become executable. The SDK and qualification paymaster verify independent user/operator EIP-712 consent, while the local bridge test reconciles the actual reference EntryPoint debit. This does not make opaque evidence/policy references in other control methods authentic or qualify public Base finality/custody/cost attribution.

Migration 009 also backfills one immutable execution-claim registry under a source-table lock. Both direct preparations and final bindings claim the same namespace. Competing operations cannot claim one execution through different tables, including concurrent inserts. The same operation may retain its prepared reservation reference and its final bound hash without representing two expenditures. Existing history and receipt ownership remain preserved.
