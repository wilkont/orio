import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {auditHostedSchema} from './schema-audit.ts';
import {UpgradeFailure} from './hosted-upgrade.ts';
const names=['services/control-foundation/pending-migrations/020_reserve_valuation_signing.sql',
 'services/control-foundation/pending-migrations/021_valuation_runtime_functions.sql','infrastructure/aws/valuation-journal-bootstrap.sql'];
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function reviewedValuationJournalPlan(){
 const manifest:Record<string,string>=JSON.parse(await readFile(new URL('../config/valuation-journal-bootstrap-checksums.json',import.meta.url),'utf8'));
 if(JSON.stringify(Object.keys(manifest))!==JSON.stringify(names))throw Error('Unexpected journal bootstrap sequence');
 const entries=[];
 for(const name of names){
  const source=(await readFile(new URL('../../../'+name,import.meta.url),'utf8')).replaceAll('\r\n','\n');
  const envelope=/^(?:\s|--[^\n]*(?:\n|$))*BEGIN;([\s\S]*)COMMIT;\s*$/.exec(source);
  if(sha(source)!==manifest[name]||!envelope?.[1])throw Error('Journal bootstrap source changed');
  entries.push(Object.freeze({name,sha256:sha(source),body:envelope[1]}));
 }
 return Object.freeze(entries);
}
const identifier=(s:string)=>'"'+s.replaceAll('"','""')+'"';
async function preservedData(client:PoolClient,tables:readonly string[]){
 const results=[];
 for(const table of tables){
  const r=(await client.query<{rows:string;sha256:string}>(`SELECT count(*)::text AS rows,
   encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS sha256 FROM
   (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${table} t LIMIT 100001) bounded`)).rows[0];
  if(!r||BigInt(r.rows)>100000n)throw Error('Journal qualification data bound exceeded');results.push({table,...r});
 }
 return results;
}
/** Trusted administrator maintenance only; never exposed by the journal Lambda.
 * The caller must separately validate an approved private AWS target, recovery
 * checkpoint and short-lived credentials before acquiring this connection.
 * Hash-pinned SQL is one transaction; existing rows leave PostgreSQL only as
 * counts/digests. An unknown COMMIT must be inspected, never blindly replayed.
 */
export async function installValuationJournal(client:PoolClient,baselineFingerprint:string,
 record:(event:{phase:string;file?:string;sha256?:string})=>Promise<void>){
 let locked=false,started=false,commitAttempted=false,committed=false;
 try{
  const plan=await reviewedValuationJournalPlan();
  if(!/^[a-f0-9]{64}(?![\s\S])/.test(baselineFingerprint))throw Error('Missing reviewed baseline');
  locked=(await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(1869771119,1903322476) AS locked')).rows[0]?.locked===true;
  if(!locked)throw Error('Another maintenance operation holds the lock');
  const before=await auditHostedSchema(client,'orio_control',['orio_ledger_runtime','orio_protocol_reader']);
  if(before.identity.role!=='orio_ledger_admin'||before.catalogFingerprint!==baselineFingerprint)throw Error('Journal baseline or administrator changed');
  await client.query('BEGIN');started=true;
  await client.query("SET LOCAL search_path=pg_catalog;SET LOCAL statement_timeout='30000ms';SET LOCAL lock_timeout='5000ms';SET LOCAL idle_in_transaction_session_timeout='120000ms'");
  const rows=(await client.query<{schema:string;name:string}>(`SELECT n.nspname AS schema,c.relname AS name
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE pg_catalog.left(n.nspname,5)='orio_' AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname`)).rows;
  if(rows.length===0||rows.length>100||rows.some(r=>r.schema==='orio_signing'))throw Error('Unexpected bootstrap baseline');
  const tables=rows.map(r=>identifier(r.schema)+'.'+identifier(r.name));
  await client.query('LOCK TABLE '+tables.join(',')+' IN ACCESS EXCLUSIVE MODE');
  const preserved=await preservedData(client,tables);
  if((await client.query('SELECT state FROM orio_master.current_election WHERE singleton')).rows[0]?.state!=='DEPOSIT_PAUSED')throw Error('Issuance must remain paused');
  if((await client.query('SELECT count(*)::text AS n FROM orio_monetary.deployments')).rows[0]?.n!=='0')throw Error('Unexpected monetary deployment');
  for(const entry of plan){await client.query(entry.body);await record({phase:'APPLIED_UNCOMMITTED',file:entry.name,sha256:entry.sha256});}
  if(JSON.stringify(await preservedData(client,tables))!==JSON.stringify(preserved))throw Error('Existing records changed');
  for(const table of ['authorities','revocations','valuation_intents','claims','completions','runtime_authority_bindings'])
   if((await client.query('SELECT count(*)::text AS n FROM orio_signing.'+table)).rows[0]?.n!=='0')throw Error('Unexpected signing configuration');
  await record({phase:'CHECKS_PASSED_COMMIT_INTENT'});commitAttempted=true;
  if((await client.query('COMMIT')).command!=='COMMIT')throw Error('Commit acknowledgement unavailable');started=false;committed=true;
  await record({phase:'COMMITTED'});
  const after=await auditHostedSchema(client,'orio_control',['orio_ledger_runtime','orio_protocol_reader','orio_valuation_journal']);
  return {status:'SCOPED_JOURNAL_BOOTSTRAP_COMMITTED',baselineFingerprint,resultingCatalogFingerprint:after.catalogFingerprint,
   applied:plan.map(({name,sha256})=>({name,sha256})),preservedData:preserved,authorityBindings:0,signingPerformed:false,financialExecutionEnabled:false};
 }catch(error){
  let outcome=committed?'COMMITTED_POSTCHECK_FAILED':commitAttempted?'COMMIT_UNKNOWN':started?'ROLLBACK_REQUIRED':'NOT_STARTED';
  if(started&&!commitAttempted){try{await client.query('ROLLBACK');outcome='ROLLED_BACK';}catch{outcome='ROLLBACK_UNCONFIRMED';}}
  throw new UpgradeFailure(outcome,error);
 }finally{if(locked){try{await client.query('SELECT pg_advisory_unlock(1869771119,1903322476)');}catch{/* Teardown releases the session lock. */}}}
}
