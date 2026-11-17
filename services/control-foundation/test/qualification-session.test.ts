import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualificationSession,qualificationPassword,qualificationTemplateSha256,observedHostedBaseline} from '../src/qualification-session.ts';
const arn='arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-00000000-0000-0000-0000-000000000000-Ab1234';
const now=new Date('2026-11-16T20:00:00Z'),maintenance='sg-0123456789abcdef1';
function fixture(){return {version:1,account:'720232346199',region:'us-east-1',stackArn:'arn:aws:cloudformation:us-east-1:720232346199:stack/orio-spc-3-sql-qualification/00000000-0000-0000-0000-000000000000',
 templateSha256:qualificationTemplateSha256,observedAt:now.toISOString(),maintenanceSecurityGroupId:maintenance,
 instance:{DBInstanceIdentifier:'orio-spc-3-restore-qualification-20261116',DBInstanceArn:'arn:aws:rds:us-east-1:720232346199:db:orio-spc-3-restore-qualification-20261116',DBInstanceStatus:'available',
  Engine:'postgres',EngineVersion:'17.9',StorageEncrypted:true,PubliclyAccessible:false,MultiAZ:false,AllocatedStorage:20,BackupRetentionPeriod:0,MasterUsername:'orio_ledger_admin',DBName:'orio_control',
  Endpoint:{Address:'orio-spc-3-restore-qualification-20261116.example.us-east-1.rds.amazonaws.com',Port:5432},DBSubnetGroup:{VpcId:'vpc-05613af21236d6911',DBSubnetGroupName:'orio-spc-3-ledger-databasesubnets-sydsyf5mdayu'},
  DBParameterGroups:[{DBParameterGroupName:'orio-spc-3-ledger-databaseparameters-tduugdetb77x',ParameterApplyStatus:'in-sync'}],VpcSecurityGroups:[{VpcSecurityGroupId:'sg-0123456789abcdef0',Status:'active'}],MasterUserSecret:{SecretArn:arn,SecretStatus:'active'}},
 snapshot:{DBSnapshotIdentifier:'orio-spc-3-restore-checkpoint-20261116',DBSnapshotArn:'arn:aws:rds:us-east-1:720232346199:snapshot:orio-spc-3-restore-checkpoint-20261116',DBInstanceIdentifier:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',Status:'available',SnapshotType:'manual',Encrypted:true,AllocatedStorage:20,Engine:'postgres',EngineVersion:'17.9',VpcId:'vpc-05613af21236d6911'},
 cloneSecurityGroup:{GroupId:'sg-0123456789abcdef0',OwnerId:'720232346199',VpcId:'vpc-05613af21236d6911',IpPermissions:[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,IpRanges:[],Ipv6Ranges:[],PrefixListIds:[],UserIdGroupPairs:[{GroupId:maintenance,UserId:'720232346199'}]}]}};}
test('fresh authenticated context pins an immutable clone descriptor and the observed hosted baseline',()=>{
 const context=fixture(),session=qualificationSession(context,now);
 assert.equal(session.baselineFingerprint,observedHostedBaseline);assert.equal(session.target.secretArn,arn);
 context.instance.Endpoint.Address='changed.example';assert.match(session.target.host,/^orio-spc-3-restore-qualification-/);
 assert.equal(Reflect.set(session.target,'host','changed.example'),false);
});
test('stale contexts, another stack, modified templates and original endpoint substitution fail before secret access',()=>{
 for(const change of [{observedAt:'2026-11-16T18:00:00Z'},{observedAt:'2026-11-16T20:01:00Z'},{templateSha256:'0'.repeat(64)},{stackArn:'arn:aws:cloudformation:us-east-1:720232346199:stack/original/00000000-0000-0000-0000-000000000000'},{account:'710096437887'}])assert.throws(()=>qualificationSession({...fixture(),...change},now));
 const context=fixture();context.instance.Endpoint.Address='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com';assert.throws(()=>qualificationSession(context,now));
});
test('only the exact secret and username produce a sensitive password; supplied hosts cannot redirect it',()=>{
 const password='synthetic!%:/?@pass',response={ARN:arn,SecretString:JSON.stringify({username:'orio_ledger_admin',password,host:'untrusted.example',dbname:'another'})};
 assert.equal(qualificationPassword(response,arn),password);
 for(const value of [{...response,ARN:arn+'other'},{...response,SecretString:'invalid'},{...response,SecretString:JSON.stringify({username:'postgres',password})}]){
  assert.throws(()=>qualificationPassword(value,arn),e=>e instanceof Error&&!e.message.includes(password)&&!e.message.includes('untrusted.example'));
 }
});
