import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditConnection,auditSecretArn} from '../src/hosted-audit-identity.ts';

test('maintenance secret cannot redirect the pinned database and punctuation stays in the password',()=>{
 const password='synthetic:@/?#% only',url=new URL(auditConnection({ARN:auditSecretArn,SecretString:JSON.stringify({username:'orio_ledger_admin',password,host:'attacker.invalid',dbname:'elsewhere',port:1})}));
 assert.equal(url.hostname,'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com');
 assert.equal(url.port,'5432');assert.equal(url.pathname,'/orio_control');assert.equal(url.search,'');assert.equal(url.hash,'');
 assert.equal(decodeURIComponent(url.password),password);
});
test('wrong secret, principal and malformed credentials reject without echoing contents',()=>{
 for(const response of [null,{}, {ARN:'another',SecretString:'sensitive-marker'}, {ARN:auditSecretArn,SecretString:'sensitive-marker'},
  {ARN:auditSecretArn,SecretString:JSON.stringify({username:'other',password:'sensitive-marker'})},
  {ARN:auditSecretArn,SecretString:JSON.stringify({username:'orio_ledger_admin',password:''})}]){
  assert.throws(()=>auditConnection(response),(e:unknown)=>e instanceof Error&&!e.message.includes('sensitive-marker'));
 }
});
