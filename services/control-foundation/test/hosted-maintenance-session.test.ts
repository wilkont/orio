import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {hostedMaintenanceSession,maintenanceTemplateSha256,successfulRehearsalSha256,qualifiedResultFingerprint} from '../src/hosted-maintenance-session.ts';
const now=new Date('2026-11-17T02:00:00Z'),group='sg-0123456789abcdef0';
const id='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',dbGroup='sg-030c057c133762083';
function fixture(){return {version:1,purpose:'ORIGINAL_SQL_MAINTENANCE',account:'720232346199',region:'us-east-1',
 stackArn:'arn:aws:cloudformation:us-east-1:720232346199:stack/orio-spc-3-sql-maintenance/00000000-0000-0000-0000-000000000000',
 templateSha256:maintenanceTemplateSha256,rehearsalReportSha256:successfulRehearsalSha256,observedAt:now.toISOString(),maintenanceSecurityGroupId:group,
 instance:{DBInstanceIdentifier:id,DBInstanceArn:'arn:aws:rds:us-east-1:720232346199:db:'+id,DBInstanceStatus:'available',Engine:'postgres',EngineVersion:'17.9',
  StorageEncrypted:true,PubliclyAccessible:false,MultiAZ:true,DeletionProtection:true,AllocatedStorage:20,BackupRetentionPeriod:14,MasterUsername:'orio_ledger_admin',DBName:'orio_control',
  KmsKeyId:'arn:aws:kms:us-east-1:720232346199:key/00000000-0000-0000-0000-000000000000',LatestRestorableTime:'2026-11-17T01:58:00Z',
  Endpoint:{Address:id+'.cpa8oeo62tiq.us-east-1.rds.amazonaws.com',Port:5432},DBSubnetGroup:{VpcId:'vpc-05613af21236d6911',DBSubnetGroupName:'orio-spc-3-ledger-databasesubnets-sydsyf5mdayu'},
  DBParameterGroups:[{DBParameterGroupName:'orio-spc-3-ledger-databaseparameters-tduugdetb77x',ParameterApplyStatus:'in-sync'}],VpcSecurityGroups:[{VpcSecurityGroupId:dbGroup,Status:'active'}],
  MasterUserSecret:{SecretStatus:'active',SecretArn:'arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7'}},
 snapshot:{DBSnapshotIdentifier:'orio-spc-3-pre-upgrade-20261117',DBSnapshotArn:'arn:aws:rds:us-east-1:720232346199:snapshot:orio-spc-3-pre-upgrade-20261117',DBInstanceIdentifier:id,
  Status:'available',SnapshotType:'manual',Encrypted:true,AllocatedStorage:20,Engine:'postgres',EngineVersion:'17.9',VpcId:'vpc-05613af21236d6911',
  SnapshotCreateTime:'2026-11-17T01:50:00Z',KmsKeyId:'arn:aws:kms:us-east-1:720232346199:key/00000000-0000-0000-0000-000000000000'},
 databaseSecurityGroup:{GroupId:dbGroup,OwnerId:'720232346199',VpcId:'vpc-05613af21236d6911',IpPermissions:[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,IpRanges:[] as object[],Ipv6Ranges:[],PrefixListIds:[],UserIdGroupPairs:[{GroupId:group,UserId:'720232346199'}]}]}};}
