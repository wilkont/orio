import type {PoolClient} from 'pg';

/** Public metadata needs only three registry tables, never administrator,
 * other application tables, signing or settlement authority. Inspect both the authenticated
 * session and reachable roles so SET ROLE / NOINHERIT cannot mask privileges.
 * Caller uses a read-only transaction with pg_catalog search_path.
 */
export async function assertProtocolReaderIdentity(client:PoolClient):Promise<void>{
 const result=await client.query<{allowed:boolean}>(`WITH principals AS (
  SELECT r.* FROM pg_roles r WHERE r.rolname=current_user OR r.rolname=session_user OR pg_has_role(session_user,r.oid,'MEMBER')
 ), relations AS (
  SELECT c.*,n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
 ) SELECT
  (SELECT rolcanlogin FROM pg_roles WHERE rolname=session_user)
  AND NOT EXISTS(SELECT 1 FROM principals p WHERE p.rolsuper OR p.rolcreaterole OR p.rolcreatedb OR p.rolreplication OR p.rolbypassrls
   OR ((left(p.rolname,3)='pg_' OR left(p.rolname,3)='rds') AND p.rolname<>'rds_iam'))
  AND NOT EXISTS(SELECT 1 FROM principals p CROSS JOIN pg_database d WHERE d.datname=current_database() AND pg_has_role(p.oid,d.datdba,'MEMBER'))
  AND NOT EXISTS(SELECT 1 FROM principals p CROSS JOIN pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
   AND (pg_has_role(p.oid,n.nspowner,'MEMBER') OR has_schema_privilege(p.oid,n.oid,'CREATE')))
  AND NOT EXISTS(SELECT 1 FROM principals p CROSS JOIN relations c WHERE c.relkind IN ('r','p','v','m','f')
   AND (has_table_privilege(p.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(p.oid,c.oid,'INSERT,UPDATE,REFERENCES')
    OR ((c.nspname<>'orio_master' OR c.relname NOT IN ('assets','elections','current_election')) AND (has_table_privilege(p.oid,c.oid,'SELECT') OR has_any_column_privilege(p.oid,c.oid,'SELECT')))))
  AND NOT EXISTS(SELECT 1 FROM principals p CROSS JOIN relations c WHERE c.relkind='S' AND has_sequence_privilege(p.oid,c.oid,'USAGE,SELECT,UPDATE'))
  AND NOT EXISTS(SELECT 1 FROM principals p CROSS JOIN pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%' AND f.prokind IN ('f','p') AND has_schema_privilege(p.oid,n.oid,'USAGE') AND has_function_privilege(p.oid,f.oid,'EXECUTE'))
  AND (SELECT count(*) FROM relations WHERE nspname='orio_master' AND relname IN ('assets','elections','current_election') AND relkind IN ('r','p'))=3
  AND (SELECT bool_and(has_table_privilege(current_user,c.oid,'SELECT')) FROM relations c WHERE c.nspname='orio_master' AND c.relname IN ('assets','elections','current_election'))
  AND has_schema_privilege(current_user,'orio_master','USAGE') AS allowed`);
 if(result.rows.length!==1||result.rows[0]?.allowed!==true)throw new Error('Protocol reader privileges are not sufficiently restricted');
}
