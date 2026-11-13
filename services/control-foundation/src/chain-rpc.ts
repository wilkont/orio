import type { ChainReader } from './finalized-transfer.ts';

type Method = Parameters<ChainReader['request']>[0];

export interface ChainRpcConfiguration {
  sourceId: string;
  endpoint: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** Trusted deployment configuration only. No customer-controlled URLs or headers. */
export class HttpsChainReader implements ChainReader {
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

  async request(method: Method, params: unknown[]): Promise<unknown> {
    if (!Array.isArray(params)) throw new Error('Invalid read-only RPC parameters');
    const chainId = method === 'eth_chainId' && params.length === 0;
    const receipt = method === 'eth_getTransactionReceipt' && params.length === 1 &&
      typeof params[0] === 'string' && /^0x[0-9a-f]{64}$/.test(params[0]);
    const block = method === 'eth_getBlockByNumber' && params.length === 2 && params[1] === false &&
      typeof params[0] === 'string' && (params[0] === 'finalized' || /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(params[0]));
    if (!chainId && !receipt && !block) throw new Error('Unsupported read-only chain RPC request');
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
