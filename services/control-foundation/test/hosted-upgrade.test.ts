import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {ControlLedger} from '../src/ledger.ts';
import {auditHostedSchema} from '../src/schema-audit.ts';

const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
const container=process.env.ORIO_TEST_CONTAINER??'';
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test'||!/^orio-control-test-[a-f0-9-]{36}$/.test(container))throw new Error('Use the isolated PostgreSQL harness');

test('complete ordered upgrade preserves historical journals and restores a local logical backup',async()=>{
 const suffix=randomUUID().replaceAll('-',''),database='orio_test_upgrade_'+suffix,restored=database+'_restore',role='orio_upgrade_rt_'+suffix;
 const root=new Pool({connectionString:rootUrl.href});let pool:Pool|undefined,restorePool:Pool|undefined;
 try{
  await root.query('CREATE DATABASE '+database);const url=new URL(rootUrl);url.pathname='/'+database;pool=new Pool({connectionString:url.href});
  const directory=new URL('../migrations/',import.meta.url),files=(await readdir(directory)).filter(f=>/^\d{3}_[a-z_]+\.sql$/.test(f)).sort();
  assert.equal(files.length,18);
  const manifest:Record<string,string>=JSON.parse(await readFile(new URL('../config/hosted-upgrade-checksums.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(manifest),files);
  const sql: string[]=[];
  for(const [index,file] of files.entries()){
   assert.equal(file.slice(0,3),String(index+1).padStart(3,'0'));
   const text=(await readFile(new URL(file,directory),'utf8')).replaceAll('\r\n','\n');
   assert.equal(createHash('sha256').update(text).digest('hex'),manifest[file]);sql.push(text.replaceAll('orio_ledger_runtime',role));
  }
  for(const text of sql.slice(0,2))await pool.query(text);
  const ledger=new ControlLedger(pool);
  await ledger.createAccount({id:'upgrade-reserve',asset:'TEST_UNITS',normalSide:'debit',allowNegative:false});
  await ledger.createAccount({id:'upgrade-obligation',asset:'TEST_UNITS',normalSide:'credit',allowNegative:false});
  const request={idempotencyKey:'upgrade-history',externalRef:'synthetic-upgrade-only',description:'Local rehearsal only',postings:[
   {accountId:'upgrade-reserve',side:'debit' as const,units:'123456789012345678901234567890'},
   {accountId:'upgrade-obligation',side:'credit' as const,units:'123456789012345678901234567890'}]};
  const receipt=await ledger.post(request),beforeBalances=await ledger.balances();
  const observe=async(target:Pool,name:string)=>{const c=await target.connect();try{return await auditHostedSchema(c,name,[role]);}finally{c.release();}};
  const before=await observe(pool,database);
  for(const text of sql.slice(2))await pool.query(text);
  assert.deepEqual(await ledger.post(request),receipt);assert.deepEqual(await ledger.balances(),beforeBalances);assert.equal((await ledger.verify()).ok,true);
  const after=await observe(pool,database);assert.notEqual(after.catalogFingerprint,before.catalogFingerprint);
  assert.equal(after.installedMigrationVersions,null);
  assert.equal((await pool.query('SELECT state FROM orio_master.current_election')).rows[0].state,'DEPOSIT_PAUSED');
  assert.equal((await pool.query('SELECT count(*) AS n FROM orio_monetary.deployments')).rows[0].n,'0');
  assert.equal((await pool.query('SELECT count(*) AS n FROM orio_gas.signing_preparations')).rows[0].n,'0');
  const dump=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','--format=plain','--no-comments',database],{maxBuffer:16777216});
  await root.query('CREATE DATABASE '+restored);
  execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',restored,'--set=ON_ERROR_STOP=1'],{input:dump,stdio:['pipe','pipe','pipe'],maxBuffer:16777216});
  const restoreUrl=new URL(rootUrl);restoreUrl.pathname='/'+restored;restorePool=new Pool({connectionString:restoreUrl.href});
  const recovered=new ControlLedger(restorePool);
  assert.deepEqual(await recovered.balances(),beforeBalances);assert.deepEqual(await recovered.post(request),receipt);assert.equal((await recovered.verify()).ok,true);
  const recoveredCatalog=await observe(restorePool,restored);
  for(const section of Object.keys(after.catalog))assert.deepEqual(recoveredCatalog.catalog[section],after.catalog[section],section);
  assert.equal(recoveredCatalog.catalogFingerprint,after.catalogFingerprint);
  await assert.rejects(restorePool.query("UPDATE orio_ledger.journals SET payload=payload"),/append-only/);
 }finally{
  if(restorePool)await restorePool.end();if(pool)await pool.end();
  await root.query('DROP DATABASE IF EXISTS '+restored);await root.query('DROP DATABASE IF EXISTS '+database);await root.query('DROP ROLE IF EXISTS '+role);await root.end();
 }
});
