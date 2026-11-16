import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {qualificationTarget} from '../src/restore-qualification-target.ts';

// Metadata-only verification of the approved temporary restore. Never retrieves
// a secret value, connects to PostgreSQL, reads rows, changes AWS or authorizes SQL.
function record(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid AWS metadata');
 return Object.fromEntries(Object.entries(value));
}
function aws(...args:string[]):Record<string,unknown>{
 return record(JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],
  {encoding:'utf8',timeout:30000,maxBuffer:1048576,stdio:['ignore','pipe','pipe'],env:{...process.env,AWS_PAGER:''}})));
}
function one(response:Record<string,unknown>,field:string):Record<string,unknown>{
 const values=response[field];if(!Array.isArray(values)||values.length!==1)throw new Error('Ambiguous AWS identity');
 return record(values[0]);
}
try{
 if(process.argv.length!==3||process.argv[2]!=='--verify-approved-private-restore')throw new Error('Explicit approved metadata verification required');
 if(aws('sts','get-caller-identity').Account!=='720232346199')throw new Error('Wrong account');
 const stackArn='arn:aws:cloudformation:us-east-1:720232346199:stack/orio-spc-3-restore-qualification/cb839d70-e1fa-11f1-9dbd-12ffc499124f';
 const stack=one(aws('cloudformation','describe-stacks','--stack-name',stackArn),'Stacks');
 if(stack.StackId!==stackArn||stack.StackStatus!=='CREATE_COMPLETE')throw new Error('Restore stack is not ready');
 const resources=aws('cloudformation','list-stack-resources','--stack-name',stackArn).StackResourceSummaries;
 if(!Array.isArray(resources)||resources.length!==2)throw new Error('Unexpected stack resources');
 const sorted=resources.map(record).sort((a,b)=>String(a.LogicalResourceId).localeCompare(String(b.LogicalResourceId)));
 const groupResource=sorted[0],databaseResource=sorted[1];
 if(!groupResource||!databaseResource||groupResource.LogicalResourceId!=='CloneSecurityGroup'||groupResource.ResourceType!=='AWS::EC2::SecurityGroup'||groupResource.ResourceStatus!=='CREATE_COMPLETE'||
  databaseResource.LogicalResourceId!=='QualificationClone'||databaseResource.ResourceType!=='AWS::RDS::DBInstance'||databaseResource.ResourceStatus!=='CREATE_COMPLETE'||
  databaseResource.PhysicalResourceId!=='orio-spc-3-restore-qualification-20261116'||typeof groupResource.PhysicalResourceId!=='string')throw new Error('Wrong stack resource identity');
 const expected=await readFile(new URL('../../../infrastructure/aws/restore-qualification.json',import.meta.url),'utf8');
 if(createHash('sha256').update(expected.replaceAll('\r\n','\n')).digest('hex')!=='7f8f9e016cd618211c82c37d6ed91a7d9aa4bb25e9e8fed4720a6389316dad4c')throw new Error('Restore template source changed');
 const body=aws('cloudformation','get-template','--stack-name',stackArn,'--template-stage','Original').TemplateBody;
 // Compare recursively with sorted object keys; AWS may reorder JSON properties.
 function canonical(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  const result=JSON.stringify(value);if(result===undefined)throw new Error('Invalid JSON metadata');return result;
 }
 if(canonical(typeof body==='string'?JSON.parse(body):body)!==canonical(JSON.parse(expected)))throw new Error('Actual restore template differs from approval');
 const instance=one(aws('rds','describe-db-instances','--db-instance-identifier','orio-spc-3-restore-qualification-20261116'),'DBInstances');
 const snapshot=one(aws('rds','describe-db-snapshots','--db-snapshot-identifier','orio-spc-3-restore-checkpoint-20261116'),'DBSnapshots');
 const group=one(aws('ec2','describe-security-groups','--group-ids',groupResource.PhysicalResourceId),'SecurityGroups');
 const target=qualificationTarget(instance,snapshot,group);
 const original=one(aws('rds','describe-db-instances','--db-instance-identifier','orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'),'DBInstances');
 if(original.DBInstanceStatus!=='available'||original.StorageEncrypted!==true||original.PubliclyAccessible!==false||original.MultiAZ!==true||original.DeletionProtection!==true||original.BackupRetentionPeriod!==14||
  typeof original.KmsKeyId!=='string'||snapshot.KmsKeyId!==original.KmsKeyId||instance.KmsKeyId!==original.KmsKeyId||
  record(original.MasterUserSecret).SecretArn===target.secretArn)throw new Error('Source protection or inherited encryption mismatch');
 const sourceGroup=one(aws('ec2','describe-security-groups','--group-ids','sg-030c057c133762083'),'SecurityGroups');
 if(!Array.isArray(sourceGroup.IpPermissions)||sourceGroup.IpPermissions.length!==0)throw new Error('Original database ingress changed');
 const parameters=aws('rds','describe-db-parameters','--db-parameter-group-name','orio-spc-3-ledger-databaseparameters-tduugdetb77x').Parameters;
 if(!Array.isArray(parameters)||!parameters.some(p=>record(p).ParameterName==='rds.force_ssl'&&record(p).ParameterValue==='1'))throw new Error('TLS requirement changed');
 console.log(JSON.stringify({status:'PRIVATE_SNAPSHOT_RESTORE_VERIFIED',verifiedAt:new Date().toISOString(),stackArn,
  cloneIdentifier:instance.DBInstanceIdentifier,snapshotIdentifier:snapshot.DBSnapshotIdentifier,cloneSecurityGroup:group.GroupId,
  engine:'postgres',engineVersion:'17.9',storageGiB:20,encrypted:true,sourceEncryptionKeyInherited:true,private:true,multiAZ:false,
  clientIngress:[],tlsRequired:true,managedCloneSecretDistinct:true,originalDatabaseProtectionPreserved:true,originalDatabaseIngress:[],
  secretValuesRetrieved:false,sqlConnectionsMade:false,customerApplicationRowsRetrieved:false,hostedMigrationsApplied:[],financialExecutionEnabled:false},null,2));
}catch{console.error('Private restore metadata verification blocked; no secret value retrieval or database operation performed');process.exitCode=1;}
