import {readFile,writeFile} from 'node:fs/promises';
import {Interface,Transaction,getCreateAddress,keccak256} from 'ethers';

// Read-only qualification planning. This command never signs or broadcasts.
const sender='0xB1E1d791a518931042Fed65778a2f8E11938eae1';
const oracle='0x420000000000000000000000000000000000000F';
const feeApi=new Interface(['function getL1FeeUpperBound(uint256) view returns(uint256)','function getOperatorFee(uint256) view returns(uint256)']);
let sequence=0;
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Expected object');
 return value as Record<string,unknown>;
}
async function rpc(method:string,params:unknown[]):Promise<unknown>{
 const id=++sequence,response=await fetch('https://sepolia.base.org',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Qualification RPC unavailable');
 const text=await response.text();if(text.length>262144)throw new Error('Oversized qualification response');
 const value=object(JSON.parse(text));if(value.id!==id||value.jsonrpc!=='2.0'||value.error||value.result===undefined)throw new Error('Qualification RPC rejected request');
 return value.result;
}
const quantity=(value:unknown):bigint=>{if(typeof value!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value))throw new Error('Invalid RPC quantity');return BigInt(value);};
try{
 if(await rpc('eth_chainId',[])!=='0x14a34')throw new Error('Wrong network');
 const artifact=object(JSON.parse(await readFile(new URL('../artifacts/ORIOGovernanceTimelock.json',import.meta.url),'utf8')));
 const bytecode=object(object(artifact.evm).bytecode).object;
 if(typeof artifact.compiler!=='string'||!/^0\.8\.38\+/.test(artifact.compiler)||!Array.isArray(artifact.abi)||typeof bytecode!=='string'||!/^([0-9a-f]{2})+$/.test(bytecode))throw new Error('Unverified build artifact');
 const api=new Interface(artifact.abi),delay='60';
 const data='0x'+bytecode+api.encodeDeploy([delay,[sender],[sender]]).slice(2);
 const latest=object(await rpc('eth_getBlockByNumber',['latest',false]));
 if(typeof latest.hash!=='string'||!/^0x[0-9a-f]{64}$/.test(latest.hash))throw new Error('Invalid observed block');
 const block=latest.number,baseFee=quantity(latest.baseFeePerGas),priority=quantity(await rpc('eth_maxPriorityFeePerGas',[]));
 const nonce=quantity(await rpc('eth_getTransactionCount',[sender,'pending']));
 if(nonce>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Unsupported transaction nonce');
 const balance=quantity(await rpc('eth_getBalance',[sender,block]));
 const estimate=quantity(await rpc('eth_estimateGas',[{from:sender,data,value:'0x0'},block]));
 const gasLimit=(estimate*120n+99n)/100n,maxFeePerGas=2n*baseFee+priority;
 const request={type:2,chainId:84532n,nonce:Number(nonce),gasLimit,maxFeePerGas,maxPriorityFeePerGas:priority,data,value:0n};
 const transaction=Transaction.from(request);
 const size=BigInt((transaction.unsignedSerialized.length-2)/2+80);
 async function oracleRead(name:string,arg:bigint):Promise<bigint>{
  const result=await rpc('eth_call',[{to:oracle,data:feeApi.encodeFunctionData(name,[arg])},block]);
  if(typeof result!=='string'||!/^0x[0-9a-f]{64}$/.test(result))throw new Error('Invalid oracle response');
  const fee=feeApi.decodeFunctionResult(name,result)[0];
  if(typeof fee!=='bigint'||fee<0n)throw new Error('Invalid exact fee');
  return fee;
 }
 const l1FeeUpperBound=await oracleRead('getL1FeeUpperBound',size),operatorFee=await oracleRead('getOperatorFee',gasLimit);
 const feeBudget=gasLimit*maxFeePerGas+l1FeeUpperBound*2n+operatorFee*2n;
 const plan={status:balance>=feeBudget?'PREPARED_REQUIRES_SIGNING_APPROVAL':'INSUFFICIENT_TEST_ETH',chainId:'84532',
  qualificationOnly:true,financialExecutionEnabled:false,observedAt:new Date().toISOString(),observedBlock:block,observedBlockHash:latest.hash,
  sender,contract:'ORIOGovernanceTimelock',compiler:artifact.compiler,creationBytecodeHash:keccak256('0x'+bytecode),
  constructor:{delaySeconds:delay,proposers:[sender],executors:[sender]},predictedAddress:getCreateAddress({from:sender,nonce}),
  transaction:{type:'2',chainId:'84532',nonce:nonce.toString(),gasLimit:gasLimit.toString(),maxFeePerGas:maxFeePerGas.toString(),
   maxPriorityFeePerGas:priority.toString(),value:'0',data},unsignedDigest:transaction.unsignedHash,
  fees:{testEthBalanceWei:balance.toString(),estimatedGas:estimate.toString(),l1UpperBoundWei:l1FeeUpperBound.toString(),
   operatorFeeAtGasLimitWei:operatorFee.toString(),planningBudgetWei:feeBudget.toString()},
  limits:['Unsigned planning only; no signing access or broadcast authorized by this file',
   'Fee observations can change; L1/operator charges are not capped by EIP-1559 maxFeePerGas',
   'Recheck nonce, balance, network and all fee components immediately before any approved submission',
   '60-second governance delay and single qualification proposer/executor are test-only proposed settings',
   'Public RPC is diagnostic only; production requires qualified dedicated providers']};
 await writeFile(process.argv[2]??new URL('../artifacts/base-sepolia-timelock-plan.json',import.meta.url),JSON.stringify(plan,null,2)+'\n');
 console.log(JSON.stringify({...plan,transaction:{...plan.transaction,data:'[recorded in plan file]'}}));
}catch{console.error('Base Sepolia deployment preflight blocked; no signing or broadcast occurred');process.exitCode=1;}
