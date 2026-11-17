import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdtemp,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {ReviewedUpgrade,applyAtomicUpgrade,UpgradeFailure} from '../src/hosted-upgrade.ts';
import {auditHostedSchema} from '../src/schema-audit.ts';
import {ControlLedger} from '../src/ledger.ts';

const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test')throw new Error('Use isolated local PostgreSQL');
const directory=new URL('../migrations/',import.meta.url),manifest=new URL('../config/hosted-upgrade-checksums.json',import.meta.url);
async function fixture(run:(pool:Pool,database:string,fingerprint:string)=>Promise<void>){
 const database='orio_test_atomic_'+randomUUID().replaceAll('-',''),root=new Pool({connectionString:rootUrl.href});let pool:Pool|undefined;
 try{
  await root.query('CREATE DATABASE '+database);const url=new URL(rootUrl);url.pathname='/'+database;pool=new Pool({connectionString:url.href});
  for(const file of ['001_ledger.sql','002_master_registry.sql'])await pool.query(await readFile(new URL(file,directory),'utf8'));
  const ledger=new ControlLedger(pool);
  await ledger.createAccount({id:'historical_reserve',asset:'LOCAL_TEST_UNITS',normalSide:'debit',allowNegative:false});
  await ledger.createAccount({id:'historical_obligation',asset:'LOCAL_TEST_UNITS',normalSide:'credit',allowNegative:false});
  await ledger.post({idempotencyKey:'historical',externalRef:'local:historical',description:'Synthetic preserved history',postings:[
   {accountId:'historical_reserve',side:'debit',units:'123456789012345678901234567890'},
   {accountId:'historical_obligation',side:'credit',units:'123456789012345678901234567890'}]});
  const client=await pool.connect();let fingerprint:string;try{fingerprint=(await auditHostedSchema(client,database)).catalogFingerprint;}finally{client.release();}
  await run(pool,database,fingerprint);
 }finally{if(pool)await pool.end();await root.query('DROP DATABASE IF EXISTS '+database);await root.end();}
}
test('reviewed 003–019 commit atomically, preserve history, and leave no synthetic probe or live configuration',async()=>fixture(async(pool,database,fingerprint)=>{
 const plan=await ReviewedUpgrade.load(directory,manifest),ledger=new ControlLedger(pool),before=await ledger.balances(),events:string[]=[];
 assert.equal(plan.entries.length,17);assert.equal(Object.isFrozen(plan.entries),true);
 const entry=plan.entries[0];assert.ok(entry);assert.equal(Reflect.set(entry,'body','DROP SCHEMA orio_ledger CASCADE'),false);
 const client=await pool.connect();try{
  const result=await applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async e=>{events.push(e.phase);});
  assert.equal(result.status,'ATOMIC_UPGRADE_COMMITTED');assert.equal(result.committedMigrations.length,17);
  assert.equal(result.syntheticProbeRolledBack,true);assert.equal(result.historical001002VersionsInferred,false);assert.equal(result.financialActivationPerformed,false);
  assert.equal(events.filter(e=>e==='APPLIED_UNCOMMITTED').length,17);assert.ok(events.includes('COMMITTED'));
 }finally{client.release();}
 assert.deepEqual(await ledger.balances(),before);assert.equal((await ledger.verify()).ok,true);
 assert.equal((await pool.query('SELECT count(*)::text AS n FROM orio_ledger.journals')).rows[0].n,'1');
 assert.equal((await pool.query("SELECT count(*)::text AS n FROM orio_ledger.accounts WHERE id LIKE 'qualification_%'")).rows[0].n,'0');
}));
test('a final-stage receipt failure rolls back every migration and preserves the exact original catalog and journal',async()=>fixture(async(pool,database,fingerprint)=>{
 const plan=await ReviewedUpgrade.load(directory,manifest),client=await pool.connect();try{
  await assert.rejects(applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async e=>{
   if(e.phase==='APPLIED_UNCOMMITTED'&&e.file==='019_managed_digest_permissions.sql')throw new Error('Synthetic receipt failure');
  }),e=>e instanceof UpgradeFailure&&e.outcome==='ROLLED_BACK');
  assert.equal((await auditHostedSchema(client,database)).catalogFingerprint,fingerprint);
 }finally{client.release();}
 assert.equal((await new ControlLedger(pool).verify()).ok,true);
 assert.equal((await pool.query("SELECT count(*)::text AS n FROM pg_namespace WHERE nspname='orio_conversion'")).rows[0].n,'0');
}));
test('a changed baseline and a competing maintenance lock both reject before any DDL',async()=>fixture(async(pool,database,fingerprint)=>{
 const plan=await ReviewedUpgrade.load(directory,manifest),client=await pool.connect(),competitor=await pool.connect();try{
  await assert.rejects(applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:'f'.repeat(64)},async()=>{}),e=>e instanceof UpgradeFailure&&e.outcome==='NOT_STARTED');
  await competitor.query('SELECT pg_advisory_lock(1869771119,1903322476)');
  await assert.rejects(applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async()=>{}),e=>e instanceof UpgradeFailure&&e.outcome==='NOT_STARTED');
  assert.equal((await auditHostedSchema(client,database)).catalogFingerprint,fingerprint);
 }finally{await competitor.query('SELECT pg_advisory_unlock(1869771119,1903322476)');competitor.release();client.release();}
}));
test('a reporting error after commit is classified committed and cannot cause blind replay',async()=>fixture(async(pool,database,fingerprint)=>{
 const plan=await ReviewedUpgrade.load(directory,manifest),client=await pool.connect();try{
  await assert.rejects(applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async e=>{
   if(e.phase==='COMMITTED')throw new Error('Synthetic post-commit storage failure');
  }),e=>e instanceof UpgradeFailure&&e.outcome==='COMMITTED_POSTCHECK_FAILED');
  assert.notEqual((await auditHostedSchema(client,database)).catalogFingerprint,fingerprint);
  await assert.rejects(applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async()=>{}),e=>e instanceof UpgradeFailure&&e.outcome==='NOT_STARTED');
 }finally{client.release();}
 assert.equal((await new ControlLedger(pool).verify()).ok,true);
}));
test('a lost acknowledgement after the actual commit remains ambiguous and prevents blind replay',async()=>fixture(async(pool,database,fingerprint)=>{
 const plan=await ReviewedUpgrade.load(directory,manifest),client=await pool.connect();
 const interrupted=new Proxy(client,{get(target,key,receiver){
  if(key==='query')return async(...args:unknown[])=>{
   if(args[0]==='COMMIT'){await target.query('COMMIT');throw Object.assign(new Error('Synthetic acknowledgement loss'),{code:'08006'});}
   return Reflect.apply(target.query,target,args);
  };
  return Reflect.get(target,key,receiver);
 }});
 try{
  await assert.rejects(applyAtomicUpgrade(interrupted,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async()=>{}),e=>e instanceof UpgradeFailure&&e.outcome==='COMMIT_UNKNOWN'&&e.sqlState==='08006');
  assert.notEqual((await auditHostedSchema(client,database)).catalogFingerprint,fingerprint);
  await assert.rejects(applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async()=>{}),e=>e instanceof UpgradeFailure&&e.outcome==='NOT_STARTED');
 }finally{client.release();}
 assert.equal((await new ControlLedger(pool).verify()).ok,true);
}));
test('pre-existing journal corruption blocks the upgrade without exporting or replacing that history',async()=>fixture(async(pool,database,fingerprint)=>{
 await pool.query("ALTER TABLE orio_ledger.journals DISABLE TRIGGER immutable_rows; UPDATE orio_ledger.journals SET payload=jsonb_set(payload,'{description}','\"altered synthetic history\"'); ALTER TABLE orio_ledger.journals ENABLE TRIGGER immutable_rows");
 const plan=await ReviewedUpgrade.load(directory,manifest),client=await pool.connect();try{
  assert.equal((await auditHostedSchema(client,database)).catalogFingerprint,fingerprint);
  await assert.rejects(applyAtomicUpgrade(client,plan,{database,owner:'postgres',baselineFingerprint:fingerprint},async()=>{}),e=>e instanceof UpgradeFailure&&e.outcome==='ROLLED_BACK');
  assert.equal((await client.query("SELECT count(*)::text AS n FROM pg_namespace WHERE nspname='orio_conversion'")).rows[0].n,'0');
 }finally{client.release();}
}));
test('modified migration source and modified checksum manifest both reject before connection',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'orio-upgrade-review-'));
 try{
  const checksums:Record<string,string>=JSON.parse(await readFile(manifest,'utf8'));
  for(const file of Object.keys(checksums))await copyFile(new URL(file,directory),join(folder,file));
  const localManifest=join(folder,'manifest.json');await copyFile(manifest,localManifest);
  const sqlPath=join(folder,'019_managed_digest_permissions.sql');await writeFile(sqlPath,(await readFile(sqlPath,'utf8'))+'\n-- changed\n');
  await assert.rejects(ReviewedUpgrade.load(pathToFileURL(folder+'/'),pathToFileURL(localManifest)),/source mismatch/);
  await copyFile(new URL('019_managed_digest_permissions.sql',directory),sqlPath);await writeFile(localManifest,'{}');
  await assert.rejects(ReviewedUpgrade.load(pathToFileURL(folder+'/'),pathToFileURL(localManifest)),/Unreviewed/);
 }finally{
  if(!resolve(folder).startsWith(resolve(join(tmpdir(),'orio-upgrade-review-'))))throw new Error('Wrong temporary cleanup target');
  await rm(folder,{recursive:true,force:true});
 }
});
