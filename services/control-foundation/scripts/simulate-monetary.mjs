import { writeFile } from 'node:fs/promises';
import { simulateGenesis, simulateRedemptionEpoch } from '../src/monetary-simulation.ts';
const usd = whole => (BigInt(whole) * 10n ** 36n).toString();
const tokens = whole => (BigInt(whole) * 10n ** 18n).toString();
const result = {
  policyStatus: 'PROPOSED_NOT_APPROVED', simulationOnly: true,
  genesis: simulateGenesis(usd('1000')),
  ordinaryEpoch: simulateRedemptionEpoch({ reserveUsd36: usd('1000'), supplyTokenUnits: tokens('1000'),
    redemptions: [{ id: 'a', tokenUnits: tokens('300') }, { id: 'b', tokenUnits: tokens('200') }] }),
  fullRedemption: simulateRedemptionEpoch({ reserveUsd36: usd('1000'), supplyTokenUnits: tokens('1000'),
    redemptions: [{ id: 'all', tokenUnits: tokens('1000') }] }),
  concentration: simulateRedemptionEpoch({ reserveUsd36: usd('1000000'), supplyTokenUnits: tokens('1000000'),
    redemptions: [{ id: 'almost-all', tokenUnits: tokens('999999') }] }),
};
await writeFile(new URL('../../../docs/monetary/ORIO_MONETARY_SIMULATION_RESULTS.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log('Wrote exact proposed-policy scenario results; no settlement or activation');
