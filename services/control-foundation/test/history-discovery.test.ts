import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chainObject} from '../src/chain-evidence.ts';
import {discoverHistoryBlock} from '../src/finalized-history.ts';
import {hash,historyConfig,historyReader} from './history-fixture.ts';

test('scans every receipt, retains watched activity and preserves block order',async()=>{
 const seen:string[]=[];
 const first=historyReader('first',(method,params,value)=>{if(method==='eth_getTransactionReceipt')seen.push(String(params[0]));return value;});
 const result=await discoverHistoryBlock(first,historyReader('second'),historyConfig,'10',hash(9));
 assert.deepEqual(seen,[hash(100),hash(101)]);
 assert.equal(result?.receipts.length,1);
 assert.deepEqual(result?.transactionHashes,[hash(100),hash(101)]);
 assert.equal(await discoverHistoryBlock(first,historyReader('second'),historyConfig,'11',hash(10)).then(x=>x?.receipts.length),0);
});
test('lagging finalized heads wait and missing receipts stop rather than skip',async()=>{
 const lag=historyReader('lag',(m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='finalized'?{number:'0x9',hash:hash(9)}:v);
 assert.equal(await discoverHistoryBlock(lag,historyReader('second'),historyConfig,'10',hash(9)),null);
 const missing=historyReader('missing',(m,p,v)=>m==='eth_getTransactionReceipt'&&p[0]===hash(101)?null:v);
 await assert.rejects(discoverHistoryBlock(historyReader('first'),missing,historyConfig,'10',hash(9)));
});
test('rejects disagreeing transaction membership, receipt identities and log contents',async()=>{
 for(const mutate of [
  (m:string,p:unknown[],v:unknown)=>m==='eth_getBlockByNumber'&&p[0]==='0xa'?{...chainObject(v),transactions:[hash(100)]}:v,
  (m:string,_p:unknown[],v:unknown)=>m==='eth_getTransactionReceipt'?{...chainObject(v),transactionIndex:'0x9'}:v,
  (m:string,_p:unknown[],v:unknown)=>m==='eth_getTransactionReceipt'?{...chainObject(v),logs:[]}:v,
 ])await assert.rejects(discoverHistoryBlock(historyReader('first'),historyReader('second',mutate),historyConfig,'10',hash(9)));
});
test('rejects bad parent anchors, wrong chains and a contradictory finalized hash',async()=>{
 await assert.rejects(discoverHistoryBlock(historyReader('first'),historyReader('second'),historyConfig,'10',hash(8)));
 const wrong=historyReader('second',(m,_p,v)=>m==='eth_chainId'?'0x2105':v);
 await assert.rejects(discoverHistoryBlock(historyReader('first'),wrong,historyConfig,'10',hash(9)),/chain mismatch/);
 const tip=historyReader('second',(m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='finalized'?{number:'0xa',hash:hash(99)}:v);
 await assert.rejects(discoverHistoryBlock(historyReader('first'),tip,historyConfig,'10',hash(9)),/anchor mismatch/);
});
test('checks block identity again after reads and rejects removed, gapped or failed logs',async()=>{
 let calls=0;
 const changed=historyReader('first',(m,p,v)=>m==='eth_getBlockByNumber'&&p[0]==='0xa'&&++calls===2?{...chainObject(v),hash:hash(88)}:v);
 await assert.rejects(discoverHistoryBlock(changed,historyReader('second'),historyConfig,'10',hash(9)),/changed during discovery/);
 for(const patch of [{removed:true},{logIndex:'0x5'},{blockHash:hash(55)}]){
  const reader=(id:string)=>historyReader(id,(m,_p,v)=>{
   if(m!=='eth_getTransactionReceipt')return v;
   const r=chainObject(v);return {...r,logs:[{...chainObject((r.logs as unknown[])[0]),...patch}]};
  });
  await assert.rejects(discoverHistoryBlock(reader('first'),reader('second'),historyConfig,'10',hash(9)));
 }
 const failed=(id:string)=>historyReader(id,(m,_p,v)=>m==='eth_getTransactionReceipt'?{...chainObject(v),status:'0x0'}:v);
 await assert.rejects(discoverHistoryBlock(failed('first'),failed('second'),historyConfig,'10',hash(9)),/Failed transaction/);
});
test('pins caller configuration before asynchronous provider work and rejects mainnet',async()=>{
 const config=structuredClone(historyConfig);
 const pending=discoverHistoryBlock(historyReader('first'),historyReader('second'),config,'10',hash(9));
 config.watchedAddresses=[];
 assert.equal((await pending)?.receipts.length,1);
 await assert.rejects(discoverHistoryBlock(historyReader('first'),historyReader('second'),{...historyConfig,chainId:'8453'},'10',hash(9)));
 await assert.rejects(discoverHistoryBlock(historyReader('same'),historyReader('same'),historyConfig,'10',hash(9)));
});
