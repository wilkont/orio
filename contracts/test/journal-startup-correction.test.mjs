import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {journalStartupCorrection,lambdaStartupKey} from '../../infrastructure/aws/journal-startup-correction.mjs';
const source=await readFile(new URL('../../infrastructure/aws/valuation-journal-private-lambda.json',import.meta.url),'utf8');
test('startup proposal changes only the role policy and retains the paused code-pinned six-resource service',()=>{
 const before=JSON.parse(source),after=journalStartupCorrection(source);
 const originalPolicy=before.Resources.JournalRole.Properties.Policies[0].PolicyDocument;
 const policy=after.Resources.JournalRole.Properties.Policies[0].PolicyDocument;
 assert.equal(Object.keys(after.Resources).length,6);
 const restored=structuredClone(after);restored.Resources.JournalRole.Properties.Policies[0].PolicyDocument=originalPolicy;
 assert.deepEqual(restored,before);
 assert.deepEqual(policy.Statement.slice(0,-5).at(-1).Action,['secretsmanager:GetSecretValue','rds-data:*','lambda:InvokeFunction','sts:AssumeRole']);
 const exception=policy.Statement.at(-1);
 assert.deepEqual(exception,{Sid:'AllowLambdaManagedStartupDecryption',Effect:'Allow',Action:'kms:Decrypt',Resource:lambdaStartupKey,
  Condition:{StringEquals:{'kms:ViaService':'lambda.us-east-1.amazonaws.com','kms:CallerAccount':'720232346199'}}});
 assert.deepEqual(policy.Statement.slice(-5).map(s=>s.Sid),['DenyEveryOtherKey','DenyOtherStartupKeyOperations','DenyDirectOrOtherServiceDecryption','DenyOtherAccountDecryption','AllowLambdaManagedStartupDecryption']);
 assert.throws(()=>journalStartupCorrection(source+' '));
});
