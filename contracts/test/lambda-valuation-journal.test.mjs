import {test} from 'node:test';
import assert from 'node:assert/strict';
import {InvokeCommand} from '@aws-sdk/client-lambda';
import {verifyTypedData} from 'ethers';
import {LambdaValuationJournal} from '../sdk/lambda-valuation-journal.mjs';
import {signCommittedReserveValuation} from '../sdk/aws-kms-valuation-signer.mjs';
import {valuationTypes} from '../sdk/reserve-valuation.mjs';
import {createValuationJournalLambda} from '../../services/control-foundation/src/valuation-journal-lambda.ts';
import {reserveFixture} from './helpers/reserve-valuation-fixture.mjs';
const arn='arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-valuation-journal:1';
function transport(handler,after=async()=>{}){
 const calls=[];let closed=0;
 return {calls,get closed(){return closed;},factory:options=>{
  assert.deepEqual(options,{region:'us-east-1',endpoint:'https://lambda.us-east-1.amazonaws.com',maxAttempts:1});
  return {send:async c=>{assert.ok(c instanceof InvokeCommand);assert.equal(c.input.FunctionName,arn);assert.equal(c.input.InvocationType,'RequestResponse');assert.equal(c.input.LogType,'None');
   const e=JSON.parse(Buffer.from(c.input.Payload).toString());calls.push(e);const result=await handler(e);await after(e,result);
   return {StatusCode:200,ExecutedVersion:'1',Payload:Buffer.from(JSON.stringify(result))};},destroy:()=>closed++};
 }};
}
function staged(f){const m=f.prepare();let claimed=false,completed=false;return {
 get claimed(){return claimed;},get completed(){return completed;},qualify:async()=>{},
 load:async()=>{if(claimed)throw Error('Consumed');return {evidence:m.evidence,preparedAt:f.now,typedDigest:m.digest,policyDigest:m.policyDigest,keyArn:f.signingPolicy.keyArn,signer:f.wallet.address};},
 claim:async()=>{if(claimed)throw Error('Consumed');claimed=true;},complete:async()=>{assert.ok(claimed);completed=true;}};}
test('version-pinned private transport connects the strict handler to the actual valuation signer without changing its evidence',async()=>{
 const f=reserveFixture(),server=staged(f),t=transport(createValuationJournalLambda(server)),journal=new LambdaValuationJournal({functionArn:arn},t.factory);
 await journal.qualify();let signs=0;
 const result=await signCommittedReserveValuation(journal,f.signingPolicy,'owned-intent',()=>f.now,()=>f.client(async()=>{assert.ok(server.claimed);signs++;}));
 assert.equal(signs,1);assert.equal(server.completed,true);
 assert.equal(verifyTypedData(result.domain,valuationTypes,result.value,result.signature),f.wallet.address);
 assert.deepEqual(t.calls.map(c=>c.action),['qualify','load','claim','complete']);assert.equal(t.closed,4);
 assert.deepEqual(t.calls[1],{version:'1',action:'load',intentId:'owned-intent'});
});
test('aliases, different accounts, wrong executed versions and opaque transport failures reject without retries',async()=>{
 for(const functionArn of [arn.replace(':1',':$LATEST'),arn.replace(':1',':live'),arn.replace('720232346199','710096437887'),arn+'\n',arn.replace(':1',':0')])assert.throws(()=>new LambdaValuationJournal({functionArn}));
 let calls=0,closed=0;
 const journal=new LambdaValuationJournal({functionArn:arn},()=>({send:async()=>{calls++;return {StatusCode:200,ExecutedVersion:'2',Payload:Buffer.from('{}')};},destroy:()=>closed++}));
 await assert.rejects(journal.qualify(),{message:'Scoped journal response unavailable; reconcile the intent before retry'});assert.equal(calls,1);assert.equal(closed,1);
 const failed=new LambdaValuationJournal({functionArn:arn},()=>({send:async()=>{calls++;throw Error('private-credential-detail');},destroy:()=>closed++}));
 await assert.rejects(failed.load('owned'),e=>e instanceof Error&&!e.message.includes('private-credential-detail'));assert.equal(calls,2);
 await assert.rejects(failed.claim('owned','0x'+'a'.repeat(64)+'\n'));assert.equal(calls,2);
});
test('a claim committed before a lost Lambda acknowledgement prevents KMS signing and requires reconciliation',async()=>{
 const f=reserveFixture(),server=staged(f);let signs=0;
 const t=transport(createValuationJournalLambda(server),async e=>{if(e.action==='claim')throw Error('Acknowledgement lost after commit');});
 const journal=new LambdaValuationJournal({functionArn:arn},t.factory);
 await assert.rejects(signCommittedReserveValuation(journal,f.signingPolicy,'unknown-claim',()=>f.now,()=>f.client(async()=>signs++)),
  {message:'Reserve signing outcome requires reconciliation; claim acknowledgement is unknown'});
 assert.equal(server.claimed,true);assert.equal(server.completed,false);assert.equal(signs,0);
 assert.deepEqual(t.calls.map(c=>c.action),['load','claim']);
});