test('original maintenance pins an immutable original target and successful real rehearsal evidence',()=>{
 const c=fixture(),s=hostedMaintenanceSession(c,now);assert.equal(s.expectedResultFingerprint,qualifiedResultFingerprint);
 assert.equal(s.target.host,id+'.cpa8oeo62tiq.us-east-1.rds.amazonaws.com');c.instance.Endpoint.Address='changed.example';
 assert.notEqual(s.target.host,c.instance.Endpoint.Address);assert.equal(Reflect.set(s.target,'host','changed.example'),false);
});
test('clone approval, substituted evidence, stale contexts and another stack cannot authorize original maintenance',()=>{
 for(const change of [{purpose:'QUALIFICATION'},{account:'710096437887'},{templateSha256:'0'.repeat(64)},{rehearsalReportSha256:'0'.repeat(64)},
  {observedAt:'2026-11-17T00:00:00Z'},{observedAt:'2026-11-17T02:01:00Z'},{stackArn:'arn:aws:cloudformation:us-east-1:720232346199:stack/orio-spc-3-sql-qualification/00000000-0000-0000-0000-000000000000'}]){
  assert.throws(()=>hostedMaintenanceSession({...fixture(),...change},now));
 }
});
test('original endpoint and secret substitution or reduced database protections fail before credential retrieval',()=>{
 const mutations=[(c:ReturnType<typeof fixture>)=>{c.instance.Endpoint.Address='another.example';},
  (c:ReturnType<typeof fixture>)=>{c.instance.MasterUserSecret.SecretArn+='other';},
  (c:ReturnType<typeof fixture>)=>{c.instance.MultiAZ=false;},(c:ReturnType<typeof fixture>)=>{c.instance.DeletionProtection=false;},
  (c:ReturnType<typeof fixture>)=>{c.instance.PubliclyAccessible=true;},(c:ReturnType<typeof fixture>)=>{c.instance.BackupRetentionPeriod=0;},
  (c:ReturnType<typeof fixture>)=>{c.instance.DBParameterGroups[0]!.ParameterApplyStatus='pending-reboot';}];
 for(const mutate of mutations){const c=fixture();mutate(c);assert.throws(()=>hostedMaintenanceSession(c,now));}
});
test('only one narrow maintenance group ingress is accepted; CIDR and extra sources fail',()=>{
 const cidr=fixture();cidr.databaseSecurityGroup.IpPermissions[0]!.IpRanges.push({CidrIp:'0.0.0.0/0'});assert.throws(()=>hostedMaintenanceSession(cidr,now));
 const extra=fixture();extra.databaseSecurityGroup.IpPermissions[0]!.UserIdGroupPairs.push({GroupId:'sg-11111111111111111',UserId:'720232346199'});assert.throws(()=>hostedMaintenanceSession(extra,now));
 const self=fixture();self.maintenanceSecurityGroupId=dbGroup;assert.throws(()=>hostedMaintenanceSession(self,now));
});
test('a stale or unrelated checkpoint and missing recent point-in-time recovery block maintenance',()=>{
 for(const change of [{SnapshotCreateTime:'2026-11-16T20:00:00Z'},{SnapshotCreateTime:'2026-11-17T02:01:00Z'},{DBInstanceIdentifier:'another'},
  {Encrypted:false},{Status:'creating'},{KmsKeyId:'another'}]){const c=fixture();Object.assign(c.snapshot,change);assert.throws(()=>hostedMaintenanceSession(c,now));}
 const c=fixture();c.instance.LatestRestorableTime='2026-11-17T01:00:00Z';assert.throws(()=>hostedMaintenanceSession(c,now));
});
test('maintenance template has ten additions, no replacement database or IAM grant, and the pinned digest',async()=>{
 const text=(await readFile(new URL('../../../infrastructure/aws/hosted-sql-maintenance.json',import.meta.url),'utf8')).replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(text).digest('hex'),maintenanceTemplateSha256);
 const t=JSON.parse(text);assert.equal(Object.keys(t.Resources).length,10);
 assert.ok(Object.values(t.Resources).every((r:unknown)=>r!==null&&typeof r==='object'&&'Type' in r&&typeof r.Type==='string'&&!r.Type.startsWith('AWS::IAM::')&&r.Type!=='AWS::RDS::DBInstance'));
 assert.equal(t.Resources.DatabaseIngress.Properties.GroupId,dbGroup);
 assert.equal(t.Resources.SecretsEndpoint.Properties.PolicyDocument.Statement[0].Resource,fixture().instance.MasterUserSecret.SecretArn);
});
