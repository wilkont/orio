import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMetadataLambda} from '../src/metadata-lambda.ts';
import {metadataTokenPassword,metadataIamConfiguration,metadataHost,metadataDatabaseUser} from '../src/metadata-iam.ts';
const paused={electionId:null,state:'DEPOSIT_PAUSED',asset:null} as const;
const event=(path='/v1/protocol/master',method='GET')=>({version:'2.0',rawPath:path,rawQueryString:'',requestContext:{http:{method}}});
test('Lambda exposes only fixed public metadata and reports financial execution disabled',async()=>{
 let checks=0,reads=0;
 const handler=createMetadataLambda({master:async()=>{reads++;return paused;}},async()=>{checks++;});
 for(const path of ['/health','/ready','/v1/protocol/policy','/v1/protocol/master']){
  const response=await handler(event(path));assert.equal(response.statusCode,200);assert.equal(response.headers['Cache-Control'],'no-store');
  if(path.endsWith('/master'))assert.deepEqual(JSON.parse(response.body),{master:paused,financialExecutionEnabled:false});
 }
 assert.equal(checks,4);assert.equal(reads,2);
 assert.equal((await handler(event('/v1/settlement'))).statusCode,404);
 assert.equal((await handler(event('/v1/protocol/master','POST'))).statusCode,405);
 assert.equal(checks,4);
});
test('malformed requests and bodies cannot select database or signing operations',async()=>{
 const handler=createMetadataLambda({master:async()=>paused},async()=>{throw new Error('must not execute');});
 for(const invalid of [null,[],{}, {...event(),version:'1.0'},{...event(),body:'SELECT private'}, {...event(),isBase64Encoded:true},event('/ready\n'),event('/'+'a'.repeat(256)),{...event(),rawQueryString:'x'.repeat(513)}])assert.equal((await handler(invalid)).statusCode,400);
});
test('qualification and database failures stay generic without leaking credentials',async()=>{
 const failed=createMetadataLambda({master:async()=>paused},async()=>{throw new Error('secret-token');});
 for(const path of ['/health','/ready','/v1/protocol/master','/v1/protocol/policy']){
  const response=await failed(event(path));assert.equal(response.statusCode,503);assert.equal(response.body.includes('secret-token'),false);
 }
 const handler=createMetadataLambda({master:async()=>{throw new Error('private endpoint');}},async()=>{});
 assert.deepEqual(JSON.parse((await handler(event())).body),{error:'protocol_state_unavailable'});
});
test('each new connection requests a token for the pinned reader only and redacts issuer errors',async()=>{
 const config={host:metadataHost,port:5432,database:'orio_control',user:metadataDatabaseUser,region:'us-east-1'};
 let issued=0;
 const password=metadataTokenPassword(config,async target=>{
  assert.deepEqual(target,{hostname:metadataHost,port:5432,username:metadataDatabaseUser,region:'us-east-1'});
  assert.equal(Object.isFrozen(target),true);return 'synthetic-test-token-'+(++issued);
 });
 assert.equal(await password(),'synthetic-test-token-1');assert.equal(await password(),'synthetic-test-token-2');
 assert.throws(()=>metadataTokenPassword({...config,user:'orio_ledger_admin'},async()=>''),/Unexpected/);
 await assert.rejects(metadataTokenPassword(config,async()=>{throw new Error('sensitive issuer detail');})(),{message:'Metadata authentication unavailable'});
 await assert.rejects(metadataTokenPassword(config,async()=> '')(),{message:'Metadata authentication unavailable'});
});
test('runtime rejects administrator URLs and untrusted CA material before database access',()=>{
 const env={AWS_REGION:'us-east-1',AWS_LAMBDA_FUNCTION_NAME:'orio-spc-3-protocol-metadata',ORIO_METADATA_MODE:'READ_ONLY_IAM',ORIO_DATABASE_HOST:metadataHost,ORIO_DATABASE_NAME:'orio_control',ORIO_DATABASE_USER:metadataDatabaseUser};
 for(const override of [{},{ORIO_DATABASE_URL:'postgresql://admin:secret@localhost/db'},{PGPASSWORD:'secret'},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{AWS_REGION:'us-west-2'},{ORIO_DATABASE_USER:'orio_ledger_admin'}])assert.throws(()=>metadataIamConfiguration({...env,...override},Buffer.from('untrusted CA')),/Invalid restricted/);
});
