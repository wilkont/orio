import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileContracts } from '../scripts/compile.mjs';

import { Interface, AbiCoder, keccak256, toUtf8Bytes, ZeroAddress, ZeroHash } from 'ethers';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { createBlock } from '@ethereumjs/block';
import { createVM, runTx } from '@ethereumjs/vm';
import { createLegacyTx } from '@ethereumjs/tx';
import { createAccount, createAddressFromPrivateKey, hexToBytes, bytesToHex, createAddressFromString } from '@ethereumjs/util';

const artifacts = compileContracts(true);
const policyDigest = keccak256(toUtf8Bytes('synthetic-reviewed-policy'));

async function fixture() {
  const common = createCustomCommon({ chainId: 31337 }, Mainnet, { hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });
  // Fixed public fixture keys for an offline VM only.
  const key = hexToBytes('0x' + '11'.repeat(32));
  const outsiderKey = hexToBytes('0x' + '22'.repeat(32));
  const sender = createAddressFromPrivateKey(key);
  for (const candidate of [key, outsiderKey])
    await vm.stateManager.putAccount(createAddressFromPrivateKey(candidate),
      createAccount({ nonce: 0n, balance: 10n ** 24n }));
  let time = 1000n;
  let operation = 0;
  async function transact(data, to, signingKey = key) {
    const account = await vm.stateManager.getAccount(createAddressFromPrivateKey(signingKey));
    const tx = createLegacyTx({ nonce: account.nonce, gasLimit: 15000000n, gasPrice: 1000000000n,
      data: hexToBytes(data), ...(to ? { to: createAddressFromString(to) } : {}) }, { common }).sign(signingKey);
    return runTx(vm, { tx, block: createBlock({
      header: { number: 1n, timestamp: time, gasLimit: 30000000n, baseFeePerGas: 7n },
    }, { common }) });
  }
  async function deploy(file, name, args) {
    const artifact = artifacts[file][name];
    const api = new Interface(artifact.abi);
    const result = await transact('0x' + artifact.evm.bytecode.object + api.encodeDeploy(args).slice(2));
    assert.equal(result.execResult.exceptionError, undefined);
    return { address: result.createdAddress.toString(), api };
  }
  async function call(contract, name, args = [], signingKey = key) {
    return transact(contract.api.encodeFunctionData(name, args), contract.address, signingKey);
  }
  async function read(contract, name, args = []) {
    const result = await vm.evm.runCall({
      to: createAddressFromString(contract.address), caller: sender,
      data: hexToBytes(contract.api.encodeFunctionData(name, args)), isStatic: true,
      skipNonceIncrement: true,
    });
    assert.equal(result.execResult.exceptionError, undefined);
    return contract.api.decodeFunctionResult(name, bytesToHex(result.execResult.returnValue));
  }
  const authority = await deploy('src/ORIOGovernanceTimelock.sol', 'ORIOGovernanceTimelock',
    [5, [sender.toString()], [ZeroAddress]]);
  const registry = await deploy('src/MasterAssetRegistry.sol', 'MasterAssetRegistry', [authority.address]);
  const first = await deploy('test/MockTokenMetadata.sol', 'MockTokenMetadata', [6]);
  const second = await deploy('test/MockTokenMetadata.sol', 'MockTokenMetadata', [6]);
  async function schedule(contract, name, args) {
    const data = contract.api.encodeFunctionData(name, args);
    const salt = keccak256(toUtf8Bytes('operation-' + operation++));
    const result = await call(authority, 'schedule', [contract.address, 0, data, ZeroHash, salt,
      (await read(authority, 'getMinDelay'))[0]]);
    assert.equal(result.execResult.exceptionError, undefined);
    return { contract, data, salt };
  }
  async function execute(plan) {
    return call(authority, 'execute', [plan.contract.address, 0, plan.data, ZeroHash, plan.salt]);
  }
  async function govern(contract, name, args) {
    const plan = await schedule(contract, name, args);
    time += (await read(authority, 'getMinDelay'))[0];
    return execute(plan);
  }
  const assetId = token => keccak256(AbiCoder.defaultAbiCoder().encode(['uint256', 'address'], [31337, token.address]));
  async function approve(token) {
    assert.equal((await govern(registry, 'registerCandidate', [token.address, 6, policyDigest])).execResult.exceptionError, undefined);
    assert.equal((await govern(registry, 'approveAsset', [assetId(token), policyDigest])).execResult.exceptionError, undefined);
  }
  return { authority, registry, first, second, outsiderKey, call, read, govern, schedule, execute, assetId, approve,
    advance: seconds => { time += seconds; } };
}

test('unqualified direct callers cannot register/elect assets and metadata must match deployed token', async () => {
  const f = await fixture();
  assert.ok((await f.call(f.registry, 'registerCandidate',
    [f.first.address, 6, policyDigest], f.outsiderKey)).execResult.exceptionError);
  assert.ok((await f.govern(f.registry, 'registerCandidate',
    [f.first.address, 18, policyDigest])).execResult.exceptionError);
  await f.approve(f.first);
  assert.equal((await f.read(f.registry, 'currentMaster'))[0], ZeroHash);
  assert.equal((await f.govern(f.registry, 'electInitial',
    [f.assetId(f.first), policyDigest])).execResult.exceptionError, undefined);
  assert.equal((await f.read(f.registry, 'currentMaster'))[0], f.assetId(f.first));
  assert.equal((await f.read(f.registry, 'issuanceAllowed', [1]))[0], true);
  assert.ok((await f.govern(f.registry, 'electInitial',
    [f.assetId(f.first), policyDigest])).execResult.exceptionError);
});

