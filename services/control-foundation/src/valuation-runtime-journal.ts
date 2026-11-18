import type {Pool,PoolClient} from 'pg';

interface Identity {database:string;login:string}
interface IdentityResult {session:string;current:string;database:string;unsafe:boolean}
interface PreparedIntent {evidence:unknown;preparedAt:string;typedDigest:string;policyDigest:string;keyArn:string;signer:string}
const id=(v:string)=>{if(typeof v!=='string'||!/^[A-Za-z0-9:_-]{1,100}(?![\s\S])/.test(v))throw Error('Invalid scoped intent');return v;};
const digest=(v:string)=>{if(typeof v!=='string'||!/^0x[0-9a-f]{64}(?![\s\S])/.test(v))throw Error('Invalid scoped digest');return v;};

/** Qualification DB delegate: only three reviewed definer functions. Session
 * identity and absence of direct table/extra-function authority are checked on
 * the same leased connection for every call. This creates no role or grant.
 * An outside-VPC KMS worker can invoke a private in-VPC journal Lambda, avoiding
 * database passwords, signing permission in the DB role and NAT/KMS endpoints.
 * Actual IAM bootstrap/Lambda deployment are separate, unperformed changes.
 */
export class ValuationRuntimeJournal {
 private readonly pool:Pool;
 private readonly identity:Identity;
 constructor(pool:Pool,identity:Identity){
  if(!/^[a-z][a-z0-9_]{0,62}(?![\s\S])/.test(identity.login)||!/^[a-z][a-z0-9_]{0,62}(?![\s\S])/.test(identity.database))throw Error('Invalid valuation runtime identity');
  this.pool=pool;this.identity=structuredClone(identity);
 }
 private async checked<T>(query:(client:PoolClient)=>Promise<T>){
  const client=await this.pool.connect();
  try{
   const row=(await client.query<IdentityResult>(`SELECT session_user::text AS session,current_user::text AS current,
    pg_catalog.current_database() AS database,(r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls OR
    pg_catalog.has_database_privilege(current_user,pg_catalog.current_database(),'CREATE') OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_roles privileged WHERE privileged.rolname IN
     ('rds_superuser','rdsadmin','pg_read_all_data','pg_write_all_data','pg_read_server_files','pg_write_server_files','pg_execute_server_program','pg_signal_backend')
     AND pg_catalog.pg_has_role(current_user,privileged.oid,'MEMBER')) OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE pg_catalog.left(n.nspname,5)='orio_' AND c.relkind IN ('r','p','v','m','f') AND
      (pg_catalog.has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
       pg_catalog.has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE pg_catalog.left(n.nspname,5)='orio_' AND pg_catalog.has_function_privilege(current_user,p.oid,'EXECUTE') AND
      p.oid<>ALL(ARRAY['orio_signing.valuation_runtime_load(text)'::pg_catalog.regprocedure,
       'orio_signing.valuation_runtime_claim(text,text)'::pg_catalog.regprocedure,
       'orio_signing.valuation_runtime_complete(text,text,text)'::pg_catalog.regprocedure]))) AS unsafe
    FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`)).rows[0];
   if(!row||row.session!==this.identity.login||row.current!==this.identity.login||row.database!==this.identity.database||row.unsafe)
    throw Error('Valuation runtime identity or privileges are unsafe');
   return await query(client);
  }finally{client.release();}
 }
 async load(intentId:string):Promise<PreparedIntent>{
  id(intentId);return this.checked(async c=>{
   const row=(await c.query<{intent:PreparedIntent}>('SELECT orio_signing.valuation_runtime_load($1) AS intent',[intentId])).rows[0];
   if(!row?.intent)throw Error('Missing scoped valuation intent');return row.intent;
  });
 }
 async claim(intentId:string,typedDigest:string){
  id(intentId);digest(typedDigest);await this.checked(c=>c.query('SELECT orio_signing.valuation_runtime_claim($1,$2)',[intentId,typedDigest]));
 }
 async complete(intentId:string,typedDigest:string,signature:string){
  id(intentId);digest(typedDigest);if(typeof signature!=='string'||!/^0x[0-9a-f]{130}(?![\s\S])/.test(signature))throw Error('Invalid scoped signature');
  await this.checked(c=>c.query('SELECT orio_signing.valuation_runtime_complete($1,$2,$3)',[intentId,typedDigest,signature]));
 }
}
