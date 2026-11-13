import type { Pool, PoolClient } from 'pg';
import type { Posting, Receipt } from './ledger.ts';
import { gasDigest, gasReference, gasUnits, reconcileGas, validateGasCost, validateGasQuote } from './gas-policy.ts';
import type { GasCost, GasQuote } from './gas-policy.ts';

export interface GasAuthorization {
  ownerRef: string;
  quoteDigest: string;
  actionDigest: string;
  maximumPaymentUnits: string;
  authorizationDigest: string;
}
export function gasAccounts(quote: Pick<GasQuote, 'ownerRef' | 'paymentAsset' | 'chainId' | 'transactionId'>) {
  const ownerAsset = gasDigest([quote.ownerRef, quote.paymentAsset]);
  const transaction = gasDigest(quote.transactionId);
  return {
    prepaid: 'gas_prepaid_' + ownerAsset, held: 'gas_held_' + transaction,
    reimbursement: 'gas_reimbursement_' + gasDigest(quote.paymentAsset),
    ethAvailable: 'gas_eth_available_' + quote.chainId, ethHeld: 'gas_eth_held_' + transaction,
    expense: 'gas_network_expense_' + quote.chainId,
  };
}
interface Reservation { quote: GasQuote; authorization_digest: string; reserve_sequence: string }
interface Closure { kind: 'SETTLED' | 'CANCELLED'; result: ReturnType<typeof reconcileGas> | { refundUnits: string }; policy_digest: string | null; journal_sequence: string }
function unbookedExpense(quote: GasQuote, item: { evidence: GasCost; expense_sequence: string | null }): boolean {
  return !item.expense_sequence && validateGasCost(quote, item.evidence) > 0n;
}
const postings = (items: Posting[]): Posting[] => items.filter(item => gasUnits(item.units) > 0n);

/** Owner-only local control writer, not a user API or relayer. Authentication, custody, finalized
 * receipts, monetary-policy approval and release qualification are independent prerequisites. */
