import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {Interface,keccak256,getCreateAddress} from 'ethers';
import {manifest,decodeManifest,operationIds,unsigned,signed} from '../sdk/remaining-sepolia.ts';
import {compileContracts} from '../scripts/compile.mjs';
const path=new URL('../../infrastructure/aws/REMAINING_SEPOLIA_PLAN_2026-11-14.json',import.meta.url);
test('approved batch binds current source, constructors, consecutive testnet nonces and child addresses',async()=>{
 const m=await manifest(),artifacts=compileContracts();let cap=0n;
 for(let i=0;i<m.plans.length;i++){
  const p=m.plans[i],tx=await unsigned(p.operationId),a=artifacts['src/'+p.contract+'.sol'][p.contract];
  assert.equal(keccak256('0x'+a.evm.bytecode.object),p.creationBytecodeHash);
  assert.equal(tx.data,'0x'+a.evm.bytecode.object+new Interface(a.abi).encodeDeploy(p.constructorArguments).slice(2));
  assert.equal(tx.chainId,84532n);assert.equal(tx.to,null);assert.equal(tx.value,0n);assert.equal(tx.nonce,i+1);
  assert.equal(getCreateAddress({from:m.sender,nonce:tx.nonce}),p.predictedAddress);
  cap+=(BigInt(p.fees.planningBudgetWei)*125n+99n)/100n;
 }
 assert.ok(cap<=BigInt(m.maximumBatchPlanningWei));
 const controller=m.plans.at(-1);
 assert.equal(controller.children.length,3);
 for(let i=0;i<3;i++)assert.equal(controller.children[i].address,getCreateAddress({from:controller.predictedAddress,nonce:i+1}));
});
test('changed manifest or other authorization evidence cannot authorize a remaining deployment',async()=>{
 const text=readFileSync(path,'utf8');assert.throws(()=>decodeManifest(text.replace('84532','8453')),/Unapproved/);
 const proof=JSON.parse(readFileSync(new URL('../../infrastructure/aws/KEY_QUALIFICATION_RESPONSE_2026-11-14.json',import.meta.url)));
 for(const id of operationIds)await assert.rejects(signed(id,proof),/Wrong signing proof/);
 await assert.rejects(unsigned('withdraw'),/Unknown deployment/);
 const m=await manifest();m.plans[0].transaction.value='1';assert.equal((await manifest()).plans[0].transaction.value,'0');
});
test('private batch handler accepts only one listed operation ID and signs its fixed digest',async()=>{
 const template=JSON.parse(readFileSync(new URL('../../infrastructure/aws/protected-remaining-deployment.json',import.meta.url)));
 const code=template.Resources.QualificationFunction.Properties.Code.ZipFile,m=await manifest();
 const script=`import sys,json,types\nsource,expected=json.load(sys.stdin)\nb=types.ModuleType('boto3'); clients=[]; calls=[]\nclass Client:\n def get_public_key(self,**k): return {'KeyId':ns['KEY'],'KeySpec':'ECC_SECG_P256K1','KeyUsage':'SIGN_VERIFY','SigningAlgorithms':['ECDSA_SHA_256'],'PublicKey':b'synthetic public data'}\n def sign(self,**k):\n  calls.append(k);return {'KeyId':ns['KEY'],'SigningAlgorithm':'ECDSA_SHA_256','Signature':b'synthetic signature'}\ndef client(*a,**k):\n clients.append(k);return Client()\nb.client=client;sys.modules['boto3']=b\nc=types.ModuleType('botocore.config');c.Config=lambda **k:k\nsys.modules['botocore']=types.ModuleType('botocore');sys.modules['botocore.config']=c\nns={};exec(source,ns)\nfor bad in [None,{},[],{'operationId':3},{'operationId':'withdraw'},{'operationId':'registry','digest':'00'}]:\n try:ns['handler'](bad,None);raise AssertionError('unauthorized input accepted')\n except ValueError:pass\nassert clients==[] and calls==[]\nfor name,digest in expected.items():\n result=ns['handler']({'operationId':name},None)\n assert result['digest']==digest and result['operationId']==name and result['financialExecutionEnabled']==False\n assert calls[-1]['Message']==bytes.fromhex(digest[2:])\n assert calls[-1]['MessageType']=='DIGEST' and calls[-1]['SigningAlgorithm']=='ECDSA_SHA_256'\n`;
 const result=spawnSync('python',['-c',script],{input:JSON.stringify([code,Object.fromEntries(m.plans.map(p=>[p.operationId,p.unsignedDigest]))]),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.ok(!Object.values(template.Resources).some(r=>['AWS::Lambda::Url','AWS::Lambda::Permission'].includes(r.Type)));
 const previous=JSON.parse(readFileSync(new URL('../../infrastructure/aws/protected-signing-qualification.json',import.meta.url)));
 assert.deepEqual(template.Resources.QualificationRole,previous.Resources.QualificationRole);
 assert.deepEqual(template.Resources.QualificationPermissions,previous.Resources.QualificationPermissions);
 assert.deepEqual(template.Resources.OperatorQualificationInvoke,previous.Resources.OperatorQualificationInvoke);
});
