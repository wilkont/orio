import type { Pool } from 'pg';

export interface EntryIntent {
  intentId: string;
  ownerRef: string;
  sourceAssetId: string;
  sourceUnits: string;
  electionId: string;
  reserveVaultId: string;
  minimumMasterUnits: string;
  quoteDigest: string;
  quoteExpiresAt: string;
}

export type EntryEventKind = 'DEPOSIT_CONFIRMED' | 'CONVERSION_STARTED' |
  'MASTER_RECEIVED' | 'CONVERSION_FAILED' | 'REFUND_CONFIRMED';

export interface EntryEvent {
  eventId: string;
  intentId: string;
  expectedVersion: string;
  kind: EntryEventKind;
  evidence: Record<string, unknown>;
}

const positiveUnits = /^[1-9][0-9]{0,77}$/;

/** Trusted internal control writer. Independent adapter verification precedes all calls. */
export class ConversionEntries {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async open(intent: EntryIntent): Promise<void> {
    if (typeof intent.sourceUnits !== 'string' || !positiveUnits.test(intent.sourceUnits) ||
        typeof intent.minimumMasterUnits !== 'string' || !positiveUnits.test(intent.minimumMasterUnits))
      throw new Error('Conversion quantities must be canonical positive integer strings');
    const values = [intent.intentId, intent.ownerRef, intent.sourceAssetId, intent.sourceUnits,
      intent.electionId, intent.reserveVaultId, intent.minimumMasterUnits, intent.quoteDigest, intent.quoteExpiresAt];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO orio_conversion.entries
        (intent_id,owner_ref,source_asset_id,source_units,election_id,reserve_vault_id,
         minimum_master_units,quote_digest,quote_expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz)
        ON CONFLICT (intent_id) DO NOTHING`, values);
      const matching = await client.query(`SELECT intent_id FROM orio_conversion.entries
        WHERE intent_id=$1 AND owner_ref=$2 AND source_asset_id=$3 AND source_units=$4
          AND election_id=$5 AND reserve_vault_id=$6 AND minimum_master_units=$7
          AND quote_digest=$8 AND quote_expires_at=$9::timestamptz`, values);
      if (matching.rowCount !== 1) throw new Error('Conversion intent idempotency conflict');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async record(event: EntryEvent): Promise<{ state: string; version: string }> {
    if (typeof event.expectedVersion !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(event.expectedVersion))
      throw new Error('Invalid conversion version');
    const result = await this.pool.query<{ resulting_state: string; resulting_version: string }>(
      'SELECT resulting_state,resulting_version FROM orio_conversion.record_event($1,$2,$3,$4,$5::jsonb)',
      [event.eventId, event.intentId, event.expectedVersion, event.kind, JSON.stringify(event.evidence)]);
    const row = result.rows[0];
    if (!row) throw new Error('Missing conversion event receipt');
    return { state: row.resulting_state, version: row.resulting_version };
  }
}