export class GasControls {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await run(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async account(client: PoolClient, id: string, asset: string, side: 'debit' | 'credit') {
    await client.query('SELECT orio_ledger.create_account($1,$2,$3,false)', [id, asset, side]);
  }
  private async journal(client: PoolClient, id: string, description: string, entries: Posting[]): Promise<Receipt> {
    const result = await client.query<{ sequence: string; request_hash: string; event_hash: string }>(
      'SELECT sequence,request_hash,event_hash FROM orio_ledger.post_journal($1,$1,$2,$3::jsonb)',
      [id, description, JSON.stringify(postings(entries))]);
    const row = result.rows[0];
    if (!row) throw new Error('Missing gas journal');
    return { sequence: row.sequence, requestHash: row.request_hash, eventHash: row.event_hash };
  }
  private async locked(client: PoolClient, transactionId: string): Promise<Reservation> {
    gasReference(transactionId);
    const result = await client.query<Reservation>(
      'SELECT * FROM orio_gas.reservations WHERE transaction_id=$1 FOR UPDATE', [transactionId]);
    const row = result.rows[0];
    if (!row) throw new Error('Missing gas reservation');
    return row;
  }
  private async closure(client: PoolClient, transactionId: string): Promise<Closure | undefined> {
    return (await client.query<Closure>('SELECT * FROM orio_gas.closures WHERE transaction_id=$1', [transactionId])).rows[0];
  }
  private async now(client: PoolClient): Promise<string> {
    return (await client.query<{ time: Date }>('SELECT clock_timestamp() AS time')).rows[0]!.time.toISOString();
  }

  /** Both gas prepayment liability and company-owned ETH must already be independently funded.
   * No customer monetary-reserve account is accepted as a funding source. */
  async reserve(quote: GasQuote, authorization: GasAuthorization): Promise<string> {
    quote = structuredClone(quote); authorization = structuredClone(authorization);
    validateGasQuote(quote, quote.estimatedAt);
    if (quote.paymentMethod !== 'PREPAID') throw new Error('Gas collection adapter required for non-prepaid payment');
    if (authorization.ownerRef !== quote.ownerRef || authorization.quoteDigest !== quote.digest ||
        authorization.actionDigest !== quote.actionDigest || authorization.maximumPaymentUnits !== quote.maximumPaymentUnits ||
        typeof authorization.authorizationDigest !== 'string' || !/^[a-f0-9]{64}$/.test(authorization.authorizationDigest))
      throw new Error('Gas authorization does not bind the quote');
    return this.transaction(async client => {
      // Serialize same-ID creation even before a reservation row exists. Other transactions may
      // share a hash lock conservatively; they cannot share money or receipt identities.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['orio_gas:' + quote.transactionId]);
      const previous = await client.query<Reservation>('SELECT * FROM orio_gas.reservations WHERE transaction_id=$1', [quote.transactionId]);
      if (previous.rows[0]) {
        if (gasDigest(previous.rows[0].quote) !== gasDigest(quote) || previous.rows[0].authorization_digest !== authorization.authorizationDigest)
          throw new Error('Gas reservation idempotency conflict');
        return previous.rows[0].reserve_sequence;
      }
      validateGasQuote(quote, await this.now(client));
      const accounts = gasAccounts(quote), ethAsset = 'native:' + quote.chainId + ':ETH';
      await this.account(client, accounts.prepaid, quote.paymentAsset, 'credit');
      await this.account(client, accounts.held, quote.paymentAsset, 'credit');
      await this.account(client, accounts.ethAvailable, ethAsset, 'debit');
      await this.account(client, accounts.ethHeld, ethAsset, 'debit');
      const receipt = await this.journal(client, 'gas_reserve:' + gasDigest(quote.transactionId), 'Reserve user gas prepayment and company ETH', [
        { accountId: accounts.prepaid, side: 'debit', units: quote.maximumPaymentUnits },
        { accountId: accounts.held, side: 'credit', units: quote.maximumPaymentUnits },
        { accountId: accounts.ethAvailable, side: 'credit', units: quote.maximumNetworkWei },
        { accountId: accounts.ethHeld, side: 'debit', units: quote.maximumNetworkWei },
      ]);
      validateGasQuote(quote, await this.now(client));
      await client.query('INSERT INTO orio_gas.reservations VALUES($1,$2::jsonb,$3,$4)',
        [quote.transactionId, JSON.stringify(quote), authorization.authorizationDigest, receipt.sequence]);
      return receipt.sequence;
    });
  }

  /** Persist the deterministic signed-operation reference BEFORE any broadcast. A retry must
   * query the same reference; an uncertain broadcast cannot allocate another execution slot. */
  async prepare(transactionId: string, operationId: string, executionRef: string, callDigest: string): Promise<void> {
    gasReference(executionRef);
    await this.transaction(async client => {
      const { quote } = await this.locked(client, transactionId);
      const operation = quote.operations.find(item => item.operationId === operationId);
      if (!operation || operation.callDigest !== callDigest) throw new Error('Gas execution differs from authorized call');
      const prior = await client.query<{ execution_ref: string }>('SELECT execution_ref FROM orio_gas.submissions WHERE transaction_id=$1 AND operation_id=$2', [transactionId, operationId]);
      if (prior.rows[0]) {
        if (prior.rows[0].execution_ref !== executionRef) throw new Error('Uncertain gas execution cannot be resubmitted under another reference');
        return;
      }
      if (await this.closure(client, transactionId)) throw new Error('Gas reservation is closed');
      validateGasQuote(quote, await this.now(client));
      const costs = await this.costs(client, transactionId);
      const reconciliation = reconcileGas(quote, costs.map(item => item.evidence));
      if (costs.some(item => unbookedExpense(quote, item)) ||
          reconciliation.reasons.some(reason => reason !== 'INCOMPLETE_EXECUTION'))
        throw new Error('Gas execution requires review');
      await client.query('INSERT INTO orio_gas.submissions(transaction_id,operation_id,execution_ref) VALUES($1,$2,$3)', [transactionId, operationId, executionRef]);
    });
  }
  private async costs(client: PoolClient, transactionId: string) {
    return (await client.query<{ evidence: GasCost; expense_sequence: string | null }>(
      'SELECT evidence,expense_sequence FROM orio_gas.costs WHERE transaction_id=$1 ORDER BY operation_id', [transactionId])).rows;
  }

  /** Receipt adapters must authenticate finality, actual fees and per-user-operation allocation.
   * Never submit the entire bundler transaction cost once for each user. */
  async recordCost(transactionId: string, cost: GasCost): Promise<'RECORDED' | 'REVIEW_REQUIRED'> {
    cost = structuredClone(cost);
    return this.transaction(async client => {
      const { quote } = await this.locked(client, transactionId);
      const amount = validateGasCost(quote, cost);
      const prior = (await client.query<{ evidence: GasCost; expense_sequence: string | null }>(
        'SELECT evidence,expense_sequence FROM orio_gas.costs WHERE transaction_id=$1 AND operation_id=$2', [transactionId, cost.operationId])).rows[0];
      if (prior) {
        if (gasDigest(prior.evidence) !== gasDigest(cost)) throw new Error('Conflicting gas execution receipt');
        return !unbookedExpense(quote, prior) && cost.outcome === 'SUCCESS' ? 'RECORDED' : 'REVIEW_REQUIRED';
      }
      if (await this.closure(client, transactionId)) throw new Error('Gas reservation is closed');
      const submission = (await client.query<{ execution_ref: string }>('SELECT execution_ref FROM orio_gas.submissions WHERE transaction_id=$1 AND operation_id=$2', [transactionId, cost.operationId])).rows[0];
      if (!submission || submission.execution_ref !== cost.executionRef) throw new Error('Gas receipt does not match prepared execution');
      const existing = await this.costs(client, transactionId);
      const booked = existing.filter(item => item.expense_sequence).reduce((sum, item) => sum + validateGasCost(quote, item.evidence), 0n);
      let sequence: string | null = null;
      // Preserve over-cap evidence without inventing an extra debit or silently drawing reserves.
      // Its unbooked network expenditure remains an explicit reconciliation/recovery obligation.
      if (amount > 0n && booked + amount <= gasUnits(quote.maximumNetworkWei)) {
        const accounts = gasAccounts(quote);
        await this.account(client, accounts.expense, 'native:' + quote.chainId + ':ETH', 'debit');
        sequence = (await this.journal(client, 'gas_cost:' + gasDigest([transactionId, cost.operationId]), 'Actual Base gas expenditure', [
          { accountId: accounts.expense, side: 'debit', units: amount.toString() },
          { accountId: accounts.ethHeld, side: 'credit', units: amount.toString() },
        ])).sequence;
      }
      await client.query('INSERT INTO orio_gas.costs VALUES($1,$2,$3::jsonb,$4)', [transactionId, cost.operationId, JSON.stringify(cost), sequence]);
      return (sequence || amount === 0n) && cost.outcome === 'SUCCESS' ? 'RECORDED' : 'REVIEW_REQUIRED';
    });
  }

  /** Candidate floor-rounding policy: policyDigest is a trusted approval reference, not proof
   * of approval. This method is not wired to a public or live financial execution route. */
  async settle(transactionId: string, policyDigest: string): Promise<ReturnType<typeof reconcileGas>> {
    if (typeof policyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(policyDigest)) throw new Error('Missing gas settlement policy approval reference');
    return this.transaction(async client => {
      const { quote } = await this.locked(client, transactionId);
      const previous = await this.closure(client, transactionId);
      if (previous) {
        if (previous.kind !== 'SETTLED' || previous.policy_digest !== policyDigest) throw new Error('Gas closure conflict');
        return previous.result as ReturnType<typeof reconcileGas>;
      }
      const costs = await this.costs(client, transactionId);
      const result = reconcileGas(quote, costs.map(item => item.evidence));
      if (result.status === 'REVIEW_REQUIRED' || costs.some(item => unbookedExpense(quote, item))) return {
        ...result, status: 'REVIEW_REQUIRED', chargeUnits: null, refundUnits: null,
        reasons: [...new Set([...result.reasons, ...(costs.some(item => unbookedExpense(quote, item)) ? ['UNBOOKED_NETWORK_EXPENSE'] : [])])],
      };
      const accounts = gasAccounts(quote), ethRemainder = gasUnits(quote.maximumNetworkWei) - gasUnits(result.actualNetworkWei);
      await this.account(client, accounts.reimbursement, quote.paymentAsset, 'credit');
      const receipt = await this.journal(client, 'gas_close:' + gasDigest(transactionId), 'Gas reimbursement and unused prepayment credit', [
        { accountId: accounts.held, side: 'debit', units: quote.maximumPaymentUnits },
        { accountId: accounts.prepaid, side: 'credit', units: result.refundUnits! },
        { accountId: accounts.reimbursement, side: 'credit', units: result.chargeUnits! },
        { accountId: accounts.ethAvailable, side: 'debit', units: ethRemainder.toString() },
        { accountId: accounts.ethHeld, side: 'credit', units: ethRemainder.toString() },
      ]);
      await client.query('INSERT INTO orio_gas.closures VALUES($1,$2,$3::jsonb,$4,$5)', [transactionId, 'SETTLED', JSON.stringify(result), policyDigest, receipt.sequence]);
      return result;
    });
  }

  async cancelUnsubmitted(transactionId: string): Promise<void> {
    await this.transaction(async client => {
      const { quote } = await this.locked(client, transactionId), previous = await this.closure(client, transactionId);
      if (previous?.kind === 'CANCELLED') return;
      if (previous) throw new Error('Gas reservation is closed');
      if ((await client.query('SELECT 1 FROM orio_gas.submissions WHERE transaction_id=$1', [transactionId])).rowCount)
        throw new Error('Prepared execution requires reconciliation, not cancellation');
      const accounts = gasAccounts(quote);
      const receipt = await this.journal(client, 'gas_close:' + gasDigest(transactionId), 'Release unsubmitted gas reservation', [
        { accountId: accounts.held, side: 'debit', units: quote.maximumPaymentUnits },
        { accountId: accounts.prepaid, side: 'credit', units: quote.maximumPaymentUnits },
        { accountId: accounts.ethAvailable, side: 'debit', units: quote.maximumNetworkWei },
        { accountId: accounts.ethHeld, side: 'credit', units: quote.maximumNetworkWei },
      ]);
      await client.query('INSERT INTO orio_gas.closures VALUES($1,$2,$3::jsonb,NULL,$4)',
        [transactionId, 'CANCELLED', JSON.stringify({ refundUnits: quote.maximumPaymentUnits }), receipt.sequence]);
    });
  }
}
