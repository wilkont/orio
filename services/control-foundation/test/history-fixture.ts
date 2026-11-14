import type { ChainReader } from '../src/chain-evidence.ts';
import type { HistoryConfiguration } from '../src/finalized-history.ts';
export const hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
export const address='0x'+'1'.repeat(40);
export const historyConfig:HistoryConfiguration={id:'history',chainId:'84532',firstBlock:'10',precedingBlockHash:hash(9),watchedAddresses:[address]};
export function historyReader(sourceId:string, change:(method:string,params:unknown[],value:unknown)=>unknown=(_m,_p,value)=>value):ChainReader {
 return {sourceId,request:async(method,params)=>{
  let value:unknown;
  if(method==='eth_chainId')value='0x14a34';
  else if(method==='eth_getTransactionReceipt'){
   const tx=String(params[0]),index=tx===hash(100)?0:1;
   const log={address:index===0?address:'0x'+'2'.repeat(40),topics:[hash(3)],data:'0x12',removed:false,
     transactionHash:tx,transactionIndex:'0x'+index,blockNumber:'0xa',blockHash:hash(10),logIndex:'0x'+index};
   value={status:'0x1',transactionHash:tx,transactionIndex:'0x'+index,blockNumber:'0xa',blockHash:hash(10),logs:[log]};
  }else{
   const height=params[0]==='finalized'?12:Number(BigInt(String(params[0])));
   value={number:'0x'+height.toString(16),hash:hash(height),parentHash:hash(height-1),transactions:height===10?[hash(100),hash(101)]:[]};
  }
  return structuredClone(change(method,params,value));
 }};
}
