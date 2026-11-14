import type { Pool } from 'pg';
export interface RedemptionRequest {
  requestId: string; ownerRef: string; tokenAssetId: string; tokenUnits: string;
  payoutAssetId: string; payoutUnits: string; recipientRef: string;
  electionId: string; quoteDigest: string; quoteExpiresAt: string;
}
export type RedemptionEventKind = 'CLAIM_VERIFIED' | 'SETTLEMENT_PREPARED' | 'EXECUTION_UNCERTAIN' | 'SETTLEMENT_CONFIRMED';
/** Trusted internal claim recorder only. Does not reserve, burn or transfer assets. */
export class RedemptionClaims {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }
  async open(request: RedemptionRequest): Promise<void> {
    for (const value of [request.tokenUnits, request.payoutUnits])
      if (typeof value !== 'string' || !/^[1-9][0-9]{0,77}$/.test(value)) throw new Error('Invalid redemption quantity');
    const values=[request.requestId,request.ownerRef,request.tokenAssetId,request.tokenUnits,
      request.payoutAssetId,request.payoutUnits,request.recipientRef,request.electionId,request.quoteDigest,request.quoteExpiresAt];
    const c=await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO orio_redemption.requests VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)
        ON CONFLICT(request_id) DO NOTHING`, values);
      const match=await c.query(`SELECT request_id FROM orio_redemption.requests WHERE request_id=$1 AND owner_ref=$2
        AND token_asset_id=$3 AND token_units=$4 AND payout_asset_id=$5 AND payout_units=$6 AND recipient_ref=$7
        AND election_id=$8 AND quote_digest=$9 AND quote_expires_at=$10::timestamptz`,values);
      if(match.rowCount!==1) throw new Error('Redemption request idempotency conflict');
      await c.query('COMMIT');
    } catch(error) { await c.query('ROLLBACK'); throw error; } finally { c.release(); }
  }
  async record(eventId: string,requestId: string,expectedVersion: string,kind: RedemptionEventKind,evidence: Record<string,unknown>) {
    if(typeof expectedVersion!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(expectedVersion)) throw new Error('Invalid redemption version');
    const result=await this.pool.query<{resulting_state:string;resulting_version:string}>(
      'SELECT resulting_state,resulting_version FROM orio_redemption.record_event($1,$2,$3,$4,$5::jsonb)',
      [eventId,requestId,expectedVersion,kind,JSON.stringify(evidence)]);
    const row=result.rows[0]; if(!row) throw new Error('Missing redemption receipt');
    return {state:row.resulting_state,version:row.resulting_version};
  }
}
