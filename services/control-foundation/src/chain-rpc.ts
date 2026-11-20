import type { ChainReader } from './finalized-transfer.ts';
import type { AutonomousReader } from './finalized-autonomous.ts';

type Method = Parameters<ChainReader['request']>[0];
type BundlerMethod = 'eth_chainId' | 'eth_supportedEntryPoints';
type ReserveMethod='eth_chainId'|'eth_getBlockByNumber'|'eth_getCode'|'eth_call';
type AutonomousMethod=Parameters<AutonomousReader['request']>[0];
export interface ReserveReader {
 readonly sourceId:string;
 request(method:ReserveMethod,params:unknown[]):Promise<unknown>;
}
export interface BundlerReader {
  readonly sourceId: string;
  request(method: BundlerMethod, params: unknown[]): Promise<unknown>;
}

export interface ChainRpcConfiguration {
  sourceId: string;
  endpoint: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** Trusted deployment configuration only. No customer-controlled URLs or headers. */
class ReadOnlyHttpsRpc {
  readonly sourceId: string;
  private readonly endpoint: string;
  private readonly headers: Headers;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(configuration: ChainRpcConfiguration, fetchImplementation: typeof fetch = fetch) {
    this.sourceId = configuration.sourceId;
    if (!this.sourceId || this.sourceId.trim() !== this.sourceId || this.sourceId.length > 128)
      throw new Error('Invalid chain source identity');
    let endpoint: URL;
    try { endpoint = new URL(configuration.endpoint); }
    catch { throw new Error('Invalid chain RPC endpoint'); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash)
      throw new Error('Chain RPC requires HTTPS without URL credentials or fragments');
    this.endpoint = endpoint.href;
    this.timeoutMs = configuration.timeoutMs ?? 5000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 30000)
      throw new Error('Invalid chain RPC timeout');
    try { this.headers = new Headers(configuration.headers); }
    catch { throw new Error('Invalid chain RPC headers'); }
    this.headers.set('Content-Type', 'application/json');
    this.headers.set('Accept', 'application/json');
    this.fetch = fetchImplementation;
  }

  async request(method: Method | BundlerMethod | ReserveMethod | AutonomousMethod, params: unknown[]): Promise<unknown> {
    if (!Array.isArray(params)) throw new Error('Invalid read-only RPC parameters');
    const chainId = method === 'eth_chainId' && params.length === 0;
    const receipt = method === 'eth_getTransactionReceipt' && params.length === 1 &&
      typeof params[0] === 'string' && /^0x[0-9a-f]{64}$/.test(params[0]);
    const block = method === 'eth_getBlockByNumber' && params.length === 2 && params[1] === false &&
      typeof params[0] === 'string' && (params[0] === 'finalized' || /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(params[0]));
    const supported = method === 'eth_supportedEntryPoints' && params.length === 0;
    const pinned=(value:unknown)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
      Object.keys(value).sort().join(',')==='blockHash,requireCanonical'&&
      (value as Record<string,unknown>).requireCanonical===true&&
      typeof (value as Record<string,unknown>).blockHash==='string'&&
      /^0x[0-9a-f]{64}(?![\s\S])/.test((value as Record<string,unknown>).blockHash as string);
    const target=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-f]{40}(?![\s\S])/.test(value);
    const code=method==='eth_getCode'&&params.length===2&&target(params[0])&&pinned(params[1]);
    const call=method==='eth_call'&&params.length===2&&params[0]!==null&&typeof params[0]==='object'&&!Array.isArray(params[0])&&
      Object.keys(params[0]).sort().join(',')==='data,to'&&target((params[0] as Record<string,unknown>).to)&&
      typeof (params[0] as Record<string,unknown>).data==='string'&&
      /^0x[0-9a-f]{8}(?:[0-9a-f]{64}){0,4}(?![\s\S])/.test((params[0] as Record<string,unknown>).data as string)&&pinned(params[1]);
    const filter=params[0] as Record<string,unknown>|undefined;
    const logs=method==='eth_getLogs'&&params.length===1&&filter!==null&&typeof filter==='object'&&!Array.isArray(filter)&&
      Object.keys(filter).sort().join(',')==='address,fromBlock,toBlock,topics'&&
      typeof filter.fromBlock==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(filter.fromBlock)&&
      typeof filter.toBlock==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(filter.toBlock)&&
      BigInt(filter.toBlock)>=BigInt(filter.fromBlock)&&BigInt(filter.toBlock)-BigInt(filter.fromBlock)<2000n&&
      Array.isArray(filter.address)&&filter.address.length===3&&filter.address.every(target)&&new Set(filter.address).size===3&&
      Array.isArray(filter.topics)&&filter.topics.length===1&&Array.isArray(filter.topics[0])&&filter.topics[0].length===3&&
      filter.topics[0].every((t:unknown)=>typeof t==='string'&&/^0x[0-9a-f]{64}$/.test(t));
    if (!chainId && !receipt && !block && !supported && !code && !call && !logs) throw new Error('Unsupported read-only chain RPC request');
    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST', headers: this.headers, redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!response.ok || !response.body) throw new Error('Invalid RPC response');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > 2 * 1024 * 1024) {
            await reader.cancel();
            throw new Error('RPC response exceeded limit');
          }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      const value: unknown = JSON.parse(Buffer.concat(chunks, length).toString('utf8'));
      if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid RPC response envelope');
      const envelope = value as Record<string, unknown>;
      if (envelope.jsonrpc !== '2.0' || envelope.id !== 1 ||
          Object.hasOwn(envelope, 'error') || !Object.hasOwn(envelope, 'result'))
        throw new Error('Invalid RPC response envelope');
      return envelope.result;
    } catch {
      // Provider errors can contain authenticated URLs, headers and response bodies.
      throw new Error('Chain RPC request failed');
    }
  }
}

