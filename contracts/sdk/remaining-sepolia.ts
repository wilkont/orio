import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {Transaction,Signature,recoverAddress,Interface,keccak256} from 'ethers';
import {publicAddress,derSignature} from './aws-kms-gas-signer.mjs';

export const manifestDigest='1c49fbbdb36e527e8a40fc74aa005bc75afe34afd790f32c2ee02eb83d593d12';
export const operationIds=['registry','paymaster','accountFactory','recoveryFactory','controller'] as const;
export type OperationId=typeof operationIds[number];
export interface DeploymentPlan{
 operationId:OperationId;contract:string;constructorArguments:string[];predictedAddress:string;creationBytecodeHash:string;expectedRuntimeCodeHash:string;unsignedDigest:string;
 children:{name:string;address:string;expectedRuntimeCodeHash:string}[];
 transaction:{type:string;chainId:string;nonce:string;gasLimit:string;maxFeePerGas:string;maxPriorityFeePerGas:string;value:string;data:string};
 fees:{planningBudgetWei:string};
}
export interface DeploymentManifest{
 chainId:string;sender:string;keyArn:string;governance:string;entryPoint:string;testUsdc:string;maximumBatchPlanningWei:string;
 dependencies:Record<string,{address:string;codeHash:string}>;plans:DeploymentPlan[];
}
export function object(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))throw new Error('Expected object');return v as Record<string,unknown>;}
export function quantity(v:unknown):bigint{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v))throw new Error('Invalid RPC quantity');return BigInt(v);}
function exact(v:unknown):bigint{if(typeof v!=='string'||! /^(0|[1-9][0-9]*)$/.test(v)||v.length>78)throw new Error('Invalid exact integer');return BigInt(v);}
export function decodeManifest(text:string):DeploymentManifest{
 const canonical=text.replaceAll('\r\n','\n');
 if(canonical.length>1048576||createHash('sha256').update(canonical).digest('hex')!==manifestDigest)throw new Error('Unapproved deployment manifest');
 // Exact approved file identity is checked before accepting its generated schema.
 const value=JSON.parse(canonical) as DeploymentManifest;
 if(value.chainId!=='84532'||value.plans.map(p=>p.operationId).join(',')!==operationIds.join(','))throw new Error('Invalid release identity');
 return value;
}
let cached:Promise<DeploymentManifest>|undefined;
export async function manifest():Promise<DeploymentManifest>{
 cached??=readFile(new URL('../../infrastructure/aws/REMAINING_SEPOLIA_PLAN_2026-11-14.json',import.meta.url),'utf8').then(decodeManifest);
 return structuredClone(await cached);
}
export async function operation(id:string):Promise<DeploymentPlan>{const p=(await manifest()).plans.find(p=>p.operationId===id);if(!p)throw new Error('Unknown deployment operation');return p;}
function construct(p:DeploymentPlan):Transaction{
 const n=exact(p.transaction.nonce);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Invalid nonce');
 const f=p.transaction,tx=Transaction.from({type:2,chainId:exact(f.chainId),nonce:Number(n),gasLimit:exact(f.gasLimit),maxFeePerGas:exact(f.maxFeePerGas),
  maxPriorityFeePerGas:exact(f.maxPriorityFeePerGas),value:exact(f.value),data:f.data});
 if(f.type!=='2'||tx.chainId!==84532n||tx.to!==null||tx.value!==0n||tx.unsignedHash!==p.unsignedDigest)throw new Error('Changed deployment payload');
 return tx;
}
export async function unsigned(id:string):Promise<Transaction>{return construct(await operation(id));}
export async function signed(id:string,input:unknown):Promise<Transaction>{
 const m=await manifest(),p=await operation(id),proof=object(input);
 if(proof.operationId!==p.operationId||proof.keyArn!==m.keyArn||proof.digest!==p.unsignedDigest||proof.financialExecutionEnabled!==false||
  typeof proof.publicKey!=='string'||typeof proof.signature!=='string'||proof.publicKey.length>512||proof.signature.length>128)throw new Error('Wrong signing proof');
 if(publicAddress({KeyId:m.keyArn,KeySpec:'ECC_SECG_P256K1',KeyUsage:'SIGN_VERIFY',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey:Buffer.from(proof.publicKey,'base64')},m.keyArn)!==m.sender)throw new Error('Wrong public signer');
 const scalars=derSignature(Buffer.from(proof.signature,'base64')),tx=construct(p);
 const signature=[27,28].map(v=>Signature.from({...scalars,v})).find(s=>recoverAddress(p.unsignedDigest,s)===m.sender);
 if(!signature)throw new Error('Invalid protected signature');tx.signature=signature;return tx;
}
type ReadMethod='eth_chainId'|'eth_getBlockByNumber'|'eth_getTransactionCount'|'eth_getBalance'|'eth_getCode'|'eth_call'|'eth_estimateGas'|'eth_getTransactionReceipt'|'eth_getTransactionByHash';
let sequence=0,nextReadAt=0;
export async function readRpc(method:ReadMethod,params:unknown[]):Promise<unknown>{
 const now=Date.now(),delay=Math.max(0,nextReadAt-now);nextReadAt=Math.max(now,nextReadAt)+1000;await pause(delay);
 return request('https://sepolia.base.org',method,params);
}
async function request(endpoint:string,method:string,params:unknown[]):Promise<unknown>{
 const id=++sequence,r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Qualification RPC unavailable');const text=await r.text();if(text.length>524288)throw new Error('Oversized RPC response');
 const v=object(JSON.parse(text));if(v.id!==id||v.jsonrpc!=='2.0'||v.error||v.result===undefined)throw new Error('Qualification RPC rejected request');return v.result;
}
export async function submit(tx:Transaction):Promise<unknown>{
 if(tx.chainId!==84532n||!tx.isSigned()||tx.value!==0n||tx.to!==null)throw new Error('Only signed zero-value testnet creation transactions');
 const p=(await manifest()).plans.find(p=>p.unsignedDigest===tx.unsignedHash);if(!p||tx.from!==(await manifest()).sender)throw new Error('Not an approved batch transaction');
 return request('https://sepolia-sequencer.base.org','eth_sendRawTransaction',[tx.serialized]);
}
export async function preflight(id:string,tx:Transaction):Promise<{planningFeeWei:string;perOperationLimitWei:string}>{
 const m=await manifest(),p=await operation(id);if(tx.unsignedHash!==p.unsignedDigest)throw new Error('Wrong operation transaction');
 if(await readRpc('eth_chainId',[])!=='0x14a34'||quantity(await readRpc('eth_getTransactionCount',[m.sender,'pending']))!==BigInt(p.transaction.nonce))throw new Error('Wrong chain or consumed nonce; reconcile before retry');
 const block=object(await readRpc('eth_getBlockByNumber',['latest',false]));
 if(quantity(block.baseFeePerGas)+(tx.maxPriorityFeePerGas??0n)>(tx.maxFeePerGas??0n))throw new Error('Fee cap stale');
 if(await readRpc('eth_getCode',[p.predictedAddress,block.number])!=='0x')throw new Error('Predicted address is occupied');
 for(const address of p.constructorArguments){
  const dependency=Object.values(m.dependencies).find(d=>d.address.toLowerCase()===address.toLowerCase());
  const previous=m.plans.find(other=>other.predictedAddress.toLowerCase()===address.toLowerCase());
  const expected=dependency?.codeHash??previous?.expectedRuntimeCodeHash;if(!expected)throw new Error('Unknown constructor dependency');
  const code=await readRpc('eth_getCode',[address,block.number]);if(typeof code!=='string'||keccak256(code)!==expected)throw new Error('Dependency runtime changed or missing');
 }
 if(p.constructorArguments.some(a=>a.toLowerCase()===m.testUsdc.toLowerCase())){
  const metadata=new Interface(['function decimals() view returns(uint8)']);
  const raw=await readRpc('eth_call',[{to:m.testUsdc,data:metadata.encodeFunctionData('decimals')},block.number]);
  if(typeof raw!=='string'||metadata.decodeFunctionResult('decimals',raw)[0]!==6n)throw new Error('Test USDC metadata changed');
 }
 if(quantity(await readRpc('eth_estimateGas',[{from:m.sender,data:tx.data,value:'0x0'},'latest']))>tx.gasLimit)throw new Error('Approved gas limit insufficient');
 const fees=new Interface(['function getL1Fee(bytes) view returns(uint256)','function getOperatorFee(uint256) view returns(uint256)']);
 async function fee(name:string,arg:unknown):Promise<bigint>{
  const raw=await readRpc('eth_call',[{to:'0x420000000000000000000000000000000000000F',data:fees.encodeFunctionData(name,[arg])},block.number]);
  if(typeof raw!=='string'||!/^0x[0-9a-f]{64}$/.test(raw))throw new Error('Invalid fee result');const v:unknown=fees.decodeFunctionResult(name,raw)[0];
  if(typeof v!=='bigint'||v<0n)throw new Error('Invalid fee units');return v;
 }
 const cost=tx.gasLimit*(tx.maxFeePerGas??0n)+2n*await fee('getL1Fee',tx.serialized)+2n*await fee('getOperatorFee',tx.gasLimit);
 const ceiling=(exact(p.fees.planningBudgetWei)*125n+99n)/100n;
 const batchCeiling=m.plans.reduce((sum,x)=>sum+(exact(x.fees.planningBudgetWei)*125n+99n)/100n,0n);
 if(cost>ceiling||batchCeiling>exact(m.maximumBatchPlanningWei)||quantity(await readRpc('eth_getBalance',[m.sender,'latest']))<ceiling)throw new Error('Approved test fee budget insufficient');
 return {planningFeeWei:cost.toString(),perOperationLimitWei:ceiling.toString()};
}
