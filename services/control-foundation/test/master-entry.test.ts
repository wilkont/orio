import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMasterEntry } from '../src/master-entry.ts';

const election = { assetId: 'base:master', electionId: 'election-1', state: 'ACTIVE_MASTER' } as const;
const quote = { masterAssetId: election.assetId, electionId: election.electionId, minimumMasterUnits: '9007199254740993' };
const receipt = { assetId: election.assetId, vaultId: 'reserve', units: '9007199254740993', settlementRef: 'base:tx:0' };

test('accepts exact finalized master proceeds at the quoted minimum', () => {
  assert.deepEqual(validateMasterEntry(election, quote, receipt, 'reserve'), receipt);
});

test('rejects secondary assets, the wrong vault, and untraceable receipts', () => {
  for (const invalid of [{ assetId: 'base:secondary' }, { vaultId: 'other' }, { settlementRef: ' ' }]) {
    assert.throws(() => validateMasterEntry(election, quote, { ...receipt, ...invalid }, 'reserve'));
  }
});

test('rejects paused or migrating elections and quotes from a prior election', () => {
  for (const state of ['DEPOSIT_PAUSED', 'MIGRATING', 'QUARANTINED'] as const) {
    assert.throws(() => validateMasterEntry({ ...election, state }, quote, receipt, 'reserve'), /unavailable/);
  }
  assert.throws(() => validateMasterEntry({ ...election, electionId: 'election-2' }, quote, receipt, 'reserve'), /different master election/);
});

test('rejects even one unit of slippage beyond the limit and invalid units', () => {
  assert.throws(() => validateMasterEntry(election, quote, { ...receipt, units: '9007199254740992' }, 'reserve'), /quoted minimum/);
  for (const units of ['0', '1.1', '01', '1e6', '9'.repeat(79)]) {
    assert.throws(() => validateMasterEntry(election, quote, { ...receipt, units }, 'reserve'), /Invalid master units/);
  }
});
