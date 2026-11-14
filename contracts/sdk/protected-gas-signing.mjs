import {getAddress,verifyTypedData} from 'ethers';
import {prepareGasPermit} from './gas-permit.mjs';

/** Qualification coordinator for company-operated protected signing. The backend
 * exposes typed signing only: no private key, raw transaction or broadcast API.
 * Policy and ledger adapters are trusted owner configuration, never customer input.
 * Production key provisioning, protected hardware/service and mainnet are not enabled.
 */
export async function signCompanyGasPermit(ledger,backend,inputPolicy,input,now){
 const policy=structuredClone(inputPolicy),request=structuredClone(input);
 if(policy.chainId!=='84532'||typeof policy.revision!=='string'||!/^[1-9][0-9]*$/.test(policy.revision))
  throw new Error('Invalid qualification signing policy');
 const signer=getAddress(policy.signer),entryPoint=getAddress(policy.entryPoint),paymaster=getAddress(policy.paymaster);
 if([signer,entryPoint,paymaster].includes('0x'+'0'.repeat(40))||new Set([signer,entryPoint,paymaster]).size!==3)
  throw new Error('Invalid signing authority identities');
 const {quote,reserveReceipt}=await ledger.signingReservation(request.transactionId);
 if(quote.chainId!==policy.chainId||quote.transactionId!==request.transactionId)throw new Error('Signing reservation deployment mismatch');
 const material=prepareGasPermit({quote,operationId:request.operationId,reserveReceipt,entryPoint,paymaster,
  userOperation:request.userOperation,revision:policy.revision,now});
 const preparedRef='eip155:'+policy.chainId+':reservation:'+material.permit.reservationId.slice(2);
 const planned=quote.operations.find(op=>op.operationId===request.operationId);
 await ledger.prepare(request.transactionId,request.operationId,preparedRef,planned.callDigest);
 await ledger.prepareProtectedSignature(request.transactionId,request.operationId,preparedRef,material.digest);
 let signature;
 try{
  signature=await backend.signTypedData(structuredClone(material.domain),structuredClone(material.types),structuredClone(material.value));
  if(getAddress(verifyTypedData(material.domain,material.types,material.value,signature))!==signer)throw new Error('Wrong protected signer');
 }catch{
  // Protected backend errors may contain credentials, key references or request details.
  throw new Error('Protected signing failed; reservation remains prepared');
 }
 return {material,preparedRef,operatorConsent:signature,financialExecutionEnabled:false};
}
