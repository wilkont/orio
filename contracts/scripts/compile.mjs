import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import solc from 'solc';

export function compileContracts(includeFixtures = false) {
  const names = ['ORIOGovernanceTimelock', 'MasterAssetRegistry', 'ORIOTreasuryPaymaster', 'ORIOGasAccount', 'ORIOGasAccountFactory'];
  const files = names.map(name => 'src/' + name + '.sol');
  if (includeFixtures) files.push('test/MockTokenMetadata.sol', 'test/GasExecutionTarget.sol',
    '@account-abstraction/contracts/core/EntryPoint.sol');
  const sources = Object.fromEntries(files.map(file => [file, {
    content: readFileSync(new URL('../' + (file.startsWith('@') ? 'node_modules/' : '') + file, import.meta.url), 'utf8'),
  }]));
  const result = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } } },
  }), { import: path => {
    if (!path.startsWith('@openzeppelin/contracts/') && !path.startsWith('@account-abstraction/contracts/')) return { error: 'Unexpected import' };
    return { contents: readFileSync(new URL('../node_modules/' + path, import.meta.url), 'utf8') };
  } }));
  const errors = (result.errors ?? []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
  return result.contracts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const artifacts = compileContracts();
  const directory = new URL('../artifacts/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const name of ['ORIOGovernanceTimelock', 'MasterAssetRegistry', 'ORIOTreasuryPaymaster', 'ORIOGasAccount', 'ORIOGasAccountFactory']) {
    await writeFile(new URL(name + '.json', directory), JSON.stringify({
      compiler: solc.version(), contractName: name, ...artifacts['src/' + name + '.sol'][name],
    }, null, 2) + '\n');
  }
  console.log('Compiled ORIO contracts to ' + fileURLToPath(directory));
}
