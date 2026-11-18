const metadataHost='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com';
export const journalMaintenanceTemplateSha256='4ebb302ea1679b9f721b8a0ce2d68144adaffe73fed2f262667b8731512bc61c';
export const journalOriginalBaseline='141a8c8aedd1ea45af794d2de847c836798e19d21cf1223334b740e9082b33f7';
export const journalQualifiedCatalog='ea31f39f97fc104cbd5f4ec9be42333fbc39606f00c6af12eeee7dd744b73f3d';
export const journalQualifiedReportSha256='6256c62186b44397370a1df6a8f8242fdf1d8c2a900e20621c5f25aabf0b16af';
const retainedMetadataGroup='sg-035e5f2d33504884b';
const secretArn='arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7';
const resourceTypes:Record<string,string>={AuditSecurityGroup:'AWS::EC2::SecurityGroup',EndpointSecurityGroup:'AWS::EC2::SecurityGroup',EndpointIngress:'AWS::EC2::SecurityGroupIngress',AuditEndpointEgress:'AWS::EC2::SecurityGroupEgress',DatabaseIngress:'AWS::EC2::SecurityGroupIngress',SecretsEndpoint:'AWS::EC2::VPCEndpoint',AuditS3Egress:'AWS::EC2::SecurityGroupEgress',AuditBucket:'AWS::S3::Bucket',AuditBucketPolicy:'AWS::S3::BucketPolicy',AuditS3Endpoint:'AWS::EC2::VPCEndpoint'};
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid original journal context');return Object.fromEntries(Object.entries(value));
}
/** PREPARED ONLY: separately authorized original-database boundary. The clone
 * approval does not authorize this function. Fresh recovery, exact prior
 * rehearsal, original identity and both actual ingress rules are required.
 * Captured administrator evidence is not an independent attestation. */
export function journalOriginalContext(value:unknown,now=new Date()){
 const c=object(value),at=typeof c.observedAt==='string'?Date.parse(c.observedAt):NaN;
 if(c.version!==1||c.purpose!=='APPROVED_ORIGINAL_VALUATION_JOURNAL'||c.rehearsalReportSha256!==journalQualifiedReportSha256||c.account!=='720232346199'||c.region!=='us-east-1'||
  c.principalArn!=='arn:aws:iam::720232346199:root'||!Number.isFinite(at)||!Number.isFinite(now.getTime())||at>now.getTime()+30000||now.getTime()-at>900000||
  c.templateSha256!==journalMaintenanceTemplateSha256)throw new Error('Unapproved or stale original journal context');
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
 if(group.GroupId!=='sg-030c057c133762083'||group.OwnerId!=='720232346199'||group.VpcId!=='vpc-05613af21236d6911'||
  !Array.isArray(rules)||rules.length!==2||maintenance===retainedMetadataGroup)throw new Error('Unexpected journal maintenance ingress');
 const sources=new Set<string>();
 for(const raw of rules){const rule=object(raw),pairs=rule.UserIdGroupPairs;
  if(rule.IpProtocol!=='tcp'||rule.FromPort!==5432||rule.ToPort!==5432||['IpRanges','Ipv6Ranges','PrefixListIds'].some(k=>!Array.isArray(rule[k])||rule[k].length!==0)||!Array.isArray(pairs)||pairs.length!==1)throw new Error('Unexpected journal ingress rule');
  const pair=object(pairs[0]);if(typeof pair.GroupId!=='string'||![maintenance,retainedMetadataGroup].includes(pair.GroupId)||pair.UserId!=='720232346199'||pair.VpcPeeringConnectionId!==undefined||
   (pair.VpcId!==undefined&&pair.VpcId!=='vpc-05613af21236d6911'))throw new Error('Unexpected journal ingress source');
  sources.add(pair.GroupId);
 }
 if(sources.size!==2)throw new Error('Both fixed journal maintenance ingress sources are required');
 const recovery=object(c.restoreWindow),latest=typeof recovery.LatestTime==='string'?Date.parse(recovery.LatestTime):NaN,earliest=typeof recovery.EarliestTime==='string'?Date.parse(recovery.EarliestTime):NaN;
 if(!Number.isFinite(latest)||!Number.isFinite(earliest)||earliest>=latest||latest>at+30000||at-latest>900000)throw new Error('Current recovery coverage required');
 const snapshot=object(c.recoveryCheckpoint),created=typeof snapshot.SnapshotCreateTime==='string'?Date.parse(snapshot.SnapshotCreateTime):NaN;
 if(snapshot.DBSnapshotIdentifier!=='orio-spc-3-pre-journal-upgrade-20261118'||
  snapshot.DBSnapshotArn!=='arn:aws:rds:us-east-1:720232346199:snapshot:orio-spc-3-pre-journal-upgrade-20261118'||
  snapshot.DBInstanceIdentifier!==d.DBInstanceIdentifier||snapshot.Status!=='available'||snapshot.SnapshotType!=='manual'||snapshot.Encrypted!==true||
  snapshot.Engine!=='postgres'||snapshot.EngineVersion!=='17.9'||snapshot.AllocatedStorage!==20||snapshot.VpcId!=='vpc-05613af21236d6911'||
  typeof d.KmsKeyId!=='string'||!/^arn:aws:kms:us-east-1:720232346199:key\/[a-f0-9-]{36}$/.test(d.KmsKeyId)||snapshot.KmsKeyId!==d.KmsKeyId||
  !Number.isFinite(created)||created>at+30000||at-created>7200000)throw new Error('Fresh original journal recovery checkpoint required');
 return Object.freeze({target:Object.freeze({host:metadataHost,database:'orio_control',username:'orio_ledger_admin',secretArn}),
  baselineFingerprint:journalOriginalBaseline,expectedResultFingerprint:journalQualifiedCatalog});
}
