import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Interface } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { compileContracts } from '../scripts/compile.mjs';
import { createFixture } from './helpers/vm.mjs';
import { paymasterFixture as fixture } from './helpers/paymaster-fixture.mjs';
const artifacts = compileContracts(true);

test('real EntryPoint executes a gas-abstracted action with zero user/account ETH and company deposit payment', async () => {
  const f = await fixture(), before = (await f.read(f.paymaster, 'getDeposit'))[0];
  assert.equal(await f.balance(f.account.address), 0n);
  const { operation, permit, operationHash } = await f.signOperation(), result = await f.submit(operation);
  assert.equal(result.execResult.exceptionError, undefined, bytesToHex(result.execResult.returnValue));
  assert.equal((await f.read(f.target, 'value'))[0], 42n);
  assert.equal(await f.balance(f.account.address), 0n);
  const completed = f.logs(result, f.entry).find(event => event?.name === 'UserOperationEvent');
  assert.equal(completed.args.userOpHash, operationHash); assert.equal(completed.args.success, true);
  assert.ok(completed.args.actualGasCost > 0n);
  assert.equal(before - (await f.read(f.paymaster, 'getDeposit'))[0], completed.args.actualGasCost);
  assert.equal((await f.read(f.paymaster, 'usedReservations', [permit.reservationId]))[0], true);
  assert.ok(f.logs(result, f.paymaster).find(event => event?.name === 'GasExecutionObserved').args.costBeforePostOp < completed.args.actualGasCost);
});
test('counterfactual account deployment is included in the same funded user operation', async () => {
  const f = await fixture({ counterfactual: true }); const { operation } = await f.signOperation();
  const result = await f.submit(operation);
  assert.equal(result.execResult.exceptionError, undefined, bytesToHex(result.execResult.returnValue));
  assert.equal((await f.read(f.target, 'value'))[0], 42n);
  assert.equal(await f.balance(f.account.address), 0n);
});
test('business revert still costs company ETH and emits failed execution without any token collection', async () => {
  const f = await fixture(), before = (await f.read(f.paymaster, 'getDeposit'))[0];
  const { operation } = await f.signOperation({ method: 'fail' }), result = await f.submit(operation);
  assert.equal(result.execResult.exceptionError, undefined);
  const completed = f.logs(result, f.entry).find(event => event?.name === 'UserOperationEvent');
  assert.equal(completed.args.success, false); assert.ok(completed.args.actualGasCost > 0n);
  assert.equal(before - (await f.read(f.paymaster, 'getDeposit'))[0], completed.args.actualGasCost);
  assert.equal(f.logs(result, f.paymaster).find(event => event?.name === 'GasExecutionObserved').args.outcome, 1n);
});
test('missing user consent, missing operator consent and prefund above the signed cap all reject', async () => {
  const f = await fixture();
  for (const options of [{ wrongUser: true }, { wrongOperator: true }, { maximumNetworkWei: 1n }]) {
    const { operation, permit } = await f.signOperation(options), result = await f.submit(operation);
    assert.ok(result.execResult.exceptionError);
    assert.equal((await f.read(f.paymaster, 'usedReservations', [permit.reservationId]))[0], false);
  }
  assert.equal((await f.read(f.target, 'value'))[0], 0n);
});
test('expired authorization, replayed reservation and exact-operation mutations cannot spend the deposit', async () => {
  const f = await fixture();
  const expired = await f.signOperation({ expiry: f.time() - 1n });
  assert.ok((await f.submit(expired.operation)).execResult.exceptionError);
  const signed = await f.signOperation(); assert.equal((await f.submit(signed.operation)).execResult.exceptionError, undefined);
  const replay = await f.signOperation({ reservationId: signed.permit.reservationId });
  assert.ok((await f.submit(replay.operation)).execResult.exceptionError);
  const changed = await f.signOperation(); changed.operation.preVerificationGas++;
  const newHash = (await f.read(f.entry, 'getUserOpHash', [changed.operation]))[0];
  changed.operation.signature = f.owner.signingKey.sign(newHash).serialized;
  assert.ok((await f.submit(changed.operation)).execResult.exceptionError);
});
test('owner cannot bypass EntryPoint or withdraw treasury, paused/stale permits and empty treasury reject', async () => {
  const f = await fixture();
  assert.ok((await f.call(f.account, 'execute', [f.target.address, 0, f.target.api.encodeFunctionData('record', [99])], f.outsiderKey)).execResult.exceptionError);
  assert.ok((await f.call(f.paymaster, 'withdrawTo', [f.owner.address, 1n], f.outsiderKey)).execResult.exceptionError);
  const signed = await f.signOperation();
  assert.equal((await f.govern(f.paymaster, 'configure', [f.operator.address, false, 1])).execResult.exceptionError, undefined);
  assert.ok((await f.submit(signed.operation)).execResult.exceptionError);
  assert.equal((await f.govern(f.paymaster, 'configure', [f.operator.address, true, 2])).execResult.exceptionError, undefined);
  assert.ok((await f.submit(signed.operation)).execResult.exceptionError);
  const empty = await fixture({ fund: false }); const request = await empty.signOperation();
  assert.ok((await empty.submit(request.operation)).execResult.exceptionError);
});
test('qualification contracts cannot deploy on Base mainnet', async () => {
  const f = await createFixture(artifacts, 8453);
  const entry = await f.deploy('@account-abstraction/contracts/core/EntryPoint.sol', 'EntryPoint', []);
  for (const [name, args] of [
    ['ORIOTreasuryPaymaster', [entry.address, f.authority.address]],
    ['ORIOGasAccount', [entry.address, entry.address, f.sender]],
    ['ORIOGasAccountFactory', [entry.address, entry.address]],
  ]) {
    const artifact = artifacts['src/' + name + '.sol'][name], api = new Interface(artifact.abi);
    const result = await f.transact('0x' + artifact.evm.bytecode.object + api.encodeDeploy(args).slice(2));
    assert.ok(result.execResult.exceptionError, name + ' must reject mainnet');
  }
});
