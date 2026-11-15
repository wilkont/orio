import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';

// Only fixed source-owned SQL fragments enter this helper. Expand defaults and
// sort named grants so an equivalent pg_dump restore has the same ACL digest.
function aclDigest(acl:string,kind:string,owner:string):string{
 return `encode(sha256(convert_to((SELECT coalesce(string_agg(
  concat_ws(':',pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable::text),
  ',' ORDER BY pg_get_userbyid(a.grantor),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable),'')
  FROM aclexplode(coalesce(${acl},acldefault(${kind},${owner}))) a),'UTF8')),'hex')`;
}

/** Read-only prerequisite to a separately authorized upgrade. Catalog hashes do
 * not establish which migration ran, authenticate a hostile DBA, or authorize DDL.
 * No application rows, credentials or raw stored-function bodies are returned.
 */
export async function auditHostedSchema(client:PoolClient,expectedDatabase:string,roleNames:readonly string[]=['orio_ledger_runtime']){
 if(!/^orio_(?:control|test_[a-z0-9_]+)$/.test(expectedDatabase)||roleNames.some(r=>!/^orio_[a-z0-9_]+$/.test(r)))throw new Error('Invalid audit identity');
 let started=false;
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');started=true;
  await client.query('SET LOCAL search_path=pg_catalog');
  await client.query("SET LOCAL statement_timeout='5000ms'");await client.query("SET LOCAL lock_timeout='2000ms'");
  const identity=(await client.query<{database:string;role:string;read_only:string;server_version:string}>(
   "SELECT current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS read_only,current_setting('server_version') AS server_version")).rows[0];
  if(!identity||identity.database!==expectedDatabase||identity.read_only!=='on')throw new Error('Wrong database or read-only boundary');
  const catalog:Record<string,unknown[]>={};
  catalog.schemas=(await client.query(`SELECT nspname AS name,pg_get_userbyid(nspowner) AS owner,
   ${aclDigest('nspacl',"'n'",'nspowner')} AS acl_digest
   FROM pg_catalog.pg_namespace WHERE left(nspname,5)='orio_' ORDER BY nspname`)).rows;
  catalog.relations=(await client.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
   c.relrowsecurity AS row_security,c.relforcerowsecurity AS force_row_security,pg_get_userbyid(c.relowner) AS owner,
   ${aclDigest('c.relacl',"CASE WHEN c.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END",'c.relowner')} AS acl_digest,
   CASE WHEN c.relkind IN ('v','m') THEN encode(sha256(convert_to(pg_get_viewdef(c.oid,true),'UTF8')),'hex') ELSE NULL END AS view_digest,
   CASE WHEN c.relkind IN ('i','I') THEN encode(sha256(convert_to(pg_get_indexdef(c.oid),'UTF8')),'hex') ELSE NULL END AS index_digest
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE left(n.nspname,5)='orio_' ORDER BY n.nspname,c.relname`)).rows;
  catalog.columns=(await client.query(`SELECT n.nspname AS schema,c.relname AS relation,a.attnum AS ordinal,a.attname AS name,
   format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,a.attidentity AS identity,a.attgenerated AS generated,
   CASE WHEN d.oid IS NULL THEN NULL ELSE encode(sha256(convert_to(pg_get_expr(d.adbin,d.adrelid),'UTF8')),'hex') END AS default_digest
   FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE left(n.nspname,5)='orio_' AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum`)).rows;
  catalog.constraints=(await client.query(`SELECT n.nspname AS schema,c.relname AS relation,k.conname AS name,k.contype AS type,k.convalidated AS validated,
   encode(sha256(convert_to(pg_get_constraintdef(k.oid,true),'UTF8')),'hex') AS definition_digest
   FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE left(n.nspname,5)='orio_' ORDER BY n.nspname,c.relname,k.conname`)).rows;
  catalog.triggers=(await client.query(`SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,
   encode(sha256(convert_to(pg_get_triggerdef(t.oid,true),'UTF8')),'hex') AS definition_digest
   FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE left(n.nspname,5)='orio_' AND NOT t.tgisinternal ORDER BY n.nspname,c.relname,t.tgname`)).rows;
  catalog.functions=(await client.query(`SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
   p.prosecdef AS security_definer,pg_get_userbyid(p.proowner) AS owner,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_digest,
   ${aclDigest('p.proacl',"'f'",'p.proowner')} AS acl_digest
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE left(n.nspname,5)='orio_' AND p.prokind IN ('f','p') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`)).rows;
  catalog.roles=(await client.query(`SELECT rolname AS name,rolsuper AS superuser,rolinherit AS inherits,rolcreaterole AS create_role,
   rolcreatedb AS create_database,rolcanlogin AS can_login,rolreplication AS replication,rolbypassrls AS bypass_rls
   FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,[[...roleNames]])).rows;
  catalog.memberships=(await client.query(`SELECT member.rolname AS member,granted.rolname AS granted_role,m.admin_option,m.inherit_option,m.set_option
   FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles member ON member.oid=m.member JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
   WHERE member.rolname=ANY($1::text[]) ORDER BY member.rolname,granted.rolname`,[[...roleNames]])).rows;
  catalog.rowPolicies=(await client.query(`SELECT n.nspname AS schema,c.relname AS relation,p.polname AS name,p.polcmd AS command,p.polpermissive AS permissive,
   encode(sha256(convert_to(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'UTF8')),'hex') AS using_digest,
   encode(sha256(convert_to(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'UTF8')),'hex') AS check_digest,
   encode(sha256(convert_to(p.polroles::text,'UTF8')),'hex') AS roles_digest
   FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE left(n.nspname,5)='orio_' ORDER BY n.nspname,c.relname,p.polname`)).rows;
  catalog.extensions=(await client.query("SELECT extname AS name,extversion AS version FROM pg_catalog.pg_extension WHERE extname='pgcrypto' ORDER BY extname")).rows;
  const fingerprint=createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
  return {status:'READ_ONLY_SCHEMA_OBSERVATION',catalogFormatVersion:2,identity,catalogFingerprint:fingerprint,catalog,observedAt:new Date().toISOString(),
   baselineStatus:'REQUIRES_VERIFIED_BASELINE',installedMigrationVersions:null,financialExecutionEnabled:false,
   limits:['Catalog evidence only; no migration history or restore validation is inferred','Does not authenticate against a privileged database administrator','No application table rows or raw function bodies were read into this report']};
 }finally{if(started)await client.query('ROLLBACK');}
}
