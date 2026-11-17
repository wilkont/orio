import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {assertProtocolReaderIdentity} from '../src/protocol-reader-identity.ts';
const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/orio_test')throw new Error('Use isolated local PostgreSQL');
test('one-shot IAM bootstrap has no password, restricts actual reader authority, and rejects occupied names',async()=>{
 const root=new Pool({connectionString:url.href});let db:Pool|undefined;
 try{
  await root.query('CREATE ROLE orio_ledger_admin LOGIN CREATEROLE; CREATE ROLE rds_iam NOLOGIN; GRANT rds_iam TO orio_ledger_admin WITH ADMIN OPTION');
  await root.query('CREATE DATABASE orio_control OWNER orio_ledger_admin');const target=new URL(url);target.pathname='/orio_control';db=new Pool({connectionString:target.href});
  for(const name of ['001_ledger.sql','002_master_registry.sql'])await db.query((await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')).replaceAll('orio_ledger_runtime','orio_bootstrap_test_runtime'));
  await db.query('GRANT USAGE ON SCHEMA orio_master TO orio_ledger_admin WITH GRANT OPTION; GRANT SELECT ON orio_master.assets,orio_master.elections,orio_master.current_election TO orio_ledger_admin WITH GRANT OPTION');
  const sql=await readFile(new URL('../../../infrastructure/aws/metadata-reader-bootstrap.sql',import.meta.url),'utf8');
  const wrong=await root.connect();try{await assert.rejects(wrong.query(sql),/Wrong reader bootstrap identity/);await wrong.query('ROLLBACK');}finally{wrong.release();}
  const client=await db.connect();try{
   await client.query('SET SESSION AUTHORIZATION orio_ledger_admin');await client.query(sql);
   await assert.rejects(client.query(sql),/Reader already exists/);await client.query('ROLLBACK');await client.query('RESET SESSION AUTHORIZATION');
   const role=(await client.query("SELECT rolpassword,rolconnlimit,rolcanlogin FROM pg_authid WHERE rolname='orio_protocol_reader'")).rows[0];
   assert.equal(role.rolpassword,null);assert.equal(role.rolconnlimit,2);assert.equal(role.rolcanlogin,true);
   await client.query('SET SESSION AUTHORIZATION orio_protocol_reader');
   await client.query('BEGIN READ ONLY');await assertProtocolReaderIdentity(client);await client.query('ROLLBACK');
   assert.equal((await client.query('SELECT state FROM orio_master.current_election')).rows[0].state,'DEPOSIT_PAUSED');
   await assert.rejects(client.query('SELECT * FROM orio_ledger.journals'),/permission denied/);
   await assert.rejects(client.query('UPDATE orio_master.current_election SET state=state'),/permission denied|read-only/);
   await client.query('RESET SESSION AUTHORIZATION');
  }finally{client.release();}
 }finally{
  if(db)await db.end();await root.query('DROP DATABASE IF EXISTS orio_control');
  for(const name of ['orio_protocol_reader','orio_bootstrap_test_runtime','orio_ledger_admin','rds_iam'])await root.query('DROP ROLE IF EXISTS '+name);
  await root.end();
 }
});
