import type {Pool} from 'pg';
import {chainHash,chainObject} from './chain-evidence.ts';
import {gasDigest} from './gas-policy.ts';
import type {HistoryBlock} from './finalized-history.ts';

export interface HistoryConsumer {
 streamId:string;
 consumerId:string;
 handlerDigest:string;
}
export interface HistoryDelivery {
 deliveryId:string;
 blockHash:string;
 height:string;
 receipt:Record<string,unknown>;
}
/** A trusted adapter must verify/import all supported financial events and return
 * durable evidence identities. It must throw on an unsupported required transition.
 * Retrying this deliveryId MUST replay previous imports rather than post twice.
 */
export interface HistoryAcknowledgement {outcome:'IMPORTED'|'NO_FINANCIAL_EFFECT';evidenceReferences:string[]}
export type HistoryHandler=(input:HistoryDelivery)=>Promise<HistoryAcknowledgement>;
function config(input:HistoryConsumer){
 const c=structuredClone(input);
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(c.streamId)||!/^[a-z][a-z0-9_-]{0,63}$/.test(c.consumerId)||!/^[a-f0-9]{64}$/.test(c.handlerDigest))
  throw new Error('Invalid history consumer');
 return c;
}
/** Separate ordered delivery progress, never a discovery cursor. Session advisory
 * lock serializes a consumer without holding a database transaction during RPC work.
 * Handler effects and delivery ACK are intentionally at least once, not a distributed
 * atomic transaction; downstream accounting must use immutable receipt ownership.
 */
