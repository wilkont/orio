import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {autonomousQualificationSession,qualificationTemplateSha256} from '../src/autonomous-qualification-session.ts';
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
 const stack=one(aws('cloudformation','describe-stacks','--stack-name','orio-spc-3-sql-qualification'),'Stacks');
 if(stack.StackStatus!=='CREATE_COMPLETE'||typeof stack.StackId!=='string')throw new Error('Stack not ready');
 const source=(await readFile(new URL('../../../infrastructure/aws/sql-qualification.json',import.meta.url),'utf8')).replaceAll('\r\n','\n');
 if(createHash('sha256').update(source).digest('hex')!==qualificationTemplateSha256)throw new Error('Unreviewed template source');
 const template:unknown=JSON.parse(source),expected=object(object(template).Resources);
 const returned=aws('cloudformation','get-template','--stack-name',stack.StackId,'--template-stage','Original').TemplateBody;
 if(canonical(typeof returned==='string'?JSON.parse(returned):returned)!==canonical(template))throw new Error('Deployed template mismatch');
 const resources=aws('cloudformation','list-stack-resources','--stack-name',stack.StackId).StackResourceSummaries;
 if(!Array.isArray(resources)||resources.length!==12||resources.some(r=>{const row=object(r);return typeof row.LogicalResourceId!=='string'||row.ResourceStatus!=='CREATE_COMPLETE'||row.ResourceType!==object(expected[row.LogicalResourceId]).Type;}))throw new Error('Unexpected resources');
 const physical=(logical:string)=>{const row=resources.map(object).find(r=>r.LogicalResourceId===logical);if(!row||typeof row.PhysicalResourceId!=='string')throw new Error('Missing physical identity');return row.PhysicalResourceId;};
 const instance=one(aws('rds','describe-db-instances','--db-instance-identifier',physical('QualificationClone')),'DBInstances');
 const snapshot=one(aws('rds','describe-db-snapshots','--db-snapshot-identifier','orio-spc-3-restore-checkpoint-20261116'),'DBSnapshots');
 const group=one(aws('ec2','describe-security-groups','--group-ids',physical('CloneSecurityGroup')),'SecurityGroups');
 const original=one(aws('rds','describe-db-instances','--db-instance-identifier','orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'),'DBInstances');
 if(original.DBInstanceStatus!=='available'||original.StorageEncrypted!==true||original.PubliclyAccessible!==false||original.DeletionProtection!==true||original.BackupRetentionPeriod!==14||
  typeof original.KmsKeyId!=='string'||original.KmsKeyId!==instance.KmsKeyId||original.KmsKeyId!==snapshot.KmsKeyId||object(original.MasterUserSecret).SecretArn===object(instance.MasterUserSecret).SecretArn)throw new Error('Source protection mismatch');
 const originalGroup=one(aws('ec2','describe-security-groups','--group-ids','sg-030c057c133762083'),'SecurityGroups');
 const metadataReader=object(aws('cloudformation','describe-stack-resource','--stack-name','orio-spc-3-protocol-metadata','--logical-resource-id','ReaderSecurityGroup').StackResourceDetail);
 if(typeof metadataReader.PhysicalResourceId!=='string'||metadataReader.ResourceStatus!=='CREATE_COMPLETE')throw new Error('Persistent reader identity unavailable');
 const journalGroup=object(aws('cloudformation','describe-stack-resource','--stack-name','orio-spc-3-valuation-journal','--logical-resource-id','JournalSecurityGroup').StackResourceDetail);
 if(typeof journalGroup.PhysicalResourceId!=='string'||!['CREATE_COMPLETE','UPDATE_COMPLETE'].includes(String(journalGroup.ResourceStatus)))throw new Error('Persistent journal identity unavailable');
 const context={stackCreatedAt:stack.CreationTime,journalSecurityGroupId:journalGroup.PhysicalResourceId,version:1,purpose:'AUTONOMOUS_SCHEMA_REHEARSAL',originalInstance:original,originalSecurityGroup:originalGroup,metadataReaderSecurityGroupId:metadataReader.PhysicalResourceId,account:'720232346199',region:'us-east-1',stackArn:stack.StackId,templateSha256:qualificationTemplateSha256,
  observedAt:new Date().toISOString(),instance,snapshot,cloneSecurityGroup:group,maintenanceSecurityGroupId:physical('AuditSecurityGroup')};
 autonomousQualificationSession(context);
 const bytes=JSON.stringify(context,null,2)+'\n';await writeFile(output,bytes,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'PRIVATE_QUALIFICATION_CONTEXT_CAPTURED',contextSha256:createHash('sha256').update(bytes).digest('hex'),secretValuesRetrieved:false}));
}catch{console.error('Qualification context capture blocked; no secret value retrieval or SQL operation performed');process.exitCode=1;}
