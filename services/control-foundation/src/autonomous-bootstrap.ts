import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {PoolClient} from 'pg';
import {auditHostedSchema,auditSchemaInMaintenanceTransaction} from './schema-audit.ts';
import {UpgradeFailure} from './hosted-upgrade.ts';
export const autonomousSqlSha256='3fbee34530ec2a0f6e03d052ce4dcfe186f84c4daab7521d4e434488de60eb3e';
export async function reviewedAutonomousSql(readSource=()=>readFile(new URL('../pending-migrations/022_autonomous_settlement.sql',import.meta.url),'utf8')){
 const text=(await readSource()).replaceAll('\r\n','\n');
 const body=/^BEGIN;([\s\S]*)COMMIT;\s*$/.exec(text)?.[1];
 if(createHash('sha256').update(text).digest('hex')!==autonomousSqlSha256||!body)throw Error('Unreviewed autonomous SQL');
 return body;
}
const identifier=(s:string)=>'"'+s.replaceAll('"','""')+'"';
async function preservedData(client:PoolClient,tables:readonly string[]){
 const result=[];
 for(const table of tables){
  const row=(await client.query<{rows:string;sha256:string}>(`SELECT count(*)::text AS rows,
   encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS sha256 FROM
   (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${table} t LIMIT 100001) bounded`)).rows[0];
  if(!row||BigInt(row.rows)>100000n)throw Error('Autonomous rehearsal record bound exceeded');result.push({table,...row});
 }
 return result;
}
/** Trusted maintenance seam only. Caller must validate the specifically approved
 * clone/original target, fresh recovery evidence and credential scope before connecting.
 * This module creates no AWS access, role, connection, runtime grant or financial config.
 * Only counts/digests leave PostgreSQL; COMMIT ambiguity never permits blind replay.
 */
export async function installAutonomousLedger(client:PoolClient,expectedDatabase:string,baselineFingerprint:string,
 record:(event:{phase:string;sha256?:string})=>Promise<void>,expectedResultFingerprint?:string){
 let locked=false,started=false,commitAttempted=false,committed=false;
 try{
  const sql=await reviewedAutonomousSql();
  if(expectedResultFingerprint!==undefined&&!/^[a-f0-9]{64}$/.test(expectedResultFingerprint))throw Error('Invalid expected catalog');
  if(!/^orio_(?:control|test_[a-z0-9_]+)$/.test(expectedDatabase)||!/^[a-f0-9]{64}$/.test(baselineFingerprint))throw Error('Explicit reviewed autonomous baseline required');
  locked=(await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(1869771119,1903322476) AS locked')).rows[0]?.locked===true;
  if(!locked)throw Error('Another maintenance operation holds the lock');
  const before=await auditHostedSchema(client,expectedDatabase,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
  if(before.catalogFingerprint!==baselineFingerprint||before.identity.role!==(expectedDatabase==='orio_control'?'orio_ledger_admin':'postgres'))throw Error('Autonomous baseline or administrator changed');
  await client.query('BEGIN');started=true;
  await client.query("SET LOCAL search_path=pg_catalog; SET LOCAL statement_timeout='30000ms'; SET LOCAL lock_timeout='5000ms'; SET LOCAL idle_in_transaction_session_timeout='120000ms'");
  const rows=(await client.query<{schema:string;name:string}>(`SELECT n.nspname AS schema,c.relname AS name FROM pg_catalog.pg_class c
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE left(n.nspname,5)='orio_' AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname`)).rows;
  if(rows.length===0||rows.length>150||rows.some(r=>r.schema==='orio_autonomous'))throw Error('Autonomous schema already exists or baseline is unexpected');
  const tables=rows.map(r=>identifier(r.schema)+'.'+identifier(r.name));
  await client.query('LOCK TABLE '+tables.join(',')+' IN ACCESS EXCLUSIVE MODE');
  if((await client.query('SELECT state FROM orio_master.current_election WHERE singleton')).rows[0]?.state!=='DEPOSIT_PAUSED'||
   (await client.query('SELECT count(*)::text AS n FROM orio_monetary.deployments')).rows[0]?.n!=='0')throw Error('Existing financial configuration must remain inactive');
  const preserved=await preservedData(client,tables);
  await client.query(sql);await record({phase:'APPLIED_UNCOMMITTED',sha256:autonomousSqlSha256});
  if(JSON.stringify(await preservedData(client,tables))!==JSON.stringify(preserved))throw Error('Existing autonomous rehearsal records changed');
  const added=(await client.query<{name:string;rows:string}>(`SELECT 'deployments' AS name,count(*)::text AS rows FROM orio_autonomous.deployments
   UNION ALL SELECT 'facts',count(*)::text FROM orio_autonomous.facts ORDER BY name`)).rows;
  if(added.length!==2||added.some(r=>r.rows!=='0'))throw Error('Unexpected autonomous configuration');
  const grants=(await client.query<{n:string}>(`SELECT count(*)::text AS n FROM (
   SELECT a.grantee,n.nspowner AS owner FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='orio_autonomous'
   UNION ALL SELECT a.grantee,c.relowner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='orio_autonomous') grants WHERE grantee<>owner`)).rows[0]?.n;
  if(grants!=='0')throw Error('Unexpected autonomous runtime or public grants');
  if(expectedResultFingerprint!==undefined){
   const staged=await auditSchemaInMaintenanceTransaction(client,expectedDatabase,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
   if(staged.catalogFingerprint!==expectedResultFingerprint)throw Error('Staged autonomous catalog differs from qualified copy');
  }
  await record({phase:'CHECKS_PASSED_COMMIT_INTENT'});commitAttempted=true;
  if((await client.query('COMMIT')).command!=='COMMIT')throw Error('Autonomous commit acknowledgement unavailable');
  started=false;committed=true;await record({phase:'COMMITTED'});
  const after=await auditHostedSchema(client,expectedDatabase,['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
  return {status:'AUTONOMOUS_SCHEMA_COMMITTED',baselineFingerprint,resultingCatalogFingerprint:after.catalogFingerprint,
   sqlSha256:autonomousSqlSha256,preservedData:preserved,runtimeGrants:0,autonomousDeployments:0,financialExecutionEnabled:false};
 }catch(error){
  let outcome=committed?'COMMITTED_POSTCHECK_FAILED':commitAttempted?'COMMIT_UNKNOWN':started?'ROLLBACK_REQUIRED':'NOT_STARTED';
  if(started&&!commitAttempted){try{await client.query('ROLLBACK');outcome='ROLLED_BACK';}catch{outcome='ROLLBACK_UNCONFIRMED';}}
  throw new UpgradeFailure(outcome,error);
 }finally{if(locked){try{await client.query('SELECT pg_advisory_unlock(1869771119,1903322476)');}catch{/* Closing the maintenance connection releases its lock. */}}}
}
