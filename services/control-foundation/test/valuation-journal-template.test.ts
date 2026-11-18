import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('prepared journal is paused, private, version-pinned and has no signing, secret or direct table permission',async()=>{
 const t=JSON.parse(await readFile(new URL('../../../infrastructure/aws/valuation-journal-private-lambda.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(t.Resources).sort(),['DatabaseIngress','JournalFunction','JournalLogs','JournalRole','JournalSecurityGroup','JournalVersion']);
 const f=t.Resources.JournalFunction.Properties,r=t.Resources.JournalRole.Properties;
 assert.equal(f.FunctionName,'orio-spc-3-valuation-journal');
 assert.deepEqual(f.ReservedConcurrentExecutions,{Ref:'QualificationConcurrency'});
 assert.deepEqual(t.Parameters.QualificationConcurrency.AllowedValues,[0,1]);assert.equal(t.Parameters.QualificationConcurrency.Default,0);
 assert.equal(f.Handler,'src/valuation-journal-lambda-entry.handler');assert.equal(f.Environment.Variables.ORIO_DATABASE_USER,'orio_valuation_journal');
 assert.equal(f.Environment.Variables.ORIO_JOURNAL_MODE,'SCOPED_QUALIFICATION_IAM');
 assert.equal(t.Resources.JournalVersion.Properties.CodeSha256,'VQ8lCuZRNyvEodHHVZaXD0KB8YZnqJNL6h8LCecDMzU=');
 assert.deepEqual(t.Resources.DatabaseIngress.Properties,{GroupId:'sg-030c057c133762083',IpProtocol:'tcp',FromPort:5432,ToPort:5432,SourceSecurityGroupId:{Ref:'JournalSecurityGroup'}});
 assert.deepEqual(t.Resources.JournalSecurityGroup.Properties.SecurityGroupEgress,[{IpProtocol:'tcp',FromPort:5432,ToPort:5432,DestinationSecurityGroupId:'sg-030c057c133762083'}]);
 const statements=r.Policies[0].PolicyDocument.Statement;
 assert.equal(statements.find((s:{Action:unknown})=>s.Action==='rds-db:connect').Resource,
  'arn:aws:rds-db:us-east-1:720232346199:dbuser:db-GDKQSO4LQYHC4WACUEYAGRFZNA/orio_valuation_journal');
 assert.deepEqual(statements.at(-1),{Effect:'Deny',Action:['kms:*','secretsmanager:GetSecretValue','rds-data:*','lambda:InvokeFunction','sts:AssumeRole'],Resource:'*'});
 assert.equal(Object.values(t.Resources).some((r:unknown)=>typeof r==='object'&&r!==null&&'Type' in r&&
  ['AWS::Lambda::Url','AWS::Lambda::Permission','AWS::IAM::AccessKey','AWS::ApiGatewayV2::Api','AWS::KMS::Key'].includes(String(r.Type))),false);
 assert.equal(JSON.stringify(t).includes('0.0.0.0/0'),false);
});
