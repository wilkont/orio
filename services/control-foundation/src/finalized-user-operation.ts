import { createHash } from 'node:crypto';
import { chainAddress, chainHash, chainIdentifier, finalizedLog, finalizedReceipt, indexedAddress, requireChainSources } from './chain-evidence.ts';
import type { ChainReader } from './chain-evidence.ts';

export interface ExpectedUserOperation {
  chainId: string; entryPointAddress: string; accountAddress: string; paymasterAddress: string;
  userOperationHash: string; nonce: string; transactionHash: string; logIndex: string;
}
const eventTopic = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
async function verifySource(source: ChainReader, expected: ExpectedUserOperation) {
  const snapshot = await finalizedReceipt(source, expected.chainId, expected.transactionHash);
  const log = finalizedLog(snapshot, expected.transactionHash, expected.logIndex);
  if (chainAddress(log.address) !== expected.entryPointAddress || !Array.isArray(log.topics) || log.topics.length !== 4 ||
      chainHash(log.topics[0]) !== eventTopic || chainHash(log.topics[1]) !== expected.userOperationHash ||
      indexedAddress(log.topics[2]) !== expected.accountAddress || indexedAddress(log.topics[3]) !== expected.paymasterAddress)
    throw new Error('UserOperation event identity mismatch');
  const data = chainIdentifier(log.data, /^0x[0-9a-f]{256}$/);
  const words = [0, 1, 2, 3].map(index => BigInt('0x' + data.slice(2 + 64 * index, 66 + 64 * index)));
  if (words[0]!.toString() !== expected.nonce || (words[1] !== 0n && words[1] !== 1n) || words[3] === 0n)
    throw new Error('Malformed UserOperation event values');
  return { blockHash: snapshot.blockHash, blockNumber: snapshot.blockNumber, success: words[1] === 1n,
    entryPointDebitWei: words[2]!.toString(), actualGasUsed: words[3]!.toString() };
}

/** Read-only final per-operation EntryPoint-debit observation, not a final customer network bill.
 * Base L1/bundler allocation, payment conversion and failure responsibility require separate
 * evidence/policy. A successful outer bundle may contain a reverted business operation. */
export async function verifyFinalizedUserOperation(first: ChainReader, second: ChainReader, input: ExpectedUserOperation) {
  requireChainSources(first, second);
  if (!['8453', '84532'].includes(input.chainId) || typeof input.nonce !== 'string' ||
      !/^(0|[1-9][0-9]{0,77})(?![\s\S])/.test(input.nonce) || BigInt(input.nonce) >= (1n << 256n) ||
      typeof input.logIndex !== 'string' || !/^(0|[1-9][0-9]{0,77})(?![\s\S])/.test(input.logIndex))
    throw new Error('Invalid UserOperation expectation');
  const expected = { chainId: input.chainId, entryPointAddress: chainAddress(input.entryPointAddress),
    accountAddress: chainAddress(input.accountAddress), paymasterAddress: chainAddress(input.paymasterAddress),
    userOperationHash: chainHash(input.userOperationHash), nonce: input.nonce,
    transactionHash: chainHash(input.transactionHash), logIndex: input.logIndex };
  const [a, b] = await Promise.all([verifySource(first, expected), verifySource(second, expected)]);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('Chain sources disagree');
  const evidenceDigest = createHash('sha256').update(JSON.stringify(['ORIO-USEROP-DEBIT/v1', expected, a])).digest('hex');
  return { ...expected, ...a, evidenceDigest,
    executionRef: 'eip155:' + expected.chainId + ':userop:' + expected.userOperationHash.slice(2),
    eventRef: 'eip155:' + expected.chainId + '/tx:' + expected.transactionHash + '/log:' + expected.logIndex };
}
