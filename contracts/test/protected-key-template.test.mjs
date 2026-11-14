import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
const template=JSON.parse(await readFile(new URL('../../infrastructure/aws/protected-signing-key.json',import.meta.url),'utf8'));
test('qualification template cannot grant signing or create an enabled or exportable key',()=>{
 const resources=Object.values(template.Resources);
 assert.deepEqual(resources.map(r=>r.Type).sort(),['AWS::KMS::Alias','AWS::KMS::Key']);
 const key=resources.find(r=>r.Type==='AWS::KMS::Key'),p=key.Properties;
 assert.equal(p.Enabled,false);assert.equal(p.KeySpec,'ECC_SECG_P256K1');assert.equal(p.KeyUsage,'SIGN_VERIFY');
 assert.equal(p.Origin,'AWS_KMS');assert.equal(p.MultiRegion,false);assert.equal(p.BypassPolicyLockoutSafetyCheck,false);
 assert.equal(key.DeletionPolicy,'Retain');assert.equal(key.UpdateReplacePolicy,'Retain');
 for(const statement of p.KeyPolicy.Statement){
  assert.ok(statement.Principal.AWS!=='*');
  for(const action of statement.Action)assert.ok(!action.includes('*')&&!['kms:Sign','kms:CreateGrant','kms:ScheduleKeyDeletion','kms:ImportKeyMaterial'].includes(action));
 }
 const admin=template.Parameters.KeyAdministratorArn;
 assert.deepEqual(admin.AllowedValues,['arn:aws:iam::720232346199:user/orio/orio-operator']);
});
test('all key resources and outputs are confined to the target account and region',()=>{
 assert.deepEqual(template.Conditions.TargetAccountAndRegion,{'Fn::And':[
  {'Fn::Equals':[{'Ref':'AWS::AccountId'},'720232346199']},
  {'Fn::Equals':[{'Ref':'AWS::Region'},'us-east-1']}]});
 for(const resource of Object.values(template.Resources))assert.equal(resource.Condition,'TargetAccountAndRegion');
 for(const output of Object.values(template.Outputs))assert.equal(output.Condition,'TargetAccountAndRegion');
});
