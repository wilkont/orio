import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {journalOriginalContext,journalOriginalBaseline,journalQualifiedCatalog,journalQualifiedReportSha256} from '../src/journal-original-context.ts';
import {metadataHost} from '../src/metadata-iam.ts';
const now=new Date('2026-11-18T03:15:00Z');
const template=JSON.parse(await readFile(new URL('../../../infrastructure/aws/hosted-sql-maintenance.json',import.meta.url),'utf8'));
const base={version:1,purpose:'APPROVED_ORIGINAL_VALUATION_JOURNAL',rehearsalReportSha256:journalQualifiedReportSha256,account:'720232346199',region:'us-east-1',principalArn:'arn:aws:iam::720232346199:root',observedAt:now.toISOString(),templateSha256:'4ebb302ea1679b9f721b8a0ce2d68144adaffe73fed2f262667b8731512bc61c',forceSsl:'1',
 instance:{DBInstanceIdentifier:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',DbiResourceId:'db-GDKQSO4LQYHC4WACUEYAGRFZNA',DBInstanceArn:'arn:aws:rds:us-east-1:720232346199:db:orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',DBInstanceStatus:'available',PendingModifiedValues:{},Engine:'postgres',EngineVersion:'17.9',DBInstanceClass:'db.t4g.medium',AllocatedStorage:20,StorageEncrypted:true,PubliclyAccessible:false,MultiAZ:true,DeletionProtection:true,BackupRetentionPeriod:14,IAMDatabaseAuthenticationEnabled:true,MasterUsername:'orio_ledger_admin',DBName:'orio_control',Endpoint:{Address:metadataHost,Port:5432},MasterUserSecret:{SecretArn:'arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7',SecretStatus:'active'},DBSubnetGroup:{VpcId:'vpc-05613af21236d6911',DBSubnetGroupName:'orio-spc-3-ledger-databasesubnets-sydsyf5mdayu'},VpcSecurityGroups:[{VpcSecurityGroupId:'sg-030c057c133762083',Status:'active'}],DBParameterGroups:[{DBParameterGroupName:'orio-spc-3-ledger-databaseparameters-tduugdetb77x',ParameterApplyStatus:'in-sync'}]},
 maintenanceStack:{StackId:'arn:aws:cloudformation:us-east-1:720232346199:stack/orio-spc-3-sql-maintenance/12345678-1234-1234-1234-123456789012',StackStatus:'CREATE_COMPLETE'},
 resources:Object.entries<{Type:string}>(template.Resources).map(([name,value])=>({LogicalResourceId:name,ResourceType:value.Type,ResourceStatus:'CREATE_COMPLETE',PhysicalResourceId:name==='AuditSecurityGroup'?'sg-11111111111111111':name})),
 databaseSecurityGroup:{GroupId:'sg-030c057c133762083',OwnerId:'720232346199',VpcId:'vpc-05613af21236d6911',IpPermissions:[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,IpRanges:[],Ipv6Ranges:[],PrefixListIds:[],UserIdGroupPairs:[{GroupId:'sg-11111111111111111',UserId:'720232346199'}]}]},
 restoreWindow:{EarliestTime:'2026-11-11T01:12:25Z',LatestTime:'2026-11-18T03:13:00Z'}};
