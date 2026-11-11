import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileMaster } from '../src/reconciliation.ts';
import { initialMasterAsset } from '../src/initial-master.ts';

const snapshot = {
  chainId: '84532',
  finalizedBlockHash: '0x' + 'a'.repeat(64),
  electionId: 'election-1',
  masterAssetId: initialMasterAsset(84532).assetId,
  vaultId: 'test-vault',
  supplyUnits: '9007199254740993',
  reserveUnits: '100000000000000000000000',
};

test('reconciles exact master reserve and supply against the same finalized block', () => {
  assert.deepEqual(reconcileMaster(snapshot, { ...snapshot }), { ok: true, differences: [] });
});

test('contains divergence of quantities and every settlement identity independently', () => {
  const mismatches = {
    chainId: '8453', finalizedBlockHash: '0x' + 'b'.repeat(64),
    electionId: 'election-2', masterAssetId: 'another-asset',
    vaultId: 'other-vault', supplyUnits: '9007199254740992',
    reserveUnits: '100000000000000000000001',
  };
  for (const [field, value] of Object.entries(mismatches)) {
    const control = { ...snapshot };
    const chain = { ...snapshot, [field]: value };
    assert.deepEqual(reconcileMaster(control, chain), { ok: false, differences: [field] });
    assert.deepEqual(control, snapshot);
  }
});

test('rejects missing finality anchors and noncanonical quantities', () => {
  for (const bad of [
    { finalizedBlockHash: '' }, { supplyUnits: '-1' }, { reserveUnits: '01' },
    { supplyUnits: '1e5' }, { reserveUnits: '9'.repeat(79) },
  ]) assert.throws(() => reconcileMaster(snapshot, { ...snapshot, ...bad }));
  assert.equal(reconcileMaster({ ...snapshot, supplyUnits: '0' }, { ...snapshot, supplyUnits: '0' }).ok, true);
});
