import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyAutonomousCoverage,autonomousTopics} from '../src/finalized-autonomous.ts';
import type {AutonomousDeployment,AutonomousReader} from '../src/finalized-autonomous.ts';
import {HttpsAutonomousReader,HttpsChainReader} from '../src/chain-rpc.ts';
const address=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const c:AutonomousDeployment={id:'test',chainId:'84532',deploymentBlock:'1',controller:address(1),currency:address(2),vault:address(3),master:address(4),claims:address(5),companyRecipient:address(6),masterDecimals:6};
const event=(height:number,index:number,tx:number,topic=autonomousTopics.checkpoint,contract=c.controller)=>({blockNumber:'0x'+height.toString(16),blockHash:hash(height),logIndex:'0x'+index.toString(16),transactionHash:hash(tx),topics:[topic],data:'0x',address:contract,removed:false});
const reader=(sourceId:string,logs:unknown[]):AutonomousReader=>({sourceId,request:async()=>structuredClone(logs)});
const cursor={block_number:'1',log_index:'-1'},target={blockNumber:'2',logIndex:'2',transactionHash:hash(2)};
test('history coverage stops skipped transfers, disagreement, duplicated positions and out-of-filter data before progress',async()=>{
 const cp=event(2,2,2),prior=event(1,1,1,autonomousTopics.transfer,c.currency);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[prior,cp]),reader('b',[prior,cp]),c,cursor,target,['2']),/Missing preceding/);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[cp]),reader('b',[]),c,cursor,target,['2']),/sources disagree/);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[cp,cp]),reader('b',[cp,cp]),c,cursor,target,['2']),/Duplicate/);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[{...cp,removed:true}]),reader('b',[cp]),c,cursor,target,['2']));
 await assert.rejects(verifyAutonomousCoverage(reader('a',[{...cp,address:c.master}]),reader('b',[cp]),c,cursor,target,['2']));
 await verifyAutonomousCoverage(reader('a',[cp]),reader('b',[cp]),c,cursor,target,['2']);
});
test('empty catch-up requires an actually empty interval and range limits cannot be silently bypassed',async()=>{
 await verifyAutonomousCoverage(reader('a',[]),reader('b',[]),c,cursor,target,null);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[event(2,2,2)]),reader('b',[event(2,2,2)]),c,cursor,target,null),/Missing preceding/);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[]),reader('b',[]),c,cursor,{...target,blockNumber:'10002'},null),/bounded catch-up/);
});
test('matching zero wallet transfers require no journal but still participate in history agreement',async()=>{
 const noop={...event(1,1,1,autonomousTopics.transfer,c.currency),topics:[autonomousTopics.transfer,hash(7),hash(8)],data:hash(0)};
 await verifyAutonomousCoverage(reader('a',[noop]),reader('b',[noop]),c,cursor,target,null);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[noop]),reader('b',[]),c,cursor,target,null),/sources disagree/);
 await assert.rejects(verifyAutonomousCoverage(reader('a',[noop,noop]),reader('b',[noop,noop]),c,cursor,target,null),/Duplicate/);
 const mint={...noop,topics:[autonomousTopics.transfer,hash(0),hash(8)]};
 await assert.rejects(verifyAutonomousCoverage(reader('a',[mint]),reader('b',[mint]),c,cursor,target,null),/Missing preceding/);
});
test('autonomous HTTPS transport allows bounded event reads while ordinary chain reader and unsafe ranges reject',async()=>{
 let sent=0;
 const fetcher:typeof fetch=async()=>{sent++;return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:[]}));};
 const settings={sourceId:'test',endpoint:'https://example.com/rpc'},reader=new HttpsAutonomousReader(settings,fetcher),old=new HttpsChainReader(settings,fetcher);
 const filter={fromBlock:'0x1',toBlock:'0x7d0',address:[c.currency,c.controller,c.claims],topics:[[autonomousTopics.transfer,autonomousTopics.checkpoint,autonomousTopics.claim]]};
 await reader.request('eth_getLogs',[filter]);assert.equal(sent,1);
 await assert.rejects(reader.request('eth_getLogs',[{...filter,toBlock:'0x7d1'}]));
 await assert.rejects(reader.request('eth_getLogs',[{...filter,address:[c.currency,c.currency,c.claims]}]));
 // Deliberately probe the runtime allowlist, outside the narrower static method type.
 await assert.rejects(Reflect.apply(old.request,old,['eth_getLogs',[filter]]));assert.equal(sent,1);
});
