import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {auditHostedSchema} from '../src/schema-audit.ts';
import {installAutonomousLedger,reviewedAutonomousSql} from '../src/autonomous-bootstrap.ts';
import {UpgradeFailure} from '../src/hosted-upgrade.ts';
import {ControlLedger} from '../src/ledger.ts';
const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/orio_test')throw Error('Use isolated local PostgreSQL');
test('hash-pinned autonomous schema rehearses atomically, preserves prior records and grants no runtime access',async()=>{
 const root=new Pool({connectionString:url.href}),name='orio_test_aut_boot_'+randomUUID().replaceAll('-',''),runtime=name+'_rt';let pool:Pool|undefined,created=false;
 try{
  await root.query('CREATE DATABASE '+name);created=true;const db=new URL(url);db.pathname='/'+name;pool=new Pool({connectionString:db.href});
  const directory=new URL('../migrations/',import.meta.url);
  for(const file of(await readdir(directory)).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await pool.query((await readFile(new URL(file,directory),'utf8')).replaceAll('orio_ledger_runtime',runtime));
  const ledger=new ControlLedger(pool);
  await ledger.createAccount({id:'fixture_cash',asset:'LOCAL_FIXTURE',normalSide:'debit',allowNegative:false});
  await ledger.createAccount({id:'fixture_claim',asset:'LOCAL_FIXTURE',normalSide:'credit',allowNegative:false});
  await ledger.post({idempotencyKey:'prior_fixture',externalRef:'fixture',description:'Preserved disconnected record',postings:[{accountId:'fixture_cash',side:'debit',units:'12345'},{accountId:'fixture_claim',side:'credit',units:'12345'}]});
  const client=await pool.connect();
  try{
   const before=await auditHostedSchema(client,name,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
   await assert.rejects(installAutonomousLedger(client,name,'0'.repeat(64),async()=>{}),(e:unknown)=>e instanceof UpgradeFailure&&e.outcome==='NOT_STARTED');
   await assert.rejects(installAutonomousLedger(client,name,before.catalogFingerprint,async e=>{if(e.phase==='APPLIED_UNCOMMITTED')throw Error('Injected report failure');}),
    (e:unknown)=>e instanceof UpgradeFailure&&e.outcome==='ROLLED_BACK');
   const rolled=await auditHostedSchema(client,name,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);assert.equal(rolled.catalogFingerprint,before.catalogFingerprint);
   await client.query('ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO PUBLIC');
   const unsafe=await auditHostedSchema(client,name,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
   await assert.rejects(installAutonomousLedger(client,name,unsafe.catalogFingerprint,async()=>{}),(e:unknown)=>e instanceof UpgradeFailure&&e.outcome==='ROLLED_BACK');
   await client.query('ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM PUBLIC');
   const result=await installAutonomousLedger(client,name,before.catalogFingerprint,async()=>{});
   assert.equal(result.financialExecutionEnabled,false);assert.equal(result.runtimeGrants,0);assert.equal(result.autonomousDeployments,0);
   assert.ok(result.preservedData.some(r=>r.table==='"orio_ledger"."journals"'&&r.rows==='1'));
   assert.equal((await ledger.verify()).ok,true);
   assert.equal((await client.query('SELECT units::text FROM orio_ledger.balances WHERE id=$1',['fixture_cash'])).rows[0].units,'12345');
   const after=await auditHostedSchema(client,name,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
   await assert.rejects(installAutonomousLedger(client,name,after.catalogFingerprint,async()=>{}),
    (e:unknown)=>e instanceof UpgradeFailure&&e.outcome==='ROLLED_BACK');
   assert.equal((await client.query('SELECT count(*)::text AS n FROM orio_autonomous.facts')).rows[0].n,'0');
   // Reset only this disposable fixture to exercise a reporting failure after a real COMMIT.
   await client.query('DROP SCHEMA orio_autonomous CASCADE');
   const reset=await auditHostedSchema(client,name,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
   await assert.rejects(installAutonomousLedger(client,name,reset.catalogFingerprint,async e=>{if(e.phase==='COMMITTED')throw Error('Lost report');}),
    (e:unknown)=>e instanceof UpgradeFailure&&e.outcome==='COMMITTED_POSTCHECK_FAILED');
   assert.equal((await client.query('SELECT count(*)::text AS n FROM orio_autonomous.deployments')).rows[0].n,'0');
  }finally{client.release();}
 }finally{if(pool)await pool.end();if(created)await root.query('DROP DATABASE '+name+' WITH (FORCE)');await root.query('DROP ROLE IF EXISTS '+runtime);await root.end();}
});
test('autonomous rehearsal refuses changed SQL before acquiring credentials or a database connection',async()=>{
 await assert.rejects(reviewedAutonomousSql(async()=> 'BEGIN; DROP SCHEMA orio_ledger CASCADE; COMMIT;'),/Unreviewed/);
 const source=await readFile(new URL('../pending-migrations/022_autonomous_settlement.sql',import.meta.url),'utf8');
 assert.equal(await reviewedAutonomousSql(async()=>source.replaceAll('\r\n','\n').replaceAll('\n','\r\n')),await reviewedAutonomousSql());
});
