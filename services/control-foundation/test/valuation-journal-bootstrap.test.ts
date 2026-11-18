import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {ValuationRuntimeJournal} from '../src/valuation-runtime-journal.ts';
import {createValuationJournalLambda} from '../src/valuation-journal-lambda.ts';
import {auditHostedSchema} from '../src/schema-audit.ts';
import {installValuationJournal} from '../src/valuation-journal-bootstrap.ts';
import {UpgradeFailure} from '../src/hosted-upgrade.ts';
import {ControlLedger} from '../src/ledger.ts';
const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/orio_test')throw Error('Use isolated local PostgreSQL');
test('exact journal bootstrap is passwordless and inert, validates the managed owner and refuses occupied roles',async()=>{
 const root=new Pool({connectionString:url.href});let db:Pool|undefined,worker:Pool|undefined;
 try{
  await root.query('CREATE ROLE orio_ledger_admin LOGIN CREATEROLE;CREATE ROLE rds_iam NOLOGIN;GRANT rds_iam TO orio_ledger_admin WITH ADMIN OPTION');
  await root.query('CREATE DATABASE orio_control OWNER orio_ledger_admin');const u=new URL(url);u.pathname='/orio_control';db=new Pool({connectionString:u.href});
  const c=await db.connect();
  try{
   await c.query('SET SESSION AUTHORIZATION orio_ledger_admin');
   const directory=new URL('../migrations/',import.meta.url);
   for(const file of (await readdir(directory)).filter(x=>/^\d{3}_.*\.sql$/.test(x)).sort()){
    if(file.startsWith('019_')){
     // Reproduce the provider-owned, owner-only extension ACL already verified
     // on RDS; historical qualification is not a new hosted migration here.
     await c.query('RESET SESSION AUTHORIZATION');
     await c.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA orio_ledger FROM PUBLIC');
    }
    await c.query((await readFile(new URL(file,directory),'utf8')).replaceAll('orio_ledger_runtime','orio_journal_bootstrap_runtime'));
    if(file.startsWith('019_'))await c.query('SET SESSION AUTHORIZATION orio_ledger_admin');
   }
   const ledger=new ControlLedger(db);
   await ledger.createAccount({id:'preserved_reserve',asset:'LOCAL_REHEARSAL_UNITS',normalSide:'debit',allowNegative:false});
   await ledger.createAccount({id:'preserved_obligation',asset:'LOCAL_REHEARSAL_UNITS',normalSide:'credit',allowNegative:false});
   await ledger.post({idempotencyKey:'preserved',externalRef:'local:preserved',description:'Synthetic preserved rehearsal history',postings:[
    {accountId:'preserved_reserve',side:'debit',units:'12345'},{accountId:'preserved_obligation',side:'credit',units:'12345'}]});
   const sql=await readFile(new URL('../../../infrastructure/aws/valuation-journal-bootstrap.sql',import.meta.url),'utf8');
   await c.query('RESET SESSION AUTHORIZATION');
   await assert.rejects(c.query(sql),/Wrong journal bootstrap identity/);await c.query('ROLLBACK');
   await c.query('SET SESSION AUTHORIZATION orio_ledger_admin');
   const baseline=(await auditHostedSchema(c,'orio_control')).catalogFingerprint;
   await assert.rejects(installValuationJournal(c,baseline,async e=>{
    if(e.file?.endsWith('valuation-journal-bootstrap.sql'))throw Error('Synthetic final receipt failure');
   }),e=>e instanceof UpgradeFailure&&e.outcome==='ROLLED_BACK');
   assert.equal((await auditHostedSchema(c,'orio_control')).catalogFingerprint,baseline);
   assert.equal((await c.query("SELECT count(*)::text AS n FROM pg_roles WHERE rolname='orio_valuation_journal'")).rows[0].n,'0');
   const result=await installValuationJournal(c,baseline,async()=>{});
   assert.equal(result.status,'SCOPED_JOURNAL_BOOTSTRAP_COMMITTED');assert.equal(result.applied.length,3);
   assert.equal(result.authorityBindings,0);assert.equal(result.financialExecutionEnabled,false);
   assert.equal(result.preservedData.find(r=>r.table==='"orio_ledger"."journals"')?.rows,'1');
   assert.equal((await ledger.verify()).ok,true);assert.equal((await ledger.verify()).head.sequence,'1');
   await assert.rejects(c.query(sql),/Journal role already exists/);await c.query('ROLLBACK');await c.query('RESET SESSION AUTHORIZATION');
   const role=(await c.query("SELECT rolpassword,rolconnlimit,rolinherit,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_authid WHERE rolname='orio_valuation_journal'")).rows[0];
   assert.deepEqual(role,{rolpassword:null,rolconnlimit:2,rolinherit:false,rolsuper:false,rolcreaterole:false,rolcreatedb:false,rolbypassrls:false});
   assert.equal((await c.query('SELECT count(*)::text AS n FROM orio_signing.runtime_authority_bindings')).rows[0].n,'0');
   assert.equal((await c.query('SELECT count(*)::text AS n FROM orio_signing.authorities')).rows[0].n,'0');
   // Local harness password only, after proving production bootstrap stores none.
   await c.query("ALTER ROLE orio_valuation_journal PASSWORD 'synthetic-local-journal-only'");
  }finally{c.release();}
  u.username='orio_valuation_journal';u.password='synthetic-local-journal-only';worker=new Pool({connectionString:u.href,max:1});
  const runtime=new ValuationRuntimeJournal(worker,{database:'orio_control',login:'orio_valuation_journal'});
  await runtime.qualify();
  await assert.rejects(worker.query('SELECT * FROM orio_ledger.journals'),/permission denied/);
  await assert.rejects(worker.query('SELECT * FROM orio_signing.authorities'),/permission denied/);
  assert.deepEqual(await createValuationJournalLambda(runtime)({version:'1',action:'load',intentId:'not-authorized'}),
   {version:'1',ok:false,error:'SCOPED_JOURNAL_REQUEST_REJECTED'});
 }finally{
  if(worker)await worker.end();if(db)await db.end();await root.query('DROP DATABASE IF EXISTS orio_control');
  for(const name of ['orio_valuation_journal','orio_journal_bootstrap_runtime','orio_ledger_admin','rds_iam'])await root.query('DROP ROLE IF EXISTS '+name);
  await root.end();
 }
});
