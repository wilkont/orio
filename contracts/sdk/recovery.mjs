import { TypedDataEncoder,getAddress,ZeroAddress } from 'ethers';
const authorization=[{name:'digest',type:'bytes32'},{name:'ownerRevision',type:'uint256'}];
const recovery=[{name:'nextOwner',type:'address'},{name:'ownerRevision',type:'uint256'},{name:'recoveryNonce',type:'uint256'},{name:'validUntil',type:'uint48'}];
const cancellation=[{name:'recoveryAuthorization',type:'bytes32'},{name:'ownerRevision',type:'uint256'},{name:'validUntil',type:'uint48'}];
function integer(value,bits=256){
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(value)||BigInt(value)>=(1n<<BigInt(bits)))throw new Error('Invalid recovery integer');
  return value;
}
function digest(value){if(typeof value!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value))throw new Error('Invalid recovery digest');return value.toLowerCase();}
function prepared(input,primaryType,fields,value){
  if(!['84532','31337'].includes(input.chainId))throw new Error('Qualification network required');
  const account=getAddress(input.account);if(account===ZeroAddress)throw new Error('Account identity required');
  const domain={name:'ORIO Recoverable Account',version:'1',chainId:input.chainId,verifyingContract:account};
  const types={[primaryType]:fields};return {domain,types,value,digest:TypedDataEncoder.hash(domain,types,value)};
}
/** Offline signing material. Caller verifies current account revision and enrollment before signing. */
export function prepareAccountAuthorization(input){
  return prepared(input,'AccountAuthorization',authorization,{digest:digest(input.digest),ownerRevision:integer(input.ownerRevision)});
}
export function prepareRecovery(input){
  const nextOwner=getAddress(input.nextOwner);if(nextOwner===ZeroAddress)throw new Error('Replacement owner required');
  return prepared(input,'Recover',recovery,{nextOwner,ownerRevision:integer(input.ownerRevision),recoveryNonce:integer(input.recoveryNonce),validUntil:integer(input.validUntil,48)});
}
export function prepareRecoveryCancellation(input){
  return prepared(input,'CancelRecovery',cancellation,{recoveryAuthorization:digest(input.recoveryAuthorization),
    ownerRevision:integer(input.ownerRevision),validUntil:integer(input.validUntil,48)});
}
