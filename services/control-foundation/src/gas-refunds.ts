import type { Pool, PoolClient } from 'pg';
import type { Receipt, Posting } from './ledger.ts';
import type { ChainReader } from './chain-evidence.ts';
import { chainAddress } from './chain-evidence.ts';
import { gasAccounts } from './gas-controls.ts';
import { gasDigest, gasReference, gasUnits, validateGasQuote } from './gas-policy.ts';
import type { GasQuote } from './gas-policy.ts';
import { verifyFinalizedTokenTransfer } from './finalized-transfer.ts';
import { verifyFinalizedUserOperation } from './finalized-user-operation.ts';

export interface GasRefundRequest {
  refundId: string; ownerRef: string; assetId: string; units: string;
  gasTransactionId: string; authorizationDigest: string;
}
export interface GasRefundExecution { operationId: string; userOperationHash: string; nonce: string; userOperationLogIndex: string }
export interface GasRefundDeployment { entryPointAddress: string; paymasterAddress: string }
export function gasRefundActionDigest(request: Pick<GasRefundRequest, 'refundId' | 'ownerRef' | 'assetId' | 'units'>): string {
  return gasDigest({ kind: 'GAS_PREPAYMENT_REFUND', refundId: request.refundId,
    ownerRef: request.ownerRef, assetId: request.assetId, units: request.units });
}
function cashAccount(assetId: string, treasury: string) { return 'gas_cash_' + gasDigest([assetId, treasury]); }
function holdAccount(refundId: string) { return 'gas_refund_' + gasDigest(refundId); }
interface Row { refund_id: string; owner_ref: string; asset_id: string; units: string;
  gas_transaction_id: string; authorization_digest: string; journal_sequence: string }

/** Trusted owner-only custody accounting. No payout broadcast and no public API.
 * Authenticate request ownership/consent first. Each withdrawal reserves a separately quoted
 * user-paid gas action; this is not an ORIO redemption or conversion-fee event. */
