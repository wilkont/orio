import {metadataHost} from './metadata-iam.ts';
export const metadataBootstrapSqlSha256='803c8cc44c5348cbab283ecd8c6823c9c228102d584b2189fac51764ef71b4e1';
export const metadataBootstrapBaseline='c4d12f3655980558f8e87bc526b2e6ea630ae06cc937b6fba7efce70278c67db';
const secretArn='arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7';
const resourceTypes:Record<string,string>={AuditSecurityGroup:'AWS::EC2::SecurityGroup',EndpointSecurityGroup:'AWS::EC2::SecurityGroup',EndpointIngress:'AWS::EC2::SecurityGroupIngress',AuditEndpointEgress:'AWS::EC2::SecurityGroupEgress',DatabaseIngress:'AWS::EC2::SecurityGroupIngress',SecretsEndpoint:'AWS::EC2::VPCEndpoint',AuditS3Egress:'AWS::EC2::SecurityGroupEgress',AuditBucket:'AWS::S3::Bucket',AuditBucketPolicy:'AWS::S3::BucketPolicy',AuditS3Endpoint:'AWS::EC2::VPCEndpoint'};
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid metadata bootstrap context');return Object.fromEntries(Object.entries(value));
}
/** Fresh authenticated control-plane evidence, not authority against a malicious
 * administrator. Secret retrieval is confined to the exact original target. */
export function metadataBootstrapContext(value:unknown,now=new Date()){
 const c=object(value),at=typeof c.observedAt==='string'?Date.parse(c.observedAt):NaN;
 if(c.version!==1||c.purpose!=='APPROVED_PRIVATE_METADATA_READER'||c.account!=='720232346199'||c.region!=='us-east-1'||
  c.principalArn!=='arn:aws:iam::720232346199:root'||!Number.isFinite(at)||!Number.isFinite(now.getTime())||at>now.getTime()+30000||now.getTime()-at>900000||
  c.templateSha256!=='4ebb302ea1679b9f721b8a0ce2d68144adaffe73fed2f262667b8731512bc61c')throw new Error('Unapproved or stale metadata bootstrap context');
 const d=object(c.instance),endpoint=object(d.Endpoint),secret=object(d.MasterUserSecret),subnet=object(d.DBSubnetGroup),pending=object(d.PendingModifiedValues);
 if(d.DBInstanceIdentifier!=='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'||d.DbiResourceId!=='db-GDKQSO4LQYHC4WACUEYAGRFZNA'||
  d.DBInstanceArn!=='arn:aws:rds:us-east-1:720232346199:db:orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'||d.DBInstanceStatus!=='available'||Object.keys(pending).length!==0||
  d.Engine!=='postgres'||d.EngineVersion!=='17.9'||d.DBInstanceClass!=='db.t4g.medium'||d.AllocatedStorage!==20||d.StorageEncrypted!==true||d.PubliclyAccessible!==false||d.MultiAZ!==true||d.DeletionProtection!==true||d.BackupRetentionPeriod!==14||d.IAMDatabaseAuthenticationEnabled!==true||
  d.MasterUsername!=='orio_ledger_admin'||d.DBName!=='orio_control'||endpoint.Address!==metadataHost||endpoint.Port!==5432||secret.SecretArn!==secretArn||secret.SecretStatus!=='active'||
  subnet.VpcId!=='vpc-05613af21236d6911'||subnet.DBSubnetGroupName!=='orio-spc-3-ledger-databasesubnets-sydsyf5mdayu')throw new Error('Unsafe metadata bootstrap database');
 const groups=d.VpcSecurityGroups,parameters=d.DBParameterGroups;
 if(!Array.isArray(groups)||groups.length!==1||object(groups[0]).VpcSecurityGroupId!=='sg-030c057c133762083'||object(groups[0]).Status!=='active'||
  !Array.isArray(parameters)||parameters.length!==1||object(parameters[0]).DBParameterGroupName!=='orio-spc-3-ledger-databaseparameters-tduugdetb77x'||object(parameters[0]).ParameterApplyStatus!=='in-sync'||c.forceSsl!=='1')throw new Error('Database isolation or TLS changed');
 const stack=object(c.maintenanceStack),resources=c.resources;
 if(typeof stack.StackId!=='string'||!/^arn:aws:cloudformation:us-east-1:720232346199:stack\/orio-spc-3-sql-maintenance\/[a-f0-9-]{36}$/.test(stack.StackId)||stack.StackStatus!=='CREATE_COMPLETE'||
  !Array.isArray(resources)||resources.length!==10||new Set(resources.map(r=>object(r).LogicalResourceId)).size!==10||resources.some(r=>{const row=object(r);return typeof row.LogicalResourceId!=='string'||row.ResourceType!==resourceTypes[row.LogicalResourceId]||row.ResourceStatus!=='CREATE_COMPLETE';}))throw new Error('Unverified private maintenance resources');
 const maintenance=object(resources.find(r=>object(r).LogicalResourceId==='AuditSecurityGroup')).PhysicalResourceId;
 if(typeof maintenance!=='string'||!/^sg-[a-f0-9]{17}$/.test(maintenance)||maintenance==='sg-030c057c133762083')throw new Error('Wrong maintenance security group');
 const group=object(c.databaseSecurityGroup),rules=group.IpPermissions;
 if(group.GroupId!=='sg-030c057c133762083'||group.OwnerId!=='720232346199'||group.VpcId!=='vpc-05613af21236d6911'||!Array.isArray(rules)||rules.length!==1)throw new Error('Unexpected bootstrap ingress');
 const rule=object(rules[0]),pairs=rule.UserIdGroupPairs;
 if(rule.IpProtocol!=='tcp'||rule.FromPort!==5432||rule.ToPort!==5432||['IpRanges','Ipv6Ranges','PrefixListIds'].some(k=>!Array.isArray(rule[k])||rule[k].length!==0)||!Array.isArray(pairs)||pairs.length!==1||
  object(pairs[0]).GroupId!==maintenance||object(pairs[0]).UserId!=='720232346199'||object(pairs[0]).VpcPeeringConnectionId!==undefined)throw new Error('Unexpected bootstrap ingress source');
 const recovery=object(c.restoreWindow),latest=typeof recovery.LatestTime==='string'?Date.parse(recovery.LatestTime):NaN,earliest=typeof recovery.EarliestTime==='string'?Date.parse(recovery.EarliestTime):NaN;
 if(!Number.isFinite(latest)||!Number.isFinite(earliest)||earliest>=latest||latest>at+30000||at-latest>900000)throw new Error('Current recovery coverage required');
 return Object.freeze({host:metadataHost,database:'orio_control',username:'orio_ledger_admin',secretArn,baselineFingerprint:metadataBootstrapBaseline});
}
