import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('prepared production-purpose keys are all disabled, retained and cannot sign or delegate grants',async()=>{
 const t=JSON.parse(await readFile(new URL('../../../infrastructure/aws/production-disabled-keys.json',import.meta.url),'utf8'));
 assert.equal(Object.keys(t.Resources).length,10);
 const keys=Object.entries<{Type:string;Condition:string;DeletionPolicy:string;UpdateReplacePolicy:string;Properties:{Enabled:boolean;KeySpec:string;KeyUsage:string;Origin:string;MultiRegion:boolean;BypassPolicyLockoutSafetyCheck:boolean;KeyPolicy:{Statement:Array<{Sid:string;Effect:string;Principal:unknown;Action:string[];Resource:string}>}}}>(t.Resources).filter(([,r])=>r.Type==='AWS::KMS::Key');
 assert.equal(keys.length,5);
 for(const [,r] of keys){
  assert.equal(r.Condition,'Target');assert.equal(r.DeletionPolicy,'Retain');assert.equal(r.UpdateReplacePolicy,'Retain');
  const p=r.Properties;assert.equal(p.Enabled,false);assert.equal(p.KeySpec,'ECC_SECG_P256K1');assert.equal(p.KeyUsage,'SIGN_VERIFY');assert.equal(p.Origin,'AWS_KMS');assert.equal(p.MultiRegion,false);assert.equal(p.BypassPolicyLockoutSafetyCheck,false);
  const deny=p.KeyPolicy.Statement.find(s=>s.Sid==='NoCryptographicUseOrGrantDelegation');assert.ok(deny);assert.equal(deny.Effect,'Deny');assert.equal(deny.Principal,'*');assert.deepEqual(deny.Action,['kms:Sign','kms:Verify','kms:CreateGrant']);
  const operator=p.KeyPolicy.Statement.find(s=>s.Sid==='OperatorPublicMetadataOnly');assert.ok(operator);assert.deepEqual(operator.Principal,{AWS:'arn:aws:iam::720232346199:user/orio/orio-operator'});assert.deepEqual(operator.Action,['kms:DescribeKey','kms:GetPublicKey']);
  const admin=p.KeyPolicy.Statement.find(s=>s.Sid==='OwnerAdministration');assert.ok(admin);assert.ok(admin.Action.includes('kms:ListGrants'));
  assert.deepEqual(Reflect.get(admin,'Condition'),{ArnEquals:{'aws:PrincipalArn':'arn:aws:iam::720232346199:root'}});
  for(const statement of p.KeyPolicy.Statement.filter(s=>s.Effect==='Allow')){
   assert.equal(statement.Action.some(a=>a==='kms:*'||['kms:Sign','kms:Verify','kms:CreateGrant'].includes(a)),false);
   assert.notEqual(statement.Principal,'*');
  }
 }
});
test('five production purposes have distinct aliases and no application or financial infrastructure is added',async()=>{
 const t=JSON.parse(await readFile(new URL('../../../infrastructure/aws/production-disabled-keys.json',import.meta.url),'utf8'));
 const aliases=Object.values<{Type:string;Properties:{AliasName:string;TargetKeyId:{Ref:string}}}>(t.Resources).filter(r=>r.Type==='AWS::KMS::Alias');
 assert.deepEqual(aliases.map(r=>r.Properties.AliasName).sort(),['governance','settlement','valuation','gas-reservation','gas-operations'].map(p=>'alias/orio-spc-3/production-'+p).sort());
 assert.equal(new Set(aliases.map(r=>r.Properties.TargetKeyId.Ref)).size,5);
 for(const alias of aliases)assert.equal(t.Resources[alias.Properties.TargetKeyId.Ref].Type,'AWS::KMS::Key');
 for(const resource of Object.values<{Type:string}>(t.Resources))assert.ok(['AWS::KMS::Key','AWS::KMS::Alias'].includes(resource.Type));
});
