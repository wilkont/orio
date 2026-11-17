import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {metadataBootstrapContext} from '../src/metadata-bootstrap-context.ts';
import {metadataHost} from '../src/metadata-iam.ts';
const now=new Date('2026-11-17T20:00:00Z');
const template=JSON.parse(await readFile(new URL('../../../infrastructure/aws/hosted-sql-maintenance.json',import.meta.url),'utf8'));
const base={version:1,purpose:'APPROVED_PRIVATE_METADATA_READER',account:'720232346199',region:'us-east-1',principalArn:'arn:aws:iam::720232346199:root',observedAt:now.toISOString(),templateSha256:'4ebb302ea1679b9f721b8a0ce2d68144adaffe73fed2f262667b8731512bc61c',forceSsl:'1',
 instance:{DBInstanceIdentifier:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',DbiResourceId:'db-GDKQSO4LQYHC4WACUEYAGRFZNA',DBInstanceArn:'arn:aws:rds:us-east-1:720232346199:db:orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',DBInstanceStatus:'available',PendingModifiedValues:{},Engine:'postgres',EngineVersion:'17.9',DBInstanceClass:'db.t4g.medium',AllocatedStorage:20,StorageEncrypted:true,PubliclyAccessible:false,MultiAZ:true,DeletionProtection:true,BackupRetentionPeriod:14,IAMDatabaseAuthenticationEnabled:true,MasterUsername:'orio_ledger_admin',DBName:'orio_control',Endpoint:{Address:metadataHost,Port:5432},MasterUserSecret:{SecretArn:'arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7',SecretStatus:'active'},DBSubnetGroup:{VpcId:'vpc-05613af21236d6911',DBSubnetGroupName:'orio-spc-3-ledger-databasesubnets-sydsyf5mdayu'},VpcSecurityGroups:[{VpcSecurityGroupId:'sg-030c057c133762083',Status:'active'}],DBParameterGroups:[{DBParameterGroupName:'orio-spc-3-ledger-databaseparameters-tduugdetb77x',ParameterApplyStatus:'in-sync'}]},
 maintenanceStack:{StackId:'arn:aws:cloudformation:us-east-1:720232346199:stack/orio-spc-3-sql-maintenance/12345678-1234-1234-1234-123456789012',StackStatus:'CREATE_COMPLETE'},
 resources:Object.entries<{Type:string}>(template.Resources).map(([name,value])=>({LogicalResourceId:name,ResourceType:value.Type,ResourceStatus:'CREATE_COMPLETE',PhysicalResourceId:name==='AuditSecurityGroup'?'sg-11111111111111111':name})),
 databaseSecurityGroup:{GroupId:'sg-030c057c133762083',OwnerId:'720232346199',VpcId:'vpc-05613af21236d6911',IpPermissions:[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,IpRanges:[],Ipv6Ranges:[],PrefixListIds:[],UserIdGroupPairs:[{GroupId:'sg-11111111111111111',UserId:'720232346199'}]}]},
 restoreWindow:{EarliestTime:'2026-11-11T01:12:25Z',LatestTime:'2026-11-17T19:58:00Z'}};
test('fresh exact private metadata context returns only the pinned original secret target',()=>{
 const result=metadataBootstrapContext(structuredClone(base),now);
 assert.equal(result.host,metadataHost);assert.equal(result.database,'orio_control');assert.equal(result.username,'orio_ledger_admin');assert.equal(Object.isFrozen(result),true);
});
test('stale credentials context, changed source protections and extra network access reject before secrets',()=>{
 const changes:Array<(v:typeof base)=>void>=[
  v=>{v.observedAt='2026-11-17T19:44:59Z';},v=>{v.observedAt='2026-11-17T20:01:00Z';},v=>{v.account='710096437887';},v=>{v.region='us-west-2';},v=>{v.principalArn+='-other';},v=>{v.purpose='ORIGINAL_SQL_MAINTENANCE';},
  v=>{v.instance.DbiResourceId+='-other';},v=>{v.instance.Endpoint.Address+='-other';},v=>{v.instance.MasterUserSecret.SecretArn+='-other';},v=>{v.instance.PubliclyAccessible=true;},v=>{v.instance.IAMDatabaseAuthenticationEnabled=false;},v=>{v.instance.StorageEncrypted=false;},v=>{v.instance.BackupRetentionPeriod=0;},v=>{v.instance.PendingModifiedValues={EngineVersion:'18'};},v=>{v.forceSsl='0';},v=>{v.instance.DBParameterGroups[0]!.ParameterApplyStatus='pending-reboot';},
  v=>{v.databaseSecurityGroup.IpPermissions.push(structuredClone(v.databaseSecurityGroup.IpPermissions[0]!));},v=>{v.databaseSecurityGroup.IpPermissions[0]!.ToPort=65535;},v=>{v.databaseSecurityGroup.IpPermissions[0]!.UserIdGroupPairs[0]!.UserId='710096437887';},
  v=>{v.resources.pop();},v=>{v.resources[0]!.ResourceType='AWS::IAM::Role';},v=>{v.resources[0]!.LogicalResourceId=v.resources[1]!.LogicalResourceId;},v=>{v.maintenanceStack.StackStatus='DELETE_COMPLETE';},v=>{v.restoreWindow.LatestTime='2026-11-17T19:40:00Z';}
 ];
 for(const change of changes){const value=structuredClone(base);change(value);assert.throws(()=>metadataBootstrapContext(value,now));}
 assert.throws(()=>metadataBootstrapContext(base,new Date('invalid')));
});
