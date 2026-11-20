import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autonomousQualificationSession,qualificationTemplateSha256} from '../src/autonomous-qualification-session.ts';
import {journalQualifiedCatalog} from '../src/journal-original-context.ts';
const now=new Date('2026-11-20T17:00:00Z'),maintenance='sg-0123456789abcdef1';
function fixture(){return {
 version:1,purpose:'AUTONOMOUS_SCHEMA_REHEARSAL',account:'720232346199',region:'us-east-1',observedAt:now.toISOString(),templateSha256:qualificationTemplateSha256,
 stackArn:'arn:aws:cloudformation:us-east-1:720232346199:stack/orio-spc-3-sql-qualification/00000000-0000-0000-0000-000000000000',maintenanceSecurityGroupId:maintenance,
 instance:{DBInstanceIdentifier:'orio-spc-3-restore-qualification-20261116',DBInstanceArn:'arn:aws:rds:us-east-1:720232346199:db:orio-spc-3-restore-qualification-20261116',DBInstanceStatus:'available',Engine:'postgres',EngineVersion:'17.9',StorageEncrypted:true,PubliclyAccessible:false,MultiAZ:false,AllocatedStorage:20,BackupRetentionPeriod:0,MasterUsername:'orio_ledger_admin',DBName:'orio_control',
  Endpoint:{Address:'orio-spc-3-restore-qualification-20261116.example.us-east-1.rds.amazonaws.com',Port:5432},DBSubnetGroup:{VpcId:'vpc-05613af21236d6911',DBSubnetGroupName:'orio-spc-3-ledger-databasesubnets-sydsyf5mdayu'},
  DBParameterGroups:[{DBParameterGroupName:'orio-spc-3-ledger-databaseparameters-tduugdetb77x',ParameterApplyStatus:'in-sync'}],VpcSecurityGroups:[{VpcSecurityGroupId:'sg-0123456789abcdef0',Status:'active'}],
  MasterUserSecret:{SecretArn:'arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-00000000-0000-0000-0000-000000000000-Ab1234',SecretStatus:'active'}},
 snapshot:{DBSnapshotIdentifier:'orio-spc-3-restore-checkpoint-20261116',DBSnapshotArn:'arn:aws:rds:us-east-1:720232346199:snapshot:orio-spc-3-restore-checkpoint-20261116',DBInstanceIdentifier:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',Status:'available',SnapshotType:'manual',Encrypted:true,AllocatedStorage:20,Engine:'postgres',EngineVersion:'17.9',VpcId:'vpc-05613af21236d6911',SnapshotCreateTime:now.toISOString()},
 cloneSecurityGroup:{GroupId:'sg-0123456789abcdef0',OwnerId:'720232346199',VpcId:'vpc-05613af21236d6911',IpPermissions:[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,IpRanges:[],Ipv6Ranges:[],PrefixListIds:[],UserIdGroupPairs:[{GroupId:maintenance,UserId:'720232346199'}]}]},
 metadataReaderSecurityGroupId:'sg-035e5f2d33504884b',journalSecurityGroupId:'sg-22222222222222222',
 originalInstance:{DBInstanceIdentifier:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',DBInstanceStatus:'available',StorageEncrypted:true,PubliclyAccessible:false,DeletionProtection:true,BackupRetentionPeriod:14,IAMDatabaseAuthenticationEnabled:true},
 originalSecurityGroup:{GroupId:'sg-030c057c133762083',OwnerId:'720232346199',VpcId:'vpc-05613af21236d6911',IpPermissions:[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,IpRanges:[],Ipv6Ranges:[],PrefixListIds:[],UserIdGroupPairs:[{GroupId:'sg-035e5f2d33504884b',UserId:'720232346199'},{GroupId:'sg-22222222222222222',UserId:'720232346199'}]}]}
 };}
test('autonomous rehearsal admits only the fresh private clone while preserving both original service sources',()=>{
 const accepted=autonomousQualificationSession(fixture(),now);assert.equal(accepted.baselineFingerprint,journalQualifiedCatalog);
 assert.match(accepted.target.host,/restore-qualification/);
 const changes:Array<(v:ReturnType<typeof fixture>)=>void>=[
  v=>{v.purpose='VALUATION_JOURNAL_REHEARSAL';},v=>{v.snapshot.SnapshotCreateTime='2026-11-20T10:00:00Z';},
  v=>{v.originalSecurityGroup.IpPermissions[0]!.UserIdGroupPairs.push({GroupId:maintenance,UserId:'720232346199'});},
  v=>{v.instance.Endpoint.Address='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com';},
  v=>{v.originalInstance.IAMDatabaseAuthenticationEnabled=false;},v=>{v.metadataReaderSecurityGroupId='sg-11111111111111111';},
  v=>{v.instance.MasterUserSecret.SecretArn='arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7';}
 ];
 for(const change of changes){const value=fixture();change(value);assert.throws(()=>autonomousQualificationSession(value,now));}
});
