import {readFile,open,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {valuationJournalQualificationSession} from '../src/valuation-journal-qualification-session.ts';
import {qualificationPassword} from '../src/qualification-session.ts';
const [contextPath,contextSha,caPath,reportPath]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex');
let pool;
try{
 const bytes=await readFile(contextPath);if(sha(bytes)!==contextSha)throw Error('Context mismatch');
 const session=valuationJournalQualificationSession(JSON.parse(bytes));
 const ca=await readFile(caPath);if(sha(ca)!=='b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77'||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('Untrusted TLS');
 const result=JSON.parse(await readFile(reportPath,'utf8'));if(result.status!=='SCOPED_JOURNAL_BOOTSTRAP_COMMITTED')throw Error('Missing successful rehearsal');
 const config=reportPath+'.postcheck-aws-config';await writeFile(config,'[default]\ncli_history = disabled\n',{flag:'wx',mode:0o600});
 const env={...process.env,AWS_CONFIG_FILE:config,AWS_PAGER:''};
 const raw=execFileSync('aws',['secretsmanager','get-secret-value','--secret-id',session.target.secretArn,'--region','us-east-1','--output','json'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000});
 pool=new Pool({...session.target,port:5432,user:session.target.username,password:qualificationPassword(JSON.parse(raw),session.target.secretArn),max:1,connectionTimeoutMillis:10000,query_timeout:10000,ssl:{ca:ca.toString('utf8'),rejectUnauthorized:true}});
 const c=await pool.connect();let safe;
 try{
  await c.query('BEGIN READ ONLY');await c.query('SET LOCAL search_path=pg_catalog');
  safe=(await c.query(`SELECT current_database()='orio_control' AND session_user='orio_ledger_admin'
   AND r.rolcanlogin AND NOT (r.rolinherit OR r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
   AND r.rolconnlimit=2 AND pg_has_role(r.oid,'rds_iam','MEMBER') AND NOT has_database_privilege(r.oid,current_database(),'CREATE')
   AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE left(n.nspname,5)='orio_' AND c.relkind IN ('r','p','v','m','f')
    AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
   AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE left(n.nspname,5)='orio_' AND has_function_privilege(r.oid,p.oid,'EXECUTE'))=3
   AND has_function_privilege(r.oid,'orio_signing.valuation_runtime_load(text)','EXECUTE')
   AND has_function_privilege(r.oid,'orio_signing.valuation_runtime_claim(text,text)','EXECUTE')
   AND has_function_privilege(r.oid,'orio_signing.valuation_runtime_complete(text,text,text)','EXECUTE')
   AND NOT EXISTS(SELECT 1 FROM orio_signing.authorities) AND NOT EXISTS(SELECT 1 FROM orio_signing.runtime_authority_bindings)
   AS safe FROM pg_roles r WHERE r.rolname='orio_valuation_journal'`)).rows[0]?.safe===true;
 }finally{await c.query('ROLLBACK');c.release();}
 if(!safe)throw Error('Restricted grant matrix rejected');
 const event={at:new Date().toISOString(),phase:'RUNTIME_GRANT_POSTCHECK_PASSED',login:'orio_valuation_journal',directTableOrColumnPrivileges:false,executableOrioFunctions:3,authorityBindings:0,actualIamLoginPerformed:false,financialExecutionEnabled:false};
 const eventPath=reportPath+'.events.jsonl',f=await open(eventPath,'a');try{await f.write(JSON.stringify(event)+'\n');await f.sync();}finally{await f.close();}
 execFileSync('aws',['s3api','put-object','--bucket','orio-sql-qualification-720232346199-20261116','--key','reports/execution.jsonl','--body',eventPath,'--server-side-encryption','AES256','--region','us-east-1','--output','json'],{env,stdio:['ignore','pipe','pipe'],timeout:20000});
 console.log(JSON.stringify(event));
}catch{console.error('CLONE_GRANT_POSTCHECK_BLOCKED_NO_FINANCIAL_ACTIVATION');process.exitCode=1;}
finally{if(pool)await pool.end();}
