import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import solc from 'solc';

export function compileContracts(includeFixtures = false) {
  const names = ['ORIOGovernanceTimelock', 'MasterAssetRegistry', 'ORIOTreasuryPaymaster', 'ORIOGasAccount', 'ORIOGasAccountFactory',
    'ORIOCurrency', 'ORIOReserveVault', 'ORIOMonetaryController', 'ORIORedemptionLocks'];
  const files = names.map(name => 'src/' + name + '.sol');
  if (includeFixtures) files.push('test/MockTokenMetadata.sol', 'test/GasExecutionTarget.sol', 'test/MonetaryFixtures.sol',
    '@account-abstraction/contracts/core/EntryPoint.sol');
  const sources = Object.fromEntries(files.map(file => [file, {
    content: readFileSync(new URL('../' + (file.startsWith('@') ? 'node_modules/' : '') + file, import.meta.url), 'utf8'),
  }]));
  const monetary = new Set(['src/ORIOCurrency.sol', 'src/ORIOReserveVault.sol', 'src/ORIOMonetaryController.sol', 'src/ORIORedemptionLocks.sol']);
  const compile = (selected, viaIR) => {
    const outputSelection = Object.fromEntries(selected.map(file => [file, { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] }]));
    const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources,
      settings: { optimizer: { enabled: true, runs: viaIR ? 1 : 200 }, evmVersion: 'cancun', viaIR, outputSelection },
    }), { import: path => {
      if (!path.startsWith('@openzeppelin/contracts/') && !path.startsWith('@account-abstraction/contracts/')) return { error: 'Unexpected import' };
      return { contents: readFileSync(new URL('../node_modules/' + path, import.meta.url), 'utf8') };
    } }));
    const errors = (result.errors ?? []).filter(error => error.severity === 'error');
    if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n'));
    return result.contracts;
  };
  // Preserve the original components' compiler path. The monetary controller and its embedded
  // child contracts share IR compilation; their artifact templates match actual child deployments.
  const compiled = { ...compile(files.filter(file => !monetary.has(file)), false), ...compile([...monetary], true) };
  for (const name of names) {
    const artifact = compiled['src/' + name + '.sol'][name];
    if (artifact.evm.deployedBytecode.object.length / 2 > 24576 || artifact.evm.bytecode.object.length / 2 > 49152)
      throw new Error(name + ' exceeds EVM deployment limits');
  }
  return compiled;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const artifacts = compileContracts();
  const directory = new URL('../artifacts/', import.meta.url);
  await mkdir(directory, { recursive: true });
  for (const name of ['ORIOGovernanceTimelock', 'MasterAssetRegistry', 'ORIOTreasuryPaymaster', 'ORIOGasAccount', 'ORIOGasAccountFactory',
    'ORIOCurrency', 'ORIOReserveVault', 'ORIOMonetaryController', 'ORIORedemptionLocks']) {
    await writeFile(new URL(name + '.json', directory), JSON.stringify({
      compiler: solc.version(), contractName: name, ...artifacts['src/' + name + '.sol'][name],
    }, null, 2) + '\n');
  }
  console.log('Compiled ORIO contracts to ' + fileURLToPath(directory));
}
