// PREPARED ONLY: original-database access requires separate action-time approval.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,open,writeFile} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {qualificationPassword} from '../src/qualification-session.ts';
import {hostedMaintenanceSession} from '../src/hosted-maintenance-session.ts';
import {ReviewedUpgrade,applyAtomicUpgrade,UpgradeFailure} from '../src/hosted-upgrade.ts';
import type {UpgradeEvent} from '../src/hosted-upgrade.ts';

const bucket='orio-sql-maintenance-720232346199-20261117';
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
let pool:Pool|undefined,events:Awaited<ReturnType<typeof open>>|undefined;
let output:string|undefined,historyConfig:string|undefined;
let commitKnown=false;
let remoteReceiptOwned=false;
function aws(args:string[]){
 if(!historyConfig)throw new Error('Private CLI configuration missing');
 return execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',timeout:20000,maxBuffer:65536,
  stdio:['ignore','pipe','pipe'],env:{...process.env,AWS_PAGER:'',AWS_CONFIG_FILE:historyConfig}});
}
function upload(path:string,key:string,exclusive=false){aws(['s3api','put-object','--bucket',bucket,'--key',key,'--body',path,'--server-side-encryption','AES256',...(exclusive?['--if-none-match','*']:[])]);}
try{
 const [mode,contextPath,contextSha,caPath,reportPath]=process.argv.slice(2);
 if(process.argv.length!==7||mode!=='--apply-approved-original-upgrade'||!contextPath||!contextSha||!caPath||!reportPath||
  ![contextPath,caPath,reportPath].every(isAbsolute)||!/^[a-f0-9]{64}$/.test(contextSha)||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw new Error('Explicit private qualification configuration required');
 const repo=fileURLToPath(new URL('../../../',import.meta.url)),within=relative(repo,resolve(reportPath));
 if(!within.startsWith('..'+sep)&&!isAbsolute(within))throw new Error('Private receipts must remain outside the source tree');
 const contextBytes=await readFile(contextPath);if(sha(contextBytes)!==contextSha)throw new Error('Context checksum mismatch');
 const session=hostedMaintenanceSession(JSON.parse(contextBytes.toString('utf8')));
 const ca=await readFile(caPath);if(sha(ca)!=='b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77')throw new Error('Unreviewed RDS CA');
 const plan=await ReviewedUpgrade.load(new URL('../migrations/',import.meta.url),new URL('../config/hosted-upgrade-checksums.json',import.meta.url));
 // Reserve both private files before any credential retrieval or SQL operation.
 const summary=await open(reportPath,'wx',0o600);await summary.close();output=reportPath;
 const eventPath=reportPath+'.events.jsonl';events=await open(eventPath,'wx',0o600);
 historyConfig=reportPath+'.aws-config';await writeFile(historyConfig,'[default]\ncli_history = disabled\n',{flag:'wx',mode:0o600});
 const record=async(event:UpgradeEvent)=>{
  if(!events)throw new Error('Private execution receipt unavailable');
  await events.write(JSON.stringify({at:new Date().toISOString(),...event})+'\n');await events.sync();
  // Claim the remote receipt before credential retrieval. A duplicate attempt
  // cannot overwrite another execution's progress or proceed into PostgreSQL.
  upload(eventPath,'reports/execution.jsonl',!remoteReceiptOwned);remoteReceiptOwned=true;
 };
 await record({phase:'QUALIFICATION_INITIALIZED'});
 const response:unknown=JSON.parse(aws(['secretsmanager','get-secret-value','--secret-id',session.target.secretArn]));
 pool=new Pool({host:session.target.host,port:5432,database:session.target.database,user:session.target.username,
  password:qualificationPassword(response,session.target.secretArn),max:1,connectionTimeoutMillis:10000,query_timeout:35000,
  ssl:{ca:ca.toString('utf8'),rejectUnauthorized:true},options:'-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=120000 -c timezone=UTC'});
 pool.on('error',()=>{process.exitCode=1;});
 const client=await pool.connect();let result;
 try{result=await applyAtomicUpgrade(client,plan,{database:'orio_control',owner:'orio_ledger_admin',baselineFingerprint:session.baselineFingerprint},record);commitKnown=true;if(result.resultingCatalogFingerprint!==session.expectedResultFingerprint)throw new Error('Committed catalog differs from qualified result');}finally{client.release();}
 const report=JSON.stringify({...result,contextSha256:contextSha,completedAt:new Date().toISOString(),target:'ORIGINAL_HOSTED_DATABASE',secretPrintedOrPersisted:false},null,2)+'\n';
 await writeFile(reportPath,report,{mode:0o600});
 try{upload(reportPath,'reports/qualification.json',true);console.log(JSON.stringify({status:result.status,reportSha256:sha(report),financialActivationPerformed:false}));}
 catch{console.error('Qualification committed; its private local receipt is retained, but remote receipt transfer failed');process.exitCode=1;}
}catch(error){
 const report=JSON.stringify({status:'QUALIFICATION_BLOCKED',outcome:commitKnown?'COMMITTED_REPORTING_FAILURE':error instanceof UpgradeFailure?error.outcome:'BOOTSTRAP_OR_REPORTING_FAILURE',
  sqlState:error instanceof UpgradeFailure?error.sqlState:undefined,financialActivationPerformed:false,requiresInspectionBeforeRetry:true},null,2)+'\n';
 if(output){try{await writeFile(output,report,{mode:0o600});if(remoteReceiptOwned)upload(output,'reports/qualification.json',true);}catch{/* Keep the private local receipt; never dump credential-bearing exceptions. */}}
 console.error('Private SQL qualification stopped; inspect the protected receipt before any retry');process.exitCode=1;
}finally{try{if(events)await events.close();}catch{process.exitCode=1;}try{if(pool)await pool.end();}catch{process.exitCode=1;}}
