import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { compileAutonomousContracts } from './compile-autonomous.mjs';

// Qualification inventory only. It does not read credentials, contact a chain,
// deploy contracts, or grant production execution.
const root = new URL('../../', import.meta.url);
const control = 'services/control-foundation/';
const [output] = process.argv.slice(2);
if (process.argv.length !== 3 || !output.endsWith('.json')) {
  throw new Error('Supply an explicit new qualification report JSON path');
}

const inputs = [
  'contracts/package.json', 'contracts/package-lock.json', 'contracts/scripts/compile-autonomous.mjs',
  'contracts/scripts/qualification-autonomous-report.mjs', 'contracts/src', 'contracts/sdk',
  control + 'src', control + 'migrations', control + 'pending-migrations',
  control + 'package.json', control + 'package-lock.json', control + 'tsconfig.json',
  control + 'config/approved-monetary-policy.json', control + 'config/approved-reserve-risk-policy.json',
  control + 'config/initial-master.json', control + 'scripts/bootstrap-autonomous-qualification.ts',
  control + 'scripts/build-valuation-journal-lambda.mjs',
  'infrastructure/aws/autonomous-import-qualification-artifacts.json',
  'infrastructure/aws/autonomous-import-qualification-foundation.json',
  'infrastructure/aws/autonomous-import-qualification-worker.json',
];
const tracked = execFileSync('git', ['ls-files', '-z', '--', ...inputs], { cwd: fileURLToPath(root), encoding: 'utf8' });
const paths = Array.from(new Set(tracked.split('\0').filter(Boolean))).sort();
if (!inputs.every(input => paths.some(path => path === input || path.startsWith(input + '/')))) {
  throw new Error('Qualification inventory is missing tracked source inputs');
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sourceDigests = await Promise.all(paths.map(async path => ({ path,
  sha256: sha256((await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n')),
})));

const compiled = compileAutonomousContracts();
const artifacts = Object.keys(compiled).filter(path => path.startsWith('src/')).sort().flatMap(path =>
  Object.entries(compiled[path]).filter(([, artifact]) => artifact.evm.bytecode.object.length).map(([name, artifact]) => ({
    path: 'contracts/' + path, name,
    creationSha256: sha256(Buffer.from(artifact.evm.bytecode.object, 'hex')),
    runtimeTemplateSha256: sha256(Buffer.from(artifact.evm.deployedBytecode.object, 'hex')),
  })));
const report = {
  schemaVersion: 1,
  purpose: 'Autonomous settlement qualification source and bytecode inventory',
  compiler: solc.version(),
  candidateNetworks: ['84532', '31337'],
  productionQualified: false,
  financialExecutionEnabled: false,
  releaseDigest: sha256(JSON.stringify(sourceDigests)),
  contractSetDigest: sha256(JSON.stringify(artifacts)),
  sourceDigests,
  artifacts,
};
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(`Wrote qualification inventory for ${artifacts.length} contracts`);
