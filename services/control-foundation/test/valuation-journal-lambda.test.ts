import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createValuationJournalLambda} from '../src/valuation-journal-lambda.ts';
import {valuationJournalIamConfiguration,valuationJournalTokenPassword,valuationJournalUser} from '../src/valuation-journal-iam.ts';
import {metadataHost} from '../src/metadata-iam.ts';
test('private journal accepts only exact scoped actions and never interprets caller policy, key or SQL',async()=>{
 const calls:unknown[][]=[];
 const handler=createValuationJournalLambda({qualify:async()=>{calls.push(['qualify']);},load:async id=>{calls.push(['load',id]);return {typedDigest:'known'};},
  claim:async(id,d)=>{calls.push(['claim',id,d]);},complete:async(id,d,s)=>{calls.push(['complete',id,d,s]);}});
 const e={version:'1',action:'load',intentId:'staged'},digest='0x'+'a'.repeat(64),signature='0x'+'1'.repeat(130);
 assert.equal((await handler({version:'1',action:'qualify'})).ok,true);
 assert.deepEqual((await handler(e)).result,{typedDigest:'known'});
 assert.equal((await handler({...e,action:'claim',digest})).ok,true);
 assert.equal((await handler({...e,action:'complete',digest,signature})).ok,true);
 const before=calls.length;
 for(const bad of [null,[],{}, {...e,keyArn:'caller'}, {...e,sql:'SELECT secret'}, {...e,policy:{}}, {...e,action:'sign'},
  {...e,intentId:'staged\n'}, {...e,action:'claim',digest:digest+'\n'}, {...e,action:'complete',digest,signature:signature+'\n'},
  {...e,version:'2'}, Object.create(e)])assert.equal((await handler(bad)).ok,false);
 assert.equal(calls.length,before);
});
test('journal errors and oversized evidence remain opaque; temporary tokens have a pinned identity',async()=>{
 let calls=0;const fail=async()=>{calls++;throw Error('private password or server address');};
 const handler=createValuationJournalLambda({qualify:fail,load:fail,claim:fail,complete:fail});
 assert.deepEqual(await handler({version:'1',action:'load',intentId:'known'}),{version:'1',ok:false,error:'SCOPED_JOURNAL_REQUEST_REJECTED'});
 assert.equal(calls,1);
 const huge=createValuationJournalLambda({qualify:fail,load:async()=>({private:'x'.repeat(131073)}),claim:fail,complete:fail});
 assert.equal((await huge({version:'1',action:'load',intentId:'known'})).ok,false);
 let issued=0;const password=valuationJournalTokenPassword(async target=>{
  assert.deepEqual(target,{hostname:metadataHost,port:5432,username:valuationJournalUser,region:'us-east-1'});
  assert.equal(Object.isFrozen(target),true);return 'synthetic-'+(++issued);
 });
 assert.equal(await password(),'synthetic-1');assert.equal(await password(),'synthetic-2');
 await assert.rejects(valuationJournalTokenPassword(fail)(),{message:'Scoped journal authentication unavailable'});
 const env={AWS_REGION:'us-east-1',AWS_LAMBDA_FUNCTION_NAME:'orio-spc-3-valuation-journal',ORIO_JOURNAL_MODE:'SCOPED_QUALIFICATION_IAM',
  ORIO_DATABASE_HOST:metadataHost,ORIO_DATABASE_NAME:'orio_control',ORIO_DATABASE_USER:valuationJournalUser};
 for(const override of [{},{ORIO_DATABASE_URL:'postgresql://admin'},{PGPASSWORD:'password'},{ORIO_DATABASE_USER:'orio_ledger_admin'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}])
  assert.throws(()=>valuationJournalIamConfiguration({...env,...override},Buffer.from('untrusted CA')),/Invalid scoped/);
});
