import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {auditHostedSchema} from '../src/schema-audit.ts';
const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test')throw new Error('Use isolated PostgreSQL harness');
test('read-only catalog audit detects definition and privilege drift without inspecting application rows or inventing migration history',async()=>{
 const suffix=randomUUID().replaceAll('-',''),name='orio_test_audit_'+suffix,role='orio_audit_rt_'+suffix;
 assert.match(name,/^orio_test_audit_[a-f0-9]{32}$/);assert.match(role,/^orio_audit_rt_[a-f0-9]{32}$/);
 const root=new Pool({connectionString:rootUrl.href});let pool:Pool|undefined;
 try{
  await root.query('CREATE DATABASE '+name);const url=new URL(rootUrl);url.pathname='/'+name;pool=new Pool({connectionString:url.href});
  for(const file of ['001_ledger.sql','002_master_registry.sql'])await pool.query((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replaceAll('orio_ledger_runtime',role));
  await pool.query('CREATE TABLE orio_ledger.audit_fixture(payload text)');
  const observe=async()=>{const client=await pool!.connect();try{return await auditHostedSchema(client,name,[role]);}finally{client.release();}};
  const before=await observe();assert.equal(before.identity.read_only,'on');assert.equal(before.installedMigrationVersions,null);assert.equal(before.baselineStatus,'REQUIRES_VERIFIED_BASELINE');
  const privateRow='private-application-row-'+suffix;await pool.query('INSERT INTO orio_ledger.audit_fixture VALUES($1)',[privateRow]);
  const afterRow=await observe();assert.equal(afterRow.catalogFingerprint,before.catalogFingerprint);assert.ok(!JSON.stringify(afterRow).includes(privateRow));
  await pool.query('ALTER ROLE '+role+' LOGIN');const afterRole=await observe();assert.notEqual(afterRole.catalogFingerprint,afterRow.catalogFingerprint);
  await pool.query('ALTER TABLE orio_ledger.audit_fixture ADD COLUMN flag boolean NOT NULL DEFAULT false');
  const afterColumn=await observe();assert.notEqual(afterColumn.catalogFingerprint,afterRole.catalogFingerprint);
  await pool.query("CREATE FUNCTION orio_ledger.audit_marker() RETURNS text LANGUAGE SQL AS $$ SELECT 'private-function-body-marker'::text $$");
  const firstFunction=await observe();assert.ok(!JSON.stringify(firstFunction).includes('private-function-body-marker'));
  await pool.query("CREATE OR REPLACE FUNCTION orio_ledger.audit_marker() RETURNS text LANGUAGE SQL AS $$ SELECT 'changed-private-function-body'::text $$");
  const changedFunction=await observe();assert.notEqual(changedFunction.catalogFingerprint,firstFunction.catalogFingerprint);
  await pool.query('ALTER TABLE orio_ledger.audit_fixture ENABLE ROW LEVEL SECURITY');
  await pool.query('CREATE POLICY audit_policy ON orio_ledger.audit_fixture USING(true)');const firstPolicy=await observe();
  await pool.query('ALTER POLICY audit_policy ON orio_ledger.audit_fixture USING(false)');assert.notEqual((await observe()).catalogFingerprint,firstPolicy.catalogFingerprint);
  const client=await pool.connect();try{
   await assert.rejects(auditHostedSchema(client,'orio_control',[role]),/Wrong database/);
   assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'off');
  }finally{client.release();}
 }finally{if(pool)await pool.end();await root.query('DROP DATABASE IF EXISTS '+name);await root.query('DROP ROLE IF EXISTS '+role);await root.end();}
});
