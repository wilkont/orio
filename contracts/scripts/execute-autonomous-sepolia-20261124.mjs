import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {Interface,Signature,Transaction,getCreateAddress,recoverAddress} from 'ethers';
import {compileAutonomousContracts} from './compile-autonomous.mjs';
import {derSignature,publicAddress} from '../sdk/aws-kms-gas-signer.mjs';

const sender='0xB1E1d791a518931042Fed65778a2f8E11938eae1';
const keyArn='arn:aws:kms:us-east-1:720232346199:key/479ae4e7-483e-4d17-8f46-232f08c5c6ee';
const qualificationFunction='orio-spc-3-key-qualification';
const changeSet='arn:aws:cloudformation:us-east-1:720232346199:changeSet/orio-autonomous-qualification-20261124/ca2c77c7-4a60-4e08-96e3-8090cbe64385';
const stack='orio-spc-3-protected-signing';
const expires=Date.parse('2026-11-25T02:30:00Z');
const ceiling=650000000000000n;
const creation=[
 ['deploy-test-asset','AutonomousTestAsset',725000n,'0x9743305116e09e8d2f49c12c962be824fab0c3b58d35bebf3d58ff22d3464208'],
 ['deploy-test-feed-a','AutonomousTestFeed',275000n,'0x2a06396f6933c59b001250630fe27fea23096e03ac72f0c2d09a167c40012589'],
 ['deploy-test-feed-b','AutonomousTestFeed',275000n,'0x3bd9a4852f7cdd6f3c9ff797ddd4538b1bdfeca36766173e98558a37d05b3084'],
 ['deploy-autonomous-controller','ORIOAutonomousController',8550000n,'0xb55449ec070e49f1e024df5071a3299f07c220b6ce6dd51b394b1f8b2539368d'],
];
const addresses=creation.map((_,i)=>getCreateAddress({from:sender,nonce:16+i}));
const arts=compileAutonomousContracts(true);
const plans=creation.map(([id,name,gasLimit,digest],i)=>{
 const args=i===3?[...addresses.slice(0,3),sender,60]:[];
 const art=arts[i===3?'src/ORIOAutonomousController.sol':'test/AutonomousFixtures.sol'][name];
 const data='0x'+art.evm.bytecode.object+new Interface(art.abi).encodeDeploy(args).slice(2);
 const tx=Transaction.from({type:2,chainId:84532,nonce:16+i,value:0,gasLimit,maxFeePerGas:50000000n,maxPriorityFeePerGas:1000000n,data});
 if(tx.unsignedHash!==digest||tx.to!==null||tx.value!==0n)throw Error('Fixed payload identity mismatch');
 return {id,name,tx,address:addresses[i]};
});
const aws=(...args)=>{
 const text=execFileSync('aws',[...args,'--region','us-east-1','--output','json','--no-cli-pager'],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
 return text?JSON.parse(text):null;
};
let rpcId=0;
async function rpc(method,params,send=false){
 const id=++rpcId, response=await fetch(send?'https://sepolia-sequencer.base.org':'https://sepolia.base.org',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),redirect:'error',signal:AbortSignal.timeout(15000),
 });
 const x=await response.json();
 if(!response.ok||x.id!==id||x.error||x.result===undefined)throw Error('Base Sepolia RPC rejected request');
 return x.result;
}
const fees=new Interface(['function getL1FeeUpperBound(uint256) view returns(uint256)','function getOperatorFee(uint256) view returns(uint256)']);
async function preflight(next){
 if(Date.now()+120000>=expires||await rpc('eth_chainId',[])!=='0x14a34')throw Error('Signing window or chain invalid');
 const [confirmed,pending]=await Promise.all(['latest','pending'].map(tag=>rpc('eth_getTransactionCount',[sender,tag])));
 if(BigInt(confirmed)!==BigInt(next.tx.nonce)||BigInt(pending)!==BigInt(next.tx.nonce))throw Error('Reconcile changed nonce');
 const block=await rpc('eth_getBlockByNumber',['latest',false]);
 if(BigInt(block.baseFeePerGas)+1000000n>50000000n)throw Error('Fee cap unavailable');
 const fee=async(name,x)=>fees.decodeFunctionResult(name,await rpc('eth_call',[{
  to:'0x420000000000000000000000000000000000000F',data:fees.encodeFunctionData(name,[x]),
 },block.number]))[0];
 let remaining=0n;
 for(const p of plans.slice(next.tx.nonce-16)){
  if(await rpc('eth_getCode',[p.address,block.number])!=='0x')throw Error('Predicted address occupied');
  remaining+=p.tx.gasLimit*50000000n+2n*await fee('getL1FeeUpperBound',BigInt((p.tx.unsignedSerialized.length-2)/2+80))+2n*await fee('getOperatorFee',p.tx.gasLimit);
 }
 if(BigInt(await rpc('eth_getBalance',[sender,block.number]))<remaining)throw Error('Test ETH balance insufficient');
 return remaining;
}
function assertPreview(){
 if(aws('sts','get-caller-identity').Arn!=='arn:aws:iam::720232346199:root')throw Error('AWS administrator session required');
 const p=aws('cloudformation','describe-change-set','--change-set-name',changeSet);
 const ids=['OperatorQualificationInvoke','QualificationFunction','QualificationGasKey','QualificationPermissions'];
 if(p.Status!=='CREATE_COMPLETE'||p.ExecutionStatus!=='AVAILABLE'||p.Changes?.length!==ids.length||
    p.Changes.some(c=>c.ResourceChange.Action!=='Modify'||c.ResourceChange.Replacement!=='False')||
    p.Changes.map(c=>c.ResourceChange.LogicalResourceId).sort().join(',')!==ids.sort().join(','))throw Error('Reviewed AWS preview unavailable');
 if(aws('kms','describe-key','--key-id',keyArn).KeyMetadata.KeyState!=='Disabled'||
    aws('lambda','get-function-concurrency','--function-name',qualificationFunction).ReservedConcurrentExecutions!==0)
  throw Error('Signing controls are not paused');
}
const stagedTemplate=async(name)=>JSON.parse(await readFile(new URL('../../infrastructure/aws/'+name,import.meta.url),'utf8'));
const canon=(v)=>JSON.stringify(v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canon(v[k]))])):Array.isArray(v)?v.map(x=>JSON.parse(canon(x))):v);
function templateBody(args){
 const b=aws('cloudformation','get-template',...args,'--template-stage','Original').TemplateBody;
 return typeof b==='string'?JSON.parse(b):b;
}
async function awaitUpdate(expected){
 for(let i=0;i<55;i++){
  const s=aws('cloudformation','describe-stacks','--stack-name',stack).Stacks[0];
  if(s.StackStatus==='UPDATE_COMPLETE'&&canon(templateBody(['--stack-name',stack]))===canon(expected))return;
  if(!['UPDATE_COMPLETE','UPDATE_IN_PROGRESS','UPDATE_COMPLETE_CLEANUP_IN_PROGRESS'].includes(s.StackStatus))throw Error('Signing stack entered unexpected state');
  await pause(3000);
 }
 throw Error('Signing stack update result unknown');
}
async function awaitMined(hash){
 for(let i=0;i<25;i++){
  const r=await rpc('eth_getTransactionReceipt',[hash]);
  if(r)return r;
  await pause(2000);
 }
 throw Error('Receipt not observed. Reconcile exact hash before any retry.');
}
function readProof(p,x){
 const {id,tx}=p;
 if(x.operationId!==id||x.keyArn!==keyArn||x.digest!==tx.unsignedHash||x.financialExecutionEnabled!==false)throw Error('Signing response mismatch');
 const publicKey={KeyId:keyArn,KeySpec:'ECC_SECG_P256K1',KeyUsage:'SIGN_VERIFY',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey:Buffer.from(x.publicKey,'base64')};
 if(publicAddress(publicKey,keyArn)!==sender)throw Error('Unexpected public signer');
 const scalars=derSignature(Buffer.from(x.signature,'base64'));
 tx.signature=[27,28].map(v=>Signature.from({...scalars,v})).find(s=>recoverAddress(tx.unsignedHash,s)===sender);
 if(!tx.isSigned()||tx.from!==sender)throw Error('Invalid transaction signature');
}

