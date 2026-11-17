import {readFile,open} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {signedSetup,preflightSetup,submitSetup,verifySetupReceipt} from '../sdk/monetary-setup-sepolia.mjs';
let ambiguous=false,transactionHash=null;
try{
 const [operationId,responsePath,mode,receiptPath]=process.argv.slice(2);
 if(!operationId||!responsePath)throw Error('Missing fixed setup response');
 const bytes=await readFile(responsePath);if(bytes.length>8192)throw Error('Oversized setup response');
 const tx=await signedSetup(operationId,JSON.parse(bytes.toString('utf8')));transactionHash=tx.hash;
 if(mode==='--verify-only'){console.log(JSON.stringify(await verifySetupReceipt(operationId,tx)));}
 else{
  const fees=await preflightSetup(operationId,tx);
  if(mode!=='--broadcast-approved-paused-base-sepolia-setup')console.log(JSON.stringify({status:'VERIFIED_NOT_SUBMITTED',operationId,transactionHash,...fees,financialExecutionEnabled:false}));
  else{
   const repo=fileURLToPath(new URL('../../',import.meta.url)),within=receiptPath?relative(repo,resolve(receiptPath)):'';
   if(!receiptPath||!isAbsolute(receiptPath)||(!within.startsWith('..'+sep)&&!isAbsolute(within)))throw Error('Private exclusive receipt outside source required');
   const file=await open(receiptPath,'wx',0o600);
   try{await file.writeFile(JSON.stringify({status:'SUBMISSION_PREPARED',operationId,transactionHash,unsignedDigest:tx.unsignedHash,...fees,financialExecutionEnabled:false})+'\n');await file.sync();}finally{await file.close();}
   ambiguous=true;await submitSetup(tx);
   console.log(JSON.stringify({status:'SUBMITTED_TESTNET_SETUP_ONLY',operationId,transactionHash,financialExecutionEnabled:false}));
  }
 }
}catch{
 console.error(JSON.stringify({status:ambiguous?'SETUP_SUBMISSION_OUTCOME_AMBIGUOUS':'BLOCKED_NOT_SUBMITTED',transactionHash,financialExecutionEnabled:false}));process.exitCode=1;
}
