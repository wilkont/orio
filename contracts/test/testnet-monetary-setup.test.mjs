import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {Transaction,ZeroHash} from 'ethers';
import {createFixture} from './helpers/vm.mjs';
import {artifacts} from './helpers/monetary-fixture.mjs';
import {buildTestnetMonetarySetup,registrySetupApi,controllerSetupApi,timelockSetupApi} from '../sdk/testnet-monetary-setup.mjs';
import {decodeSetupPlan,setupPlan,submitSetup,signedSetup} from '../sdk/monetary-setup-sepolia.mjs';
import {readRpc} from '../sdk/remaining-sepolia.ts';

test('fixed setup links an empty registry/controller/vault using ordered timelock calls while monetary execution stays disabled',async()=>{
 const f=await createFixture(artifacts,84532);
 const registry=await f.deploy('src/MasterAssetRegistry.sol','MasterAssetRegistry',[f.authority.address]);
 const master=await f.deploy('test/MonetaryFixtures.sol','MockMasterToken',[6]);
 const controller=await f.deploy('src/ORIOMonetaryController.sol','ORIOMonetaryController',[f.authority.address,registry.address,master.address]);
 const config={chainId:'84532',governance:f.authority.address,registry:registry.address,controller:controller.address,
  currency:(await f.read(controller,'currency'))[0],vault:(await f.read(controller,'vault'))[0],master:master.address,sender:f.sender,nonce:'0',delaySeconds:'5'};
 const plan=buildTestnetMonetarySetup(config);assert.equal(plan.plans.length,10);assert.equal(plan.actions.length,5);
 for(const operation of plan.plans.slice(0,5)){
  const call=timelockSetupApi.parseTransaction({data:operation.transaction.data});
  const result=await f.call(f.authority,call.name,[...call.args]);assert.equal(result.execResult.exceptionError,undefined);
  assert.ok(result.totalGasSpent<=BigInt(operation.transaction.gasLimit));
 }
 f.advance(5);
 for(const [index,action] of plan.actions.entries()){
  assert.equal(action.value,'0');assert.equal(action.predecessor,index===0?ZeroHash:plan.actions[index-1].operationHash);
  const call=timelockSetupApi.parseTransaction({data:plan.plans[5+index].transaction.data});
  const result=await f.call(f.authority,call.name,[...call.args]);assert.equal(result.execResult.exceptionError,undefined);
  assert.ok(result.totalGasSpent<=BigInt(plan.plans[5+index].transaction.gasLimit));
  assert.equal((await f.read(controller,'executionEnabled'))[0],false);
 }
 assert.equal((await f.read(registry,'monetaryController'))[0].toLowerCase(),controller.address.toLowerCase());
 assert.equal((await f.read(registry,'monetaryVault'))[0].toLowerCase(),config.vault.toLowerCase());
 assert.equal((await f.read(registry,'epoch'))[0],1n);assert.equal((await f.read(registry,'revision'))[0],2n);
 assert.equal((await f.read(controller,'revision'))[0],1n);
 for(const [index,operation] of plan.plans.entries()){
  const tx=Transaction.from({...operation.transaction,type:2,nonce:index});
  assert.equal(tx.chainId,84532n);assert.equal(tx.to,plan.governance);assert.equal(tx.value,0n);assert.equal(tx.unsignedHash,operation.unsignedDigest);
  const call=timelockSetupApi.parseTransaction({data:tx.data});assert.ok(['schedule','execute'].includes(call.name));
  assert.equal(call.args[1],0n);
 }
 const last=controllerSetupApi.parseTransaction({data:plan.actions.at(-1).data});assert.equal(last.args[2],false);
 assert.deepEqual(plan.actions.slice(0,4).map(a=>registrySetupApi.parseTransaction({data:a.data}).name),
  ['registerCandidate','approveAsset','electInitial','bindMonetarySettlement']);
 assert.throws(()=>buildTestnetMonetarySetup({...config,chainId:'8453'}));
 assert.throws(()=>buildTestnetMonetarySetup({...config,delaySeconds:'0'}));
});

