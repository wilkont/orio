// PREPARED ONLY: reads metadata, never a password or customer record.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {autonomousOriginalContext,autonomousMaintenanceTemplateSha256,autonomousQualifiedReportSha256} from '../src/autonomous-original-context.ts';
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid AWS metadata');return Object.fromEntries(Object.entries(value));
}
function aws(...args:string[]){return object(JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],
 {encoding:'utf8',timeout:30000,maxBuffer:1048576,stdio:['ignore','pipe','pipe'],env:{...process.env,AWS_PAGER:''}})));}
function one(response:Record<string,unknown>,key:string){const values=response[key];if(!Array.isArray(values)||values.length!==1)throw new Error('Ambiguous identity');return object(values[0]);}
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 const out=JSON.stringify(value);if(out===undefined)throw new Error('Invalid JSON');return out;
}
try{
 const output=process.argv[3];if(process.argv.length!==4||process.argv[2]!=='--capture-approved-metadata'||!output||!isAbsolute(output))throw new Error('Explicit private output required');
 const identity=aws('sts','get-caller-identity');if(identity.Account!=='720232346199'||identity.Arn!=='arn:aws:iam::720232346199:root')throw new Error('Wrong maintenance principal');
 const stack=one(aws('cloudformation','describe-stacks','--stack-name','orio-spc-3-sql-maintenance'),'Stacks');
 if(stack.StackStatus!=='CREATE_COMPLETE'||typeof stack.StackId!=='string')throw new Error('Stack not ready');
 const source=(await readFile(new URL('../../../infrastructure/aws/hosted-sql-maintenance.json',import.meta.url),'utf8')).replaceAll('\r\n','\n');
 if(createHash('sha256').update(source).digest('hex')!==autonomousMaintenanceTemplateSha256)throw new Error('Unreviewed template source');
 const template:unknown=JSON.parse(source),expected=object(object(template).Resources);
 const returned=aws('cloudformation','get-template','--stack-name',stack.StackId,'--template-stage','Original').TemplateBody;
 if(canonical(typeof returned==='string'?JSON.parse(returned):returned)!==canonical(template))throw new Error('Deployed template mismatch');
 const resources=aws('cloudformation','list-stack-resources','--stack-name',stack.StackId).StackResourceSummaries;
 if(!Array.isArray(resources)||resources.length!==10||resources.some(r=>{const row=object(r);return typeof row.LogicalResourceId!=='string'||row.ResourceStatus!=='CREATE_COMPLETE'||row.ResourceType!==object(expected[row.LogicalResourceId]).Type;}))throw new Error('Unexpected resources');
 const physical=(logical:string)=>{const row=resources.map(object).find(r=>r.LogicalResourceId===logical);if(!row||typeof row.PhysicalResourceId!=='string')throw new Error('Missing physical identity');return row.PhysicalResourceId;};
 const instance=one(aws('rds','describe-db-instances','--db-instance-identifier','orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'),'DBInstances');
 const snapshot=one(aws('rds','describe-db-snapshots','--db-snapshot-identifier','orio-spc-3-pre-autonomous-upgrade-20261121'),'DBSnapshots');
 const group=one(aws('ec2','describe-security-groups','--group-ids','sg-030c057c133762083'),'SecurityGroups');
 const backups=aws('rds','describe-db-instance-automated-backups','--dbi-resource-id','db-GDKQSO4LQYHC4WACUEYAGRFZNA').DBInstanceAutomatedBackups;
 if(!Array.isArray(backups))throw new Error('Backup metadata unavailable');
 const active=backups.map(object).filter(v=>v.DbiResourceId==='db-GDKQSO4LQYHC4WACUEYAGRFZNA'&&v.Status==='active');
 if(active.length!==1)throw new Error('Ambiguous recovery window');
 const parameters=aws('rds','describe-db-parameters','--db-parameter-group-name','orio-spc-3-ledger-databaseparameters-tduugdetb77x').Parameters;
 if(!Array.isArray(parameters))throw new Error('Parameter metadata unavailable');
 const ssl=parameters.map(object).filter(v=>v.ParameterName==='rds.force_ssl');if(ssl.length!==1)throw new Error('TLS enforcement unknown');
 const journal=object(aws('cloudformation','describe-stack-resource','--stack-name','orio-spc-3-valuation-journal','--logical-resource-id','JournalSecurityGroup').StackResourceDetail);
 if(typeof journal.PhysicalResourceId!=='string'||!['CREATE_COMPLETE','UPDATE_COMPLETE'].includes(String(journal.ResourceStatus)))throw new Error('Persistent journal unavailable');
 const context={journalSecurityGroupId:journal.PhysicalResourceId,version:1,purpose:'APPROVED_ORIGINAL_AUTONOMOUS_LEDGER',account:'720232346199',region:'us-east-1',principalArn:identity.Arn,
  maintenanceStack:stack,resources,templateSha256:autonomousMaintenanceTemplateSha256,rehearsalReportSha256:autonomousQualifiedReportSha256,
  observedAt:new Date().toISOString(),instance,recoveryCheckpoint:snapshot,databaseSecurityGroup:group,forceSsl:ssl[0]!.ParameterValue,
  restoreWindow:active[0]!.RestoreWindow};
 autonomousOriginalContext(context);
 const bytes=JSON.stringify(context,null,2)+'\n';await writeFile(output,bytes,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'PRIVATE_ORIGINAL_MAINTENANCE_CONTEXT_CAPTURED',contextSha256:createHash('sha256').update(bytes).digest('hex'),secretValuesRetrieved:false}));
}catch{console.error('Qualification context capture blocked; no secret value retrieval or SQL operation performed');process.exitCode=1;}
