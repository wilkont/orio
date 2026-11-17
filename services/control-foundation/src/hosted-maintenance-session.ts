/** Original-database maintenance is a distinct authorization boundary from the
 * disposable rehearsal. Authenticated metadata and owner approval are required;
 * this validator does not grant access or attest against a malicious DBA. */
export const maintenanceTemplateSha256='4ebb302ea1679b9f721b8a0ce2d68144adaffe73fed2f262667b8731512bc61c';
export const successfulRehearsalSha256='91e47bdf44367d7fcd90d5720980a35dfd52004a2596796d50d996534e571fe5';
export const qualifiedResultFingerprint='c4d12f3655980558f8e87bc526b2e6ea630ae06cc937b6fba7efce70278c67db';
const original='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc';
const originalGroup='sg-030c057c133762083',vpc='vpc-05613af21236d6911';
const originalSecret='arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7';
const checkpoint='orio-spc-3-pre-upgrade-20261117';
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid maintenance metadata');
 return Object.fromEntries(Object.entries(value));
}
export function hostedMaintenanceSession(value:unknown,now=new Date()){
 const c=object(value),at=typeof c.observedAt==='string'?Date.parse(c.observedAt):NaN;
 if(c.version!==1||c.purpose!=='ORIGINAL_SQL_MAINTENANCE'||c.account!=='720232346199'||c.region!=='us-east-1'||
  c.templateSha256!==maintenanceTemplateSha256||c.rehearsalReportSha256!==successfulRehearsalSha256||
  typeof c.stackArn!=='string'||!/^arn:aws:cloudformation:us-east-1:720232346199:stack\/orio-spc-3-sql-maintenance\/[a-f0-9-]{36}$/.test(c.stackArn)||
  !Number.isFinite(at)||!Number.isFinite(now.getTime())||at>now.getTime()+30000||now.getTime()-at>3600000||
  typeof c.maintenanceSecurityGroupId!=='string'||!/^sg-[a-f0-9]{17}$/.test(c.maintenanceSecurityGroupId)||c.maintenanceSecurityGroupId===originalGroup)throw new Error('Unapproved or stale maintenance context');
 const d=object(c.instance),s=object(c.snapshot),g=object(c.databaseSecurityGroup),endpoint=object(d.Endpoint),secret=object(d.MasterUserSecret),subnets=object(d.DBSubnetGroup);
 if(d.DBInstanceIdentifier!==original||d.DBInstanceArn!==`arn:aws:rds:us-east-1:720232346199:db:${original}`||d.DBInstanceStatus!=='available'||
  d.Engine!=='postgres'||d.EngineVersion!=='17.9'||d.StorageEncrypted!==true||d.PubliclyAccessible!==false||d.MultiAZ!==true||d.DeletionProtection!==true||
  d.AllocatedStorage!==20||d.BackupRetentionPeriod!==14||d.MasterUsername!=='orio_ledger_admin'||d.DBName!=='orio_control'||
  endpoint.Address!==original+'.cpa8oeo62tiq.us-east-1.rds.amazonaws.com'||endpoint.Port!==5432||
  subnets.VpcId!==vpc||subnets.DBSubnetGroupName!=='orio-spc-3-ledger-databasesubnets-sydsyf5mdayu'||
  secret.SecretArn!==originalSecret||secret.SecretStatus!=='active')throw new Error('Wrong or unsafe original database');
 const params=d.DBParameterGroups,groups=d.VpcSecurityGroups;
 if(!Array.isArray(params)||params.length!==1||object(params[0]).DBParameterGroupName!=='orio-spc-3-ledger-databaseparameters-tduugdetb77x'||object(params[0]).ParameterApplyStatus!=='in-sync'||
  !Array.isArray(groups)||groups.length!==1||object(groups[0]).VpcSecurityGroupId!==originalGroup||object(groups[0]).Status!=='active'||
  g.GroupId!==originalGroup||g.OwnerId!=='720232346199'||g.VpcId!==vpc||!Array.isArray(g.IpPermissions)||g.IpPermissions.length!==1)throw new Error('Original database boundary changed');
 const rule=object(g.IpPermissions[0]),pairs=rule.UserIdGroupPairs;
 if(rule.IpProtocol!=='tcp'||rule.FromPort!==5432||rule.ToPort!==5432||['IpRanges','Ipv6Ranges','PrefixListIds'].some(k=>!Array.isArray(rule[k])||rule[k].length!==0)||
  !Array.isArray(pairs)||pairs.length!==1)throw new Error('Unexpected original database ingress');
 const pair=object(pairs[0]);
 if(pair.GroupId!==c.maintenanceSecurityGroupId||pair.UserId!=='720232346199'||pair.VpcPeeringConnectionId!==undefined||
  (pair.VpcId!==undefined&&pair.VpcId!==vpc))throw new Error('Wrong maintenance ingress');
 const snapshotAt=typeof s.SnapshotCreateTime==='string'?Date.parse(s.SnapshotCreateTime):NaN;
 const latest=typeof d.LatestRestorableTime==='string'?Date.parse(d.LatestRestorableTime):NaN;
 if(s.DBSnapshotIdentifier!==checkpoint||s.DBSnapshotArn!==`arn:aws:rds:us-east-1:720232346199:snapshot:${checkpoint}`||s.DBInstanceIdentifier!==original||
  s.Status!=='available'||s.SnapshotType!=='manual'||s.Encrypted!==true||s.AllocatedStorage!==20||s.Engine!=='postgres'||s.EngineVersion!=='17.9'||s.VpcId!==vpc||
  typeof d.KmsKeyId!=='string'||!/^arn:aws:kms:us-east-1:720232346199:key\/[a-f0-9-]{36}$/.test(d.KmsKeyId)||s.KmsKeyId!==d.KmsKeyId||
  !Number.isFinite(snapshotAt)||snapshotAt>at+30000||at-snapshotAt>7200000||!Number.isFinite(latest)||latest>at+30000||at-latest>900000)throw new Error('Fresh recoverable checkpoint required');
 return Object.freeze({target:Object.freeze({host:endpoint.Address,secretArn:originalSecret,database:'orio_control',username:'orio_ledger_admin'}),
  baselineFingerprint:'8374196a216470ba79eb63c908ed801d8b0b04ba9a19859ae08919ca58a4f09d',expectedResultFingerprint:qualifiedResultFingerprint});
}
