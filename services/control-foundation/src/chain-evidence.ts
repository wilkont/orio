export interface ChainReader {
  readonly sourceId: string;
  request(method: 'eth_chainId' | 'eth_getTransactionReceipt' | 'eth_getBlockByNumber', params: unknown[]): Promise<unknown>;
}
export function chainObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Missing chain evidence');
  return value as Record<string, unknown>;
}
export function chainQuantity(value: unknown): bigint {
  if (typeof value !== 'string' || value !== value.trim() || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value)) throw new Error('Invalid chain quantity');
  return BigInt(value);
}
export function chainIdentifier(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || value !== value.trim() || !pattern.test(value.toLowerCase())) throw new Error('Invalid chain identifier');
  return value.toLowerCase();
}
export const chainHash = (value: unknown) => chainIdentifier(value, /^0x[0-9a-f]{64}$/);
export const chainAddress = (value: unknown) => chainIdentifier(value, /^0x[0-9a-f]{40}$/);
export function indexedAddress(value: unknown): string {
  const topic = chainHash(value);
  if (!topic.startsWith('0x' + '0'.repeat(24))) throw new Error('Invalid indexed address');
  return '0x' + topic.slice(-40);
}
export function requireChainSources(first: ChainReader, second: ChainReader): void {
  if (!first.sourceId.trim() || !second.sourceId.trim() || first.sourceId === second.sourceId)
    throw new Error('Distinct configured chain sources are required');
}
export async function finalizedReceipt(source: ChainReader, chainId: string, transactionHash: string) {
  if (chainQuantity(await source.request('eth_chainId', [])).toString() !== chainId) throw new Error('Chain identity mismatch');
  const receipt = chainObject(await source.request('eth_getTransactionReceipt', [transactionHash]));
  if (receipt.status !== '0x1' || chainHash(receipt.transactionHash) !== transactionHash)
    throw new Error('Transaction failed or receipt mismatch');
  const height = chainQuantity(receipt.blockNumber), blockHash = chainHash(receipt.blockHash);
  const finalized = chainObject(await source.request('eth_getBlockByNumber', ['finalized', false]));
  if (height > chainQuantity(finalized.number)) throw new Error('Receipt is not finalized');
  const finalizedHash = chainHash(finalized.hash);
  const canonical = chainObject(await source.request('eth_getBlockByNumber', [receipt.blockNumber, false]));
  if (chainQuantity(canonical.number) !== height || chainHash(canonical.hash) !== blockHash)
    throw new Error('Receipt is not on the canonical chain');
  if (height === chainQuantity(finalized.number) && blockHash !== finalizedHash)
    throw new Error('Finalized block identity mismatch');
  return { receipt, blockHash, blockNumber: height.toString() };
}
export function finalizedLog(snapshot: Awaited<ReturnType<typeof finalizedReceipt>>, transactionHash: string, logIndex: string) {
  if (!Array.isArray(snapshot.receipt.logs)) throw new Error('Missing transaction logs');
  const logs = snapshot.receipt.logs.map(chainObject).filter(log => chainQuantity(log.logIndex).toString() === logIndex);
  if (logs.length !== 1) throw new Error('Event log missing or duplicated');
  const log = logs[0]!;
  if (log.removed !== false || chainHash(log.transactionHash) !== transactionHash ||
      chainHash(log.blockHash) !== snapshot.blockHash || chainQuantity(log.blockNumber).toString() !== snapshot.blockNumber)
    throw new Error('Event log identity mismatch');
  return log;
}
