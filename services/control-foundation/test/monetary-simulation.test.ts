import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monetaryScenarios } from '../src/monetary-simulation.ts';
import { orioScale, usdScale } from '../src/monetary-engine.ts';
test('published approved scenarios use the company-only genesis exception without activating money', () => {
  const result = monetaryScenarios();
  assert.equal(result.policyStatus, 'FOUNDER_APPROVED'); assert.equal(result.simulationOnly, true);
  assert.equal(result.genesis.companyMasterUnits, '10000000'); assert.equal(result.genesis.holderMasterUnits, '0');
  assert.equal(result.genesis.next.supplyAtoms, (990n * orioScale).toString());
});
test('published reopening preserves the final 1.25 USD reference after explicit reconciliation', () => {
  const result = monetaryScenarios();
  assert.equal(result.fullRedemption.next.phase, 'ZERO_SUPPLY_PENDING');
  assert.equal(result.reopening.next.priceUsd36.numerator, (usdScale * 5n / 4n).toString());
  assert.equal(result.reopening.next.supplyAtoms, (99n * orioScale).toString());
});
test('published extreme residual allocation has no escrow or concentration withholding', () => {
  const result = monetaryScenarios().concentration;
  assert.equal(result.next.supplyAtoms, orioScale.toString());
  assert.equal(result.holderMasterUnits, '7999992000');
  assert.equal(result.next.priceUsd36.numerator, (usdScale * 1000124n / 125n).toString());
});
