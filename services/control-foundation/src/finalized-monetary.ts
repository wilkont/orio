import { chainAddress, chainHash, chainObject, chainQuantity, finalizedLog, finalizedReceipt, indexedAddress, requireChainSources } from './chain-evidence.ts';
import type { ChainReader } from './chain-evidence.ts';

export interface MonetaryExecutionExpectation {
  chainId: string; controller: string; currency: string; vault: string; master: string;
  transactionHash: string; checkpointLogIndex: string; operationId: string; version: string;
  kind: 'PURCHASE' | 'REDEMPTION' | 'ZERO_SUPPLY_RECONCILIATION';
}
const topics = {
  checkpoint: '0x20898450f31a91406bb3ae22abdc1bc501e0d5f8fd28bbcbd0f334fd60381bf2',
  start: '0xbff691edd23f2f3bdffe02b48ff9fe70093f791c026d9b1b37dc52c1ce45914e',
  purchase: '0xde27d2d52e8a1490228b0a13da6a33d21911851d4b1ea188577a1bd62f58984c',
  redemption: '0x4a7e3c899c7d2a743c73c2d2ad6e5e7fc085889d4f37ac32bf3b1d287b2aab21',
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
};
const zero = '0x' + '0'.repeat(40);
function words(value: unknown, count: number): string[] {
  if (typeof value !== 'string' || !new RegExp('^0x[0-9a-fA-F]{' + count * 64 + '}$').test(value))
    throw new Error('Invalid monetary event encoding');
  return value.slice(2).toLowerCase().match(/.{64}/g)!;
}
const uint = (word: string) => BigInt('0x' + word).toString();
const addressWord = (word: string) => indexedAddress('0x' + word);
function eventTopics(log: Record<string, unknown>): string[] {
  if (!Array.isArray(log.topics)) throw new Error('Missing monetary event topics');
  return log.topics.map(chainHash);
}
async function verifySource(source: ChainReader, expected: MonetaryExecutionExpectation) {
  const snapshot = await finalizedReceipt(source, expected.chainId, expected.transactionHash);
  const checkpoint = finalizedLog(snapshot, expected.transactionHash, expected.checkpointLogIndex);
  const t = eventTopics(checkpoint), kind = expected.kind === 'PURCHASE' ? '0' : expected.kind === 'REDEMPTION' ? '1' : '2';
  if (chainAddress(checkpoint.address) !== expected.controller || t.length !== 4 || t[0] !== topics.checkpoint ||
      t[1] !== expected.operationId || uint(t[2]!.slice(2)) !== kind || uint(t[3]!.slice(2)) !== expected.version)
    throw new Error('Monetary checkpoint identity mismatch');
  const encoded = words(checkpoint.data, 17);
  if (uint(encoded[0]!) !== '32' || uint(encoded[1]!) !== '480') throw new Error('Invalid checkpoint offset or length');
  const data = encoded.slice(2);
  if (BigInt(uint(data[0]!)) + 1n !== BigInt(expected.version) || addressWord(data[1]!) !== expected.master ||
      BigInt(uint(data[8]!)) > 3n || BigInt(uint(data[13]!)) >= (1n << 64n) || BigInt(uint(data[10]!)) === 0n)
    throw new Error('Invalid monetary checkpoint state');
  const logs = (snapshot.receipt.logs as unknown[]).map(chainObject).map(log =>
    finalizedLog(snapshot, expected.transactionHash, chainQuantity(log.logIndex).toString()));
  const starts = logs.filter(log => chainAddress(log.address) === expected.controller &&
    eventTopics(log)[0] === topics.start && eventTopics(log)[1] === expected.operationId);
  if (starts.length !== 1) throw new Error('Missing or ambiguous settlement boundary');
  const start = starts[0]!, st = eventTopics(start);
  if (st.length !== 3 || uint(st[2]!.slice(2)) !== kind || uint(words(start.data, 1)[0]!) !== uint(data[0]!) ||
      chainQuantity(start.logIndex) >= BigInt(expected.checkpointLogIndex)) throw new Error('Invalid settlement boundary');
  const segment = logs.filter(log => chainQuantity(log.logIndex) > chainQuantity(start.logIndex) &&
    chainQuantity(log.logIndex) < BigInt(expected.checkpointLogIndex)).sort((a,b) =>
      chainQuantity(a.logIndex) < chainQuantity(b.logIndex) ? -1 : 1);
  if (segment.some(log => chainAddress(log.address) === expected.controller &&
      [topics.start, topics.checkpoint].includes(eventTopics(log)[0]!))) throw new Error('Nested monetary execution');
  const transfers = segment.filter(log => [expected.master, expected.currency].includes(chainAddress(log.address)) &&
    eventTopics(log)[0] === topics.transfer).map(log => {
      const ts = eventTopics(log); if (ts.length !== 3) throw new Error('Invalid token transfer');
      return { token: chainAddress(log.address), from: indexedAddress(ts[1]), to: indexedAddress(ts[2]),
        units: uint(words(log.data, 1)[0]!), logIndex: chainQuantity(log.logIndex).toString() };
    });
  const take = (token: string, from: string, to: string, units: string) => {
    const index = transfers.findIndex(item => item.token === token && item.from === from && item.to === to && item.units === units);
    if (index < 0) throw new Error('Settlement token movement missing');
    return transfers.splice(index, 1)[0]!.logIndex;
  };
  const events = segment.filter(log => chainAddress(log.address) === expected.controller &&
    [topics.purchase,topics.redemption].includes(eventTopics(log)[0]!));
  if (expected.kind === 'ZERO_SUPPLY_RECONCILIATION' ? events.length !== 0 :
    !events.length || (expected.kind === 'PURCHASE' && events.length !== 1)) throw new Error('Missing or unexpected settlement allocation');
  if(events.some(log=>eventTopics(log)[0] !== (expected.kind === 'PURCHASE'?topics.purchase:topics.redemption)))
    throw new Error('Unexpected monetary allocation kind');
  const allocations = events.map(log => {
    const ts = eventTopics(log);
    if (ts[1] !== expected.operationId || ts.length !== (expected.kind === 'PURCHASE' ? 3 : 4))
      throw new Error('Settlement allocation identity mismatch');
    if (expected.kind === 'PURCHASE') {
      const w = words(log.data, 4), owner = indexedAddress(ts[2]);
      const gross = uint(w[0]!), fee = uint(w[1]!), company = uint(w[2]!), minted = uint(w[3]!);
      return { owner, gross, fee, company, minted,
        cashLogIndex: take(expected.master, owner, expected.vault, gross),
        tokenLogIndex: take(expected.currency, zero, owner, minted) };
    }
    const w = words(log.data, 6), owner = indexedAddress(ts[3]), recipient = addressWord(w[0]!);
    const nonce = uint(w[1]!), burned = uint(w[2]!), payout = uint(w[3]!), fee = uint(w[4]!), company = uint(w[5]!);
    return { requestId: ts[2]!, owner, recipient, nonce, burned, payout, fee, company,
      cashLogIndex: take(expected.master, expected.vault, recipient, payout),
      tokenLogIndex: take(expected.currency, owner, zero, burned) };
  });
  if (transfers.length) throw new Error('Unexpected monetary token movement');
  if (new Set(allocations.map(a => 'requestId' in a ? a.requestId : expected.operationId)).size !== allocations.length)
    throw new Error('Duplicate monetary allocation');
  return { blockHash: snapshot.blockHash, blockNumber: snapshot.blockNumber, ...expected,
    previousVersion: uint(data[0]!), supplyAtoms: uint(data[2]!), referencePriceUsd36: uint(data[3]!),
    reserveMasterUnits: uint(data[4]!), roundingUsd54: uint(data[5]!), companyMasterUnits: uint(data[6]!),
    cycle: uint(data[7]!), phase: uint(data[8]!), evidenceDigest: '0x' + data[9]!,
    masterUsd36PerToken: uint(data[10]!), registryEpoch: uint(data[11]!), registryRevision: uint(data[12]!),
    controllerRevision: uint(data[13]!), masterAssetHash: '0x' + data[14]!, allocations };
}

