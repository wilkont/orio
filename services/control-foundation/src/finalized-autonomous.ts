import {chainAddress,chainHash,chainObject,chainQuantity,finalizedReceipt,finalizedLog,indexedAddress,requireChainSources} from './chain-evidence.ts';
import type {ChainReader} from './chain-evidence.ts';
import {gasDigest} from './gas-policy.ts';
export interface AutonomousDeployment {
 id:string;chainId:'84532'|'31337';controller:string;currency:string;vault:string;master:string;claims:string;companyRecipient:string;masterDecimals:number;
}
export function autonomousConfiguration(input:AutonomousDeployment):AutonomousDeployment {
 const c=structuredClone(input);
 if(!/^[a-z][a-z0-9_-]{0,63}$/.test(c.id)||!['84532','31337'].includes(c.chainId)||!Number.isInteger(c.masterDecimals)||c.masterDecimals<0||c.masterDecimals>18)
  throw Error('Invalid autonomous qualification deployment');
 const keys=['controller','currency','vault','master','claims'] as const;
 for(const key of keys)c[key]=chainAddress(c[key]);
 c.companyRecipient=chainAddress(c.companyRecipient);
 if(new Set(keys.map(key=>c[key])).size!==5||keys.some(key=>c[key]===zero)||c.companyRecipient===zero||keys.some(key=>c[key]===c.companyRecipient))throw Error('Invalid autonomous identities');
 return c;
}
export const autonomousTopics={
 start:'0xcb418aea50f62cbb6a2394300e45eb64336b1a1794189579a0b9cc73df8a0567',
 checkpoint:'0xb72b9734ac47d1bffd6bf5a113675f3d90b0739cf44eac7906137c0023ca36e1',
 purchase:'0xde27d2d52e8a1490228b0a13da6a33d21911851d4b1ea188577a1bd62f58984c',
 allocation:'0x82a5f8917915ece139731a0a3b5e9e64d15bc135419648ccb2ed019eb940a107',
 credit:'0xfa0ea8a012f094d1b6f48df9238391dcbfbbda9acf72c5fa9b26c32451e98a61',
 claim:'0xec68461f5d4cc45c89e914cb8826a966c73dd35e5f97815ece0a01ffa4a025a6',
 transfer:'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
};
const zero='0x'+'0'.repeat(40);
const topics=(l:Record<string,unknown>)=>{if(!Array.isArray(l.topics))throw Error('Missing event topics');return l.topics.map(chainHash);};
function words(data:unknown,n:number):string[]{
 if(typeof data!=='string'||data.length!==2+n*64||!new RegExp('^0x[0-9a-fA-F]{'+n*64+'}$').test(data))throw Error('Invalid autonomous event encoding');
 return n===0?[]:data.slice(2).toLowerCase().match(/.{64}/g)!;
}
const uint=(w:string)=>BigInt('0x'+w).toString();
export interface AutonomousAllocation {id:string;owner:string;recipient:string;amount:string;payout:string;fee:string;company:string;gross:string;logIndex:string}
export interface AutonomousProof {
 transactionHash:string;checkpointLogIndex:string;blockHash:string;blockNumber:string;operationId:string;version:string;previousVersion:string;kind:string;
 supplyAtoms:string;referencePriceUsd36:string;reserveMasterUnits:string;roundingUsd54:string;companyUnits:string;cycle:string;phase:string;masterUsd36:string;pendingClaims:string;
 allocations:AutonomousAllocation[];receiptIndexes:string[];
 companyWithdrawal:{recipient:string;units:string}|null;
}
async function snapshot(source:ChainReader,c:AutonomousDeployment,tx:string){
 const s=await finalizedReceipt(source,c.chainId,tx);
 if(!Array.isArray(s.receipt.logs))throw Error('Missing receipt logs');
 const logs=s.receipt.logs.map(chainObject).map(l=>finalizedLog(s,tx,chainQuantity(l.logIndex).toString()));
 if(new Set(logs.map(l=>chainQuantity(l.logIndex).toString())).size!==logs.length)throw Error('Duplicate receipt log');
 return {...s,logs};
}
async function execution(source:ChainReader,c:AutonomousDeployment,tx:string,index:string):Promise<AutonomousProof>{
 const s=await snapshot(source,c,tx),cp=finalizedLog(s,tx,index),ct=topics(cp);
 if(chainAddress(cp.address)!==c.controller||ct.length!==4||ct[0]!==autonomousTopics.checkpoint)throw Error('Wrong autonomous checkpoint');
 const version=uint(ct[1]!.slice(2)),kind=uint(ct[2]!.slice(2));
 if(BigInt(version)===0n||BigInt(kind)>4n)throw Error('Invalid checkpoint identity');
 const w=words(cp.data,11);if(uint(w[0]!)!=='32'||uint(w[1]!)!=='288')throw Error('Invalid checkpoint payload');
 const state=w.slice(2);
 const starts=s.logs.filter(l=>chainAddress(l.address)===c.controller&&topics(l)[0]===autonomousTopics.start&&chainQuantity(l.logIndex)<BigInt(index));
 const start=starts.sort((a,b)=>chainQuantity(a.logIndex)<chainQuantity(b.logIndex)?1:-1)[0];
 if(!start||topics(start).length!==2||words(start.data,0).length!==0)throw Error('Missing autonomous boundary');
 const previousVersion=uint(topics(start)[1]!.slice(2));if(BigInt(previousVersion)+1n!==BigInt(version))throw Error('Wrong previous version');
 const segment=s.logs.filter(l=>chainQuantity(l.logIndex)>chainQuantity(start.logIndex)&&chainQuantity(l.logIndex)<BigInt(index));
 if(segment.some(l=>chainAddress(l.address)===c.controller&&[autonomousTopics.start,autonomousTopics.checkpoint].includes(topics(l)[0]!)))throw Error('Nested execution');
 const movements=segment.filter(l=>[c.master,c.currency].includes(chainAddress(l.address))&&topics(l)[0]===autonomousTopics.transfer).map(l=>{
  const t=topics(l);if(t.length!==3)throw Error('Invalid transfer topics');
  return {token:chainAddress(l.address),from:indexedAddress(t[1]),to:indexedAddress(t[2]),units:uint(words(l.data,1)[0]!),index:chainQuantity(l.logIndex).toString()};
 });
 const indexes=[index],take=(token:string,from:string,to:string,units:string)=>{
  const i=movements.findIndex(m=>m.token===token&&m.from===from&&m.to===to&&m.units===units);
  if(i<0)throw Error('Missing autonomous token movement');indexes.push(movements[i]!.index);movements.splice(i,1);
 };
 const allocations:AutonomousAllocation[]=[],credits=segment.filter(l=>chainAddress(l.address)===c.claims&&topics(l)[0]===autonomousTopics.credit);
 for(const l of segment.filter(l=>chainAddress(l.address)===c.controller&&[autonomousTopics.purchase,autonomousTopics.allocation].includes(topics(l)[0]!))){
  const t=topics(l),i=chainQuantity(l.logIndex).toString();indexes.push(i);
  if(t[0]===autonomousTopics.purchase){
   if(kind!=='0'||t.length!==3||t[1]!==ct[3])throw Error('Unexpected purchase');
   const a=words(l.data,4),owner=indexedAddress(t[2]);
   take(c.master,owner,c.vault,uint(a[0]!));take(c.currency,zero,owner,uint(a[3]!));
   allocations.push({id:t[1]!,owner,recipient:owner,gross:uint(a[0]!),fee:uint(a[1]!),company:uint(a[2]!),amount:uint(a[3]!),payout:'0',logIndex:i});
  }else{
   if(kind!=='1'||t.length!==4)throw Error('Unexpected withdrawal');
   const a=words(l.data,4),owner=indexedAddress(t[2]),recipient=indexedAddress(t[3]);
   const amount=uint(a[0]!),payout=uint(a[1]!);take(c.currency,owner,zero,amount);
   const ci=credits.findIndex(l=>{const t=topics(l);return t.length===2&&indexedAddress(t[1])===recipient&&uint(words(l.data,1)[0]!)===payout;});
   if(ci<0)throw Error('Missing funded claim credit');indexes.push(chainQuantity(credits[ci]!.logIndex).toString());credits.splice(ci,1);
   allocations.push({id:t[1]!,owner,recipient,gross:'0',amount,payout,fee:uint(a[2]!),company:uint(a[3]!),logIndex:i});
  }
 }
 if(kind==='0'?allocations.length!==1:kind!=='1'&&allocations.length!==0)throw Error('Invalid allocation count');
 if(kind==='1'&&allocations.length){const total=allocations.reduce((n,a)=>n+BigInt(a.payout),0n);take(c.master,c.vault,c.claims,total.toString());}
 let companyWithdrawal:AutonomousProof['companyWithdrawal']=null;
 if(kind==='4'){
  if(movements.length!==1||movements[0]!.token!==c.master||movements[0]!.from!==c.vault||movements[0]!.to!==c.companyRecipient||movements[0]!.units==='0')throw Error('Invalid company distribution');
  companyWithdrawal={recipient:c.companyRecipient,units:movements[0]!.units};take(c.master,c.vault,c.companyRecipient,companyWithdrawal.units);
 }
 if(movements.length||credits.length||new Set(allocations.map(a=>a.id)).size!==allocations.length)throw Error('Unaccounted movement or duplicate allocation');
 return {transactionHash:tx,checkpointLogIndex:index,blockHash:s.blockHash,blockNumber:s.blockNumber,operationId:ct[3]!,version,previousVersion,kind,
  supplyAtoms:uint(state[0]!),referencePriceUsd36:uint(state[1]!),reserveMasterUnits:uint(state[2]!),roundingUsd54:uint(state[3]!),companyUnits:uint(state[4]!),
  cycle:uint(state[5]!),phase:uint(state[6]!),masterUsd36:uint(state[7]!),pendingClaims:uint(state[8]!),allocations,receiptIndexes:indexes,companyWithdrawal};
}
export async function verifyAutonomousExecution(first:ChainReader,second:ChainReader,input:AutonomousDeployment,transactionHash:string,checkpointLogIndex:string){
 requireChainSources(first,second);const c=autonomousConfiguration(input),tx=chainHash(transactionHash);
 if(typeof checkpointLogIndex!=='string'||!/^(0|[1-9][0-9]*)$/.test(checkpointLogIndex))throw Error('Invalid checkpoint index');
 const [a,b]=await Promise.all([execution(first,c,tx,checkpointLogIndex),execution(second,c,tx,checkpointLogIndex)]);
 if(gasDigest(a)!==gasDigest(b))throw Error('Autonomous chain sources disagree');return a;
}
export async function verifyAutonomousClaim(first:ChainReader,second:ChainReader,input:AutonomousDeployment,transactionHash:string,logIndex:string){
 requireChainSources(first,second);const c=autonomousConfiguration(input),tx=chainHash(transactionHash);
 if(typeof logIndex!=='string'||!/^(0|[1-9][0-9]*)$/.test(logIndex))throw Error('Invalid claim index');
 const read=async(source:ChainReader)=>{
  const s=await snapshot(source,c,tx),l=finalizedLog(s,tx,logIndex),t=topics(l);
  if(chainAddress(l.address)!==c.claims||t.length!==2||t[0]!==autonomousTopics.claim)throw Error('Wrong payout claim');
  const recipient=indexedAddress(t[1]),units=uint(words(l.data,1)[0]!);if(units==='0')throw Error('Empty payout claim');
  const transfers=s.logs.filter(m=>chainAddress(m.address)===c.master&&topics(m)[0]===autonomousTopics.transfer&&
   topics(m).length===3&&indexedAddress(topics(m)[1])===c.claims&&indexedAddress(topics(m)[2])===recipient&&uint(words(m.data,1)[0]!)===units&&chainQuantity(m.logIndex)<BigInt(logIndex));
  if(transfers.length!==1)throw Error('Missing or ambiguous claim transfer');
  return {transactionHash:tx,logIndex,recipient,units,transferLogIndex:chainQuantity(transfers[0]!.logIndex).toString(),blockHash:s.blockHash,blockNumber:s.blockNumber};
 };
 const [a,b]=await Promise.all([read(first),read(second)]);if(gasDigest(a)!==gasDigest(b))throw Error('Claim sources disagree');return a;
}