const kms='arn:aws:kms:us-east-1:720232346199:key/12345678-1234-1234-1234-123456789abc';
function fixture(){const v=structuredClone(base);return {...v,instance:{...v.instance,KmsKeyId:kms},
 databaseSecurityGroup:{...v.databaseSecurityGroup,IpPermissions:[...v.databaseSecurityGroup.IpPermissions,
 {IpProtocol:'tcp',FromPort:5432,ToPort:5432,IpRanges:[],Ipv6Ranges:[],PrefixListIds:[],UserIdGroupPairs:[{GroupId:'sg-035e5f2d33504884b',UserId:'720232346199'}]}]},
 recoveryCheckpoint:{DBSnapshotIdentifier:'orio-spc-3-pre-journal-upgrade-20261118',DBSnapshotArn:'arn:aws:rds:us-east-1:720232346199:snapshot:orio-spc-3-pre-journal-upgrade-20261118',DBInstanceIdentifier:v.instance.DBInstanceIdentifier,
 SnapshotCreateTime:'2026-11-18T03:13:00Z',Status:'available',SnapshotType:'manual',Encrypted:true,Engine:'postgres',EngineVersion:'17.9',AllocatedStorage:20,VpcId:'vpc-05613af21236d6911',KmsKeyId:kms}};}
test('separate original journal context pins fresh recovery and both actual allowed ingress sources',()=>{
 const r=journalOriginalContext(fixture(),now);assert.equal(r.target.host,metadataHost);assert.equal(r.target.username,'orio_ledger_admin');
 assert.equal(r.baselineFingerprint,journalOriginalBaseline);assert.equal(r.expectedResultFingerprint,journalQualifiedCatalog);
 assert.equal(Object.isFrozen(r.target),true);
});
test('clone approval, stale recovery, original substitution and altered network boundaries reject before secret access',()=>{
 const changes:Array<(v:ReturnType<typeof fixture>)=>void>=[
 v=>{v.purpose='VALUATION_JOURNAL_REHEARSAL';},v=>{v.rehearsalReportSha256='0'.repeat(64);},v=>{v.observedAt='2026-11-18T02:59:59Z';},
 v=>{v.recoveryCheckpoint.SnapshotCreateTime='2026-11-18T01:14:59Z';},v=>{v.recoveryCheckpoint.Encrypted=false;},v=>{v.recoveryCheckpoint.KmsKeyId+='-other';},
 v=>{v.instance.DbiResourceId+='-other';},v=>{v.instance.MasterUserSecret.SecretArn+='-other';},v=>{v.instance.IAMDatabaseAuthenticationEnabled=false;},v=>{v.forceSsl='0';},
 v=>{v.databaseSecurityGroup.IpPermissions.pop();},v=>{v.databaseSecurityGroup.IpPermissions[1]!.UserIdGroupPairs[0]!.GroupId='sg-22222222222222222';},
 v=>{v.databaseSecurityGroup.IpPermissions[1]=structuredClone(v.databaseSecurityGroup.IpPermissions[0]!);},v=>{v.databaseSecurityGroup.IpPermissions[0]!.ToPort=65535;},
 v=>{v.resources.pop();},v=>{v.principalArn+='-other';},v=>{v.instance.PubliclyAccessible=true;},v=>{v.restoreWindow.LatestTime='2026-11-18T02:59:59Z';}];
 for(const change of changes){const v=fixture();change(v);assert.throws(()=>journalOriginalContext(v,now));}
});

test('AWS grouped ingress preserves exactly the two approved sources and rejects added or duplicate pairs',()=>{
 const v=fixture(),rules=v.databaseSecurityGroup.IpPermissions;
 rules[0]!.UserIdGroupPairs.push(...rules[1]!.UserIdGroupPairs);rules.pop();
 assert.equal(journalOriginalContext(v,now).target.host,metadataHost);
 for(const pair of [{GroupId:'sg-22222222222222222',UserId:'720232346199'},structuredClone(rules[0]!.UserIdGroupPairs[0]!)]){
  const changed=structuredClone(v);changed.databaseSecurityGroup.IpPermissions[0]!.UserIdGroupPairs.push(pair);
  assert.throws(()=>journalOriginalContext(changed,now));
 }
 const duplicate=structuredClone(v);duplicate.databaseSecurityGroup.IpPermissions[0]!.UserIdGroupPairs[1]=structuredClone(rules[0]!.UserIdGroupPairs[0]!);
 assert.throws(()=>journalOriginalContext(duplicate,now));
});
