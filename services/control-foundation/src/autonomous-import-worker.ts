import {autonomousConfiguration,autonomousTopics} from './finalized-autonomous.ts';
import type {AutonomousDeployment,AutonomousReader} from './finalized-autonomous.ts';
import {chainAddress,chainHash,chainObject,chainQuantity,indexedAddress,requireChainSources} from './chain-evidence.ts';
import {gasDigest} from './gas-policy.ts';

export interface AutonomousImportTarget {
 cursor():Promise<{blockNumber:string;logIndex:string}>;
 importExecution(transactionHash:string,checkpointLogIndex:string):Promise<unknown>;
 importClaim(transactionHash:string,logIndex:string):Promise<unknown>;
 importTransfer(input:{transactionHash:string;logIndex:string;senderAddress:string;recipientAddress:string;units:string}):Promise<unknown>;
 advanceEmptyHistory(throughBlock:string):Promise<unknown>;
}
interface Event {blockNumber:string;blockHash:string;logIndex:string;transactionHash:string;address:string;topics:string[];data:string}
const decimal=(v:unknown,negative=false):v is string=>typeof v==='string'&&new RegExp(negative?'^(?:-1|0|[1-9][0-9]{0,77})$':'^(?:0|[1-9][0-9]{0,77})$').test(v);
const zero='0x'+'0'.repeat(40);
const hex=(n:bigint)=>'0x'+n.toString(16);

/** Private qualification worker; configuration and providers come from deployment,
 * never an HTTP request. One bounded step discovers work but cannot authorize it:
 * the settlement target independently rechecks receipts, coverage and accounting.
 * No signing, sending, credential retrieval or schema/permission changes.
 * Concurrent steps may replay a fact; the target must retain atomic idempotency.
 */
