export interface ChainReader {
  readonly sourceId: string;
  request(method: 'eth_chainId' | 'eth_getTransactionReceipt' | 'eth_getBlockByNumber', params: unknown[]): Promise<unknown>;
}

export interface ExpectedTokenTransfer {
  chainId: string;
  tokenAddress: string;
  senderAddress: string;
  recipientAddress: string;
  transactionHash: string;
  logIndex: string;
  units: string;
}

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hashPattern = /^0x[0-9a-f]{64}$/;
const addressPattern = /^0x[0-9a-f]{40}$/;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Missing chain evidence');
  return value as Record<string, unknown>;
}
function hexQuantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value))
    throw new Error('Invalid chain quantity');
  return BigInt(value);
}
function normalized(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value.toLowerCase()))
    throw new Error('Invalid chain identifier');
  return value.toLowerCase();
}
function topicAddress(value: unknown): string {
  const topic = normalized(value, hashPattern);
  if (!topic.startsWith('0x' + '0'.repeat(24))) throw new Error('Invalid indexed address');
  return '0x' + topic.slice(-40);
}

async function verifySource(source: ChainReader, expected: ExpectedTokenTransfer) {
  const chainId = hexQuantity(await source.request('eth_chainId', []));
  if (chainId.toString() !== expected.chainId) throw new Error('Chain identity mismatch');
  const receipt = object(await source.request('eth_getTransactionReceipt', [expected.transactionHash]));
  if (receipt.status !== '0x1' ||
      normalized(receipt.transactionHash, hashPattern) !== expected.transactionHash)
    throw new Error('Transaction failed or receipt mismatch');
  const height = hexQuantity(receipt.blockNumber);
  const blockHash = normalized(receipt.blockHash, hashPattern);
  const finalized = object(await source.request('eth_getBlockByNumber', ['finalized', false]));
  if (height > hexQuantity(finalized.number)) throw new Error('Transfer is not finalized');
  normalized(finalized.hash, hashPattern);
  const canonical = object(await source.request('eth_getBlockByNumber', [receipt.blockNumber, false]));
  if (hexQuantity(canonical.number) !== height || normalized(canonical.hash, hashPattern) !== blockHash)
    throw new Error('Receipt is not on the canonical chain');
  if (height === hexQuantity(finalized.number) && blockHash !== normalized(finalized.hash, hashPattern))
    throw new Error('Finalized block identity mismatch');
  if (!Array.isArray(receipt.logs)) throw new Error('Missing transaction logs');
  const logs = receipt.logs.map(object).filter(log => hexQuantity(log.logIndex).toString() === expected.logIndex);
  if (logs.length !== 1) throw new Error('Transfer log missing or duplicated');
  const log = logs[0]!;
  if (log.removed !== false || normalized(log.address, addressPattern) !== expected.tokenAddress ||
      normalized(log.transactionHash, hashPattern) !== expected.transactionHash ||
      normalized(log.blockHash, hashPattern) !== blockHash || hexQuantity(log.blockNumber) !== height)
    throw new Error('Transfer log identity mismatch');
  if (!Array.isArray(log.topics) || log.topics.length !== 3 ||
      normalized(log.topics[0], hashPattern) !== transferTopic ||
      topicAddress(log.topics[1]) !== expected.senderAddress ||
      topicAddress(log.topics[2]) !== expected.recipientAddress)
    throw new Error('Transfer parties or event mismatch');
  const data = normalized(log.data, hashPattern);
  if (BigInt(data).toString() !== expected.units) throw new Error('Transfer amount mismatch');
  return { blockHash, blockNumber: height.toString() };
}

/**
 * Read-only finalized ERC-20 event verification against two configured sources.
 * Operators establish source independence and approved token/chain identity.
 * A verified Transfer event does not establish issuer eligibility or spendable custody.
 */
export async function verifyFinalizedTokenTransfer(
  first: ChainReader,
  second: ChainReader,
  input: ExpectedTokenTransfer,
) {
  if (!first.sourceId.trim() || !second.sourceId.trim() || first.sourceId === second.sourceId)
    throw new Error('Distinct configured chain sources are required');
  if (typeof input.chainId !== 'string' || typeof input.logIndex !== 'string' ||
      !/^[1-9][0-9]{0,77}$/.test(input.chainId) ||
      !/^(0|[1-9][0-9]{0,77})$/.test(input.logIndex) ||
      typeof input.units !== 'string' || !/^[1-9][0-9]{0,77}$/.test(input.units) ||
      BigInt(input.units) >= (1n << 256n))
    throw new Error('Invalid transfer expectation');
  const expected = {
    ...input,
    tokenAddress: normalized(input.tokenAddress, addressPattern),
    senderAddress: normalized(input.senderAddress, addressPattern),
    recipientAddress: normalized(input.recipientAddress, addressPattern),
    transactionHash: normalized(input.transactionHash, hashPattern),
  };
  const [a, b] = await Promise.all([verifySource(first, expected), verifySource(second, expected)]);
  if (a.blockHash !== b.blockHash || a.blockNumber !== b.blockNumber)
    throw new Error('Chain sources disagree');
  return {
    assetId: `eip155:${expected.chainId}/erc20:${expected.tokenAddress}`,
    units: expected.units,
    senderAddress: expected.senderAddress,
    recipientAddress: expected.recipientAddress,
    settlementRef: `eip155:${expected.chainId}/tx:${expected.transactionHash}/log:${expected.logIndex}`,
    ...a,
  };
}
