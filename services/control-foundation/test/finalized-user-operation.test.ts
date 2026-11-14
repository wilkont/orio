import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyFinalizedUserOperation } from '../src/finalized-user-operation.ts';
import type { ChainReader } from '../src/chain-evidence.ts';
const tx = '0x' + 'a'.repeat(64), block = '0x' + 'b'.repeat(64), userOp = '0x' + 'c'.repeat(64);
const entry = '0x' + '1'.repeat(40), account = '0x' + '2'.repeat(40), paymaster = '0x' + '3'.repeat(40);
const expected = { chainId: '84532', entryPointAddress: entry, accountAddress: account,
  paymasterAddress: paymaster, userOperationHash: userOp, nonce: '7', transactionHash: tx, logIndex: '2' };
function data(nonce = 7n, success = 1n, cost = 9007199254740993n, used = 123456n) {
  return '0x' + [nonce, success, cost, used].map(value => value.toString(16).padStart(64, '0')).join('');
}
const log = { logIndex: '0x2', removed: false, address: entry, transactionHash: tx, blockHash: block, blockNumber: '0xa',
  topics: ['0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f', userOp,
    '0x' + '0'.repeat(24) + account.slice(2), '0x' + '0'.repeat(24) + paymaster.slice(2)], data: data() };
const boundary = { ...log, logIndex: '0x1', topics: ['0xbb47ee3e183a558b1a2ff0874b079f3fc5478b7454eacf2bfc5af2ff5878f972'], data: '0x' };
function reader(sourceId: string, receiptChanges: Record<string, unknown> = {}, logChanges: Record<string, unknown> = {},
  other: { finalized?: unknown; canonical?: unknown; chain?: unknown } = {}): ChainReader {
  return { sourceId, request: async (method, params) => {
    if (method === 'eth_chainId') return other.chain ?? '0x14a34';
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: tx, blockHash: block,
      blockNumber: '0xa', logs: [boundary, { ...log, ...logChanges }], ...receiptChanges };
    return params[0] === 'finalized' ? other.finalized ?? { number: '0xb', hash: '0x' + 'd'.repeat(64) }
      : other.canonical ?? { number: '0xa', hash: block };
  } };
}
test('verifies exact per-user-operation final EntryPoint debit above JS safe integer range', async () => {
  const result = await verifyFinalizedUserOperation(reader('one'), reader('two'), expected);
  assert.equal(result.entryPointDebitWei, '9007199254740993'); assert.equal(result.actualGasUsed, '123456');
  assert.equal(result.success, true); assert.equal(result.executionRef, 'eip155:84532:userop:' + userOp.slice(2));
  assert.equal(result.eventRef, 'eip155:84532/tx:' + tx + '/log:2'); assert.match(result.evidenceDigest, /^[a-f0-9]{64}$/);
});
test('successful outer bundle with reverted user operation remains a paid failed business operation', async () => {
  const failed = { data: data(7n, 0n) };
  const result = await verifyFinalizedUserOperation(reader('one', {}, failed), reader('two', {}, failed), expected);
  assert.equal(result.success, false); assert.equal(result.entryPointDebitWei, '9007199254740993');
  assert.equal(Reflect.has(result, 'userChargeUnits'), false);
});
test('rejects substituted EntryPoint, account, paymaster, nonce, operation or observation topic', async () => {
  for (const mutation of [{ address: account }, { topics: [log.topics[0], tx, ...log.topics.slice(2)] },
    { topics: [log.topics[0], userOp, log.topics[3], log.topics[2]] },
    { topics: [userOp, ...log.topics.slice(1)] }, { data: data(8n) }, { removed: true }])
    await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two', {}, mutation), expected));
});
test('rejects failed bundles, missing/duplicate logs, malformed bool/ABI and non-final chain evidence', async () => {
  for (const changes of [{ status: '0x0' }, { logs: [] }, { logs: [log, log] }])
    await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two', changes), expected));
  for (const changes of [{ data: data(7n, 2n) }, { data: data(7n, 1n, 1n, 0n) }, { data: data() + '00' }])
    await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two', {}, changes), expected));
  for (const changes of [{ finalized: { number: '0x9', hash: block } },
    { canonical: { number: '0xa', hash: tx } }, { chain: '0x2105' }])
    await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two', {}, {}, changes), expected));
});
test('rejects two internally consistent sources that disagree about actual debit or execution outcome', async () => {
  await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two', {}, { data: data(7n, 1n, 9007199254740994n) }), expected), /disagree/);
  await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two', {}, { data: data(7n, 0n) }), expected), /disagree/);
});
test('rejects source aliases and malformed expected amounts while observing zero expenditure exactly', async () => {
  await assert.rejects(verifyFinalizedUserOperation(reader('same'), reader('same'), expected));
  for (const nonce of ['07', '-1', '1.5', '7\n', (1n << 256n).toString()])
    await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two'), { ...expected, nonce }));
  const zero = { data: data(7n, 1n, 0n) };
  assert.equal((await verifyFinalizedUserOperation(reader('one', {}, zero), reader('two', {}, zero), expected)).entryPointDebitWei, '0');
});
test('retry evidence identity is stable across object order and ignores untrusted extra fields', async () => {
  const first = await verifyFinalizedUserOperation(reader('one'), reader('two'), expected);
  const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(expected).reverse())));
  reordered.untrustedExtra = 'not part of the authenticated event';
  const second = await verifyFinalizedUserOperation(reader('one'), reader('two'), reordered);
  assert.equal(second.evidenceDigest, first.evidenceDigest); assert.deepEqual(second, first);
});
test('canonical event identifiers and receipt quantities reject trailing whitespace', async () => {
  await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two'), { ...expected, transactionHash: tx + '\n' }));
  await assert.rejects(verifyFinalizedUserOperation(reader('one'), reader('two', { blockNumber: '0xa\n' }), expected));
});
