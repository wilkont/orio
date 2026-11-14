import type { Pool } from 'pg';
import { chainAddress, chainHash, chainObject, chainQuantity, requireChainSources } from './chain-evidence.ts';
import type { ChainReader } from './chain-evidence.ts';
import { gasDigest } from './gas-policy.ts';

export interface HistoryConfiguration {
  id: string;
  chainId: string;
  firstBlock: string;
  precedingBlockHash: string;
  watchedAddresses: string[];
}
export interface HistoryBlock {
  height: string;
  blockHash: string;
  parentHash: string;
  transactionHashes: string[];
  receipts: Record<string, unknown>[];
}
function decimal(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,77})$/.test(value)) throw new Error('Invalid history height');
  return BigInt(value);
}
function configuration(input: HistoryConfiguration): HistoryConfiguration {
  const c = structuredClone(input);
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(c.id) || !['84532','31337'].includes(c.chainId) || decimal(c.firstBlock) < 1n ||
      !Array.isArray(c.watchedAddresses) || c.watchedAddresses.length < 1 || c.watchedAddresses.length > 32)
    throw new Error('Invalid qualification history configuration');
  c.precedingBlockHash = chainHash(c.precedingBlockHash);
  c.watchedAddresses = c.watchedAddresses.map(chainAddress).sort();
  if (new Set(c.watchedAddresses).size !== c.watchedAddresses.length || c.watchedAddresses.includes('0x'+'0'.repeat(40)))
    throw new Error('Invalid history address set');
  return c;
}
const hex = (value: bigint) => '0x'+value.toString(16);
const same = (a: unknown,b: unknown) => gasDigest(a) === gasDigest(b);

async function header(reader: ChainReader, height: bigint) {
  const raw = chainObject(await reader.request('eth_getBlockByNumber',[hex(height),false]));
  if (chainQuantity(raw.number) !== height || !Array.isArray(raw.transactions) || raw.transactions.length > 10000)
    throw new Error('Incomplete or oversized history block');
  const hashes = raw.transactions.map(chainHash);
  if (new Set(hashes).size !== hashes.length) throw new Error('Duplicate block transaction');
  return {height:height.toString(),blockHash:chainHash(raw.hash),parentHash:chainHash(raw.parentHash),transactionHashes:hashes};
}
function receipt(raw: unknown, block: Awaited<ReturnType<typeof header>>, tx: string, index: number) {
  const r = chainObject(raw);
  if (chainHash(r.transactionHash) !== tx || chainHash(r.blockHash) !== block.blockHash ||
      chainQuantity(r.blockNumber).toString() !== block.height || chainQuantity(r.transactionIndex) !== BigInt(index) ||
      (r.status !== '0x0' && r.status !== '0x1') || !Array.isArray(r.logs) || r.logs.length > 10000)
    throw new Error('Receipt does not belong to the complete history block');
  const logs = r.logs.map(value => {
    const log = chainObject(value);
    if (log.removed !== false || chainHash(log.transactionHash) !== tx || chainHash(log.blockHash) !== block.blockHash ||
        chainQuantity(log.blockNumber).toString() !== block.height || chainQuantity(log.transactionIndex) !== BigInt(index) ||
        !Array.isArray(log.topics) || log.topics.length > 4 || typeof log.data !== 'string' || !/^0x(?:[0-9a-f]{2})*$/.test(log.data))
      throw new Error('Invalid history log identity');
    return {address:chainAddress(log.address),topics:log.topics.map(chainHash),data:log.data,
      logIndex:chainQuantity(log.logIndex).toString(),transactionHash:tx,transactionIndex:index.toString(),
      blockHash:block.blockHash,blockNumber:block.height,removed:false};
  });
  if (r.status === '0x0' && logs.length) throw new Error('Failed transaction has execution logs');
  return {transactionHash:tx,transactionIndex:index.toString(),blockHash:block.blockHash,blockNumber:block.height,status:r.status,logs};
}

/** Read-only discovery. No receipt can be omitted from a scanned block; only watched
 * receipts are retained. This is dual-provider evidence, not a cryptographic proof
 * against colluding providers, and does not import journals or authorize execution.
 */
