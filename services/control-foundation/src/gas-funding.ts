import type { Pool } from 'pg';
import type { Receipt } from './ledger.ts';
import type { ChainReader } from './chain-evidence.ts';
import { chainAddress, chainHash } from './chain-evidence.ts';
import { gasUnits } from './gas-policy.ts';
import { verifyFinalizedTokenTransfer } from './finalized-transfer.ts';

export interface GasFundingIntent {
  fundingId: string; ownerRef: string; assetId: string; units: string; authorizationDigest: string;
}
interface FundingRow {
  funding_id: string; owner_ref: string; asset_id: string; units: string; chain_id: string;
  token_address: string; treasury_address: string;
}
/** Trusted internal writer. Authentication/asset eligibility/treasury custody are prerequisites.
 * This read-only chain adapter never sends funds, mints tokens or elects a master asset. */
export class GasFunding {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async open(intent: GasFundingIntent): Promise<void> {
    intent = structuredClone(intent);
    if (typeof intent.fundingId !== 'string' || !/^[A-Za-z0-9:_-]{1,100}(?![\s\S])/.test(intent.fundingId) ||
        typeof intent.authorizationDigest !== 'string' || !/^[a-f0-9]{64}(?![\s\S])/.test(intent.authorizationDigest))
      throw new Error('Invalid gas funding authorization');
    if (chainAddress(intent.ownerRef) !== intent.ownerRef || gasUnits(intent.units, true) >= (1n << 256n))
      throw new Error('Invalid gas funding owner or units');
    const values = [intent.fundingId, intent.ownerRef, intent.assetId, intent.units, intent.authorizationDigest];
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO orio_gas.funding_intents VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(funding_id) DO NOTHING`, values);
      const matching = await client.query(`SELECT 1 FROM orio_gas.funding_intents WHERE funding_id=$1
        AND owner_ref=$2 AND asset_id=$3 AND units=$4 AND authorization_digest=$5`, values);
      if (matching.rowCount !== 1) throw new Error('Gas funding intent idempotency conflict');
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async observe(fundingId: string, transactionHash: string, logIndex: string,
    first: ChainReader, second: ChainReader): Promise<Receipt> {
    if (typeof fundingId !== 'string' || !/^[A-Za-z0-9:_-]{1,100}(?![\s\S])/.test(fundingId))
      throw new Error('Invalid gas funding identifier');
    const result = await this.pool.query<FundingRow>(`SELECT i.*,a.chain_id,a.token_address,a.treasury_address
      FROM orio_gas.funding_intents i JOIN orio_gas.funding_assets a USING(asset_id) WHERE i.funding_id=$1`, [fundingId]);
    const row = result.rows[0];
    if (!row) throw new Error('Missing gas funding intent or approved asset');
    const evidence = await verifyFinalizedTokenTransfer(first, second, {
      chainId: row.chain_id, tokenAddress: row.token_address, senderAddress: row.owner_ref,
      recipientAddress: row.treasury_address, units: row.units, transactionHash: chainHash(transactionHash), logIndex,
    });
    const credited = await this.pool.query<{ sequence: string; request_hash: string; event_hash: string }>(
      'SELECT sequence,request_hash,event_hash FROM orio_gas.credit_prepayment($1,$2::jsonb)', [fundingId, JSON.stringify(evidence)]);
    const receipt = credited.rows[0];
    if (!receipt) throw new Error('Missing gas funding journal');
    return { sequence: receipt.sequence, requestHash: receipt.request_hash, eventHash: receipt.event_hash };
  }
}