export class AutonomousImportWorker {
 private readonly c:AutonomousDeployment;
 private readonly first:AutonomousReader;private readonly second:AutonomousReader;private readonly target:AutonomousImportTarget;
 constructor(first:AutonomousReader,second:AutonomousReader,input:AutonomousDeployment,target:AutonomousImportTarget){
  requireChainSources(first,second);this.c=autonomousConfiguration(input);this.first=first;this.second=second;this.target=target;
 }
 async step():Promise<{state:'WAITING'|'EMPTY_ADVANCED'|'EXECUTION_IMPORTED'|'CLAIM_IMPORTED'|'TRANSFER_IMPORTED';throughBlock:string}>{
  const cursor=await this.target.cursor();
  if(!decimal(cursor.blockNumber)||!decimal(cursor.logIndex,true)||BigInt(cursor.blockNumber)<BigInt(this.c.deploymentBlock))throw Error('Invalid autonomous cursor');
  const from=BigInt(cursor.blockNumber),after=BigInt(cursor.logIndex),last=(1n<<256n)-1n;
  if(after>last)throw Error('Invalid autonomous cursor');
  const heads=await Promise.all([this.first,this.second].map(async source=>{
   if(chainQuantity(await source.request('eth_chainId',[])).toString()!==this.c.chainId)throw Error('Autonomous worker chain mismatch');
   const h=chainObject(await source.request('eth_getBlockByNumber',['finalized',false]));
   return {number:chainQuantity(h.number),hash:chainHash(h.hash)};
  }));
  const final=heads[0]!.number<heads[1]!.number?heads[0]!.number:heads[1]!.number;
  if(final<from||final===from&&after===last)return {state:'WAITING',throughBlock:cursor.blockNumber};
  const to=final<from+1999n?final:from+1999n;
  const read=async(source:AutonomousReader,head:{number:bigint;hash:string})=>{
   const anchor=async()=>{
    const b=chainObject(await source.request('eth_getBlockByNumber',[hex(to),false]));
    if(chainQuantity(b.number)!==to)throw Error('Autonomous worker anchor mismatch');
    const hash=chainHash(b.hash);if(head.number===to&&head.hash!==hash)throw Error('Autonomous worker finalized mismatch');return hash;
   };
   const hash=await anchor();
   const raw=await source.request('eth_getLogs',[{fromBlock:hex(from),toBlock:hex(to),address:[this.c.currency,this.c.controller,this.c.claims],
    topics:[[autonomousTopics.transfer,autonomousTopics.checkpoint,autonomousTopics.claim]]}]);
   if(!Array.isArray(raw)||raw.length>10000)throw Error('Autonomous worker event budget exceeded');
   const seen=new Set<string>(),events:Event[]=[];
   for(const item of raw){
    const l=chainObject(item),n=chainQuantity(l.blockNumber),i=chainQuantity(l.logIndex),address=chainAddress(l.address);
    if(!Array.isArray(l.topics))throw Error('Invalid autonomous worker topics');
    const topics=l.topics.map(chainHash),expected=address===this.c.currency?autonomousTopics.transfer:
     address===this.c.controller?autonomousTopics.checkpoint:address===this.c.claims?autonomousTopics.claim:null;
    if(n<from||n>to||i>last||l.removed!==false||expected===null||topics[0]!==expected||typeof l.data!=='string'||
     !/^0x(?:[0-9a-fA-F]{2})*$/.test(l.data)||l.data.length>65538||topics.length>4)throw Error('Unexpected autonomous worker event');
    const blockHash=chainHash(l.blockHash),transactionHash=chainHash(l.transactionHash),position=n+':'+i;
    if(n===to&&blockHash!==hash)throw Error('Autonomous worker log anchor mismatch');
    if(seen.has(position))throw Error('Duplicate autonomous worker position');seen.add(position);
    if(n===from&&i<=after)continue;
    events.push({blockNumber:String(n),blockHash,logIndex:String(i),transactionHash,address,topics,data:l.data.toLowerCase()});
   }
   events.sort((a,b)=>BigInt(a.blockNumber)===BigInt(b.blockNumber)?BigInt(a.logIndex)<BigInt(b.logIndex)?-1:1:BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:1);
   if(await anchor()!==hash)throw Error('Autonomous worker anchor changed');
   return {hash,events};
  };
  const [a,b]=await Promise.all([read(this.first,heads[0]!),read(this.second,heads[1]!)]);
  if(gasDigest(a)!==gasDigest(b))throw Error('Autonomous worker sources disagree');
  const event=a.events[0];
  if(!event){await this.target.advanceEmptyHistory(String(to));return {state:'EMPTY_ADVANCED',throughBlock:String(to)};}
  const {transactionHash,logIndex}=event;
  if(event.address===this.c.claims){
   await this.target.importClaim(transactionHash,logIndex);return {state:'CLAIM_IMPORTED',throughBlock:event.blockNumber};
  }
  if(event.address===this.c.controller){
   await this.target.importExecution(transactionHash,logIndex);return {state:'EXECUTION_IMPORTED',throughBlock:event.blockNumber};
  }
  if(event.topics.length!==3||!/^0x[0-9a-f]{64}$/.test(event.data))throw Error('Invalid autonomous worker transfer');
  const senderAddress=indexedAddress(event.topics[1]),recipientAddress=indexedAddress(event.topics[2]);
  if(senderAddress===zero||recipientAddress===zero){
   // Mint/burn belongs to the next monetary checkpoint, never a wallet transfer.
   const checkpoint=a.events.find(e=>e.transactionHash===transactionHash&&e.blockNumber===event.blockNumber&&
    BigInt(e.logIndex)>BigInt(logIndex)&&e.address===this.c.controller);
   if(!checkpoint)throw Error('Autonomous mint or burn lacks checkpoint');
   await this.target.importExecution(transactionHash,checkpoint.logIndex);return {state:'EXECUTION_IMPORTED',throughBlock:event.blockNumber};
  }
  await this.target.importTransfer({transactionHash,logIndex,senderAddress,recipientAddress,units:BigInt(event.data).toString()});
  return {state:'TRANSFER_IMPORTED',throughBlock:event.blockNumber};
 }
}
