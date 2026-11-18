import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {initialMonetaryState} from '../src/monetary-engine.ts';
import {ValuationSigningJournal} from '../src/valuation-signing-journal.ts';
import {ValuationRuntimeJournal} from '../src/valuation-runtime-journal.ts';
const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test')throw Error('Use isolated PostgreSQL harness');

test('a scoped login can consume only its immutable valuation intents; direct records, broader grants, stale state and revocation reject',async()=>{
 const suffix=randomUUID().replaceAll('-',''),name='orio_test_vrt_'+suffix,worker='orio_test_vworker_'+suffix,group='orio_test_vgroup_'+suffix,legacy='orio_test_vledger_'+suffix;
 const root=new Pool({connectionString:rootUrl.href});let owner:Pool|undefined,runtime:Pool|undefined,poisoned:Pool|undefined;
 try{
  await root.query('CREATE DATABASE '+name);const url=new URL(rootUrl);url.pathname='/'+name;owner=new Pool({connectionString:url.href});
  const dir=new URL('../migrations/',import.meta.url);
  for(const n of (await readdir(dir)).filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort())await owner.query((await readFile(new URL(n,dir),'utf8')).replaceAll('orio_ledger_runtime',legacy));
  for(const n of ['020_reserve_valuation_signing.sql','021_valuation_runtime_functions.sql'])
   await owner.query(await readFile(new URL('../pending-migrations/'+n,import.meta.url),'utf8'));
  await owner.query('CREATE ROLE '+group+' NOLOGIN');
  await owner.query('CREATE ROLE '+worker+" LOGIN PASSWORD 'synthetic-local-valuation-only'");
  await owner.query('GRANT '+group+' TO '+worker);
  await owner.query('GRANT USAGE ON SCHEMA orio_signing TO '+group);
  await owner.query('GRANT EXECUTE ON FUNCTION orio_signing.valuation_runtime_load(text),orio_signing.valuation_runtime_claim(text,text),orio_signing.valuation_runtime_complete(text,text,text) TO '+group);
  url.username=worker;url.password='synthetic-local-valuation-only';runtime=new Pool({connectionString:url.href,max:8});
  const delegated=new ValuationRuntimeJournal(runtime,{database:name,login:worker}),journal=new ValuationSigningJournal(owner);
  const address=(i:number)=>'0x'+String(i).repeat(40);
  const config={id:'qualification_runtime',chainId:'84532',controller:address(1),currency:address(2),vault:address(3),registry:address(4),master:address(5),registryEpoch:'1',masterDecimals:6};
  const state=initialMonetaryState('erc20:84532:'+config.master,'onchain-epoch:1',6);
  await owner.query('INSERT INTO orio_monetary.deployments(id,configuration,state) VALUES($1,$2,$3)',[config.id,config,state]);
  const key='arn:aws:kms:us-east-1:720232346199:key/12345678-1234-1234-1234-123456789abc',hash='0x'+'a'.repeat(64),policy='0x'+'b'.repeat(64);
  for(const authority of ['runtime-a','runtime-b'])await owner.query('INSERT INTO orio_signing.authorities VALUES($1,$2,$3,$4)',[authority,key,address(6),policy]);
  await owner.query('INSERT INTO orio_signing.runtime_authority_bindings VALUES($1,$2)',[worker,'runtime-a']);
  const now=Math.floor(Date.now()/1000).toString();
  const material={digest:hash,policyDigest:policy,evidence:{deploymentId:config.id,ledgerVersion:'0',ledgerState:{...state},companyMasterUnits:'0',
   observations:[{...config,finalized:true}],prices:[]},value:{validAfter:now,validUntil:(BigInt(now)+120n).toString()}};
  for(const id of ['one','revoked','stale','permission-check'])await journal.stage(id,'runtime-a',material);
  await journal.stage('other-authority','runtime-b',material);
  assert.equal((await delegated.load('one')).typedDigest,hash);
  await assert.rejects(delegated.load('other-authority'),/Unrecognized scoped/);
  await assert.rejects(runtime.query('SELECT * FROM orio_ledger.journals'),/permission denied/);
  await assert.rejects(runtime.query('SELECT * FROM orio_signing.valuation_intents'),/permission denied/);
  await assert.rejects(runtime.query("INSERT INTO orio_signing.authorities VALUES('evil','x','x','x')"),/permission denied/);
  await assert.rejects(runtime.query("SELECT orio_signing.assert_runtime_valuation('one')"),/permission denied/);
  const claims=await Promise.allSettled([delegated.claim('one',hash),delegated.claim('one',hash)]);
  assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
  await assert.rejects(delegated.load('one'),/consumed/);
  // A receipt shape is not an independent ECDSA proof; the actual KMS worker
  // and all consumers must verify the signature (covered by contract integration).
  await delegated.complete('one',hash,'0x'+'11'.repeat(65));
  assert.equal((await owner.query('SELECT count(*) FROM orio_signing.completions')).rows[0].count,'1');
  await owner.query('GRANT SELECT ON orio_ledger.accounts TO '+worker);
  await assert.rejects(delegated.load('permission-check'),/privileges are unsafe/);
  await owner.query('REVOKE SELECT ON orio_ledger.accounts FROM '+worker);
  await owner.query('GRANT SELECT(id) ON orio_ledger.accounts TO '+worker);
  await assert.rejects(delegated.load('permission-check'),/privileges are unsafe/);
  poisoned=new Pool({connectionString:url.href,max:1,options:'-c search_path=pg_temp,pg_catalog'});
  await poisoned.query('CREATE TEMP TABLE pg_roles AS SELECT * FROM pg_catalog.pg_roles WHERE rolname=current_user');
  for(const relation of ['pg_class','pg_namespace','pg_proc'])
   await poisoned.query('CREATE TEMP TABLE '+relation+' AS SELECT * FROM pg_catalog.'+relation+' WITH NO DATA');
  await assert.rejects(new ValuationRuntimeJournal(poisoned,{database:name,login:worker}).load('permission-check'),/privileges are unsafe/);
  await poisoned.end();poisoned=undefined;
  await owner.query('REVOKE SELECT(id) ON orio_ledger.accounts FROM '+worker);
  await owner.query("CREATE FUNCTION orio_signing.unexpected_access() RETURNS boolean LANGUAGE sql AS 'SELECT true'");
  await assert.rejects(delegated.load('permission-check'),/privileges are unsafe/);
  await owner.query('REVOKE ALL ON FUNCTION orio_signing.unexpected_access() FROM PUBLIC');
  await owner.query('GRANT CREATE ON DATABASE '+name+' TO '+worker);
  await assert.rejects(delegated.load('permission-check'),/privileges are unsafe/);
  await owner.query('REVOKE CREATE ON DATABASE '+name+' FROM '+worker);
  await owner.query('GRANT pg_execute_server_program TO '+worker);
  await assert.rejects(delegated.load('permission-check'),/privileges are unsafe/);
  await owner.query('REVOKE pg_execute_server_program FROM '+worker);
  assert.equal((await delegated.load('permission-check')).typedDigest,hash);
  await owner.query("UPDATE orio_monetary.deployments SET version=1 WHERE id=$1",[config.id]);
  await assert.rejects(delegated.claim('stale',hash),/Committed qualification state changed/);
  await owner.query('UPDATE orio_monetary.deployments SET version=0 WHERE id=$1',[config.id]);
  await delegated.claim('revoked',hash);await journal.revoke('runtime-a','0x'+'c'.repeat(64));
  await assert.rejects(delegated.complete('revoked',hash,'0x'+'11'.repeat(65)),/revoked/);
  await assert.rejects(owner.query('DELETE FROM orio_signing.runtime_authority_bindings'),/append-only/);
  await assert.rejects(new ValuationRuntimeJournal(owner,{database:name,login:worker}).load('one'),/identity or privileges/);
 }finally{
  if(poisoned)await poisoned.end();if(runtime)await runtime.end();if(owner)await owner.end();
  await root.query('DROP DATABASE IF EXISTS '+name);
  for(const role of [worker,group,legacy])await root.query('DROP ROLE IF EXISTS '+role);
  await root.end();
 }
});
