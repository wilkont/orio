import {AbiCoder,Interface,ZeroHash,getAddress,keccak256,toUtf8Bytes,Transaction} from 'ethers';

export const registrySetupApi=new Interface([
 'function registerCandidate(address,uint8,bytes32)','function approveAsset(bytes32,bytes32)','function electInitial(bytes32,bytes32)',
 'function bindMonetarySettlement(address,address)',
]);
export const controllerSetupApi=new Interface(['function configure(address,address,bool,uint64)']);
export const timelockSetupApi=new Interface([
 'function schedule(address,uint256,bytes,bytes32,bytes32,uint256)',
 'function execute(address,uint256,bytes,bytes32,bytes32)',
]);
const integer=value=>{if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,20})(?![\s\S])/.test(value))throw Error('Invalid exact setup quantity');return BigInt(value);};
const abi=AbiCoder.defaultAbiCoder();

/** Builds five fixed governance actions and their ten zero-value testnet calls.
 * Trusted deployment preparation only; creates no key/access and never sends.
 * Native test USDC has no dollar backing. configure(false) is unconditional:
 * this plan never authorizes monetary execution, transfers or production keys.
 */
export function buildTestnetMonetarySetup(input){
 const p=structuredClone(input);
 if(p.chainId!=='84532')throw Error('Only Base Sepolia setup');
 for(const key of ['governance','registry','controller','vault','currency','master','sender'])p[key]=getAddress(p[key]);
 if(new Set(['governance','registry','controller','vault','currency','master','sender'].map(k=>p[k])).size!==7||
  Object.values(p).includes('0x'+'0'.repeat(40)))throw Error('Invalid setup identities');
 const nonce=integer(p.nonce),delay=integer(p.delaySeconds);
 if(nonce>1000000n||delay===0n||delay>86400n)throw Error('Invalid setup nonce or delay');
 const assetId=keccak256(abi.encode(['uint256','address'],['84532',p.master]));
 const evidence=label=>keccak256(toUtf8Bytes('ORIO-BASE-SEPOLIA-NONFINANCIAL-SETUP/v1:'+label));
 const specs=[
  ['register',p.registry,'registerCandidate',[p.master,6,evidence('test-usdc-policy')]],
  ['approve',p.registry,'approveAsset',[assetId,evidence('valueless-test-asset-only')]],
  ['elect',p.registry,'electInitial',[assetId,evidence('initial-test-master')]],
  ['bind',p.registry,'bindMonetarySettlement',[p.controller,p.vault]],
  ['configure-paused',p.controller,'configure',[p.sender,p.sender,false,'0']],
 ];
 let predecessor=ZeroHash;
 const actions=specs.map(([id,target,method,args])=>{
  const data=(target===p.registry?registrySetupApi:controllerSetupApi).encodeFunctionData(method,args);
  const salt=evidence('operation:'+id),operationHash=keccak256(abi.encode(['address','uint256','bytes','bytes32','bytes32'],[target,'0',data,predecessor,salt]));
  const action={id,target,value:'0',data,predecessor,salt,operationHash};predecessor=operationHash;return action;
 });
 const plans=[];
 for(const kind of ['schedule','execute'])for(const action of actions){
  const args=[action.target,'0',action.data,action.predecessor,action.salt,...(kind==='schedule'?[p.delaySeconds]:[])];
  const transaction={type:'2',chainId:'84532',nonce:(nonce+BigInt(plans.length)).toString(),to:p.governance,value:'0',
   data:timelockSetupApi.encodeFunctionData(kind,args),gasLimit:kind==='schedule'?'250000':'1000000',maxFeePerGas:'100000000',maxPriorityFeePerGas:'1000000'};
  const tx=Transaction.from({...transaction,type:2,nonce:Number(transaction.nonce)});
  const limit=(BigInt(transaction.gasLimit)*BigInt(transaction.maxFeePerGas)+50000000000000n).toString();
  plans.push({operationId:kind+'-'+action.id,kind,actionId:action.id,unsignedDigest:tx.unsignedHash,transaction,maximumPlanningFeeWei:limit});
 }
 if(plans.reduce((n,x)=>n+BigInt(x.maximumPlanningFeeWei),0n)>1500000000000000n)throw Error('Setup exceeds whole-test planning ceiling');
 return {status:'PREPARED_NOT_AUTHORIZED',chainId:'84532',sender:p.sender,governance:p.governance,registry:p.registry,controller:p.controller,
  currency:p.currency,vault:p.vault,testUsdc:p.master,delaySeconds:p.delaySeconds,assetId,actions,plans,
  maximumBatchPlanningWei:'1500000000000000',financialExecutionEnabled:false,productionKeysUsed:false};
}
