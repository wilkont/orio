/** Side-effect-free target validation for a future separately approved clone
 * maintenance session. This does not fetch credentials or authorize access.
 * Metadata must come from authenticated AWS describe calls and a reviewed
 * CREATE change set; it is not an attestation against a malicious administrator.
 */
const cloneId='orio-spc-3-restore-qualification-20261116';
const snapshotId='orio-spc-3-restore-checkpoint-20261116';
const account='720232346199',region='us-east-1';
const originalSecret='arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7';
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid restore metadata');
 return Object.fromEntries(Object.entries(value));
}
export interface QualificationTarget {host:string;secretArn:string;database:'orio_control';username:'orio_ledger_admin'}
export function qualificationTarget(instance:unknown,snapshot:unknown,securityGroup:unknown):QualificationTarget{
 const d=object(instance),s=object(snapshot),g=object(securityGroup),endpoint=object(d.Endpoint),subnets=object(d.DBSubnetGroup),secret=object(d.MasterUserSecret);
 const prefix=`arn:aws:rds:${region}:${account}:`;
 if(d.DBInstanceIdentifier!==cloneId||d.DBInstanceArn!==prefix+'db:'+cloneId||d.DBInstanceStatus!=='available'||
  d.Engine!=='postgres'||d.EngineVersion!=='17.9'||d.StorageEncrypted!==true||d.PubliclyAccessible!==false||d.MultiAZ!==false||
  d.AllocatedStorage!==20||d.BackupRetentionPeriod!==0||d.MasterUsername!=='orio_ledger_admin'||d.DBName!=='orio_control'||
  endpoint.Port!==5432||typeof endpoint.Address!=='string'||
  !/^orio-spc-3-restore-qualification-20261116\.[a-z0-9]+\.us-east-1\.rds\.amazonaws\.com$/.test(endpoint.Address)||
  subnets.VpcId!=='vpc-05613af21236d6911'||subnets.DBSubnetGroupName!=='orio-spc-3-ledger-databasesubnets-sydsyf5mdayu')throw new Error('Wrong or unsafe qualification clone');
 const parameters=d.DBParameterGroups,groups=d.VpcSecurityGroups;
 if(!Array.isArray(parameters)||parameters.length!==1||object(parameters[0]).DBParameterGroupName!=='orio-spc-3-ledger-databaseparameters-tduugdetb77x'||object(parameters[0]).ParameterApplyStatus!=='in-sync'||
  !Array.isArray(groups)||groups.length!==1||object(groups[0]).VpcSecurityGroupId!==g.GroupId||object(groups[0]).Status!=='active'||
  typeof g.GroupId!=='string'||!/^sg-[a-f0-9]{17}$/.test(g.GroupId)||g.GroupId==='sg-030c057c133762083'||g.OwnerId!==account||g.VpcId!=='vpc-05613af21236d6911'||
  !Array.isArray(g.IpPermissions)||g.IpPermissions.length!==0)throw new Error('Unexpected clone network or parameter state');
 if(s.DBSnapshotIdentifier!==snapshotId||s.DBSnapshotArn!==prefix+'snapshot:'+snapshotId||s.DBInstanceIdentifier!=='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'||
  s.Status!=='available'||s.SnapshotType!=='manual'||s.Encrypted!==true||s.AllocatedStorage!==20||s.Engine!=='postgres'||s.EngineVersion!=='17.9'||s.VpcId!=='vpc-05613af21236d6911')throw new Error('Wrong source checkpoint');
 if(secret.SecretStatus!=='active'||typeof secret.SecretArn!=='string'||secret.SecretArn===originalSecret||
  !/^arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[A-Za-z0-9]{6}$/.test(secret.SecretArn))throw new Error('Wrong clone secret identity');
 return {host:endpoint.Address,secretArn:secret.SecretArn,database:'orio_control',username:'orio_ledger_admin'};
}