export class HistoryDispatch {
 private readonly pool:Pool;
 private readonly config:HistoryConsumer;
 private readonly handle:HistoryHandler;
 constructor(pool:Pool,input:HistoryConsumer,handle:HistoryHandler){this.pool=pool;this.config=config(input);this.handle=handle;}
 async initialize(){
  const c=this.config;
  const stream=(await this.pool.query<{configuration:{firstBlock:string}}>('SELECT configuration FROM orio_history.streams WHERE id=$1',[c.streamId])).rows[0];
  if(!stream||!/^[1-9][0-9]{0,77}$/.test(stream.configuration.firstBlock))throw new Error('Missing history stream');
  await this.pool.query('INSERT INTO orio_history.consumers VALUES($1,$2,$3,$4,0) ON CONFLICT DO NOTHING',
   [c.streamId,c.consumerId,c.handlerDigest,stream.configuration.firstBlock]);
  const row=(await this.pool.query<{handler_digest:string}>('SELECT handler_digest FROM orio_history.consumers WHERE stream_id=$1 AND consumer_id=$2',[c.streamId,c.consumerId])).rows[0];
  if(row?.handler_digest!==c.handlerDigest)throw new Error('History handler revision conflict');
 }
 async dispatchOne():Promise<{state:'WAITING'|'BUSY'|'DELIVERED'|'BLOCK_COMPLETE';height?:string;deliveryId?:string}>{
  const c=this.config,client=await this.pool.connect(),lock='orio-history:'+gasDigest([c.streamId,c.consumerId]);
  let locked=false;
  try{
   locked=(await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[lock])).rows[0]!.locked;
   if(!locked)return {state:'BUSY'};
   const cursor=(await client.query<{handler_digest:string;next_block:string;receipt_offset:number}>(
    'SELECT handler_digest,next_block::text,receipt_offset FROM orio_history.consumers WHERE stream_id=$1 AND consumer_id=$2',[c.streamId,c.consumerId])).rows[0];
   if(!cursor||cursor.handler_digest!==c.handlerDigest)throw new Error('History consumer not initialized');
   const stream=(await client.query<{configuration:{firstBlock:string}}>('SELECT configuration FROM orio_history.streams WHERE id=$1',[c.streamId])).rows[0];
   if(!stream||BigInt(cursor.next_block)<BigInt(stream.configuration.firstBlock))throw new Error('Consumer precedes history stream');
   if(cursor.next_block!==stream.configuration.firstBlock){
    const previous=await client.query('SELECT 1 FROM orio_history.completions WHERE stream_id=$1 AND consumer_id=$2 AND height=$3',
     [c.streamId,c.consumerId,(BigInt(cursor.next_block)-1n).toString()]);
    if(!previous.rowCount)throw new Error('Consumer has no completed predecessor');
   }
   const delivered=(await client.query<{count:string;last:number|null}>(
    'SELECT count(*)::text AS count,max(receipt_offset) AS last FROM orio_history.deliveries WHERE stream_id=$1 AND consumer_id=$2 AND height=$3',
    [c.streamId,c.consumerId,cursor.next_block])).rows[0]!;
   if(Number(delivered.count)!==cursor.receipt_offset||(delivered.last??-1)!==cursor.receipt_offset-1)throw new Error('Consumer skipped receipt acknowledgement');
   const row=(await client.query<{evidence:HistoryBlock;evidence_digest:string}>(
    'SELECT evidence,evidence_digest FROM orio_history.blocks WHERE stream_id=$1 AND height=$2',[c.streamId,cursor.next_block])).rows[0];
   if(!row)return {state:'WAITING',height:cursor.next_block};
   const block=structuredClone(row.evidence);
   if(gasDigest(block)!==row.evidence_digest||block.height!==cursor.next_block||!Array.isArray(block.receipts)||cursor.receipt_offset>block.receipts.length)
    throw new Error('History block evidence conflict');
   chainHash(block.blockHash);
   const offset=cursor.receipt_offset,raw=block.receipts[offset];
   const deliveryId=gasDigest([c.streamId,c.consumerId,c.handlerDigest,block.height,block.blockHash,offset]);
   let result:HistoryAcknowledgement|undefined;
   if(raw){
    const receipt=chainObject(raw);
    if(chainHash(receipt.blockHash)!==block.blockHash||receipt.blockNumber!==block.height)throw new Error('Delivery block identity conflict');
    result=structuredClone(await this.handle({deliveryId,height:block.height,blockHash:block.blockHash,receipt:structuredClone(receipt)}));
    if(!['IMPORTED','NO_FINANCIAL_EFFECT'].includes(result.outcome)||!Array.isArray(result.evidenceReferences)||
      result.evidenceReferences.length<1||result.evidenceReferences.length>10000||
      result.evidenceReferences.some(ref=>typeof ref!=='string'||ref.length<1||ref.length>512)||
      new Set(result.evidenceReferences).size!==result.evidenceReferences.length)throw new Error('Invalid history handler acknowledgement');
   }
   await client.query('BEGIN');
   try{
    const current=(await client.query<{handler_digest:string;next_block:string;receipt_offset:number}>(
     'SELECT handler_digest,next_block::text,receipt_offset FROM orio_history.consumers WHERE stream_id=$1 AND consumer_id=$2 FOR UPDATE',[c.streamId,c.consumerId])).rows[0];
    if(!current||current.handler_digest!==c.handlerDigest||current.next_block!==cursor.next_block||current.receipt_offset!==offset)
     throw new Error('History consumer cursor changed');
    if(raw){
     await client.query('INSERT INTO orio_history.deliveries VALUES($1,$2,$3,$4,$5,$6::jsonb)',
      [c.streamId,c.consumerId,block.height,offset,gasDigest(raw),JSON.stringify(result)]);
     await client.query('UPDATE orio_history.consumers SET receipt_offset=receipt_offset+1 WHERE stream_id=$1 AND consumer_id=$2',[c.streamId,c.consumerId]);
    }else{
     await client.query('INSERT INTO orio_history.completions VALUES($1,$2,$3,$4,$5)',
      [c.streamId,c.consumerId,block.height,row.evidence_digest,block.receipts.length]);
     await client.query('UPDATE orio_history.consumers SET next_block=next_block+1,receipt_offset=0 WHERE stream_id=$1 AND consumer_id=$2',[c.streamId,c.consumerId]);
    }
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}
   return raw?{state:'DELIVERED',height:block.height,deliveryId}:{state:'BLOCK_COMPLETE',height:block.height};
  }finally{
   // Destroy a connection if lock release fails; never pool a session holding a lock.
   let destroy=false;
   if(locked){try{await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lock]);}catch{destroy=true;}}
   client.release(destroy);
  }
 }
}
