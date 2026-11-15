import {readFile,writeFile} from 'node:fs/promises';
import {signed,preflight,submit,operation} from '../sdk/remaining-sepolia.ts';
let outcomeAmbiguous=false,transactionHash:string|null=null;
try{
 const id=process.argv[2],bytes=await readFile(process.argv[3]);if(bytes.length>8192)throw new Error('Oversized signing response');
 const tx=await signed(id,JSON.parse(bytes.toString('utf8'))),p=await operation(id);transactionHash=tx.hash;
 const fees=await preflight(id,tx);
 if(process.argv[4]!=='--broadcast-approved-base-sepolia'){
  console.log(JSON.stringify({status:'VERIFIED_NOT_SUBMITTED',operationId:id,transactionHash,...fees,financialExecutionEnabled:false}));
 }else{
  // Preserve the exact signed hash before the first network write. An existing
  // preparation must be reconciled; never silently replace it or request a new nonce.
  await writeFile(new URL('../artifacts/remaining-'+p.operationId+'-submission.json',import.meta.url),JSON.stringify({operationId:p.operationId,unsignedDigest:p.unsignedDigest,transactionHash,...fees},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:'SUBMISSION_PREPARED',operationId:id,transactionHash,financialExecutionEnabled:false}));
  outcomeAmbiguous=true;
  const result=await submit(tx);if(result!==transactionHash)throw new Error('Unexpected transaction reference');
  console.log(JSON.stringify({status:'SUBMITTED_QUALIFICATION_ONLY',operationId:id,transactionHash,financialExecutionEnabled:false}));
 }
}catch{console.error(JSON.stringify({status:outcomeAmbiguous?'SUBMISSION_OUTCOME_AMBIGUOUS':'BLOCKED_NOT_SUBMITTED',transactionHash,financialExecutionEnabled:false}));process.exitCode=1;}
