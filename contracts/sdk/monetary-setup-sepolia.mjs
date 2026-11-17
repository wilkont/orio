import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Transaction,Signature,recoverAddress,Interface,keccak256,toUtf8Bytes,ZeroAddress,ZeroHash} from 'ethers';
import {publicAddress,derSignature} from './aws-kms-gas-signer.mjs';
import {readRpc} from './remaining-sepolia.ts';

export const setupManifestSha256='fe2aa6e3fc4c52335b226150ff68856e63b311eb672d0044bcd1e91f7efdd7c6';
export function decodeSetupPlan(text){
 if(typeof text!=='string')throw Error('Missing fixed setup plan');const canonical=text.replaceAll('\r\n','\n');
 if(canonical.length>100000||createHash('sha256').update(canonical).digest('hex')!==setupManifestSha256)throw Error('Changed fixed setup plan');
 const p=JSON.parse(canonical);if(p.chainId!=='84532'||p.plans.length!==10||p.financialExecutionEnabled!==false||p.productionKeysUsed!==false)throw Error('Wrong qualification plan');return p;
}
export async function setupPlan(){return decodeSetupPlan(await readFile(new URL('../../infrastructure/aws/TESTNET_MONETARY_SETUP_PLAN_2026-11-17.json',import.meta.url),'utf8'));}
function construct(p){const t=p.transaction,tx=Transaction.from({...t,type:2,nonce:Number(t.nonce)});
 if(tx.chainId!==84532n||tx.value!==0n||tx.to===null||tx.unsignedHash!==p.unsignedDigest)throw Error('Changed fixed setup transaction');return tx;}
export async function signedSetup(operationId,proof){
 const m=await setupPlan(),p=m.plans.find(x=>x.operationId===operationId);
 if(!p||!proof||proof.operationId!==operationId||proof.keyArn!==m.keyArn||proof.digest!==p.unsignedDigest||proof.financialExecutionEnabled!==false||
  typeof proof.publicKey!=='string'||proof.publicKey.length>512||typeof proof.signature!=='string'||proof.signature.length>128)throw Error('Invalid setup signing proof');
 if(publicAddress({KeyId:m.keyArn,KeySpec:'ECC_SECG_P256K1',KeyUsage:'SIGN_VERIFY',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey:Buffer.from(proof.publicKey,'base64')},m.keyArn)!==m.sender)throw Error('Wrong qualification signer');
 const parts=derSignature(Buffer.from(proof.signature,'base64')),sig=[27,28].map(v=>Signature.from({...parts,v})).find(s=>recoverAddress(p.unsignedDigest,s)===m.sender);
 if(!sig)throw Error('Invalid setup signature');const tx=construct(p);tx.signature=sig;return tx;
}
const queryApi=new Interface([
 'function epoch() view returns(uint256)','function revision() view returns(uint256)','function currentMaster() view returns(bytes32)',
 'function monetaryController() view returns(address)','function monetaryVault() view returns(address)',
 'function assets(bytes32) view returns(address,uint8,uint8,bytes32)','function valuationSigner() view returns(address)',
 'function settlementOperator() view returns(address)','function executionEnabled() view returns(bool)','function totalSupply() view returns(uint256)',
 'function reserveUnits() view returns(uint256)','function companyFees(address) view returns(uint256)','function getMinDelay() view returns(uint256)',
 'function minimumDelayFloor() view returns(uint256)','function hasRole(bytes32,address) view returns(bool)',
 'function isOperation(bytes32) view returns(bool)','function isOperationPending(bytes32) view returns(bool)',
 'function isOperationReady(bytes32) view returns(bool)','function isOperationDone(bytes32) view returns(bool)',
 'function decimals() view returns(uint8)','function getL1Fee(bytes) view returns(uint256)','function getOperatorFee(uint256) view returns(uint256)',
]);
const qty=value=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)(?![\s\S])/.test(value))throw Error('Invalid setup RPC quantity');return BigInt(value);};
async function call(address,name,args,block){const raw=await readRpc('eth_call',[{to:address,data:queryApi.encodeFunctionData(name,args??[])},block]);
 if(typeof raw!=='string')throw Error('Missing setup state');return queryApi.decodeFunctionResult(name,raw);}
