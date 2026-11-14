import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import solc from 'solc';
import { compileContracts } from './compile.mjs';
import { evaluateRelease, releasePolicy } from '../../services/control-foundation/src/release.ts';

const digest = value => createHash('sha256').update(value).digest('hex');
const names = ['ORIOGovernanceTimelock', 'MasterAssetRegistry', 'ORIOTreasuryPaymaster', 'ORIOGasAccount', 'ORIOGasAccountFactory', 'ORIOCurrency', 'ORIOReserveVault', 'ORIOMonetaryController', 'ORIORedemptionLocks', 'ORIORecoverableGasAccount', 'ORIORecoverableGasAccountFactory'];
const files = ['package.json', 'package-lock.json', 'scripts/compile.mjs', 'scripts/qualification-report.mjs',
  'sdk/gas-permit.mjs', 'sdk/recovery.mjs', ...names.map(name => 'src/' + name + '.sol')];
const sourceDigests = await Promise.all(files.map(async path => ({ path: 'contracts/' + path,
  sha256: digest(await readFile(new URL('../' + path, import.meta.url))) })));
for (const path of ['src/gas-policy.ts', 'src/gas-controls.ts', 'src/ledger.ts', 'src/release.ts', 'src/monetary-policy.ts',
  'src/gas-funding.ts', 'src/gas-refunds.ts',
  'src/monetary-engine.ts', 'src/finalized-monetary.ts', 'src/finalized-company-withdrawal.ts', 'src/monetary-settlement.ts', 'config/approved-monetary-policy.json',
  'src/chain-evidence.ts', 'src/finalized-user-operation.ts', 'src/finalized-transfer.ts', 'src/provider-qualification.ts', 'src/chain-rpc.ts', 'src/bundler-qualification.ts',
  'migrations/001_ledger.sql', 'migrations/008_gas_controls.sql', 'migrations/009_gas_execution_bindings.sql',
  'migrations/010_gas_prepayment_funding.sql', 'migrations/011_gas_prepayment_refunds.sql', 'migrations/012_monetary_execution.sql',
  'migrations/013_zero_supply_execution.sql', 'migrations/014_company_withdrawal_execution.sql', 'migrations/015_reserve_migration_execution.sql'])
  sourceDigests.push({ path: 'services/control-foundation/' + path,
    sha256: digest(await readFile(new URL('../../services/control-foundation/' + path, import.meta.url))) });
const compiled = compileContracts();
const artifacts = names.map(name => {
  const artifact = compiled['src/' + name + '.sol'][name];
  return { contractName: name, compiler: solc.version(), creationSha256: digest(Buffer.from(artifact.evm.bytecode.object, 'hex')),
    runtimeTemplateSha256: digest(Buffer.from(artifact.evm.deployedBytecode.object, 'hex')),
    runtimeTemplateBytes: artifact.evm.deployedBytecode.object.length / 2,
    metadataSha256: digest(artifact.metadata), deployedAddress: null, deployedRuntimeSha256: null };
});
const releaseDigest = digest(JSON.stringify(sourceDigests)), contractSetDigest = digest(JSON.stringify(artifacts));
const approvalPath = new URL('../../services/control-foundation/config/approvals.json', import.meta.url);
const trustPath = new URL('../../services/control-foundation/config/trust-registry.json', import.meta.url);
const approvals = JSON.parse(await readFile(approvalPath, 'utf8')), trust = JSON.parse(await readFile(trustPath, 'utf8'));
const prospectiveRelease = { mode: 'public-live', releaseDigest, projectId: 'orio-spc-3-prod', chainId: '8453', contractSetDigest };
const releaseDecision = evaluateRelease(prospectiveRelease, approvals, trust);
const requiredQualification = [
  ['monetary-execution', 'Approved monetary policy implemented consistently in actual contracts/controller/epochs/ledger and deployed execution; arithmetic planning alone is insufficient'],
  ['security-verification', 'Documented security testing and accountable acceptance of exact source, bytecode, EntryPoint, account, paymaster and signing/collection services; external review advisory'],
  ['base-network-costs', 'Qualified Base fee estimates and final L1/other/per-user cost attribution without double counting'],
  ['identity-and-signers', 'Authenticated customer-account ownership; qualified user signing/recovery and treasury HSM/multisig controls'],
  ['live-collection', 'Verified funding, collection, asset exchange, excess refunds and failed-operation recovery'],
  ['treasury-operations', 'Separate custody; replenishment, alerts, failover, spend limits and outage rehearsals'],
  ['deployment', 'Approved target configuration, real bytecode/constructor/roles, TLS/workload/networking and deployed integration checks'],
  ['reconciliation', 'Independent finality/custody checks, continuous dual-ledger matching, discrepancies, backups and restoration'],
  ['legal-custody-financial-operations', 'All five release-specific accountable signed gate approvals and underlying evidence; an authorized owner may cover multiple roles'],
].map(([id, requirement]) => ({ id, requirement, status: 'NOT_VERIFIED', evidenceDigest: null }));
const report = {
  schemaVersion: 1, status: 'BLOCKED', financialExecutionEnabled: false,
  scope: 'Undeployed source/artifact inventory and readiness gaps; not an independent audit or approval',
  releaseDigest, contractSetDigest, sourceDigests, artifacts,
  candidateNetworks: ['84532', '31337'], baseMainnetCompatible: false,
  mainnetBlocker: 'Qualification account, factory and paymaster constructors reject Base mainnet; a tested, approved production candidate is required',
  prospectiveRelease, releasePolicy, releaseDecision,
  economicPolicy: JSON.parse(await readFile(new URL('../../services/control-foundation/config/approved-monetary-policy.json', import.meta.url), 'utf8')),
  requiredQualification,
};
const directory = new URL('../../docs/qualification/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('PAYMASTER_CANDIDATE_MANIFEST.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log('Wrote candidate inventory: BLOCKED; no mainnet compatibility or deployment; external review advisory');
// Inventory creation succeeds; its result is explicitly blocked. It grants no execution capability.