const mode=process.argv[2];
if(mode==='--verify-payloads'){
 console.log(JSON.stringify(plans.map(p=>({id:p.id,address:p.address,digest:p.tx.unsignedHash}))));
}else if(mode==='--approved-four-deployments'&&process.argv.length===4){
 const evidence=resolve(process.argv[3]);
 let started=false;
 let temp;
 let measured=0n;
 try{
  assertPreview();
  const paused=await stagedTemplate('protected-signing-qualification.json');
  const active=await stagedTemplate('protected-autonomous-sepolia-20261124.json');
  if(canon(templateBody(['--stack-name',stack]))!==canon(paused)||
     canon(templateBody(['--change-set-name',changeSet]))!==canon(active))throw Error('Signer templates do not match reviewed content');
  if(await preflight(plans[0])>ceiling)throw Error('Draft fee ceiling exceeded');
  await writeFile(join(evidence,'deployment-claim.json'),JSON.stringify({changeSet,chain:'84532',startedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
  started=true;
  aws('cloudformation','execute-change-set','--change-set-name',changeSet,'--client-request-token','orio-autonomous-approved-20261124');
  await awaitUpdate(active);
  temp=await mkdtemp(join(tmpdir(),'orio-qualification-proof-'));
  for(const p of plans){
   if(measured+await preflight(p)>ceiling)throw Error('Remaining batch exceeds approved fee ceiling');
   if(BigInt(await rpc('eth_estimateGas',[{from:sender,data:p.tx.data,value:'0x0'},'latest']))>p.tx.gasLimit)throw Error('Deployment estimate exceeds fixed gas limit');
   const proof=join(temp,p.id+'.json');
   const result=aws('lambda','invoke','--function-name',qualificationFunction,'--cli-binary-format','raw-in-base64-out','--payload',JSON.stringify({operationId:p.id}),proof);
   if(result.StatusCode!==200||result.FunctionError)throw Error('Qualification signer did not return proof');
   readProof(p,JSON.parse(await readFile(proof,'utf8')));
   const hash=p.tx.hash;
   await writeFile(join(evidence,p.id+'-prepared.json'),JSON.stringify({hash,nonce:p.tx.nonce,digest:p.tx.unsignedHash}),{flag:'wx',mode:0o600});
   console.log('Prepared',p.id,hash);
   if(await rpc('eth_sendRawTransaction',[p.tx.serialized],true)!==hash)throw Error('Unknown submission outcome. Reconcile exact hash.');
   const r=await awaitMined(hash);
   if(r.status!=='0x1'||r.contractAddress?.toLowerCase()!==p.address.toLowerCase()||r.transactionHash!==hash||
      (await rpc('eth_getBlockByNumber',[r.blockNumber,false])).hash!==r.blockHash||
      await rpc('eth_getCode',[p.address,r.blockNumber])==='0x')throw Error('Deployment receipt verification failed');
   const actual=BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice)+BigInt(r.l1Fee)+
    (BigInt(r.operatorFeeScalar??0)*BigInt(r.gasUsed)/1000000n)+BigInt(r.operatorFeeConstant??0);
   measured+=actual;
   await writeFile(join(evidence,p.id+'-receipt.json'),JSON.stringify({hash,address:p.address,blockNumber:r.blockNumber,blockHash:r.blockHash,actualObservedFeeWei:String(actual)}),{flag:'wx',mode:0o600});
   console.log('Mined',p.id,p.address,r.blockNumber);
  }
 }finally{
  if(started){
   let failure=false;
   for(const args of [
    ['kms','disable-key','--key-id',keyArn],
    ['lambda','put-function-concurrency','--function-name',qualificationFunction,'--reserved-concurrent-executions','0'],
   ]){
    try{aws(...args);}catch{failure=true; console.error('Containment command requires immediate inspection:',args[1]);}
   }
   const disabled=aws('kms','describe-key','--key-id',keyArn).KeyMetadata.KeyState==='Disabled';
   const paused=aws('lambda','get-function-concurrency','--function-name',qualificationFunction).ReservedConcurrentExecutions===0;
   console.log('Containment',JSON.stringify({disabled,paused,observedFeeWei:String(measured)}));
   if(failure||!disabled||!paused)throw Error('Signing containment needs immediate attention');
  }
  if(temp)await rm(temp,{recursive:true,force:true});
 }
}else throw Error('Explicit mode and evidence directory required');
