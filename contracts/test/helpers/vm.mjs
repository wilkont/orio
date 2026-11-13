import assert from 'node:assert/strict';
import { Interface, ZeroAddress, ZeroHash, keccak256, toUtf8Bytes } from 'ethers';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { createBlock } from '@ethereumjs/block';
import { createVM, runTx } from '@ethereumjs/vm';
import { createLegacyTx } from '@ethereumjs/tx';
import { createAccount, createAddressFromPrivateKey, hexToBytes, bytesToHex, createAddressFromString } from '@ethereumjs/util';

export async function createFixture(artifacts, chainId = 31337) {
  const common = createCustomCommon({ chainId }, Mainnet, { hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });
  // These published deterministic keys are valid ONLY in this disconnected, disposable VM.
  const key = hexToBytes('0x' + '11'.repeat(32)), outsiderKey = hexToBytes('0x' + '22'.repeat(32));
  const sender = createAddressFromPrivateKey(key);
  for (const candidate of [key, outsiderKey]) await vm.stateManager.putAccount(createAddressFromPrivateKey(candidate),
    createAccount({ nonce: 0n, balance: 10n ** 24n }));
  let time = 1000n, operation = 0;
  async function transact(data, to, signingKey = key, value = 0n) {
    const account = await vm.stateManager.getAccount(createAddressFromPrivateKey(signingKey));
    const tx = createLegacyTx({ nonce: account.nonce, gasLimit: 25000000n, gasPrice: 1000000000n, value,
      data: hexToBytes(data), ...(to ? { to: createAddressFromString(to) } : {}) }, { common }).sign(signingKey);
    return runTx(vm, { tx, block: createBlock({ header: { number: 1n, timestamp: time,
      gasLimit: 30000000n, baseFeePerGas: 7n } }, { common }) });
  }
  async function deploy(file, name, args) {
    const artifact = artifacts[file][name], api = new Interface(artifact.abi);
    const result = await transact('0x' + artifact.evm.bytecode.object + api.encodeDeploy(args).slice(2));
    assert.equal(result.execResult.exceptionError, undefined, name + ' deployment: ' + bytesToHex(result.execResult.returnValue));
    return { address: result.createdAddress.toString(), api };
  }
  const call = (contract, name, args = [], signingKey = key, value = 0n) =>
    transact(contract.api.encodeFunctionData(name, args), contract.address, signingKey, value);
  async function read(contract, name, args = []) {
    const result = await vm.evm.runCall({ to: createAddressFromString(contract.address), caller: sender,
      data: hexToBytes(contract.api.encodeFunctionData(name, args)), isStatic: true, skipNonceIncrement: true });
    assert.equal(result.execResult.exceptionError, undefined, name + ': ' + bytesToHex(result.execResult.returnValue));
    return contract.api.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue));
  }
  function logs(result, contract) {
    return (result.execResult.logs ?? []).filter(([address]) => bytesToHex(address).toLowerCase() === contract.address.toLowerCase())
      .map(([, topics, data]) => contract.api.parseLog({ topics: topics.map(bytesToHex), data: bytesToHex(data) }));
  }
  const authority = await deploy('src/ORIOGovernanceTimelock.sol', 'ORIOGovernanceTimelock', [5, [sender.toString()], [ZeroAddress]]);
  async function govern(contract, name, args) {
    const data = contract.api.encodeFunctionData(name, args), salt = keccak256(toUtf8Bytes('operation-' + operation++));
    const delay = (await read(authority, 'getMinDelay'))[0];
    const plan = await call(authority, 'schedule', [contract.address, 0, data, ZeroHash, salt, delay]);
    assert.equal(plan.execResult.exceptionError, undefined);
    time += delay;
    return call(authority, 'execute', [contract.address, 0, data, ZeroHash, salt]);
  }
  return { vm, key, outsiderKey, sender: sender.toString(), deploy, call, read, transact, logs, authority, govern,
    time: () => time, advance: seconds => { time += BigInt(seconds); }, setTime: seconds => { time = BigInt(seconds); },
    balance: async address => (await vm.stateManager.getAccount(createAddressFromString(address)))?.balance ?? 0n };
}
