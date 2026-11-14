import { chainAddress, chainHash, finalizedLog, finalizedReceipt, indexedAddress, requireChainSources } from './chain-evidence.ts';
import type { ChainReader } from './chain-evidence.ts';
export type { ChainReader } from './chain-evidence.ts';

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
async function verifySource(source: ChainReader, expected: ExpectedTokenTransfer) {
  const snapshot = await finalizedReceipt(source, expected.chainId, expected.transactionHash);
  const log = finalizedLog(snapshot, expected.transactionHash, expected.logIndex);
  if (chainAddress(log.address) !== expected.tokenAddress || !Array.isArray(log.topics) || log.topics.length !== 3 ||
      chainHash(log.topics[0]) !== transferTopic || indexedAddress(log.topics[1]) !== expected.senderAddress ||
      indexedAddress(log.topics[2]) !== expected.recipientAddress)
    throw new Error('Transfer parties or event mismatch');
  if (BigInt(chainHash(log.data)).toString() !== expected.units) throw new Error('Transfer amount mismatch');
  return { blockHash: snapshot.blockHash, blockNumber: snapshot.blockNumber };
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
  requireChainSources(first, second);
  if (typeof input.chainId !== 'string' || typeof input.logIndex !== 'string' ||
      !/^[1-9][0-9]{0,77}$/.test(input.chainId) ||
      !/^(0|[1-9][0-9]{0,77})$/.test(input.logIndex) ||
      typeof input.units !== 'string' || !/^[1-9][0-9]{0,77}$/.test(input.units) ||
      BigInt(input.units) >= (1n << 256n))
    throw new Error('Invalid transfer expectation');
  const expected = {
    ...input,
    tokenAddress: chainAddress(input.tokenAddress),
    senderAddress: chainAddress(input.senderAddress),
    recipientAddress: chainAddress(input.recipientAddress),
    transactionHash: chainHash(input.transactionHash),
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
