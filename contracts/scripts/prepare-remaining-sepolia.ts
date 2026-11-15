import {readFile,writeFile} from 'node:fs/promises';
import {Interface,Transaction,getCreateAddress,keccak256,getBytes} from 'ethers';
import {createVM} from '@ethereumjs/vm';
import {createCustomCommon,Mainnet,Hardfork} from '@ethereumjs/common';
import {RPCStateManager} from '@ethereumjs/statemanager';
import {createAddressFromString,hexToBytes,bytesToHex,createAccount} from '@ethereumjs/util';
import type {Address,Account} from '@ethereumjs/util';
import {setTimeout as pause} from 'node:timers/promises';

// Read-only remote fork. All EVM writes remain in this process's caches.
const endpoint='https://sepolia.base.org',sender='0xB1E1d791a518931042Fed65778a2f8E11938eae1';
const governance='0x0eBa0D1802c1fC32Ed75175243893c30E120165c';
const entryPoint='0x4337084d9e255ff0702461cf8895ce9e3b5ff108';
const usdc='0x036CbD53842c5426634e7929541eC2318f3dCF7e';
let sequence=0;
let nextRequestAt=0;
async function pace():Promise<void>{const now=Date.now(),delay=Math.max(0,nextRequestAt-now);nextRequestAt=Math.max(now,nextRequestAt)+1000;await pause(delay);}
class PacedForkState extends RPCStateManager{
 // The public node restricts eth_getProof. This diagnostic trusts ordinary pinned
 // state reads; it does not claim to verify account/storage proofs or a state root.
 override async getAccountFromProvider(address:Address):Promise<Account>{
  const balance=quantity(await rpc('eth_getBalance',[address.toString(),this._blockTag]));
  const nonce=quantity(await rpc('eth_getTransactionCount',[address.toString(),this._blockTag]));
  const code=await this.getCode(address);
  return createAccount({balance,nonce,codeHash:getBytes(keccak256(code))});
 }
 override async getCode(address:Address):Promise<Uint8Array>{
  const cached=this._caches.code?.get(address)?.code;if(cached!==undefined)return cached;
  const value=await rpc('eth_getCode',[address.toString(),this._blockTag]);
  if(typeof value!=='string'||!/^0x(?:[0-9a-f]{2})*$/.test(value))throw new Error('Invalid fork code');
  const code=hexToBytes(value as `0x${string}`);this._caches.code?.put(address,code);return code;
 }
 override async getStorage(address:Address,key:Uint8Array):Promise<Uint8Array>{
  if(key.length!==32)throw new Error('Invalid storage key');
  const cached=this._caches.storage?.get(address,key);if(cached!==undefined)return cached;
  const value=await rpc('eth_getStorageAt',[address.toString(),bytesToHex(key),this._blockTag]);
  if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/.test(value))throw new Error('Invalid storage word');
  const bytes=hexToBytes(value as `0x${string}`),first=bytes.findIndex(v=>v!==0),minimal=first<0?new Uint8Array():bytes.slice(first);
  await this.putStorage(address,key,minimal);return minimal;
 }
}
function object(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))throw new Error('Expected object');return v as Record<string,unknown>;}
function quantity(v:unknown):bigint{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v))throw new Error('Invalid quantity');return BigInt(v);}
async function rpc(method:string,params:unknown[]):Promise<unknown>{
 await pace();
 const id=++sequence,r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('RPC unavailable');const text=await r.text();if(text.length>524288)throw new Error('Oversized response');
 const v=object(JSON.parse(text));if(v.id!==id||v.error||v.result===undefined)throw new Error('RPC rejected read');return v.result;
}
const watchdog=setTimeout(()=>{console.error('Read-only fork planning timed out; no signing or submission occurred');process.exit(1);},240000);
try{
 if(await rpc('eth_chainId',[])!=='0x14a34')throw new Error('Wrong chain');
 const block=object(await rpc('eth_getBlockByNumber',['latest',false])),height=quantity(block.number);
 const nonce=quantity(await rpc('eth_getTransactionCount',[sender,block.number]));
 if(nonce!==1n||quantity(await rpc('eth_getTransactionCount',[sender,'pending']))!==nonce)throw new Error('Unexpected deployment nonce');
 const common=createCustomCommon({chainId:84532},Mainnet,{hardfork:Hardfork.Cancun});
 const stateManager=new PacedForkState({provider:endpoint,blockTag:height,common});
 const caller=createAddressFromString(sender);
 const meta=new Interface(['function decimals() view returns(uint8)']);
 const decimals=await rpc('eth_call',[{to:usdc,data:meta.encodeFunctionData('decimals')},block.number]);
 if(typeof decimals!=='string'||meta.decodeFunctionResult('decimals',decimals)[0]!==6n)throw new Error('Unexpected test USDC decimals');
 const dependencies:Record<string,unknown>={};
 for(const [name,address] of [['governance',governance],['entryPoint',entryPoint],['testUsdc',usdc]]){
  const code=await rpc('eth_getCode',[address,block.number]);if(typeof code!=='string'||code==='0x')throw new Error('Missing dependency');
  dependencies[name]={address,codeHash:keccak256(code)};
 }
 const addresses=Object.fromEntries(['registry','paymaster','accountFactory','recoveryFactory','controller'].map((name,i)=>[name,getCreateAddress({from:sender,nonce:nonce+BigInt(i)})]));
 const specs=[['registry','MasterAssetRegistry',[governance]],['paymaster','ORIOTreasuryPaymaster',[entryPoint,governance]],
  ['accountFactory','ORIOGasAccountFactory',[entryPoint,addresses.paymaster]],['recoveryFactory','ORIORecoverableGasAccountFactory',[entryPoint,addresses.paymaster]],
  ['controller','ORIOMonetaryController',[governance,addresses.registry,usdc]]] as const;
 const priority=1000000n,price=50000000n;
 if(quantity(block.baseFeePerGas)+priority>price)throw new Error('Fixed qualification fee cap is currently insufficient');
 const feeApi=new Interface(['function getL1FeeUpperBound(uint256) view returns(uint256)','function getOperatorFee(uint256) view returns(uint256)']);
 async function fee(name:string,arg:bigint):Promise<bigint>{
  const result=await rpc('eth_call',[{to:'0x420000000000000000000000000000000000000F',data:feeApi.encodeFunctionData(name,[arg])},block.number]);
  if(typeof result!=='string')throw new Error('Invalid fee response');const value:unknown=feeApi.decodeFunctionResult(name,result)[0];
  if(typeof value!=='bigint'||value<0n)throw new Error('Invalid fee');return value;
 }
 const plans=[];let total=0n;
 for(let i=0;i<specs.length;i++){
  const [operationId,contract,args]=specs[i],artifact=object(JSON.parse(await readFile(new URL('../artifacts/'+contract+'.json',import.meta.url),'utf8')));
  const bytecode=object(object(artifact.evm).bytecode).object;
  if(typeof artifact.compiler!=='string'||!artifact.compiler.startsWith('0.8.38+')||!Array.isArray(artifact.abi)||typeof bytecode!=='string'||!/^([0-9a-f]{2})+$/.test(bytecode))throw new Error('Invalid artifact');
  const api=new Interface(artifact.abi),data:`0x${string}`=`0x${bytecode}${api.encodeDeploy([...args]).slice(2)}`;
  stateManager.originalStorageCache.clear();const vm=await createVM({common,stateManager});
  vm.evm.journal.addAlwaysWarmAddress(caller.toString());
  const result=await vm.evm.runCall({caller,origin:caller,data:hexToBytes(data),gasLimit:16000000n,value:0n});
  if(result.execResult.exceptionError||result.createdAddress?.toString().toLowerCase()!==addresses[operationId].toLowerCase())throw new Error('Fork constructor failed');
  const bytes=hexToBytes(data);let intrinsic=53000n+2n*((BigInt(bytes.length)+31n)/32n);
  for(const value of bytes)intrinsic+=value===0?4n:16n;
  const forkGas=result.execResult.executionGasUsed+intrinsic;
  const gasLimit=(forkGas*135n+99n)/100n+50000n;if(gasLimit>16000000n)throw new Error('Unsafe gas limit');
  const tx=Transaction.from({type:2,chainId:84532n,nonce:Number(nonce)+i,gasLimit,maxFeePerGas:price,maxPriorityFeePerGas:priority,value:0n,data});
  const l1=await fee('getL1FeeUpperBound',BigInt((tx.unsignedSerialized.length-2)/2+80)),operator=await fee('getOperatorFee',gasLimit);
  const budget=gasLimit*price+2n*l1+2n*operator;total+=budget;
  const runtime=bytesToHex(await stateManager.getCode(result.createdAddress));if(runtime==='0x')throw new Error('No simulated runtime');
  const children=[];
  if(operationId==='controller'){
   for(const getter of ['currency','vault','redemptionLocks']){
    const read=await vm.evm.runCall({caller,to:result.createdAddress,data:hexToBytes(api.encodeFunctionData(getter) as `0x${string}`),isStatic:true,skipNonceIncrement:true});
    if(read.execResult.exceptionError)throw new Error('Child identity read failed');
    const address:unknown=api.decodeFunctionResult(getter,bytesToHex(read.execResult.returnValue))[0];
    if(typeof address!=='string')throw new Error('Invalid child identity');
    const code=bytesToHex(await stateManager.getCode(createAddressFromString(address)));if(code==='0x')throw new Error('Missing child code');
    children.push({name:getter,address,expectedRuntimeCodeHash:keccak256(code)});
   }
  }
  plans.push({operationId,contract,constructorArguments:args,predictedAddress:addresses[operationId],creationBytecodeHash:keccak256('0x'+bytecode),expectedRuntimeCodeHash:keccak256(runtime),children,
   unsignedDigest:tx.unsignedHash,transaction:{type:'2',chainId:'84532',nonce:(nonce+BigInt(i)).toString(),gasLimit:gasLimit.toString(),maxFeePerGas:price.toString(),maxPriorityFeePerGas:priority.toString(),value:'0',data},
   fees:{forkGasWithIntrinsic:forkGas.toString(),l1UpperBoundWei:l1.toString(),operatorAtGasLimitWei:operator.toString(),planningBudgetWei:budget.toString()}});
 }
 const canonical=object(await rpc('eth_getBlockByNumber',[block.number,false]));if(canonical.hash!==block.hash)throw new Error('Fork anchor changed');
 const balance=quantity(await rpc('eth_getBalance',[sender,'latest']));
 const report={status:balance>=total?'PREPARED_REQUIRES_SIGNING_APPROVAL':'PREPARED_REQUIRES_MORE_TEST_ETH_AND_SIGNING_APPROVAL',chainId:'84532',sender,governance,entryPoint,testUsdc:usdc,
  observedAt:new Date().toISOString(),forkBlock:height.toString(),forkBlockHash:block.hash,dependencies,plans,totalPlanningBudgetWei:total.toString(),testEthBalanceWei:balance.toString(),
  additionalTestWeiRequired:(total>balance?total-balance:0n).toString(),financialExecutionEnabled:false,
  limits:['Simulation uses ordinary trusted state reads from one public RPC; no state-root or account/storage proof verification is claimed',
   'Cancun EVM simulation with conservative gas margins; every live transaction must pass a fresh eth_estimateGas before submission',
   'L1 and operator fees may change; EIP-1559 does not cap their total',
   'Only paused contract deployment is proposed; no asset election, issuance, paymaster activation or customer operations',
   'No private key, signing request, account change or blockchain broadcast occurs during planning']};
 await writeFile(process.argv[2]??new URL('../artifacts/remaining-sepolia-plan.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,plans:plans.map(p=>({...p,transaction:{...p.transaction,data:'[recorded in plan file]'}}))}));
}catch(error){console.error('Remaining Base Sepolia planning blocked; no signing or submission occurred');console.error(error instanceof Error?error.message:'Unknown diagnostic error');process.exitCode=1;}
finally{clearTimeout(watchdog);}
