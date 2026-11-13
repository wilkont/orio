import assert from 'node:assert/strict';
import { AbiCoder, Interface, Wallet, concat, keccak256, toBeHex, toUtf8Bytes, ZeroHash } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { compileContracts } from '../../scripts/compile.mjs';
import { createFixture } from './vm.mjs';

const artifacts = compileContracts(true), coder = AbiCoder.defaultAbiCoder();
const permitType = 'tuple(bytes32 reservationId,bytes32 quoteDigest,bytes32 paymentAsset,uint256 maximumPaymentUnits,uint256 maximumNetworkWei,uint48 validAfter,uint48 validUntil,uint64 revision)';
const hash = value => keccak256(toUtf8Bytes(value));
export async function paymasterFixture(options = {}) {
  const f = await createFixture(artifacts, 84532);
  const entry = await f.deploy('@account-abstraction/contracts/core/EntryPoint.sol', 'EntryPoint', []);
  const paymaster = await f.deploy('src/ORIOTreasuryPaymaster.sol', 'ORIOTreasuryPaymaster', [entry.address, f.authority.address]);
  const factory = await f.deploy('src/ORIOGasAccountFactory.sol', 'ORIOGasAccountFactory', [entry.address, paymaster.address]);
  const target = await f.deploy('test/GasExecutionTarget.sol', 'GasExecutionTarget', []);
  const owner = new Wallet(bytesToHex(f.outsiderKey)), operator = new Wallet(bytesToHex(f.key));
  assert.equal((await f.govern(paymaster, 'configure', [operator.address, true, 0])).execResult.exceptionError, undefined);
  if (options.fund !== false) assert.equal((await f.call(paymaster, 'deposit', [], f.key, 10n ** 18n)).execResult.exceptionError, undefined);
  const salt = ZeroHash, address = (await f.read(factory, 'getAddress', [owner.address, salt]))[0];
  const account = { address, api: new Interface(artifacts['src/ORIOGasAccount.sol'].ORIOGasAccount.abi) };
  if (!options.counterfactual) assert.equal((await f.call(factory, 'createAccount', [owner.address, salt])).execResult.exceptionError, undefined);
  let sequence = 0;
  async function signOperation({ nonce, method = 'record', maximumNetworkWei = 10n ** 16n,
    expiry = f.time() + 60n, reservationId, wrongUser = false, wrongOperator = false } = {}) {
    const header = concat([paymaster.address, toBeHex(800000n, 16), toBeHex(100000n, 16)]);
    const operation = { sender: address, nonce: nonce ?? (await f.read(entry, 'getNonce', [address, 0]))[0],
      initCode: options.counterfactual ? concat([factory.address, factory.api.encodeFunctionData('createAccount', [owner.address, salt])]) : '0x',
      callData: account.api.encodeFunctionData('execute', [target.address, 0,
        target.api.encodeFunctionData(method, method === 'record' ? [42] : [])]),
      accountGasLimits: concat([toBeHex(800000n, 16), toBeHex(300000n, 16)]), preVerificationGas: 100000n,
      gasFees: concat([toBeHex(1000000000n, 16), toBeHex(1000000000n, 16)]), paymasterAndData: header, signature: '0x' };
    const permit = { reservationId: reservationId ?? hash('reservation-' + sequence++), quoteDigest: hash('synthetic-quote'),
      paymentAsset: hash('synthetic-prepaid-USDC'), maximumPaymentUnits: 1000000n, maximumNetworkWei,
      validAfter: f.time() - 1n, validUntil: expiry, revision: (await f.read(paymaster, 'revision'))[0] };
    const digest = (await f.read(paymaster, 'permitHash', [operation, permit]))[0];
    const userConsent = (wrongUser ? operator : owner).signingKey.sign(digest).serialized;
    const operatorConsent = (wrongOperator ? owner : operator).signingKey.sign(digest).serialized;
    operation.paymasterAndData = concat([header, coder.encode([permitType, 'bytes', 'bytes'], [permit, userConsent, operatorConsent])]);
    const operationHash = (await f.read(entry, 'getUserOpHash', [operation]))[0];
    operation.signature = owner.signingKey.sign(operationHash).serialized;
    return { operation, permit, operationHash };
  }
  async function submit(operation) { return f.call(entry, 'handleOps', [[operation], f.sender]); }
  return { ...f, entry, paymaster, factory, target, account, owner, operator, signOperation, submit };
}
