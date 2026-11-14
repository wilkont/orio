import {readFile} from 'node:fs/promises';
import {Transaction,Signature,recoverAddress,Interface} from 'ethers';
import {publicAddress,derSignature} from '../sdk/aws-kms-gas-signer.mjs';
const signer='0xB1E1d791a518931042Fed65778a2f8E11938eae1';
const keyArn='arn:aws:kms:us-east-1:720232346199:key/479ae4e7-483e-4d17-8f46-232f08c5c6ee';
const digest='0x72899bbab0f9257a20a808c60788a982f7ae0315ec3c0b99bbf1a07887d7e0c2';
const oracle='0x420000000000000000000000000000000000000F';
const feeApi=new Interface(['function getL1Fee(bytes) view returns(uint256)','function getOperatorFee(uint256) view returns(uint256)']);
const budget=30000000000000n;
function object(value:unknown):Record<string,unknown>{if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Expected object');return value as Record<string,unknown>;}
function exact(value:unknown):bigint{if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value))throw new Error('Invalid exact integer');return BigInt(value);}
function quantity(value:unknown):bigint{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))throw new Error('Invalid RPC quantity');return BigInt(value);}
let sequence=0;
async function rpc(method:string,params:unknown[],submit=false):Promise<unknown>{
 const id=++sequence,response=await fetch(submit?'https://sepolia-sequencer.base.org':'https://sepolia.base.org',
  {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('RPC unavailable');const text=await response.text();if(text.length>262144)throw new Error('Oversized RPC response');
 const value=object(JSON.parse(text));if(value.id!==id||value.error||value.result===undefined)throw new Error('RPC failed');return value.result;
}
let submitted=false;
let submittedHash:string|null=null;
try{
 const plan=object(JSON.parse(await readFile(process.argv[2],'utf8'))),proof=object(JSON.parse(await readFile(process.argv[3],'utf8')));
 if(plan.chainId!=='84532'||plan.sender!==signer||plan.unsignedDigest!==digest||proof.keyArn!==keyArn||proof.digest!==digest||proof.financialExecutionEnabled!==false)
  throw new Error('Unapproved identity');
 if(typeof proof.publicKey!=='string'||typeof proof.signature!=='string')throw new Error('Missing public evidence');
 if(publicAddress({KeyId:keyArn,KeySpec:'ECC_SECG_P256K1',KeyUsage:'SIGN_VERIFY',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey:Buffer.from(proof.publicKey,'base64')},keyArn)!==signer)throw new Error('Wrong key');
 const fields=object(plan.transaction);if(typeof fields.data!=='string')throw new Error('Missing creation data');
 const nonce=exact(fields.nonce);if(nonce>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Invalid nonce');
 const tx=Transaction.from({type:2,chainId:exact(fields.chainId),nonce:Number(nonce),gasLimit:exact(fields.gasLimit),maxFeePerGas:exact(fields.maxFeePerGas),
  maxPriorityFeePerGas:exact(fields.maxPriorityFeePerGas),value:exact(fields.value),data:fields.data});
 if(tx.unsignedHash!==digest||tx.chainId!==84532n||tx.value!==0n||tx.to!==null)throw new Error('Changed deployment payload');
 const scalars=derSignature(Buffer.from(proof.signature,'base64'));
 const signature=[27,28].map(v=>Signature.from({...scalars,v})).find(candidate=>recoverAddress(digest,candidate)===signer);
 if(!signature)throw new Error('Wrong signature');tx.signature=signature;
 if(await rpc('eth_chainId',[])!=='0x14a34'||quantity(await rpc('eth_getTransactionCount',[signer,'pending']))!==nonce)throw new Error('Wrong chain or stale nonce');
 const block=object(await rpc('eth_getBlockByNumber',['latest',false]));
 if(quantity(block.baseFeePerGas)+(tx.maxPriorityFeePerGas??0n)>(tx.maxFeePerGas??0n))throw new Error('Stale fee cap');
 const estimate=quantity(await rpc('eth_estimateGas',[{from:signer,data:tx.data,value:'0x0'},'latest']));if(estimate>tx.gasLimit)throw new Error('Gas limit insufficient');
 async function oracleFee(name:string,arg:unknown):Promise<bigint>{
  const result=await rpc('eth_call',[{to:oracle,data:feeApi.encodeFunctionData(name,[arg])},block.number]);
  if(typeof result!=='string'||!/^0x[0-9a-f]{64}$/.test(result))throw new Error('Invalid oracle response');
  const fee:unknown=feeApi.decodeFunctionResult(name,result)[0];if(typeof fee!=='bigint'||fee<0n)throw new Error('Invalid fee');return fee;
 }
 const l1=await oracleFee('getL1Fee',tx.serialized),operator=await oracleFee('getOperatorFee',tx.gasLimit);
 const planningCost=tx.gasLimit*(tx.maxFeePerGas??0n)+2n*l1+2n*operator;
 if(planningCost>budget||quantity(await rpc('eth_getBalance',[signer,'latest']))<budget)throw new Error('Test fee budget insufficient');
 if(process.argv[4]!=='--broadcast-approved-base-sepolia'){
  console.log(JSON.stringify({status:'VERIFIED_NOT_SUBMITTED',transactionHash:tx.hash,planningFeeWei:planningCost.toString(),financialExecutionEnabled:false}));
 }else{
  submittedHash=tx.hash;if(submittedHash===null)throw new Error('Missing signed hash');
  submitted=true; // A timeout is ambiguous: never automatically retry with a new nonce/payload.
  const hash=await rpc('eth_sendRawTransaction',[tx.serialized],true);if(hash!==tx.hash)throw new Error('Unexpected transaction reference');
  console.log(JSON.stringify({status:'SUBMITTED_QUALIFICATION_ONLY',transactionHash:hash,financialExecutionEnabled:false}));
 }
}catch{console.error(submitted?JSON.stringify({status:'SUBMISSION_OUTCOME_AMBIGUOUS',transactionHash:submittedHash,financialExecutionEnabled:false}):'Deployment verification blocked; no transaction submitted');process.exitCode=1;}
