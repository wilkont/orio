import { writeFile } from 'node:fs/promises';
import { monetaryScenarios } from '../src/monetary-simulation.ts';
await writeFile(new URL('../../../docs/monetary/ORIO_MONETARY_SIMULATION_RESULTS.json', import.meta.url), JSON.stringify(monetaryScenarios(), null, 2) + '\n');
console.log('Wrote approved-policy scenarios; no settlement or financial activation');