test('pinned manifest and Python signer allow exactly ten digests on the existing qualification key, preserving all IAM boundaries',async()=>{
 const plan=await setupPlan(),baseline=JSON.parse(await readFile(new URL('../../infrastructure/aws/protected-signing-qualification.json',import.meta.url),'utf8'));
 const proposed=JSON.parse(await readFile(new URL('../../infrastructure/aws/protected-monetary-setup.json',import.meta.url),'utf8'));
 const copy=structuredClone(proposed);copy.Description=baseline.Description;
 copy.Resources.QualificationGasKey.Properties.Enabled=false;
 for(const k of ['Code','Description','ReservedConcurrentExecutions'])copy.Resources.QualificationFunction.Properties[k]=baseline.Resources.QualificationFunction.Properties[k];
 assert.deepEqual(copy,baseline);assert.equal(proposed.Resources.QualificationGasKey.Properties.Enabled,true);
 assert.equal(proposed.Resources.QualificationFunction.Properties.ReservedConcurrentExecutions,1);
 const text=await readFile(new URL('../../infrastructure/aws/TESTNET_MONETARY_SETUP_PLAN_2026-11-17.json',import.meta.url),'utf8');
 assert.throws(()=>decodeSetupPlan(text.replace('84532','8453')),/Changed/);
 assert.throws(()=>decodeSetupPlan(text.replace('false','true')),/Changed/);
 const code=proposed.Resources.QualificationFunction.Properties.Code.ZipFile;
 const py=`import sys,json,types\nv=json.loads(sys.stdin.read());calls=[]\nb=types.ModuleType('boto3')\nclass Client:\n def get_public_key(self,**kw):\n  assert kw=={'KeyId':v['keyArn']};return {'KeyId':v['keyArn'],'KeySpec':'ECC_SECG_P256K1','KeyUsage':'SIGN_VERIFY','SigningAlgorithms':['ECDSA_SHA_256'],'PublicKey':b'public'}\n def sign(self,**kw):\n  calls.append(kw);return {'KeyId':v['keyArn'],'SigningAlgorithm':'ECDSA_SHA_256','Signature':b'sig'}\nb.client=lambda *a,**kw:Client()\nsys.modules['boto3']=b\nsys.modules['botocore']=types.ModuleType('botocore');bc=types.ModuleType('botocore.config');bc.Config=lambda **kw:kw;sys.modules['botocore.config']=bc\nns={};exec(v['code'],ns)\nfor bad in [None,[],{}, {'operationId':'unknown'}, {'operationId':list(v['digests'])[0],'digest':'00'}, {'operationId':1}]:\n try:ns['handler'](bad,None);raise AssertionError('unsafe event accepted')\n except ValueError:pass\nassert calls==[]\nfor name,digest in v['digests'].items():\n out=ns['handler']({'operationId':name},None);c=calls[-1];assert c=={'KeyId':v['keyArn'],'Message':bytes.fromhex(digest[2:]),'MessageType':'DIGEST','SigningAlgorithm':'ECDSA_SHA_256'};assert out['digest']==digest and out['financialExecutionEnabled']==False\nassert len(calls)==10\n`;
 const result=spawnSync('python',['-c',py],{input:JSON.stringify({code,keyArn:plan.keyArn,digests:Object.fromEntries(plan.plans.map(x=>[x.operationId,x.unsignedDigest]))}),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 await assert.rejects(signedSetup(plan.plans[0].operationId,{operationId:'wrong'}));
 await assert.rejects(submitSetup({isSigned:()=>true,chainId:84532n,to:plan.governance,value:0n,from:plan.sender,unsignedHash:plan.plans[0].unsignedDigest,serialized:'0x00'}),/Signed transaction object/);
 await assert.rejects(readRpc('eth_sendRawTransaction',['0x00']),/Unsupported qualification read/);
 await assert.rejects(readRpc('personal_sign',['0x00']),/Unsupported qualification read/);
});
