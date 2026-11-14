import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bytesToHex } from '@ethereumjs/util';
import { sha256 } from 'ethers';
import { quoteGas } from '../../services/control-foundation/src/gas-policy.ts';
import { prepareGasPermit, attachGasConsents } from '../sdk/gas-permit.mjs';
import { paymasterFixture } from './helpers/paymaster-fixture.mjs';

test('signed permit material binds the exact quote, committed ledger receipt, operation and contract domain', async () => {
  const f = await paymasterFixture(), { operation } = await f.signOperation();
  operation.nonce = operation.nonce.toString(); operation.preVerificationGas = operation.preVerificationGas.toString();
  operation.paymasterAndData = operation.paymasterAndData.slice(0, 106);
  const now = new Date(Number(f.time()) * 1000).toISOString();
  const quote = quoteGas({ transactionId: 'tx', ownerRef: f.account.address, chainId: '84532', action: 'TRANSFER',
    actionDigest: 'a'.repeat(64), paymentAsset: 'USDC_TEST', paymentKind: 'STABLECOIN', paymentMethod: 'PREPAID',
    rate: { unitsNumerator: '1', weiDenominator: '1000000000000', evidenceDigest: 'b'.repeat(64) },
    estimatedAt: now, expiresAt: new Date(Number(f.time() + 60n) * 1000).toISOString(),
    operations: [{ operationId: 'op', callDigest: sha256(operation.callData).slice(2), executionGasLimit: '2100000',
      maxFeePerGasWei: '1000000000', l1DataFeeCapWei: '0', otherNetworkFeeCapWei: '0' }] }, now);
  const request = { quote, operationId: 'op', reserveReceipt: { sequence: '1', requestHash: 'c'.repeat(64), eventHash: 'd'.repeat(64) },
    entryPoint: f.entry.address, paymaster: f.paymaster.address, userOperation: operation, revision: '1', now };
  const material = prepareGasPermit(request);
  assert.equal(material.digest, (await f.read(f.paymaster, 'permitHash', [operation, material.permit]))[0]);
  operation.paymasterAndData = attachGasConsents(material, f.owner.signingKey.sign(material.digest).serialized,
    f.operator.signingKey.sign(material.digest).serialized);
  operation.signature = f.owner.signingKey.sign((await f.read(f.entry, 'getUserOpHash', [operation]))[0]).serialized;
  f.advance(1);
  const executed = await f.submit(operation);
  assert.equal(executed.execResult.exceptionError, undefined, bytesToHex(executed.execResult.returnValue));
  const anotherReceipt = prepareGasPermit({ ...request, userOperation: { ...operation, paymasterAndData: material.header },
    reserveReceipt: { ...request.reserveReceipt, sequence: '2' } });
  assert.notEqual(anotherReceipt.permit.reservationId, material.permit.reservationId);
});
test('permit preparation rejects changed calldata, omitted overhead, mismatched paymaster, numbers and uint overflow', async () => {
  const f = await paymasterFixture(), { operation } = await f.signOperation();
  operation.nonce = '0'; operation.preVerificationGas = '100000'; operation.paymasterAndData = operation.paymasterAndData.slice(0, 106);
  const now = new Date(Number(f.time()) * 1000).toISOString();
  function quote(limit = '2100000') { return quoteGas({ transactionId: 'tx', ownerRef: f.account.address, chainId: '84532', action: 'TRANSFER',
    actionDigest: 'a'.repeat(64), paymentAsset: 'USDC_TEST', paymentKind: 'STABLECOIN', paymentMethod: 'PREPAID',
    rate: { unitsNumerator: '1', weiDenominator: '1000000000000', evidenceDigest: 'b'.repeat(64) },
    estimatedAt: now, expiresAt: new Date(Number(f.time() + 60n) * 1000).toISOString(), operations: [{ operationId: 'op',
      callDigest: sha256(operation.callData).slice(2), executionGasLimit: limit, maxFeePerGasWei: '1000000000', l1DataFeeCapWei: '0', otherNetworkFeeCapWei: '0' }] }, now); }
  const request = { quote: quote(), operationId: 'op', reserveReceipt: { sequence: '1', requestHash: 'c'.repeat(64), eventHash: 'd'.repeat(64) },
    entryPoint: f.entry.address, paymaster: f.paymaster.address, userOperation: operation, revision: '1', now };
  assert.throws(() => prepareGasPermit({ ...request, userOperation: { ...operation, callData: '0x' } }), /quoted digest/);
  assert.throws(() => prepareGasPermit({ ...request, quote: quote('100000') }), /omits/);
  assert.throws(() => prepareGasPermit({ ...request, paymaster: f.target.address }), /Wrong/);
  assert.throws(() => prepareGasPermit({ ...request, userOperation: { ...operation, sender: f.owner.address } }), /another sending account/);
  assert.throws(() => prepareGasPermit({ ...request, userOperation: { ...operation, preVerificationGas: 100000 } }), /integer strings/);
  assert.throws(() => prepareGasPermit({ ...request, revision: (1n << 64n).toString() }), /precision/);
});
