import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {TypedDataEncoder,id} from 'ethers';
const t=JSON.parse(readFileSync(new URL('../../infrastructure/aws/protected-signing-qualification.json',import.meta.url)));
test('qualification challenge is distinct from monetary authorization and cannot accept caller data',()=>{
 const code=t.Resources.QualificationFunction.Properties.Code.ZipFile;
 const digest=TypedDataEncoder.hash({name:'ORIO Protected Signer Qualification',version:'1',chainId:'84532'},
  {Qualification:[{name:'purpose',type:'string'},{name:'release',type:'bytes32'}]},
  {purpose:'Non-monetary protected-key verification only',release:id('ORIO-SPC-3 AWS qualification 2026-11-14')});
 assert.ok(code.includes(digest.slice(2)));
 const script=`import sys,types,json\ncode=json.loads(sys.stdin.read())\nb=types.ModuleType('boto3'); calls=[]\nb.client=lambda *a,**k: calls.append(k)\nsys.modules['boto3']=b\nbc=types.ModuleType('botocore.config');bc.Config=lambda **k:k\nsys.modules['botocore']=types.ModuleType('botocore');sys.modules['botocore.config']=bc\nns={};exec(code,ns)\nfor event in [None,[],{'digest':'00'},{'userOperation':{}}]:\n try:ns['handler'](event,None);raise AssertionError('accepted caller input')\n except ValueError:pass\nassert calls==[]\n`;
 const result=spawnSync('python',['-c',script],{input:JSON.stringify(code),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('signing is restricted to a private service role and one existing key',()=>{
 const r=t.Resources,role=r.QualificationRole.Properties;
 assert.deepEqual(role.AssumeRolePolicyDocument.Statement,[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]);
 const sign=r.QualificationPermissions.Properties.PolicyDocument.Statement.find(s=>s.Action.includes('kms:Sign'));
 assert.deepEqual(sign.Resource,{'Fn::GetAtt':['QualificationGasKey','Arn']});
 assert.deepEqual(sign.Condition,{StringEquals:{'kms:MessageType':'DIGEST','kms:SigningAlgorithm':'ECDSA_SHA_256'}});
 assert.deepEqual(r.OperatorQualificationInvoke.Properties.PolicyDocument.Statement[0].Action,['lambda:InvokeFunction']);
 assert.equal(r.QualificationFunction.Properties.ReservedConcurrentExecutions,1);
 assert.equal(r.QualificationFunction.Properties.Timeout,15);
 assert.ok(!Object.values(r).some(x=>['AWS::Lambda::Url','AWS::Lambda::Permission','AWS::ApiGateway::RestApi'].includes(x.Type)));
 for(const x of Object.values(r))assert.equal(x.Condition,'TargetAccountAndRegion');
});