/** Read-only proof, not settlement authorization. Caller pins qualified deployment identities.
 * Both configured sources must agree on the complete canonical execution. Token movements are
 * limited to this controller call, so another operation in the same bundle cannot satisfy it.
 */
export async function verifyFinalizedMonetaryExecution(first: ChainReader, second: ChainReader, input: MonetaryExecutionExpectation) {
  requireChainSources(first, second);
  const expected = structuredClone(input);
  for (const value of [expected.chainId, expected.version])
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,77}$/.test(value) || BigInt(value) >= 1n << 256n)
      throw new Error('Invalid monetary expectation');
  if (typeof expected.checkpointLogIndex !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(expected.checkpointLogIndex) ||
      !['PURCHASE','REDEMPTION','ZERO_SUPPLY_RECONCILIATION'].includes(expected.kind)) throw new Error('Invalid monetary expectation');
  for (const key of ['controller','currency','vault','master'] as const) {
    expected[key] = chainAddress(expected[key]); if (expected[key] === zero) throw new Error('Zero deployment address');
  }
  if (new Set([expected.controller, expected.currency, expected.vault, expected.master]).size !== 4)
    throw new Error('Deployment addresses must be distinct');
  expected.transactionHash = chainHash(expected.transactionHash); expected.operationId = chainHash(expected.operationId);
  const [a,b] = await Promise.all([verifySource(first, expected), verifySource(second, expected)]);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('Monetary chain sources disagree');
  return a;
}