/** Bounded finalized-history reader. Existing readers retain their narrower allowlists. */
export class HttpsAutonomousReader implements AutonomousReader {
 readonly sourceId:string;private readonly transport:ReadOnlyHttpsRpc;
 constructor(configuration:ChainRpcConfiguration,fetchImplementation:typeof fetch=fetch){
  this.transport=new ReadOnlyHttpsRpc(configuration,fetchImplementation);this.sourceId=this.transport.sourceId;
 }
 async request(method:AutonomousMethod,params:unknown[]):Promise<unknown>{
  if(!['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber','eth_getLogs'].includes(method))throw Error('Unsupported autonomous read request');
  return this.transport.request(method,params);
 }
}

/** Reserve observations accept canonical block-hash-pinned reads only. No latest
 * eth_call, state override, caller-selected from/value or transaction submission.
 * Existing chain/bundler readers keep their narrower public method allowlists. */
export class HttpsReserveReader implements ReserveReader {
 readonly sourceId:string;
 private readonly transport:ReadOnlyHttpsRpc;
 constructor(configuration:ChainRpcConfiguration,fetchImplementation:typeof fetch=fetch){
  this.transport=new ReadOnlyHttpsRpc(configuration,fetchImplementation);this.sourceId=this.transport.sourceId;
 }
 async request(method:ReserveMethod,params:unknown[]):Promise<unknown>{
  if(!['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call'].includes(method))throw Error('Unsupported read-only reserve RPC request');
  return this.transport.request(method,params);
 }
}

/** Settlement reader deliberately excludes bundler and broadcast methods. */
export class HttpsChainReader implements ChainReader {
  readonly sourceId: string;
  private readonly transport: ReadOnlyHttpsRpc;
  constructor(configuration: ChainRpcConfiguration, fetchImplementation: typeof fetch = fetch) {
    this.transport = new ReadOnlyHttpsRpc(configuration, fetchImplementation); this.sourceId = this.transport.sourceId;
  }
  async request(method: Method, params: unknown[]): Promise<unknown> {
    if (!['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber'].includes(method))
      throw new Error('Unsupported read-only chain RPC request');
    return this.transport.request(method, params);
  }
}

/** Capability diagnostics only; no estimation, sponsorship, signing or submission. */
export class HttpsBundlerReader implements BundlerReader {
  readonly sourceId: string;
  private readonly transport: ReadOnlyHttpsRpc;
  constructor(configuration: ChainRpcConfiguration, fetchImplementation: typeof fetch = fetch) {
    this.transport = new ReadOnlyHttpsRpc(configuration, fetchImplementation); this.sourceId = this.transport.sourceId;
  }
  async request(method: BundlerMethod, params: unknown[]): Promise<unknown> {
    if (!['eth_chainId','eth_supportedEntryPoints'].includes(method)) throw new Error('Unsupported read-only bundler RPC request');
    return this.transport.request(method, params);
  }
}

export function parseRpcHeaders(encoded: string | undefined): Record<string,string> | undefined {
  if (!encoded) return undefined;
  let parsed: unknown; try { parsed=JSON.parse(encoded); } catch { throw new Error('Invalid provider header configuration'); }
  if (parsed===null || typeof parsed!=='object' || Array.isArray(parsed) || Object.values(parsed).some(value=>typeof value!=='string'))
    throw new Error('Invalid provider header configuration');
  return parsed as Record<string,string>;
}
