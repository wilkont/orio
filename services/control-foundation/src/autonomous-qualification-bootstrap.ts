import {readFile,readdir} from 'node:fs/promises';
import type {Client} from 'pg';
import {autonomousConfiguration} from './finalized-autonomous.ts';
import type {AutonomousDeployment} from './finalized-autonomous.ts';
import {initialMonetaryState} from './monetary-engine.ts';

const database='orio_control_qualification';
const migrations=new URL('../migrations/',import.meta.url);
const pending=new URL('../pending-migrations/',import.meta.url);

/** Bootstrap a fresh disposable database, before any worker invocation.
 * The caller supplies a private, already-connected maintenance client.
 * Contract and provider admission is a separate prerequisite.
 */
export async function bootstrapAutonomousQualification(client:Client,input:AutonomousDeployment){
 const deployment=autonomousConfiguration(input);
 if(deployment.chainId!=='84532')throw Error('Base Sepolia deployment required');
 const files=(await readdir(migrations)).filter(file=>/^\d{3}_.+\.sql$/.test(file)).sort();
 if(files.length!==19||files.some((file,index)=>!file.startsWith(String(index+1).padStart(3,'0')+'_')))
  throw Error('Unexpected fresh schema migration list');
 const sources=await Promise.all([
  ...files.map(file=>readFile(new URL(file,migrations),'utf8')),
  ...['022_autonomous_settlement.sql','023_autonomous_import_access.sql'].map(file=>readFile(new URL(file,pending),'utf8')),
 ]);
 const bodies=sources.map(source=>{
  const body=/^(?:\s|--[^\n]*(?:\n|$))*BEGIN;([\s\S]*)COMMIT;\s*$/.exec(source)?.[1];
  if(!body)throw Error('Unexpected qualification migration envelope');
  return body;
 });
 await client.query('BEGIN');
 let commitAttempted=false;
 try{
  await client.query("SET LOCAL search_path=pg_catalog; SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'");
  const {rows:[preflight]}=await client.query(
   `SELECT current_database() AS database, current_user=session_user AS direct_login,
      pg_try_advisory_xact_lock(1869771119,1903322476) AS locked,
      NOT EXISTS(SELECT FROM pg_namespace WHERE starts_with(nspname,'orio_')) AS fresh,
      NOT EXISTS(SELECT FROM pg_roles WHERE rolname IN ('orio_ledger_runtime','orio_autonomous_import','orio_autonomous_worker')) AS roles_fresh,
      EXISTS(SELECT FROM pg_roles WHERE rolname='rds_iam' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolbypassrls) AS iam
   `);
  if(preflight?.database!==database||!preflight.direct_login||!preflight.locked||!preflight.fresh||!preflight.roles_fresh||!preflight.iam)
   throw Error('Isolated database bootstrap preflight rejected');
  for(const body of bodies)await client.query(body);
  await client.query(`
   REVOKE CONNECT,TEMPORARY ON DATABASE orio_control_qualification FROM PUBLIC;
   REVOKE CREATE ON SCHEMA public FROM PUBLIC;
   CREATE ROLE orio_autonomous_worker LOGIN INHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1 PASSWORD NULL;
   GRANT rds_iam, orio_autonomous_import TO orio_autonomous_worker;
   GRANT CONNECT ON DATABASE orio_control_qualification TO orio_autonomous_worker;
  `);
  const state=initialMonetaryState(`erc20:${deployment.chainId}:${deployment.master}`,'autonomous:fixed-master',deployment.masterDecimals);
  await client.query('INSERT INTO orio_autonomous.deployments(id,configuration,state,block_number) VALUES($1,$2::jsonb,$3::jsonb,$4)',
   [deployment.id,JSON.stringify(deployment),JSON.stringify(state),deployment.deploymentBlock]);
  await client.query("INSERT INTO orio_autonomous.import_bindings VALUES('orio_autonomous_worker',$1)",[deployment.id]);
  commitAttempted=true;
  if((await client.query('COMMIT')).command!=='COMMIT')throw Error('Missing commit acknowledgement');
  return {status:'QUALIFICATION_BOOTSTRAPPED',deploymentId:deployment.id,financialExecutionEnabled:false};
 }catch(error){
  if(commitAttempted)throw Error('Qualification commit outcome unknown. Inspect before retrying.');
  await client.query('ROLLBACK');
  throw error;
 }
}
