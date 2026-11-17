// Approved private bootstrap only. No password is printed, written or uploaded.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,open} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {metadataBootstrapContext,metadataBootstrapSqlSha256} from '../src/metadata-bootstrap-context.ts';
import {qualificationPassword} from '../src/qualification-session.ts';
import {auditHostedSchema} from '../src/schema-audit.ts';
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const bucket='orio-sql-maintenance-720232346199-20261117';
let pool:Pool|undefined,output:string|undefined,config:string|undefined;
let outcome='NOT_STARTED',claimed=false;
function aws(args:string[]){
 if(!config)throw new Error('Private CLI configuration required');
 return execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',timeout:20000,maxBuffer:65536,stdio:['ignore','pipe','pipe'],env:{...process.env,AWS_PAGER:'',AWS_CONFIG_FILE:config}});
}
function upload(path:string,key:string){aws(['s3api','put-object','--bucket',bucket,'--key',key,'--body',path,'--server-side-encryption','AES256','--if-none-match','*']);}
try{
 const [mode,contextPath,contextHash,caPath,reportPath]=process.argv.slice(2);
 if(process.argv.length!==7||mode!=='--apply-approved-metadata-reader'||!contextPath||!contextHash||!caPath||!reportPath||![contextPath,caPath,reportPath].every(isAbsolute)||!/^[a-f0-9]{64}$/.test(contextHash)||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Explicit bootstrap configuration required');
 const root=fileURLToPath(new URL('../../../',import.meta.url)),within=relative(root,resolve(reportPath));
 if(!within.startsWith('..'+sep)&&!isAbsolute(within))throw new Error('Private receipt must remain outside source');
 const bytes=await readFile(contextPath);if(sha(bytes)!==contextHash)throw new Error('Context checksum mismatch');
 const target=metadataBootstrapContext(JSON.parse(bytes.toString('utf8')));
 const ca=await readFile(caPath);if(sha(ca)!=='b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77')throw new Error('Unreviewed CA');
 const sql=(await readFile(new URL('../../../infrastructure/aws/metadata-reader-bootstrap.sql',import.meta.url),'utf8')).replaceAll('\r\n','\n');
 if(sha(sql)!==metadataBootstrapSqlSha256)throw new Error('Unreviewed reader bootstrap');
 const reserved=await open(reportPath,'wx',0o600);await reserved.close();output=reportPath;
 config=reportPath+'.aws-config';await writeFile(config,'[default]\ncli_history = disabled\n',{flag:'wx',mode:0o600});
 const progress=reportPath+'.events.jsonl';await writeFile(progress,JSON.stringify({phase:'METADATA_BOOTSTRAP_INITIALIZED',at:new Date().toISOString(),contextSha256:contextHash})+'\n',{flag:'wx',mode:0o600});
 upload(progress,'reports/execution.jsonl');claimed=true;
 const secret:unknown=JSON.parse(aws(['secretsmanager','get-secret-value','--secret-id',target.secretArn]));
 pool=new Pool({host:target.host,port:5432,database:target.database,user:target.username,password:qualificationPassword(secret,target.secretArn),max:1,connectionTimeoutMillis:10000,query_timeout:15000,ssl:{ca:ca.toString('utf8'),rejectUnauthorized:true},options:'-c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=30000'});
 pool.on('error',()=>{process.exitCode=1;});
 const client=await pool.connect();
 let before:string,after:string;
 try{
  before=(await auditHostedSchema(client,'orio_control')).catalogFingerprint;
  if(before!==target.baselineFingerprint)throw new Error('Unexpected original catalog');
  if((await client.query('SELECT state FROM orio_master.current_election WHERE singleton')).rows[0]?.state!=='DEPOSIT_PAUSED'||
   (await client.query('SELECT count(*)::text AS n FROM orio_monetary.deployments')).rows[0]?.n!=='0'||(await client.query('SELECT count(*)::text AS n FROM orio_gas.signing_preparations')).rows[0]?.n!=='0')throw new Error('Unexpected financial configuration');
  outcome='PROVISIONING_OUTCOME_UNKNOWN';await client.query(sql);outcome='COMMITTED';
  after=(await auditHostedSchema(client,'orio_control',['orio_ledger_runtime','orio_protocol_reader'])).catalogFingerprint;
 }finally{client.release();}
 const report=JSON.stringify({status:'METADATA_READER_BOOTSTRAP_COMMITTED',outcome,beforeCatalogFingerprint:before,afterCatalogFingerprint:after,contextSha256:contextHash,sqlSha256:metadataBootstrapSqlSha256,secretPrintedOrPersisted:false,financialActivationPerformed:false,hostedReaderAuthenticationStillRequiresVerification:true,completedAt:new Date().toISOString()},null,2)+'\n';
 await writeFile(reportPath,report,{mode:0o600});upload(reportPath,'reports/qualification.json');console.log(JSON.stringify({status:'METADATA_READER_BOOTSTRAP_COMMITTED',reportSha256:sha(report),financialActivationPerformed:false}));
}catch{
 const report=JSON.stringify({status:'METADATA_BOOTSTRAP_STOPPED',outcome,requiresInspectionBeforeRetry:true,financialActivationPerformed:false},null,2)+'\n';
 if(output){try{await writeFile(output,report,{mode:0o600});if(claimed)upload(output,'reports/qualification.json');}catch{/* Retain private local evidence; never print secret-bearing exceptions. */}}
 console.error('Metadata bootstrap stopped; inspect the private receipt before any retry');process.exitCode=1;
}finally{if(pool)try{await pool.end();}catch{process.exitCode=1;}}
