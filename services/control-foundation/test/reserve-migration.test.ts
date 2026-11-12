import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessReserveMigration } from '../src/reserve-migration.ts';

const checkpoint = {
  orioSupplyUnits: '10000000000', ownershipCommitment: 'a'.repeat(64),
  companyFeeUnits: '2000000', holderAllocationUnits: '8000000',
};
const outgoing = {
  assetId: 'old-master', units: '100000000', usdValueUnits: '70000000', evidenceDigest: 'b'.repeat(64),
};
const incoming = {
  assetId: 'replacement', units: '68000000', usdValueUnits: '68000000', evidenceDigest: 'c'.repeat(64),
};

test('exposes realized loss and backing deficiency using actual independent valuations', () => {
  assert.deepEqual(assessReserveMigration(checkpoint, checkpoint, outgoing, incoming, '90000000'), {
    lossUsdUnits: '2000000', deficiencyUsdUnits: '22000000', requiresDeficiencyProcedure: true,
  });
});

test('refuses supply, ownership and fee changes during replacement', () => {
  for (const change of [
    { orioSupplyUnits: '10000000001' }, { ownershipCommitment: 'd'.repeat(64) },
    { companyFeeUnits: '2000001' }, { holderAllocationUnits: '8000001' },
  ]) assert.throws(() => assessReserveMigration(checkpoint, { ...checkpoint, ...change }, outgoing, incoming, '1'));
});

test('does not conceal missing evidence or infer dollar backing from token units', () => {
  assert.throws(() => assessReserveMigration(checkpoint, checkpoint, outgoing,
    { ...incoming, evidenceDigest: '' }, '1'));
  const result = assessReserveMigration(checkpoint, checkpoint, outgoing,
    { ...incoming, units: '100000000000000000000000', usdValueUnits: '1' }, '90000000');
  assert.equal(result.deficiencyUsdUnits, '89999999');
  assert.throws(() => assessReserveMigration(checkpoint, checkpoint, outgoing,
    { ...incoming, units: '1.1' }, '1'));
});

test('preserves fee allocations while reporting a fully covered replacement', () => {
  assert.deepEqual(assessReserveMigration(checkpoint, checkpoint, outgoing,
    { ...incoming, usdValueUnits: '90000000' }, '90000000'), {
    lossUsdUnits: '0', deficiencyUsdUnits: '0', requiresDeficiencyProcedure: false,
  });
});
