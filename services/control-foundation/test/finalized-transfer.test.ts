import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyFinalizedTokenTransfer } from '../src/finalized-transfer.ts';
import type { ChainReader } from '../src/finalized-transfer.ts';

const tx = '0x' + 'a'.repeat(64);
const block = '0x' + 'b'.repeat(64);
const token = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const sender = '0x' + '1'.repeat(40);
const recipient = '0x' + '2'.repeat(40);
const expected = {
  chainId: '8453', tokenAddress: token, senderAddress: sender, recipientAddress: recipient,
  transactionHash: tx, logIndex: '2', units: '1000000',
};
const log = {
  logIndex: '0x2', removed: false, address: token, transactionHash: tx, blockHash: block, blockNumber: '0xa',
  topics: [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    '0x' + '0'.repeat(24) + sender.slice(2), '0x' + '0'.repeat(24) + recipient.slice(2),
  ],
  data: '0x' + (1000000n).toString(16).padStart(64, '0'),
};
function reader(id: string, overrides: Record<string, unknown> = {}, logChanges: Record<string, unknown> = {}): ChainReader {
  return { sourceId: id, request: async (method, params) => {
    if (method === 'eth_chainId') return overrides.chainId ?? '0x2105';
    if (method === 'eth_getTransactionReceipt') return {
      status: '0x1', transactionHash: tx, blockHash: block, blockNumber: '0xa', logs: [{ ...log, ...logChanges }],
      ...overrides.receipt as object,
    };
    if (params[0] === 'finalized') return overrides.finalized ?? { number: '0xb', hash: '0x' + 'c'.repeat(64) };
    return overrides.canonical ?? { number: '0xa', hash: block };
  } };
}

test('verifies a finalized native-USDC event and returns one canonical settlement identity', async () => {
  const result = await verifyFinalizedTokenTransfer(reader('a'), reader('b'), expected);
  assert.equal(result.units, '1000000');
  assert.equal(result.blockNumber, '10');
  assert.equal(result.settlementRef, 'eip155:8453/tx:' + tx + '/log:2');
  assert.equal(result.assetId, 'eip155:8453/erc20:' + token);
});

test('rejects wrong networks, failed receipts, unfinalized blocks and canonical chain disagreement', async () => {
  for (const invalid of [
    { chainId: '0x14a34' }, { receipt: { status: '0x0' } },
    { finalized: { number: '0x9', hash: block } },
    { canonical: { number: '0xa', hash: '0x' + 'd'.repeat(64) } },
    { finalized: { number: '0xa', hash: '0x' + 'd'.repeat(64) } },
  ]) await assert.rejects(verifyFinalizedTokenTransfer(reader('a'), reader('b', invalid), expected));
});

test('rejects token substitution, removed logs, altered recipients, wrong amounts and missing event indexes', async () => {
  for (const invalid of [
    { address: '0x' + '3'.repeat(40) }, { removed: true }, { removed: undefined },
    { topics: [...log.topics.slice(0, 2), '0x' + '0'.repeat(64)] },
    { data: '0x' + '0'.repeat(64) }, { logIndex: '0x3' },
    { transactionHash: '0x' + 'e'.repeat(64) },
  ]) await assert.rejects(verifyFinalizedTokenTransfer(reader('a'), reader('b', {}, invalid), expected));
});

test('refuses duplicate source identifiers and noncanonical or oversized monetary expectations', async () => {
  await assert.rejects(verifyFinalizedTokenTransfer(reader('same'), reader('same'), expected));
  for (const units of ['0', '01', '1.1', (1n << 256n).toString()])
    await assert.rejects(verifyFinalizedTokenTransfer(reader('a'), reader('b'), { ...expected, units }));
});

test('rejects providers that each report a different internally consistent block', async () => {
  const differentBlock = '0x' + 'f'.repeat(64);
  const b = reader('b', {
    receipt: { blockHash: differentBlock, logs: [{ ...log, blockHash: differentBlock }] },
    canonical: { number: '0xa', hash: differentBlock },
  });
  await assert.rejects(verifyFinalizedTokenTransfer(reader('a'), b, expected), /sources disagree/);
});
