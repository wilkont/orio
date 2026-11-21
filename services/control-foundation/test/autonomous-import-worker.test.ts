import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AutonomousImportWorker} from '../src/autonomous-import-worker.ts';
import type {AutonomousImportTarget} from '../src/autonomous-import-worker.ts';
import {autonomousTopics} from '../src/finalized-autonomous.ts';
import type {AutonomousDeployment,AutonomousReader} from '../src/finalized-autonomous.ts';
const address=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const c:AutonomousDeployment={id:'worker',chainId:'84532',deploymentBlock:'1',controller:address(1),currency:address(2),vault:address(3),master:address(4),claims:address(5),companyRecipient:address(6),masterDecimals:6};
const topicAddress=(n:number)=>'0x'+'0'.repeat(24)+address(n).slice(2);
function transfer(index=0,from=7,to=8){return {blockNumber:'0x2',blockHash:hash(2),logIndex:'0x'+index.toString(16),transactionHash:hash(20),address:c.currency,
 topics:[autonomousTopics.transfer,topicAddress(from),topicAddress(to)],data:hash(100),removed:false};}
const checkpoint=(index=1)=>({...transfer(index),address:c.controller,topics:[autonomousTopics.checkpoint,hash(1),hash(0),hash(20)],data:'0x'});
function fixture(logs:unknown[]=[],mutate?:(source:string,method:string,params:unknown[],value:unknown)=>unknown){
 const calls:unknown[][]=[];
 const target:AutonomousImportTarget={cursor:async()=>({blockNumber:'1',logIndex:'-1'}),
  importExecution:async(...args)=>{calls.push(['execution',...args]);},importClaim:async(...args)=>{calls.push(['claim',...args]);},
  importTransfer:async input=>{calls.push(['transfer',input]);},advanceEmptyHistory:async height=>{calls.push(['empty',height]);}};
 const source=(sourceId:string):AutonomousReader=>({sourceId,request:async(method,params)=>{
  const value=method==='eth_chainId'?'0x14a34':method==='eth_getLogs'?structuredClone(logs):
   {number:params[0]==='finalized'?'0x2':params[0],hash:hash(Number(params[0]==='finalized'?2:BigInt(String(params[0]))))};
  return mutate?mutate(sourceId,method,params,value):value;
 }});
 return {calls,target,source,worker:()=>new AutonomousImportWorker(source('first'),source('second'),c,target)};
}
test('discovers the earliest ordinary transfer before a later checkpoint',async()=>{
 const f=fixture([checkpoint(),transfer()]);
 assert.equal((await f.worker().step()).state,'TRANSFER_IMPORTED');
 assert.deepEqual(f.calls,[['transfer',{transactionHash:hash(20),logIndex:'0',senderAddress:address(7),recipientAddress:address(8),units:'100'}]]);
});
test('mint and burn discovery selects their next checkpoint, while orphan burns stop',async()=>{
 for(const [from,to] of [[0,7],[7,0]]){
  const f=fixture([transfer(0,from,to),checkpoint()]);
  assert.equal((await f.worker().step()).state,'EXECUTION_IMPORTED');assert.deepEqual(f.calls,[['execution',hash(20),'1']]);
 }
 const orphan=fixture([transfer(0,7,0)]);await assert.rejects(orphan.worker().step(),/lacks checkpoint/);assert.equal(orphan.calls.length,0);
});
test('discovers claims and checkpoints without interpreting them as token transfers',async()=>{
 for(const [log,kind] of [[checkpoint(),'execution'],[{...transfer(),address:c.claims,topics:[autonomousTopics.claim,topicAddress(8)]},'claim']] as const){
  const f=fixture([log]);await f.worker().step();assert.equal(f.calls[0]![0],kind);
 }
});
test('two-source disagreement, duplicates, removed logs and wrong-chain reads cannot reach accounting',async()=>{
 const cases=[
  fixture([transfer()],(s,m,_p,v)=>s==='second'&&m==='eth_getLogs'?[]:v),
  fixture([transfer(),transfer()]),fixture([{...transfer(),removed:true}]),fixture([{...transfer(),address:c.master}]),
  fixture([transfer()],(_s,m,_p,v)=>m==='eth_chainId'?'0x2105':v),
  fixture([transfer()],(_s,m,_p,v)=>m==='eth_getLogs'?Array(10001).fill(transfer()):v),
 ];
 for(const f of cases){await assert.rejects(f.worker().step());assert.equal(f.calls.length,0);}
 const f=fixture();assert.throws(()=>new AutonomousImportWorker(f.source('same'),f.source('same'),c,f.target));
});
test('uses the lower finalized head, bounds catch-up and waits after the completed finalized block',async()=>{
 const ranges:unknown[]=[];
 const f=fixture([],(_s,m,p,v)=>{
  if(m==='eth_getBlockByNumber'&&p[0]==='finalized')return {number:'0x1388',hash:hash(5000)};
  if(m==='eth_getLogs')ranges.push(p[0]);return v;
 });
 assert.deepEqual(await f.worker().step(),{state:'EMPTY_ADVANCED',throughBlock:'2000'});
 assert.equal((ranges[0] as {toBlock:string}).toBlock,'0x7d0');
 const lag=fixture([], (s,m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='finalized'&&s==='second'?{number:'0x1',hash:hash(1)}:v);
 assert.equal((await lag.worker().step()).throughBlock,'1');
 lag.target.cursor=async()=>({blockNumber:'1',logIndex:((1n<<256n)-1n).toString()});
 assert.equal((await lag.worker().step()).state,'WAITING');assert.equal(lag.calls.length,1);
});
test('rechecks canonical anchor after event reads and refuses a changed finalized identity',async()=>{
 let reads=0;
 const changing=fixture([], (s,m,p,v)=>s==='first'&&m==='eth_getBlockByNumber'&&p[0]!=='finalized'&&++reads===2?{number:'0x2',hash:hash(99)}:v);
 await assert.rejects(changing.worker().step());assert.equal(changing.calls.length,0);
 const wrong=fixture([],(_s,m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='finalized'?{number:'0x2',hash:hash(99)}:v);
 await assert.rejects(wrong.worker().step(),/finalized mismatch/);assert.equal(wrong.calls.length,0);
});
test('does not swallow target failures or advance a cursor on their behalf',async()=>{
 const f=fixture([transfer()]);f.target.importTransfer=async()=>{throw Error('atomic target failed');};
 await assert.rejects(f.worker().step(),/atomic target failed/);assert.equal(f.calls.length,0);
 f.target.cursor=async()=>({blockNumber:'0',logIndex:'-1'});await assert.rejects(f.worker().step(),/Invalid autonomous cursor/);
});
