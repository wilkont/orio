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

export interface ProtocolResponse {status:number;headers:Record<string,string>;body:unknown}
/** One fixed public-metadata route table shared by HTTP and Lambda transports. */
export async function protocolResponse(reader:Pick<ProtocolReader,'master'>,method:string,url:string):Promise<ProtocolResponse>{
 const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const send=(status:number,body:unknown)=>({status,headers,body});
 if(method!=='GET'){headers.Allow='GET';return send(405,{error:'method_not_allowed'});}
 const path=url.split('?',1)[0];
 if(path==='/health')return send(200,{status:'ok'});
 if(path==='/v1/protocol/policy')return send(200,publicMonetaryPolicy());
 if(path!=='/v1/protocol/master'&&path!=='/ready')return send(404,{error:'not_found'});
 try{
  const master=await reader.master();
  return path==='/ready'?send(200,{status:'ok',service:'protocol-metadata'}):send(200,{master,financialExecutionEnabled:false});
 }catch{return send(503,{error:'protocol_state_unavailable'});}
}
/** Exposes public protocol metadata only. Workload permissions restrict the reader. */
export function createProtocolServer(reader:Pick<ProtocolReader,'master'>):Server{
 const server=createServer(async(request,response)=>{
  const result=await protocolResponse(reader,request.method??'',request.url??'/');
  response.writeHead(result.status,result.headers);response.end(JSON.stringify(result.body));
 });
 server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 return server;
}