export async function discoverHistoryBlock(first: ChainReader, second: ChainReader,
    input: HistoryConfiguration, nextBlock: string, expectedParentHash: string): Promise<HistoryBlock | null> {
  requireChainSources(first,second);
  const c = configuration(input), height = decimal(nextBlock), parent = chainHash(expectedParentHash);
  if (height < decimal(c.firstBlock)) throw new Error('History cursor precedes configured start');
  const finalizedHeads: {height:bigint;hash:string}[]=[];
  for (const reader of [first,second]) {
    if (chainQuantity(await reader.request('eth_chainId',[])).toString() !== c.chainId) throw new Error('History chain mismatch');
    const tip = chainObject(await reader.request('eth_getBlockByNumber',['finalized',false]));
    finalizedHeads.push({height:chainQuantity(tip.number),hash:chainHash(tip.hash)});
    if (chainQuantity(tip.number) < height) return null;
  }
  const a = await header(first,height), b = await header(second,height);
  if (!same(a,b) || a.parentHash !== parent) throw new Error('Canonical history divergence');
  if (finalizedHeads.some(tip=>tip.height===height && tip.hash!==a.blockHash)) throw new Error('Finalized history anchor mismatch');
  // Verify the checkpoint's predecessor, including the explicitly configured initial anchor.
  for (const reader of [first,second]) {
    const prior = chainObject(await reader.request('eth_getBlockByNumber',[hex(height-1n),false]));
    if (chainQuantity(prior.number) !== height-1n || chainHash(prior.hash) !== parent)
      throw new Error('History predecessor is no longer canonical');
  }
  const retained: Record<string,unknown>[] = [], seenLogs = new Set<string>();
  let previousLog = -1n, retainedBytes = 0;
  for (const [index,tx] of a.transactionHashes.entries()) {
    const x = receipt(await first.request('eth_getTransactionReceipt',[tx]),a,tx,index);
    const y = receipt(await second.request('eth_getTransactionReceipt',[tx]),a,tx,index);
    if (!same(x,y)) throw new Error('History receipt sources disagree');
    for (const log of x.logs) {
      const n = BigInt(log.logIndex);
      if (seenLogs.has(log.logIndex) || n !== previousLog+1n) throw new Error('Missing, duplicate or unordered history log');
      seenLogs.add(log.logIndex); previousLog = n;
      if (seenLogs.size>100000) throw new Error('History block log budget exceeded');
    }
    if (x.logs.some(log => c.watchedAddresses.includes(log.address))) {
      retainedBytes+=Buffer.byteLength(JSON.stringify(x),'utf8');
      if (retainedBytes>8*1024*1024) throw new Error('History block evidence budget exceeded');
      retained.push(x);
    }
  }
  // Network calls can span a long block: recheck canonical identity before persistence.
  if (!same(a,await header(first,height)) || !same(a,await header(second,height))) throw new Error('History changed during discovery');
  return {...a,receipts:retained};
}

/** Trusted observer owner only. Durable CAS cursor and append-only block evidence
 * commit together. A failed or competing scan never advances past missing evidence.
 */
export class FinalizedHistory {
  private readonly pool: Pool;
  private readonly first: ChainReader;
  private readonly second: ChainReader;
  private readonly config: HistoryConfiguration;
  constructor(pool: Pool, first: ChainReader, second: ChainReader, input: HistoryConfiguration) {
    requireChainSources(first,second);
    this.pool=pool; this.first=first; this.second=second; this.config=configuration(input);
  }
  async initialize(): Promise<void> {
    const c=this.config;
    await this.pool.query('INSERT INTO orio_history.streams VALUES($1,$2::jsonb,$3,$4) ON CONFLICT DO NOTHING',
      [c.id,JSON.stringify(c),c.firstBlock,c.precedingBlockHash]);
    const row=(await this.pool.query<{configuration:HistoryConfiguration}>('SELECT configuration FROM orio_history.streams WHERE id=$1',[c.id])).rows[0];
    if (!row || !same(row.configuration,c)) throw new Error('History configuration conflict');
  }
  async scanOne(): Promise<{state:'WAITING'|'COMMITTED'|'REPLAY';height:string}> {
    const c=this.config;
    const cursor=(await this.pool.query<{configuration:HistoryConfiguration;next_block:string;parent_hash:string}>(
      'SELECT configuration,next_block::text,parent_hash FROM orio_history.streams WHERE id=$1',[c.id])).rows[0];
    if (!cursor || !same(cursor.configuration,c)) throw new Error('History stream not initialized');
    if (cursor.next_block===c.firstBlock) {
      if (cursor.parent_hash!==c.precedingBlockHash) throw new Error('Initial history anchor changed');
    } else {
      const prior=(await this.pool.query<{block_hash:string}>('SELECT block_hash FROM orio_history.blocks WHERE stream_id=$1 AND height=$2',
        [c.id,(decimal(cursor.next_block)-1n).toString()])).rows[0];
      if (!prior || prior.block_hash!==cursor.parent_hash) throw new Error('History cursor has no committed predecessor');
    }
    const block=await discoverHistoryBlock(this.first,this.second,c,cursor.next_block,cursor.parent_hash);
    if (!block) return {state:'WAITING',height:cursor.next_block};
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current=(await client.query<{configuration:HistoryConfiguration;next_block:string;parent_hash:string}>(
        'SELECT configuration,next_block::text,parent_hash FROM orio_history.streams WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      if (!current || !same(current.configuration,c)) throw new Error('History configuration changed');
      const prior=(await client.query<{evidence_digest:string}>('SELECT evidence_digest FROM orio_history.blocks WHERE stream_id=$1 AND height=$2',[c.id,block.height])).rows[0];
      const digest=gasDigest(block);
      if (prior) {
        if (prior.evidence_digest!==digest || decimal(current.next_block)<=decimal(block.height)) throw new Error('History replay conflict');
        await client.query('COMMIT'); return {state:'REPLAY',height:block.height};
      }
      if (current.next_block!==block.height || current.parent_hash!==block.parentHash) throw new Error('History cursor conflict');
      await client.query('INSERT INTO orio_history.blocks VALUES($1,$2,$3,$4::jsonb,$5)',[c.id,block.height,block.blockHash,JSON.stringify(block),digest]);
      await client.query('UPDATE orio_history.streams SET next_block=$2,parent_hash=$3 WHERE id=$1',[c.id,(decimal(block.height)+1n).toString(),block.blockHash]);
      await client.query('COMMIT'); return {state:'COMMITTED',height:block.height};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
