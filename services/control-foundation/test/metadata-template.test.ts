import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('private qualification template cannot expose a public function or financial authority',async()=>{
 const text=await readFile(new URL('../../../infrastructure/aws/metadata-private-lambda.json',import.meta.url),'utf8'),template=JSON.parse(text),r=template.Resources;
 assert.equal(Object.keys(r).length,5);
 const f=r.MetadataFunction.Properties;
 assert.equal(f.Runtime,'nodejs24.x');assert.equal(f.ReservedConcurrentExecutions,1);assert.equal(f.Timeout,10);assert.equal(f.MemorySize,256);
 assert.equal(f.Environment.Variables.ORIO_DATABASE_USER,'orio_protocol_reader');
 assert.equal(f.FunctionName,'orio-spc-3-protocol-metadata');
 assert.deepEqual(r.ReaderSecurityGroup.Properties.SecurityGroupEgress,[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,DestinationSecurityGroupId:'sg-030c057c133762083'}]);
 assert.deepEqual(r.DatabaseIngress.Properties.SourceSecurityGroupId,{Ref:'ReaderSecurityGroup'});
 const statements=r.MetadataRole.Properties.Policies[0].PolicyDocument.Statement;
 assert.equal(statements[0].Action,'rds-db:connect');
 assert.equal(statements[0].Resource,'arn:aws:rds-db:us-east-1:720232346199:dbuser:db-GDKQSO4LQYHC4WACUEYAGRFZNA/orio_protocol_reader');
 assert.equal(statements[3].Effect,'Deny');assert.equal(statements[3].Condition.ArnEquals['lambda:SourceFunctionArn'],'arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-protocol-metadata');
 for(const forbidden of ['AWS::ApiGateway','AWS::Lambda::Url','AWS::Lambda::Permission','secretsmanager:','kms:','0.0.0.0/0','orio_ledger_admin','rds:*'])assert.equal(text.includes(forbidden),false);
 assert.ok(f.Code.S3ObjectVersion);assert.equal(r.MetadataLogs.Properties.RetentionInDays,7);
});
test('artifact bucket is encrypted, owner enforced and versioned with no public grants',async()=>{
 const t=JSON.parse(await readFile(new URL('../../../infrastructure/aws/metadata-artifacts.json',import.meta.url),'utf8'));
 const p=t.Resources.Artifacts.Properties;
 assert.equal(p.BucketName,'orio-metadata-artifacts-720232346199-us-east-1');
 assert.equal(p.VersioningConfiguration.Status,'Enabled');
 assert.deepEqual(p.OwnershipControls.Rules,[{ObjectOwnership:'BucketOwnerEnforced'}]);
 assert.equal(p.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm,'AES256');
 assert.deepEqual(Object.values(p.PublicAccessBlockConfiguration),[true,true,true,true]);
 assert.deepEqual(t.Resources.TransportPolicy.Properties.PolicyDocument.Statement.map((s:{Effect:string})=>s.Effect),['Deny']);
});