async function scalar(address,name,args,block){return (await call(address,name,args,block))[0];}
async function setupState(m,executed,block){
 const bound=executed>=4,configured=executed===5,elected=executed>=3;
 const values=await Promise.all([
  scalar(m.registry,'epoch',[],block),scalar(m.registry,'revision',[],block),scalar(m.registry,'currentMaster',[],block),
  scalar(m.registry,'monetaryController',[],block),scalar(m.registry,'monetaryVault',[],block),
  scalar(m.controller,'revision',[],block),scalar(m.controller,'executionEnabled',[],block),scalar(m.controller,'valuationSigner',[],block),
  scalar(m.controller,'settlementOperator',[],block),scalar(m.currency,'totalSupply',[],block),scalar(m.vault,'reserveUnits',[],block),
  scalar(m.vault,'companyFees',[m.testUsdc],block),scalar(m.governance,'getMinDelay',[],block),scalar(m.testUsdc,'decimals',[],block),
 ]);
 const expected=[elected?1n:0n,bound?2n:elected?1n:0n,elected?m.assetId:ZeroHash,bound?m.controller:ZeroAddress,bound?m.vault:ZeroAddress,
  configured?1n:0n,false,configured?m.sender:ZeroAddress,configured?m.sender:ZeroAddress,0n,0n,0n,BigInt(m.delaySeconds),6n];
 if(values.some((v,i)=>v!==expected[i]))throw Error('Unexpected testnet setup state; reconcile before retry');
 const asset=await call(m.registry,'assets',[m.assetId],block);
 if(asset[0]!== (executed===0?ZeroAddress:m.testUsdc)||asset[1]!== (executed===0?0n:6n)||asset[2]!== (elected?2n:executed>=2?1n:0n)||
  (executed>0&&asset[3]===ZeroHash))throw Error('Unexpected testnet candidate state');
}
async function codeIdentities(m,block){for(const d of Object.values(m.dependencies)){
 const code=await readRpc('eth_getCode',[d.address,block]);if(typeof code!=='string'||keccak256(code)!==d.codeHash)throw Error('Testnet dependency changed');
}}
async function setupAuthority(m,block){
 if(await scalar(m.governance,'minimumDelayFloor',[],block)!==BigInt(m.delaySeconds))throw Error('Governance delay floor changed');
 for(const role of ['PROPOSER_ROLE','EXECUTOR_ROLE','CANCELLER_ROLE'])
  if(!await scalar(m.governance,'hasRole',[keccak256(toUtf8Bytes(role)),m.sender],block))throw Error('Qualification governance authority changed');
 if(await scalar(m.governance,'hasRole',[keccak256(toUtf8Bytes('EXECUTOR_ROLE')),ZeroAddress],block)||
  !await scalar(m.governance,'hasRole',[ZeroHash,m.governance],block)||await scalar(m.governance,'hasRole',[ZeroHash,m.sender],block))throw Error('Governance execution/admin boundary changed');
}
function signedCopy(tx){if(!(tx instanceof Transaction)||!tx.isSigned())throw Error('Signed transaction object required');return Transaction.from(tx.serialized);}
export async function preflightSetup(operationId,input){
 const tx=signedCopy(input);
 const m=await setupPlan(),index=m.plans.findIndex(p=>p.operationId===operationId),p=m.plans[index];
 if(!p||tx.unsignedHash!==p.unsignedDigest||tx.to!==m.governance||!tx.isSigned()||tx.from!==m.sender)throw Error('Unapproved setup transaction');
 if(await readRpc('eth_chainId',[])!=='0x14a34'||qty(await readRpc('eth_getTransactionCount',[m.sender,'pending']))!==BigInt(p.transaction.nonce))throw Error('Wrong setup network or consumed nonce');
 const block=await readRpc('eth_getBlockByNumber',['latest',false]);
 if(qty(block.baseFeePerGas)+tx.maxPriorityFeePerGas>tx.maxFeePerGas)throw Error('Setup fee cap stale');
 await codeIdentities(m,block.number);await setupAuthority(m,block.number);await setupState(m,p.kind==='schedule'?0:index-5,block.number);
 const action=m.actions.find(a=>a.id===p.actionId);
 if(p.kind==='schedule'){
  if(await scalar(m.governance,'isOperation',[action.operationHash],block.number))throw Error('Setup operation already scheduled');
 }else{
  if(!await scalar(m.governance,'isOperationReady',[action.operationHash],block.number)||
   (action.predecessor!==ZeroHash&&!await scalar(m.governance,'isOperationDone',[action.predecessor],block.number)))throw Error('Setup timelock or predecessor not ready');
 }
 if(qty(await readRpc('eth_estimateGas',[{from:m.sender,to:tx.to,data:tx.data,value:'0x0'},'latest']))>tx.gasLimit)throw Error('Setup gas limit insufficient');
 const oracle='0x420000000000000000000000000000000000000F';
 const network=tx.gasLimit*tx.maxFeePerGas+2n*await scalar(oracle,'getL1Fee',[tx.unsignedSerialized],block.number)+2n*await scalar(oracle,'getOperatorFee',[tx.gasLimit],block.number);
 const remaining=m.plans.slice(index).reduce((n,x)=>n+BigInt(x.maximumPlanningFeeWei),0n);
 if(network>BigInt(p.maximumPlanningFeeWei)||remaining>BigInt(m.maximumBatchPlanningWei)||qty(await readRpc('eth_getBalance',[m.sender,'latest']))<remaining)throw Error('Approved test planning ceiling insufficient');
 return {planningFeeWei:network.toString(),maximumPlanningFeeWei:p.maximumPlanningFeeWei,remainingPlanningCeilingWei:remaining.toString()};
}
export async function submitSetup(input){
 const tx=signedCopy(input);
 const m=await setupPlan();
 if(!tx.isSigned()||tx.chainId!==84532n||tx.to!==m.governance||tx.value!==0n||tx.from!==m.sender||!m.plans.some(p=>p.unsignedDigest===tx.unsignedHash))throw Error('Only the ten fixed testnet setup transactions are supported');
 const r=await fetch('https://sepolia-sequencer.base.org',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',
  signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_sendRawTransaction',params:[tx.serialized]})});
 const raw=await r.text();if(!r.ok||raw.length>65536)throw Error('Setup submission acknowledgement unavailable');
 const body=JSON.parse(raw);if(body.jsonrpc!=='2.0'||body.id!==1||body.error||body.result!==tx.hash)throw Error('Setup submission acknowledgement ambiguous');return tx.hash;
}
export async function verifySetupReceipt(operationId,input){
 const tx=signedCopy(input);
 const m=await setupPlan(),index=m.plans.findIndex(p=>p.operationId===operationId),p=m.plans[index];
 if(!p||tx.unsignedHash!==p.unsignedDigest||tx.from!==m.sender)throw Error('Wrong setup receipt identity');
 if(await readRpc('eth_chainId',[])!=='0x14a34')throw Error('Wrong setup receipt network');
 const receipt=await readRpc('eth_getTransactionReceipt',[tx.hash]);
 if(!receipt)return {status:'PENDING',transactionHash:tx.hash};
 if(receipt.status!=='0x1'||receipt.transactionHash!==tx.hash||receipt.to?.toLowerCase()!==m.governance.toLowerCase()||receipt.from?.toLowerCase()!==m.sender.toLowerCase())throw Error('Setup transaction failed or receipt identity changed');
 const block=await readRpc('eth_getBlockByNumber',[receipt.blockNumber,false]);if(block.hash!==receipt.blockHash)throw Error('Setup receipt is no longer canonical');
 const actual=await readRpc('eth_getTransactionByHash',[tx.hash]);
 if(!actual||actual.input!==tx.data||actual.to?.toLowerCase()!==m.governance.toLowerCase()||actual.from?.toLowerCase()!==m.sender.toLowerCase()||qty(actual.nonce)!==BigInt(p.transaction.nonce)||qty(actual.value)!==0n)throw Error('Setup transaction input mismatch');
 const action=m.actions.find(a=>a.id===p.actionId),executed=p.kind==='execute';
 if(!await scalar(m.governance,executed?'isOperationDone':'isOperationPending',[action.operationHash],receipt.blockNumber))throw Error('Setup effect missing');
 await codeIdentities(m,receipt.blockNumber);await setupState(m,executed?index-4:0,receipt.blockNumber);
 const operator=await scalar('0x420000000000000000000000000000000000000F','getOperatorFee',[qty(receipt.gasUsed)],receipt.blockNumber);
 const total=qty(receipt.gasUsed)*qty(receipt.effectiveGasPrice)+qty(receipt.l1Fee)+operator;
 if(total>BigInt(p.maximumPlanningFeeWei))throw Error('Actual setup cost exceeds allowance; stop batch');
 const finalized=await readRpc('eth_getBlockByNumber',['finalized',false]);
 return {status:'VERIFIED_PAUSED_TESTNET_SETUP',operationId,transactionHash:tx.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,
  observedNetworkFeeWei:total.toString(),finalizedAtObservation:qty(receipt.blockNumber)<=qty(finalized.number),financialExecutionEnabled:false};
}
