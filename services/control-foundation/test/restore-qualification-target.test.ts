import {test} from 'node:test';
import assert from 'node:assert/strict';
import {qualificationTarget} from '../src/restore-qualification-target.ts';
const instance={DBInstanceIdentifier:'orio-spc-3-restore-qualification-20261116',DBInstanceArn:'arn:aws:rds:us-east-1:720232346199:db:orio-spc-3-restore-qualification-20261116',DBInstanceStatus:'available',
 Engine:'postgres',EngineVersion:'17.9',StorageEncrypted:true,PubliclyAccessible:false,MultiAZ:false,AllocatedStorage:20,BackupRetentionPeriod:0,MasterUsername:'orio_ledger_admin',DBName:'orio_control',
 Endpoint:{Address:'orio-spc-3-restore-qualification-20261116.example.us-east-1.rds.amazonaws.com',Port:5432},
 DBSubnetGroup:{VpcId:'vpc-05613af21236d6911',DBSubnetGroupName:'orio-spc-3-ledger-databasesubnets-sydsyf5mdayu'},
 DBParameterGroups:[{DBParameterGroupName:'orio-spc-3-ledger-databaseparameters-tduugdetb77x',ParameterApplyStatus:'in-sync'}],
 VpcSecurityGroups:[{VpcSecurityGroupId:'sg-0123456789abcdef0',Status:'active'}],
 MasterUserSecret:{SecretArn:'arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-00000000-0000-0000-0000-000000000000-Ab1234',SecretStatus:'active'}};
const snapshot={DBSnapshotIdentifier:'orio-spc-3-restore-checkpoint-20261116',DBSnapshotArn:'arn:aws:rds:us-east-1:720232346199:snapshot:orio-spc-3-restore-checkpoint-20261116',
 DBInstanceIdentifier:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',Status:'available',SnapshotType:'manual',Encrypted:true,AllocatedStorage:20,Engine:'postgres',EngineVersion:'17.9',VpcId:'vpc-05613af21236d6911'};
const group={GroupId:'sg-0123456789abcdef0',OwnerId:'720232346199',VpcId:'vpc-05613af21236d6911',IpPermissions:[]};
test('only the exact isolated restored target passes metadata validation',()=>{
 assert.equal(qualificationTarget(instance,snapshot,group).host,instance.Endpoint.Address);
 for(const change of [{DBInstanceIdentifier:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'},{PubliclyAccessible:true},{StorageEncrypted:false},{MultiAZ:true},{AllocatedStorage:40},{BackupRetentionPeriod:14},{DBName:'another_database'},
  {DBInstanceArn:instance.DBInstanceArn.replace('720232346199','710096437887')},{Endpoint:{...instance.Endpoint,Address:'original.example.us-east-1.rds.amazonaws.com'}},
  {DBParameterGroups:[]},{MasterUserSecret:{...instance.MasterUserSecret,SecretArn:'arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7'}}]){
  assert.throws(()=>qualificationTarget({...instance,...change},snapshot,group));
 }
});
test('source substitution and unexpected access are rejected before any connection',()=>{
 for(const change of [{DBInstanceIdentifier:'another_source'},{Encrypted:false},{SnapshotType:'shared'},{DBSnapshotArn:snapshot.DBSnapshotArn.replace('us-east-1','us-west-2')}])assert.throws(()=>qualificationTarget(instance,{...snapshot,...change},group));
 assert.throws(()=>qualificationTarget(instance,snapshot,{...group,IpPermissions:[{FromPort:5432}]}));
 assert.throws(()=>qualificationTarget(instance,snapshot,{...group,GroupId:'sg-030c057c133762083'}));
 assert.throws(()=>qualificationTarget(instance,snapshot,{...group,OwnerId:'710096437887'}));
 for(const bad of [null,[],{},'unexpected'])assert.throws(()=>qualificationTarget(bad,snapshot,group));
});
