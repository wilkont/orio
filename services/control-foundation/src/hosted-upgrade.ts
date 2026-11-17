import {createHash,randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import type {PoolClient} from 'pg';
import {auditHostedSchema} from './schema-audit.ts';

const manifestHash='94eb5ab25c6bcbdd90d3fa3344e33d2bd166d25ae53d19422a1f614acbcc8224';
const hash=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
interface Migration {readonly file:string;readonly sha256:string;readonly body:string}
export class ReviewedUpgrade {
 readonly #entries:readonly Migration[];
 private constructor(entries:Migration[]){this.#entries=Object.freeze(entries.map(e=>Object.freeze(e)));}
 get entries(){return this.#entries;}
 static async load(directory:URL,manifest:URL):Promise<ReviewedUpgrade>{
  const text=(await readFile(manifest,'utf8')).replaceAll('\r\n','\n');
  if(hash(text)!==manifestHash)throw new Error('Unreviewed migration manifest');
  const checksums:unknown=JSON.parse(text);
  if(checksums===null||typeof checksums!=='object'||Array.isArray(checksums))throw new Error('Invalid migration manifest');
  const expected=Object.entries(checksums),files=(await readdir(directory)).filter(f=>/^\d{3}_[a-z_]+\.sql$/.test(f)).sort();
  if(expected.length!==19||JSON.stringify(expected.map(([name])=>name))!==JSON.stringify(files))throw new Error('Unexpected migration sequence');
  const entries:Migration[]=[];
  for(const [index,[file,wanted]] of expected.entries()){
   const source=(await readFile(new URL(file,directory),'utf8')).replaceAll('\r\n','\n');
   if(file.slice(0,3)!==String(index+1).padStart(3,'0')||typeof wanted!=='string'||hash(source)!==wanted)throw new Error('Migration source mismatch');
   const envelope=/^(?:\s|--[^\n]*(?:\n|$))*BEGIN;([\s\S]*)COMMIT;\s*$/.exec(source);
   if(!envelope?.[1])throw new Error('Unexpected migration transaction envelope');
   if(index>=2)entries.push({file,sha256:wanted,body:envelope[1]});
  }
  return new ReviewedUpgrade(entries);
 }
}
const preservedTables=['orio_ledger.accounts','orio_ledger.chain_head','orio_ledger.journals','orio_ledger.postings','orio_ledger.outbox',
 'orio_master.assets','orio_master.elections','orio_master.current_election'];
interface DataDigest {table:string;rows:string;sha256:string}
async function dataDigests(client:PoolClient):Promise<DataDigest[]>{
 const result:DataDigest[]=[];
 for(const table of preservedTables){
  // Only bounded counts and SHA256 aggregates leave PostgreSQL; never rows.
  const row=(await client.query<{rows:string;sha256:string}>(`SELECT count(*)::text AS rows,
   encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex') AS sha256 FROM (
    SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM ${table} t LIMIT 100001) bounded`)).rows[0];
  if(!row||BigInt(row.rows)>100000n)throw new Error('History exceeds bounded qualification capacity');
  result.push({table,...row});
 }
 return result;
}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
async function verifyExistingHistory(client:PoolClient){
 const result=await client.query<{valid:boolean}>(`WITH ordered AS (
  SELECT j.*,row_number() OVER(ORDER BY sequence) AS expected_sequence,
   lag(event_hash,1,repeat('0',64)) OVER(ORDER BY sequence) AS previous_hash FROM orio_ledger.journals j
 ), running AS (
  SELECT a.allow_negative,sum(CASE WHEN p.side=a.normal_side THEN p.units ELSE -p.units END)
   OVER(PARTITION BY p.account_id ORDER BY p.journal_sequence) AS balance
  FROM orio_ledger.postings p JOIN orio_ledger.accounts a ON a.id=p.account_id
 ) SELECT
  NOT EXISTS(SELECT 1 FROM ordered j WHERE j.sequence<>j.expected_sequence
   OR j.header->>'sequence' IS DISTINCT FROM j.sequence::text OR j.header->>'previousHash' IS DISTINCT FROM j.previous_hash
   OR j.request_hash IS DISTINCT FROM encode(sha256(convert_to(j.payload::text,'UTF8')),'hex')
   OR j.header->>'requestHash' IS DISTINCT FROM j.request_hash
   OR j.event_hash IS DISTINCT FROM encode(sha256(convert_to(j.header::text,'UTF8')),'hex')
   OR j.header->>'accountsHash' IS DISTINCT FROM encode(sha256(convert_to(j.account_snapshot::text,'UTF8')),'hex')
   OR j.payload->'schemaVersion' IS DISTINCT FROM '1'::jsonb
   OR j.payload->>'idempotencyKey' IS DISTINCT FROM j.idempotency_key OR j.payload->>'externalRef' IS DISTINCT FROM j.external_ref
   OR CASE WHEN jsonb_typeof(j.payload->'postings')='array' THEN jsonb_array_length(j.payload->'postings') NOT BETWEEN 2 AND 128 ELSE true END
   OR j.payload->'postings' IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('accountId',p.account_id,'side',p.side,'units',p.units::text) ORDER BY p.account_id) FROM orio_ledger.postings p WHERE p.journal_sequence=j.sequence)
   OR j.account_snapshot IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('id',a.id,'asset',a.asset,'normalSide',a.normal_side,'allowNegative',a.allow_negative) ORDER BY a.id)
    FROM orio_ledger.postings p JOIN orio_ledger.accounts a ON a.id=p.account_id WHERE p.journal_sequence=j.sequence))
  AND (SELECT count(*) FROM orio_ledger.chain_head)=1
  AND NOT EXISTS(SELECT 1 FROM orio_ledger.chain_head h WHERE h.sequence IS DISTINCT FROM coalesce((SELECT max(sequence) FROM ordered),0)
   OR h.event_hash IS DISTINCT FROM coalesce((SELECT event_hash FROM ordered ORDER BY sequence DESC LIMIT 1),repeat('0',64)))
  AND NOT EXISTS(SELECT 1 FROM orio_ledger.postings p LEFT JOIN orio_ledger.journals j ON j.sequence=p.journal_sequence LEFT JOIN orio_ledger.accounts a ON a.id=p.account_id WHERE j.sequence IS NULL OR a.id IS NULL OR p.units<=0)
  AND NOT EXISTS(SELECT p.journal_sequence,a.asset FROM orio_ledger.postings p JOIN orio_ledger.accounts a ON a.id=p.account_id GROUP BY p.journal_sequence,a.asset HAVING sum(CASE p.side WHEN 'debit' THEN p.units ELSE -p.units END)<>0)
  AND NOT EXISTS(SELECT 1 FROM running WHERE NOT allow_negative AND balance<0)
  AND NOT EXISTS(SELECT 1 FROM orio_ledger.journals j LEFT JOIN orio_ledger.outbox o ON o.journal_sequence=j.sequence WHERE o.journal_sequence IS NULL)
  AND NOT EXISTS(SELECT 1 FROM orio_ledger.outbox o LEFT JOIN orio_ledger.journals j ON j.sequence=o.journal_sequence WHERE j.sequence IS NULL)
  AS valid`);
 if(result.rows[0]?.valid!==true)throw new Error('Existing ledger history failed integrity verification');
}
export type UpgradeEvent={phase:string;file?:string;sha256?:string;outcome?:string};
export class UpgradeFailure extends Error {
 readonly outcome:string;
 readonly sqlState:string|undefined;
 constructor(outcome:string,error:unknown){
  super('Hosted SQL upgrade did not complete normally');this.outcome=outcome;
  this.sqlState=error!==null&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:undefined;
 }
}
async function rollbackProbe(client:PoolClient){
 const headBefore=(await client.query('SELECT sequence,event_hash FROM orio_ledger.chain_head WHERE singleton')).rows;
 const id='qualification_'+randomUUID().replaceAll('-',''),accounts=[id+'_a',id+'_b'];
 await client.query('SAVEPOINT qualification_probe');
 await client.query('SET LOCAL ROLE orio_ledger_runtime');
 for(const [i,account] of accounts.entries())await client.query('SELECT orio_ledger.create_account($1,$2,$3,false)',[account,'QUALIFICATION_UNITS',i===0?'debit':'credit']);
 const postings=[{accountId:accounts[0],side:'debit',units:'123456789012345678901234567890'},{accountId:accounts[1],side:'credit',units:'123456789012345678901234567890'}];
 const values=[id,id,'Synthetic rollback-only qualification',JSON.stringify(postings)];
 const first=(await client.query<{sequence:string;request_hash:string;event_hash:string;header:{previousHash:string;accountsHash:string;requestHash:string;sequence:string};request_text:string;header_text:string;accounts_text:string}>(
  `SELECT j.*,j.payload::text AS request_text,j.header::text AS header_text,j.account_snapshot::text AS accounts_text
   FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb) j`,values)).rows[0];
 const repeated=(await client.query('SELECT sequence,event_hash FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',values)).rows[0];
 if(!first||headBefore.length!==1||!repeated||BigInt(first.sequence)!==BigInt(headBefore[0].sequence)+1n||first.header.sequence!==first.sequence||
  first.header.previousHash!==headBefore[0].event_hash||hash(first.request_text)!==first.request_hash||first.header.requestHash!==first.request_hash||
  hash(first.header_text)!==first.event_hash||hash(first.accounts_text)!==first.header.accountsHash||repeated.sequence!==first.sequence||repeated.event_hash!==first.event_hash)throw new Error('Synthetic journal or idempotency verification failed');
 const balances=(await client.query<{id:string;units:string}>('SELECT id,units FROM orio_ledger.balances WHERE id=ANY($1::text[]) ORDER BY id',[accounts])).rows;
 if(balances.length!==2||balances.some(b=>b.units!==postings[0]?.units))throw new Error('Synthetic integer settlement mismatch');
 const permissions=(await client.query<{direct_write:boolean;direct_digest:boolean}>(`SELECT
  has_table_privilege(current_user,'orio_ledger.journals','INSERT,UPDATE,DELETE') AS direct_write,
  has_function_privilege(current_user,'orio_ledger.digest(bytea,text)','EXECUTE') AS direct_digest`)).rows[0];
 if(!permissions||permissions.direct_write||permissions.direct_digest)throw new Error('Runtime privilege boundary widened');
 await client.query('ROLLBACK TO SAVEPOINT qualification_probe');await client.query('RELEASE SAVEPOINT qualification_probe');
 if(!equal((await client.query('SELECT sequence,event_hash FROM orio_ledger.chain_head WHERE singleton')).rows,headBefore)||
  (await client.query('SELECT id FROM orio_ledger.accounts WHERE id=ANY($1::text[])',[accounts])).rows.length!==0)throw new Error('Synthetic probe was not fully rolled back');
}

/** Trusted maintenance boundary. Caller must separately authorize and pin AWS
 * account, endpoint, secret, CA and backup. This function grants no AWS access.
 * All reviewed 003–019 bodies execute in ONE PostgreSQL transaction. Session
 * advisory locking coordinates our tools, not an adversarial administrator.
 */
export async function applyAtomicUpgrade(client:PoolClient,plan:ReviewedUpgrade,
 options:{database:string;baselineFingerprint:string;owner:string},record:(event:UpgradeEvent)=>Promise<void>){
 let locked=false,started=false,commitAttempted=false,committed=false;
 try{
  if(!(plan instanceof ReviewedUpgrade)||!/^orio_(?:control|test_[a-z0-9_]+)$/.test(options.database)||!/^orio_[a-z0-9_]+$|^postgres$/.test(options.owner)||!/^[a-f0-9]{64}$/.test(options.baselineFingerprint))throw new Error('Invalid qualification identity');
  locked=(await client.query<{locked:boolean}>('SELECT pg_try_advisory_lock(1869771119,1903322476) AS locked')).rows[0]?.locked===true;
  if(!locked)throw new Error('Another maintenance operation holds the lock');
  const before=await auditHostedSchema(client,options.database);
  if(before.catalogFingerprint!==options.baselineFingerprint||before.identity.role!==options.owner)throw new Error('Observed baseline or migration owner changed');
  const roles=before.catalog.roles;
  if(roles?.length!==1||before.catalog.memberships?.length!==0||roles.some(r=>r!==null&&typeof r==='object'&&['superuser','create_role','create_database','can_login','replication','bypass_rls'].some(k=>Object.entries(r).some(([key,value])=>key===k&&value!==false))))throw new Error('Unexpected runtime role authority');
  await record({phase:'BASELINE_VERIFIED'});
  await client.query('BEGIN');started=true;
  await client.query("SET LOCAL statement_timeout='30000ms';SET LOCAL lock_timeout='5000ms';SET LOCAL idle_in_transaction_session_timeout='120000ms';SET LOCAL timezone='UTC';SET LOCAL search_path=pg_catalog");
  await client.query('LOCK TABLE '+preservedTables.join(',')+' IN ACCESS EXCLUSIVE MODE');
  const preserved=await dataDigests(client);
  await verifyExistingHistory(client);
  if((await client.query('SELECT state FROM orio_master.current_election WHERE singleton')).rows[0]?.state!=='DEPOSIT_PAUSED')throw new Error('Issuance must remain paused');
  for(const entry of plan.entries){await client.query(entry.body);await record({phase:'APPLIED_UNCOMMITTED',file:entry.file,sha256:entry.sha256});}
  if(!equal(await dataDigests(client),preserved))throw new Error('Existing ledger or master records changed');
  await rollbackProbe(client);
  if(!equal(await dataDigests(client),preserved))throw new Error('Qualification changed existing records');
  if((await client.query('SELECT count(*)::text AS n FROM orio_monetary.deployments')).rows[0]?.n!=='0'||
   (await client.query('SELECT count(*)::text AS n FROM orio_gas.signing_preparations')).rows[0]?.n!=='0')throw new Error('Unexpected live execution configuration');
  await record({phase:'CHECKS_PASSED_COMMIT_INTENT'});commitAttempted=true;
  const acknowledgement=await client.query('COMMIT');
  if(acknowledgement.command!=='COMMIT')throw new Error('Commit acknowledgement was not affirmative');
  started=false;committed=true;
  await record({phase:'COMMITTED'});
  const after=await auditHostedSchema(client,options.database);
  return {status:'ATOMIC_UPGRADE_COMMITTED',baselineFingerprint:before.catalogFingerprint,resultingCatalogFingerprint:after.catalogFingerprint,
   committedMigrations:plan.entries.map(({file,sha256})=>({file,sha256})),preservedData:preserved,syntheticProbeRolledBack:true,
   existingHistoryVerified:true,historical001002VersionsInferred:false,financialActivationPerformed:false};
 }catch(error){
  let outcome=committed?'COMMITTED_POSTCHECK_FAILED':commitAttempted?'COMMIT_UNKNOWN':started?'ROLLBACK_REQUIRED':'NOT_STARTED';
  if(started&&!commitAttempted){try{await client.query('ROLLBACK');outcome='ROLLED_BACK';}catch{outcome='ROLLBACK_UNCONFIRMED';}}
  throw new UpgradeFailure(outcome,error);
 }finally{if(locked){try{await client.query('SELECT pg_advisory_unlock(1869771119,1903322476)');}catch{/* Connection teardown releases session lock. */}}}
}
