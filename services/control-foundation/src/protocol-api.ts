import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { publicMonetaryPolicy } from './monetary-policy.ts';
import { assertProtocolReaderIdentity } from './protocol-reader-identity.ts';

export interface MasterStatus {
  electionId: string | null;
  state: 'ACTIVE_MASTER' | 'MIGRATING' | 'DEPOSIT_PAUSED' | 'QUARANTINED';
  asset: { assetId: string; chainId: string; tokenAddress: string; decimals: number; issuer: string } | null;
}

export class ProtocolReader {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async master(): Promise<MasterStatus> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query('SET LOCAL search_path=pg_catalog');
      await assertProtocolReaderIdentity(client);
      const result = await client.query<{
      election_id: string | null; state: MasterStatus['state']; asset_id: string | null;
      chain_id: string | null; token_address: string | null; decimals: number | null; issuer: string | null;
    }>(`SELECT c.election_id,c.state,a.asset_id,a.chain_id::text,a.token_address,a.decimals,a.issuer
      FROM orio_master.current_election c
      LEFT JOIN orio_master.elections e USING (election_id)
      LEFT JOIN orio_master.assets a USING (asset_id) WHERE c.singleton`);
      const row = result.rows[0];
      if (!row || result.rowCount !== 1) throw new Error('Missing singleton master registry');
      const status: MasterStatus = {
        electionId: row.election_id,
        state: row.state,
        asset: row.asset_id === null ? null : {
          assetId: row.asset_id, chainId: row.chain_id!, tokenAddress: row.token_address!,
          decimals: row.decimals!, issuer: row.issuer!,
        },
      };
      await client.query('COMMIT');
      return status;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}

/** Exposes public protocol metadata only. Workload permissions must restrict the supplied reader. */
export function createProtocolServer(reader: Pick<ProtocolReader, 'master'>): Server {
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => {
      response.writeHead(status);
      response.end(JSON.stringify(body));
    };
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      send(405, { error: 'method_not_allowed' });
      return;
    }
    const path = (request.url ?? '/').split('?', 1)[0];
    if (path === '/health') {
      send(200, { status: 'ok' });
      return;
    }
    if (path === '/v1/protocol/policy') {
      send(200, publicMonetaryPolicy());
      return;
    }
    if (path !== '/v1/protocol/master' && path !== '/ready') {
      send(404, { error: 'not_found' });
      return;
    }
    try {
      const master = await reader.master();
      if (path === '/ready') {
        send(200, { status: 'ok', service: 'protocol-metadata' });
        return;
      }
      send(200, { master, financialExecutionEnabled: false });
    } catch {
      send(503, { error: 'protocol_state_unavailable' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