test('migration freezes issuance and atomically replaces one designation with epoch fencing', async () => {
  const f = await fixture();
  await f.approve(f.first); await f.approve(f.second);
  await f.govern(f.registry, 'electInitial', [f.assetId(f.first), policyDigest]);
  await f.govern(f.registry, 'authorizeSecondary', [f.assetId(f.second), policyDigest]);
  assert.ok((await f.govern(f.registry, 'beginMigration', [0, 1, f.assetId(f.second), policyDigest])).execResult.exceptionError);
  assert.equal((await f.govern(f.registry, 'beginMigration', [1, 1, f.assetId(f.second), policyDigest])).execResult.exceptionError, undefined);
  assert.equal((await f.read(f.registry, 'issuanceAllowed', [1]))[0], false);
  assert.ok((await f.govern(f.registry, 'beginMigration', [1, 1, f.assetId(f.second), policyDigest])).execResult.exceptionError);
  assert.ok((await f.govern(f.registry, 'completeMigration', [1, 2, f.assetId(f.first), policyDigest])).execResult.exceptionError);
  assert.equal((await f.govern(f.registry, 'completeMigration', [1, 2, f.assetId(f.second), policyDigest])).execResult.exceptionError, undefined);
  assert.equal((await f.read(f.registry, 'currentMaster'))[0], f.assetId(f.second));
  assert.equal((await f.read(f.registry, 'assets', [f.assetId(f.first)]))[2], 4n);
  assert.equal((await f.read(f.registry, 'assets', [f.assetId(f.second)]))[2], 2n);
  assert.equal((await f.read(f.registry, 'epoch'))[0], 2n);
  assert.equal((await f.read(f.registry, 'issuanceAllowed', [1]))[0], false);
});

test('aborted migration preserves the current asset and requires a separately governed resume', async () => {
  const f = await fixture();
  await f.approve(f.first); await f.approve(f.second);
  await f.govern(f.registry, 'electInitial', [f.assetId(f.first), policyDigest]);
  await f.govern(f.registry, 'beginMigration', [1, 1, f.assetId(f.second), policyDigest]);
  assert.equal((await f.govern(f.registry, 'abortMigration', [1, 2, policyDigest])).execResult.exceptionError, undefined);
  assert.equal((await f.read(f.registry, 'currentMaster'))[0], f.assetId(f.first));
  assert.equal((await f.read(f.registry, 'pendingMaster'))[0], ZeroHash);
  assert.equal((await f.read(f.registry, 'issuanceAllowed', [1]))[0], false);
  assert.equal((await f.govern(f.registry, 'resumeMaster', [1, 3, policyDigest])).execResult.exceptionError, undefined);
  assert.equal((await f.read(f.registry, 'issuanceAllowed', [1]))[0], true);
});

test('timelock enforces waiting and its immutable minimum-delay floor', async () => {
  const f = await fixture();
  const plan = await f.schedule(f.registry, 'registerCandidate', [f.first.address, 6, policyDigest]);
  assert.ok((await f.execute(plan)).execResult.exceptionError);
  f.advance(5n);
  assert.equal((await f.execute(plan)).execResult.exceptionError, undefined);
  assert.ok((await f.govern(f.authority, 'updateDelay', [1])).execResult.exceptionError);
  assert.equal((await f.read(f.authority, 'getMinDelay'))[0], 5n);
  assert.equal((await f.govern(f.authority, 'updateDelay', [10])).execResult.exceptionError, undefined);
  assert.equal((await f.read(f.authority, 'getMinDelay'))[0], 10n);
});

test('queued completion from an aborted attempt cannot complete a later migration', async () => {
  const f = await fixture();
  await f.approve(f.first); await f.approve(f.second);
  await f.govern(f.registry, 'electInitial', [f.assetId(f.first), policyDigest]);
  await f.govern(f.registry, 'beginMigration', [1, 1, f.assetId(f.second), policyDigest]);
  const obsoleteCompletion = await f.schedule(f.registry, 'completeMigration',
    [1, 2, f.assetId(f.second), policyDigest]);
  await f.govern(f.registry, 'abortMigration', [1, 2, policyDigest]);
  assert.equal((await f.read(f.registry, 'revision'))[0], 3n);
  await f.govern(f.registry, 'beginMigration', [1, 3, f.assetId(f.second), policyDigest]);
  assert.ok((await f.execute(obsoleteCompletion)).execResult.exceptionError);
  assert.equal((await f.read(f.registry, 'currentMaster'))[0], f.assetId(f.first));
  assert.equal((await f.read(f.registry, 'issuanceAllowed', [1]))[0], false);
  assert.equal((await f.govern(f.registry, 'completeMigration',
    [1, 4, f.assetId(f.second), policyDigest])).execResult.exceptionError, undefined);
});

test('queued resume cannot reopen a later pause with the same election epoch', async () => {
  const f = await fixture();
  await f.approve(f.first);
  await f.govern(f.registry, 'electInitial', [f.assetId(f.first), policyDigest]);
  await f.govern(f.registry, 'pauseMaster', [1, 1, policyDigest]);
  const obsoleteResume = await f.schedule(f.registry, 'resumeMaster', [1, 2, policyDigest]);
  await f.govern(f.registry, 'resumeMaster', [1, 2, policyDigest]);
  await f.govern(f.registry, 'pauseMaster', [1, 3, policyDigest]);
  assert.ok((await f.execute(obsoleteResume)).execResult.exceptionError);
  assert.equal((await f.read(f.registry, 'issuanceAllowed', [1]))[0], false);
});