export class GasRefunds {
  private readonly pool: Pool;
  private readonly deployment: GasRefundDeployment;
  constructor(pool: Pool, deployment: GasRefundDeployment) {
    this.pool = pool;
    this.deployment = { entryPointAddress: chainAddress(deployment.entryPointAddress), paymasterAddress: chainAddress(deployment.paymasterAddress) };
  }
  private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await run(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  private async post(client: PoolClient, key: string, ref: string, postings: Posting[]): Promise<Receipt> {
    const row = (await client.query<{ sequence: string; request_hash: string; event_hash: string }>(
      'SELECT sequence,request_hash,event_hash FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',
      [key, ref, 'Segregated gas prepayment withdrawal', JSON.stringify(postings)])).rows[0];
    if (!row) throw new Error('Missing gas refund journal');
    return { sequence: row.sequence, requestHash: row.request_hash, eventHash: row.event_hash };
  }
  async open(request: GasRefundRequest): Promise<void> {
    request = structuredClone(request); gasReference(request.refundId); gasReference(request.gasTransactionId);
    if (chainAddress(request.ownerRef) !== request.ownerRef || gasUnits(request.units, true) >= (1n << 256n) ||
        typeof request.authorizationDigest !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(request.authorizationDigest))
      throw new Error('Invalid gas withdrawal request');
    await this.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['orio_gas_refund:' + request.refundId]);
      const prior = (await client.query<Row>('SELECT * FROM orio_gas.refund_requests WHERE refund_id=$1', [request.refundId])).rows[0];
      if (prior) {
        if (prior.owner_ref !== request.ownerRef || prior.asset_id !== request.assetId || prior.units !== request.units ||
            prior.gas_transaction_id !== request.gasTransactionId || prior.authorization_digest !== request.authorizationDigest)
          throw new Error('Gas withdrawal idempotency conflict');
        return;
      }
      const asset = (await client.query<{ chain_id: '8453' | '84532' }>('SELECT chain_id FROM orio_gas.funding_assets WHERE asset_id=$1', [request.assetId])).rows[0];
      const quote = (await client.query<{ quote: GasQuote }>('SELECT quote FROM orio_gas.reservations WHERE transaction_id=$1 FOR UPDATE', [request.gasTransactionId])).rows[0]?.quote;
      if (!asset || !quote || quote.ownerRef !== request.ownerRef || quote.action !== 'OTHER' ||
          quote.actionDigest !== gasRefundActionDigest(request) || quote.chainId !== asset.chain_id)
        throw new Error('Withdrawal requires its own authorized gas reservation');
      if ((await client.query('SELECT 1 FROM orio_gas.closures WHERE transaction_id=$1', [request.gasTransactionId])).rowCount)
        throw new Error('Withdrawal gas reservation is already closed');
      const prepaid = gasAccounts({ ...quote, paymentAsset: request.assetId }).prepaid;
      const hold = holdAccount(request.refundId);
      await client.query("SELECT orio_ledger.create_account($1,$2,'credit',false)", [hold, request.assetId]);
      const key = 'gas_refund_hold:' + gasDigest(request.refundId);
      const journal = await this.post(client, key, key, [
        { accountId: prepaid, side: 'debit', units: request.units }, { accountId: hold, side: 'credit', units: request.units }]);
      const now = (await client.query<{ time: Date }>('SELECT clock_timestamp() AS time')).rows[0]!.time.toISOString();
      validateGasQuote(quote, now); // Recheck after waiting on journal/balance locks.
      await client.query('INSERT INTO orio_gas.refund_requests VALUES($1,$2,$3,$4,$5,$6,$7)',
        [request.refundId, request.ownerRef, request.assetId, request.units, request.gasTransactionId, request.authorizationDigest, journal.sequence]);
    });
  }

  async observe(refundId: string, transactionHash: string, logIndex: string, execution: GasRefundExecution,
    first: ChainReader, second: ChainReader): Promise<Receipt> {
    execution = structuredClone(execution);
    gasReference(refundId);
    const row = (await this.pool.query<Row & { chain_id: string; token_address: string; treasury_address: string }>(
      'SELECT r.*,a.chain_id,a.token_address,a.treasury_address FROM orio_gas.refund_requests r JOIN orio_gas.funding_assets a USING(asset_id) WHERE refund_id=$1', [refundId])).rows[0];
    if (!row) throw new Error('Missing gas withdrawal');
    if ((await this.pool.query('SELECT 1 FROM orio_gas.refund_closures WHERE refund_id=$1', [refundId])).rowCount)
      throw new Error('Gas withdrawal was cancelled');
    const evidence = await verifyFinalizedTokenTransfer(first, second, { chainId: row.chain_id,
      tokenAddress: row.token_address, senderAddress: row.treasury_address, recipientAddress: row.owner_ref,
      transactionHash, logIndex, units: row.units });
    const operation = await verifyFinalizedUserOperation(first, second, { chainId: row.chain_id,
      entryPointAddress: this.deployment.entryPointAddress, paymasterAddress: this.deployment.paymasterAddress,
      accountAddress: row.owner_ref, userOperationHash: execution.userOperationHash, nonce: execution.nonce,
      transactionHash, logIndex: execution.userOperationLogIndex });
    if (!operation.success || operation.blockHash !== evidence.blockHash || operation.blockNumber !== evidence.blockNumber ||
        BigInt(logIndex) <= BigInt(operation.executionBoundaryLogIndex) || BigInt(logIndex) >= BigInt(operation.logIndex))
      throw new Error('Payout is not inside the authorized successful UserOperation');
    const settlementEvidence = { ...evidence, gasExecutionRef: operation.executionRef, gasEvidenceDigest: operation.evidenceDigest };
    return this.transaction(async client => {
      await client.query('SELECT 1 FROM orio_gas.refund_requests WHERE refund_id=$1 FOR UPDATE', [refundId]);
      if ((await client.query('SELECT 1 FROM orio_gas.refund_closures WHERE refund_id=$1', [refundId])).rowCount)
        throw new Error('Gas withdrawal was cancelled');
      await client.query('SELECT 1 FROM orio_gas.reservations WHERE transaction_id=$1 FOR UPDATE', [row.gas_transaction_id]);
      const binding = (await client.query<{ execution_ref: string }>('SELECT execution_ref FROM orio_gas.execution_bindings WHERE transaction_id=$1 AND operation_id=$2', [row.gas_transaction_id, execution.operationId])).rows[0];
      if (binding?.execution_ref !== operation.executionRef ||
          (await client.query("SELECT 1 FROM orio_gas.closures WHERE transaction_id=$1 AND kind='CANCELLED'", [row.gas_transaction_id])).rowCount)
        throw new Error('Payout gas execution is not bound to the withdrawal reservation');
      const prior = (await client.query<{ evidence: unknown; journal_sequence: string }>('SELECT evidence,journal_sequence FROM orio_gas.refund_receipts WHERE refund_id=$1', [refundId])).rows[0];
      if (prior && gasDigest(prior.evidence) !== gasDigest(settlementEvidence)) throw new Error('Gas payout evidence conflict');
      await client.query("INSERT INTO orio_settlement.receipt_claims VALUES($1,'gas-refund',$2) ON CONFLICT DO NOTHING", [evidence.settlementRef, refundId]);
      const claim = (await client.query<{ consumer: string; operation_id: string }>(
        'SELECT consumer,operation_id FROM orio_settlement.receipt_claims WHERE external_ref=$1', [evidence.settlementRef])).rows[0];
      if (claim?.consumer !== 'gas-refund' || claim.operation_id !== refundId) throw new Error('Finalized receipt already belongs to another operation');
      const journal = await this.post(client, 'gas_refund_paid:' + gasDigest(refundId), evidence.settlementRef, [
        { accountId: holdAccount(refundId), side: 'debit', units: row.units },
        { accountId: cashAccount(row.asset_id, row.treasury_address), side: 'credit', units: row.units }]);
      if (!prior) await client.query('INSERT INTO orio_gas.refund_receipts VALUES($1,$2,$3::jsonb,$4)',
        [refundId, evidence.settlementRef, JSON.stringify(settlementEvidence), journal.sequence]);
      return journal;
    });
  }

  /** Customer-authorized cancellation is safe only before any gas preparation/signing barrier.
   * Refund the withdrawal and user gas holds plus company ETH in one database transaction. */
  async cancelUnsubmitted(refundId: string): Promise<void> {
    gasReference(refundId);
    await this.transaction(async client => {
      const row = (await client.query<Row>('SELECT * FROM orio_gas.refund_requests WHERE refund_id=$1 FOR UPDATE', [refundId])).rows[0];
      if (!row) throw new Error('Missing gas withdrawal');
      if ((await client.query('SELECT 1 FROM orio_gas.refund_closures WHERE refund_id=$1', [refundId])).rowCount) return;
      const quote = (await client.query<{ quote: GasQuote }>('SELECT quote FROM orio_gas.reservations WHERE transaction_id=$1 FOR UPDATE', [row.gas_transaction_id])).rows[0]!.quote;
      if ((await client.query('SELECT 1 FROM orio_gas.refund_receipts WHERE refund_id=$1', [refundId])).rowCount ||
          (await client.query('SELECT 1 FROM orio_gas.submissions WHERE transaction_id=$1', [row.gas_transaction_id])).rowCount ||
          (await client.query('SELECT 1 FROM orio_gas.closures WHERE transaction_id=$1', [row.gas_transaction_id])).rowCount)
        throw new Error('Possibly executed withdrawal requires reconciliation, not cancellation');
      const accounts = gasAccounts(quote), refundPrepaid = gasAccounts({ ...quote, paymentAsset: row.asset_id }).prepaid;
      const refundKey = 'gas_refund_cancel:' + gasDigest(refundId);
      const refundJournal = await this.post(client, refundKey, refundKey, [
        { accountId: holdAccount(refundId), side: 'debit', units: row.units },
        { accountId: refundPrepaid, side: 'credit', units: row.units }]);
      const gasKey = 'gas_close:' + gasDigest(row.gas_transaction_id);
      const gasJournal = await this.post(client, gasKey, gasKey, [
        { accountId: accounts.held, side: 'debit', units: quote.maximumPaymentUnits },
        { accountId: accounts.prepaid, side: 'credit', units: quote.maximumPaymentUnits },
        { accountId: accounts.ethAvailable, side: 'debit', units: quote.maximumNetworkWei },
        { accountId: accounts.ethHeld, side: 'credit', units: quote.maximumNetworkWei }]);
      await client.query("INSERT INTO orio_gas.closures VALUES($1,'CANCELLED',$2::jsonb,NULL,$3)",
        [row.gas_transaction_id, JSON.stringify({ refundUnits: quote.maximumPaymentUnits }), gasJournal.sequence]);
      await client.query("INSERT INTO orio_gas.refund_closures VALUES($1,'CANCELLED',$2)", [refundId, refundJournal.sequence]);
    });
  }
}
