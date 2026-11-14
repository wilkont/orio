import {readFile,writeFile} from 'node:fs/promises';
import {Interface,id,ZeroAddress,ZeroHash,keccak256} from 'ethers';
const address='0x0eBa0D1802c1fC32Ed75175243893c30E120165c';
const sender='0xB1E1d791a518931042Fed65778a2f8E11938eae1';
function object(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))throw new Error('Expected object');return v as Record<string,unknown>;}
function quantity(v:unknown):bigint{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v))throw new Error('Invalid quantity');return BigInt(v);}
let sequence=0;
async function rpc(method:string,params:unknown[]):Promise<unknown>{
 const requestId=++sequence,r=await fetch('https://sepolia.base.org',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('RPC unavailable');const text=await r.text();if(text.length>524288)throw new Error('Oversized response');
 const v=object(JSON.parse(text));if(v.id!==requestId||v.error||v.result===undefined)throw new Error('RPC rejected read');return v.result;
}
try{
 const hash=process.argv[2];if(!/^0x[0-9a-f]{64}$/.test(hash??''))throw new Error('Expected transaction hash');
 if(await rpc('eth_chainId',[])!=='0x14a34')throw new Error('Wrong chain');
 const plan=object(JSON.parse(await readFile(new URL('../../infrastructure/aws/BASE_SEPOLIA_TIMELOCK_PLAN_2026-11-14.json',import.meta.url),'utf8')));
 const fields=object(plan.transaction),receipt=object(await rpc('eth_getTransactionReceipt',[hash])),tx=object(await rpc('eth_getTransactionByHash',[hash]));
 if(receipt.status!=='0x1'||String(receipt.contractAddress).toLowerCase()!==address.toLowerCase()||receipt.transactionHash!==hash||
  String(tx.from).toLowerCase()!==sender.toLowerCase()||tx.to!==null||tx.input!==fields.data||quantity(tx.nonce)!==0n||quantity(tx.value)!==0n||quantity(tx.chainId)!==84532n)
  throw new Error('Deployment receipt or payload mismatch');
 const block=object(await rpc('eth_getBlockByNumber',[receipt.blockNumber,false]));if(block.hash!==receipt.blockHash)throw new Error('Noncanonical deployment block');
 const code=await rpc('eth_getCode',[address,receipt.blockNumber]);if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+$/.test(code))throw new Error('No deployed code');
 const api=new Interface(['function minimumDelayFloor() view returns(uint256)','function getMinDelay() view returns(uint256)','function hasRole(bytes32,address) view returns(bool)']);
 async function call(name:string,args:unknown[]):Promise<unknown>{const v=await rpc('eth_call',[{to:address,data:api.encodeFunctionData(name,args)},receipt.blockNumber]);if(typeof v!=='string')throw new Error('Invalid call result');return api.decodeFunctionResult(name,v)[0];}
 if(await call('minimumDelayFloor',[])!==60n||await call('getMinDelay',[])!==60n)throw new Error('Wrong governance delay');
 for(const role of ['PROPOSER_ROLE','EXECUTOR_ROLE','CANCELLER_ROLE'])if(await call('hasRole',[id(role),sender])!==true)throw new Error('Missing test role');
 if(await call('hasRole',[id('EXECUTOR_ROLE'),ZeroAddress])!==false||await call('hasRole',[ZeroHash,sender])!==false||await call('hasRole',[ZeroHash,address])!==true)throw new Error('Unexpected open execution or administrator');
 const gasUsed=quantity(receipt.gasUsed),executionFee=gasUsed*quantity(receipt.effectiveGasPrice),l1Fee=quantity(receipt.l1Fee);
 const fees=new Interface(['function getOperatorFee(uint256) view returns(uint256)']);
 const rawOperator=await rpc('eth_call',[{to:'0x420000000000000000000000000000000000000F',data:fees.encodeFunctionData('getOperatorFee',[gasUsed])},receipt.blockNumber]);
 if(typeof rawOperator!=='string')throw new Error('Missing operator fee');
 const operator:unknown=fees.decodeFunctionResult('getOperatorFee',rawOperator)[0];if(typeof operator!=='bigint'||operator<0n)throw new Error('Invalid operator fee');
 const finalized=object(await rpc('eth_getBlockByNumber',['finalized',false]));
 const report={status:'VERIFIED_MINED_QUALIFICATION_DEPLOYMENT',chainId:'84532',observedAt:new Date().toISOString(),transactionHash:hash,address,sender,
  blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,creationInputMatchesPinnedPlan:true,runtimeCodeHash:keccak256(code),
  minimumDelaySeconds:'60',proposerVerified:true,executorVerified:true,cancellerVerified:true,selfAdminVerified:true,openExecution:false,
  gasUsed:gasUsed.toString(),executionFeeWei:executionFee.toString(),l1FeeWei:l1Fee.toString(),operatorFeeAtReceiptBlockWei:operator.toString(),
  observedTotalNetworkFeeWei:(executionFee+l1Fee+operator).toString(),finalizedAtObservation:quantity(finalized.number)>=quantity(receipt.blockNumber),
  financialExecutionEnabled:false,productionQualified:false,limits:['One public read source; no production provider qualification','Empty governance contract only; no reserve, currency, wallet or UserOperation deployment implied']};
 await writeFile(process.argv[3]??new URL('../artifacts/base-sepolia-timelock-receipt.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}catch{console.error('Base Sepolia timelock verification blocked; no write or transaction was performed');process.exitCode=1;}
