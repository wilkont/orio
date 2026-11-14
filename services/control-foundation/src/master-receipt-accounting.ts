import type { Pool } from 'pg';
import type { Receipt } from './ledger.ts';

/** Trusted internal historical receipt accounting. Does not authorize financial execution. */
export class MasterReceiptAccounting {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async credit(intentId: string, expectedVersion: string): Promise<Receipt> {
    if (typeof expectedVersion !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(expectedVersion))
      throw new Error('Invalid master receipt version');
    const result = await this.pool.query<{ sequence: string; request_hash: string; event_hash: string }>(
      'SELECT sequence,request_hash,event_hash FROM orio_settlement.credit_entry_master($1,$2)',
      [intentId, expectedVersion]);
    const row = result.rows[0];
    if (!row) throw new Error('Missing master accounting receipt');
    return { sequence: row.sequence, requestHash: row.request_hash, eventHash: row.event_hash };
  }
}
