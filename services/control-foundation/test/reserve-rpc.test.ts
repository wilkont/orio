import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HttpsReserveReader,HttpsChainReader,HttpsBundlerReader} from '../src/chain-rpc.ts';

test('reserve RPC pins canonical block hashes and cannot override state or send transactions',async()=>{
 let calls=0;
 const reader=new HttpsReserveReader({sourceId:'qualification',endpoint:'https://rpc.invalid/private-path'},async(_,init)=>{
  calls++;assert.equal(init?.redirect,'error');assert.ok(init?.signal);
  const body=JSON.parse(String(init?.body));assert.deepEqual(body.params[1],{blockHash:'0x'+'b'.repeat(64),requireCanonical:true});
  return Response.json({jsonrpc:'2.0',id:1,result:'0x'+'0'.repeat(64)});
 });
 const pin={blockHash:'0x'+'b'.repeat(64),requireCanonical:true},to='0x'+'a'.repeat(40),data='0x70a08231'+'0'.repeat(64);
 await reader.request('eth_call',[{to,data},pin]);await reader.request('eth_getCode',[to,pin]);assert.equal(calls,2);
 for(const [method,params] of [
  ['eth_call',[{to,data},'latest']],['eth_call',[{to,data},{...pin,requireCanonical:false}]],
  ['eth_call',[{to,data,from:to},pin]],['eth_call',[{to,data,value:'0x1'},pin]],['eth_call',[{to,data},pin,{}]],
  ['eth_call',[{to,data:'0x00'},pin]],['eth_getCode',[to,'finalized']],['eth_sendRawTransaction',['0xab']],
  ['eth_getTransactionReceipt',['0x'+'a'.repeat(64)]],
 ] as const)await assert.rejects(reader.request(method as Parameters<HttpsReserveReader['request']>[0],[...params]));
 assert.equal(calls,2);
 for(const Reader of [HttpsChainReader,HttpsBundlerReader]){
  const old=new Reader({sourceId:'old',endpoint:'https://rpc.invalid'},async()=>{throw Error('Must not reach transport');});
  await assert.rejects(old.request('eth_call' as never,[{to,data},pin]));
 }
});
