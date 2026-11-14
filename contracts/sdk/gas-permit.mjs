import { AbiCoder, TypedDataEncoder, concat, getAddress, getBytes, keccak256, sha256 } from 'ethers';
import { validateGasQuote, gasUnits } from '../../services/control-foundation/src/gas-policy.ts';

const coder = AbiCoder.defaultAbiCoder();
export const gasPermitAbi = 'tuple(bytes32 reservationId,bytes32 quoteDigest,bytes32 paymentAsset,uint256 maximumPaymentUnits,uint256 maximumNetworkWei,uint48 validAfter,uint48 validUntil,uint64 revision)';
export const gasPermitTypes = { GasPermit: [
  ['operationDigest', 'bytes32'], ['reservationId', 'bytes32'], ['quoteDigest', 'bytes32'], ['paymentAsset', 'bytes32'],
  ['maximumPaymentUnits', 'uint256'], ['maximumNetworkWei', 'uint256'], ['validAfter', 'uint48'], ['validUntil', 'uint48'], ['revision', 'uint64'],
].map(([name, type]) => ({ name, type })) };
function uint(value, bits = 256) {
  const result = gasUnits(value);
  if (result >= 1n << BigInt(bits)) throw new Error('Permit integer exceeds contract precision');
  return result;
}
function hash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid reservation journal hash');
  return '0x' + value;
}
function hex(value, size) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value) || (size !== undefined && getBytes(value).length !== size))
    throw new Error('Invalid packed operation bytes');
  return value;
}
/** Build signing material only. User and treasury keys remain in their respective signing systems.
 * The caller must load the committed reservation/receipt from its trusted ledger, not a request. */
export function prepareGasPermit({ quote, operationId, reserveReceipt, entryPoint, paymaster, userOperation, revision, now }) {
  validateGasQuote(quote, now);
  // This adapter uses the canonical smart-account address as ownerRef. Opaque customer IDs
  // require a separately authenticated identity adapter before constructing this quote.
  if (getAddress(quote.ownerRef) !== getAddress(userOperation.sender)) throw new Error('Gas reservation belongs to another sending account');
  uint(reserveReceipt.sequence); hash(reserveReceipt.requestHash); hash(reserveReceipt.eventHash);
  if (reserveReceipt.sequence === '0') throw new Error('Gas permit requires a committed reservation');
  const planned = quote.operations.find(item => item.operationId === operationId);
  if (!planned) throw new Error('Unquoted operation');
  const header = hex(userOperation.paymasterAndData, 52);
  if (getAddress(header.slice(0, 42)) !== getAddress(paymaster)) throw new Error('Wrong paymaster header');
  if (sha256(hex(userOperation.callData)).slice(2) !== planned.callDigest) throw new Error('Operation call differs from quoted digest');
  const accountLimits = hex(userOperation.accountGasLimits, 32), fees = hex(userOperation.gasFees, 32);
  const maxPriority = BigInt('0x' + fees.slice(2, 34)), maxFee = BigInt('0x' + fees.slice(34));
  if (maxPriority > maxFee || maxFee > gasUnits(planned.maxFeePerGasWei)) throw new Error('Operation gas price exceeds quote');
  const requiredGas = BigInt('0x' + accountLimits.slice(2, 34)) + BigInt('0x' + accountLimits.slice(34))
    + uint(userOperation.preVerificationGas) + BigInt('0x' + header.slice(42, 74)) + BigInt('0x' + header.slice(74));
  if (requiredGas > gasUnits(planned.executionGasLimit)) throw new Error('Quote omits account/paymaster/bundle gas');
  const maximumNetworkWei = gasUnits(planned.executionGasLimit) * gasUnits(planned.maxFeePerGasWei)
    + gasUnits(planned.l1DataFeeCapWei) + gasUnits(planned.otherNetworkFeeCapWei);
  const reservationId = keccak256(coder.encode(['string', 'string', 'string', 'string', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
    ['ORIO-GAS-RESERVATION/v1', quote.chainId, quote.transactionId, operationId, hash(quote.digest), reserveReceipt.sequence,
      hash(reserveReceipt.requestHash), hash(reserveReceipt.eventHash)]));
  const operationDigest = keccak256(coder.encode(
    ['address', 'address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
    [getAddress(entryPoint), getAddress(userOperation.sender), uint(userOperation.nonce), keccak256(hex(userOperation.initCode)),
      keccak256(userOperation.callData), accountLimits, userOperation.preVerificationGas, fees, keccak256(header)]));
  const permit = { reservationId, quoteDigest: hash(quote.digest), paymentAsset: sha256(new TextEncoder().encode(quote.paymentAsset)),
    maximumPaymentUnits: uint(quote.maximumPaymentUnits).toString(), maximumNetworkWei: uint(maximumNetworkWei.toString()).toString(),
    validAfter: Math.floor(Date.parse(quote.estimatedAt) / 1000).toString(),
    validUntil: Math.floor(Date.parse(quote.expiresAt) / 1000).toString(), revision: uint(revision, 64).toString() };
  const domain = { name: 'ORIO Gas Permit', version: '1', chainId: quote.chainId, verifyingContract: getAddress(paymaster) };
  const value = { operationDigest, ...permit };
  return { permit, domain, types: gasPermitTypes, value, digest: TypedDataEncoder.hash(domain, gasPermitTypes, value), header };
}

export function attachGasConsents(signingMaterial, userConsent, operatorConsent) {
  return concat([signingMaterial.header,
    coder.encode([gasPermitAbi, 'bytes', 'bytes'], [signingMaterial.permit, hex(userConsent), hex(operatorConsent)])]);
}
