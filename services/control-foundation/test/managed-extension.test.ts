import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ControlLedger} from '../src/ledger.ts';
import type {JournalRequest} from '../src/ledger.ts';

const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test')throw new Error('Use isolated local PostgreSQL');

test('provider-owned digest dependency is qualified without granting runtime or PUBLIC primitive access',async()=>{
 const suffix=randomUUID().replaceAll('-',''),database='orio_test_managed_'+suffix,owner='orio_digest_owner_'+suffix,role='orio_digest_rt_'+suffix;
 const root=new Pool({connectionString:rootUrl.href});let provider:Pool|undefined,migration:Pool|undefined,runtime:Pool|undefined;
 try{
  await root.query('CREATE ROLE '+owner+' NOSUPERUSER CREATEROLE NOLOGIN');
  await root.query('CREATE DATABASE '+database+' OWNER '+owner);
  const url=new URL(rootUrl);url.pathname='/'+database;
  provider=new Pool({connectionString:url.href});migration=new Pool({connectionString:url.href,options:'-c role='+owner});
  await migration.query((await readFile(new URL('../migrations/001_ledger.sql',import.meta.url),'utf8')).replaceAll('orio_ledger_runtime',role));
  // A trusted extension is owned by the bootstrap/provider identity. Reproduce
  // the owner-only crypto ACL observed on hosted RDS, entirely in this test DB.
  await provider.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA orio_ledger FROM PUBLIC');
  runtime=new Pool({connectionString:url.href,options:'-c role='+role});const ledger=new ControlLedger(runtime);
  await ledger.createAccount({id:'reserve',asset:'TEST_UNITS',normalSide:'debit',allowNegative:false});
  await ledger.createAccount({id:'obligation',asset:'TEST_UNITS',normalSide:'credit',allowNegative:false});
  const request:JournalRequest={idempotencyKey:'managed-extension',externalRef:'synthetic-managed-extension',description:'Isolated managed extension regression',postings:[
   {accountId:'reserve',side:'debit',units:'123456789012345678901234567890'},
   {accountId:'obligation',side:'credit',units:'123456789012345678901234567890'}]};
  await assert.rejects(ledger.post(request),/permission denied for function digest/);
  assert.equal((await ledger.verify()).head.sequence,'0');
  const upgrade=(await readFile(new URL('../migrations/019_managed_digest_permissions.sql',import.meta.url),'utf8')).replaceAll('orio_ledger_runtime',role);
  const denied=await runtime.connect();try{await assert.rejects(denied.query(upgrade),/Trusted ledger owner or provider grant authority/);}finally{await denied.query('ROLLBACK');denied.release();}
  await provider.query(upgrade);
  const receipt=await ledger.post(request);assert.equal(receipt.sequence,'1');assert.deepEqual(await ledger.post(request),receipt);
  assert.equal((await ledger.verify()).ok,true);
  for(const signature of ['orio_ledger.digest(bytea,text)','orio_ledger.digest(text,text)']){
   const privileges:{owner_exec:boolean;runtime_exec:boolean}|undefined=(await provider.query<{owner_exec:boolean;runtime_exec:boolean}>(
    'SELECT has_function_privilege($1,$2,\'EXECUTE\') AS owner_exec,has_function_privilege($3,$2,\'EXECUTE\') AS runtime_exec',[owner,signature,role])).rows[0];
   assert.deepEqual(privileges,{owner_exec:true,runtime_exec:false});
  }
  await assert.rejects(runtime.query("SELECT orio_ledger.digest('text','sha256')"),/permission denied/);
  assert.equal((await provider.query("SELECT has_function_privilege($1,'orio_ledger.encrypt(bytea,bytea,text)','EXECUTE') AS allowed",[owner])).rows[0].allowed,false);
  assert.equal((await provider.query('SELECT count(*) AS n FROM orio_ledger.journals')).rows[0].n,'1');
 }finally{
  if(runtime)await runtime.end();if(migration)await migration.end();if(provider)await provider.end();
  await root.query('DROP DATABASE IF EXISTS '+database);await root.query('DROP ROLE IF EXISTS '+role);await root.query('DROP ROLE IF EXISTS '+owner);await root.end();
 }
});
