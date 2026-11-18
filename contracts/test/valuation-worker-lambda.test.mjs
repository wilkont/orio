import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyTypedData} from 'ethers';
import {InvokeCommand} from '@aws-sdk/client-lambda';
import {createValuationWorkerLambda} from '../sdk/valuation-worker-lambda.mjs';
import {valuationTypes} from '../sdk/reserve-valuation.mjs';
import {reserveFixture} from './helpers/reserve-valuation-fixture.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const arn='arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-valuation-journal:1';
function setup(){
 const f=reserveFixture(),material=f.prepare();let claim=false,complete=false,signs=0,invocations=0;
 const configuration=JSON.stringify({version:'1',mode:'BASE_SEPOLIA_QUALIFICATION',journal:{functionArn:arn},signingPolicy:f.signingPolicy});
 const journalClientFactory=options=>{
  assert.equal(options.maxAttempts,1);
  return {destroy(){},async send(command){
   assert.ok(command instanceof InvokeCommand);assert.equal(command.input.FunctionName,arn);invocations++;
   const request=JSON.parse(Buffer.from(command.input.Payload).toString());let result=null;
   if(request.action==='load')result={evidence:material.evidence,preparedAt:f.now,typedDigest:material.digest,policyDigest:material.policyDigest,keyArn:f.signingPolicy.keyArn,signer:f.wallet.address};
   else if(request.action==='claim'){if(claim)throw Error('Consumed');claim=true;}
   else if(request.action==='complete'){assert.ok(claim);complete=true;}
   else throw Error('Unexpected journal operation');
   return {StatusCode:200,ExecutedVersion:'1',Payload:Buffer.from(JSON.stringify({version:'1',ok:true,result}))};
  }};
 };
 const deps={journalClientFactory,kmsClientFactory:()=>f.client(async()=>{assert.ok(claim);signs++;}),clock:()=>f.now};
 return {f,configuration,deps,get signs(){return signs;},get complete(){return complete;},get invocations(){return invocations;}};
}
test('private worker connects immutable Lambda journal through claim, one KMS signature and completion',async()=>{
 const s=setup(),handler=createValuationWorkerLambda(s.configuration,sha(s.configuration),s.deps);
 const result=await handler({version:'1',action:'signCommittedIntent',intentId:'intent-1'});
 assert.equal(result.ok,true);assert.ok(s.complete);assert.equal(s.signs,1);assert.equal(s.invocations,3);
 assert.equal(result.result.financialExecutionEnabled,false);
 assert.equal(verifyTypedData(result.result.domain,valuationTypes,result.result.value,result.result.signature),s.f.wallet.address);
 const replay=await handler({version:'1',action:'signCommittedIntent',intentId:'intent-1'});
 assert.equal(replay.ok,false);assert.equal(s.signs,1);assert.match(replay.error,/RECONCILE/);
});
test('caller policy/digest/key/SQL substitutions and malformed events cannot reach the journal or KMS',async()=>{
 const s=setup(),handler=createValuationWorkerLambda(s.configuration,sha(s.configuration),s.deps);
 const valid={version:'1',action:'signCommittedIntent',intentId:'intent-1'};
 for(const event of [null,[],{...valid,policy:{}},{...valid,keyArn:s.f.signingPolicy.keyArn},{...valid,digest:s.f.prepare().digest},
  {...valid,sql:'SELECT 1'},{...valid,intentId:'intent-1\n'},{...valid,action:'sign'},Object.create(valid)]){
  assert.equal((await handler(event)).ok,false);
 }
 assert.equal(s.signs,0);assert.equal(s.invocations,0);
});
test('unreviewed configuration, mainnet and mutable journal versions reject before service creation',()=>{
 const s=setup();assert.throws(()=>createValuationWorkerLambda(s.configuration,'0'.repeat(64),s.deps));
 for(const change of [c=>c.signingPolicy.reservePolicy.chainId='8453',c=>c.journal.functionArn=arn.replace(':1',':latest'),c=>c.mode='LIVE',c=>c.extra=true]){
  const c=JSON.parse(s.configuration);change(c);const text=JSON.stringify(c);
  assert.throws(()=>createValuationWorkerLambda(text,sha(text),s.deps));
 }
 assert.equal(s.signs,0);assert.equal(s.invocations,0);
});
