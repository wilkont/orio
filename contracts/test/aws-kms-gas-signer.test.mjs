import assert from 'node:assert/strict';
import {createPublicKey} from 'node:crypto';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GetPublicKeyCommand,SignCommand} from '@aws-sdk/client-kms';
import {createAwsKmsGasSigner} from '../sdk/aws-kms-client.mjs';
import {Wallet,TypedDataEncoder,verifyTypedData,hexlify} from 'ethers';
import {createKmsGasSigner} from '../sdk/aws-kms-gas-signer.mjs';
import {gasPermitTypes} from '../sdk/gas-permit.mjs';

const arn='arn:aws:kms:us-east-1:720232346199:key/12345678-1234-1234-1234-123456789abc';
const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function der(r,s){
 const int=value=>{let hex=value.toString(16);if(hex.length%2)hex='0'+hex;let bytes=Buffer.from(hex,'hex');
  if(bytes[0]&128)bytes=Buffer.concat([Buffer.from([0]),bytes]);return Buffer.concat([Buffer.from([2,bytes.length]),bytes]);};
 const data=Buffer.concat([int(r),int(s)]);return Buffer.concat([Buffer.from([0x30,data.length]),data]);
}
function fixture(highS=false){
 const wallet=Wallet.createRandom(),point=Buffer.from(wallet.signingKey.publicKey.slice(4),'hex');
 const spki=createPublicKey({key:{kty:'EC',crv:'secp256k1',x:point.subarray(0,32).toString('base64url'),y:point.subarray(32).toString('base64url')},format:'jwk'}).export({format:'der',type:'spki'});
 const policy={keyArn:arn,chainId:'84532',signer:wallet.address,paymaster:'0x'+'2'.repeat(40)},requests=[];
 const domain={name:'ORIO Gas Permit',version:'1',chainId:'84532',verifyingContract:policy.paymaster};
 const value=Object.fromEntries(gasPermitTypes.GasPermit.map(field=>[field.name,field.type==='bytes32'?'0x'+'a'.repeat(64):'1']));
 const publicResult={KeyId:arn,KeySpec:'ECC_SECG_P256K1',KeyUsage:'SIGN_VERIFY',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey:spki};
 const transport={request:async(method,input)=>{
  requests.push({method,input:structuredClone(input)});
  if(method==='GetPublicKey')return publicResult;
  assert.equal(method,'Sign');assert.equal(input.KeyId,arn);assert.equal(input.MessageType,'DIGEST');
  assert.equal(input.SigningAlgorithm,'ECDSA_SHA_256');assert.equal(input.Message.length,32);
  assert.equal(hexlify(input.Message),TypedDataEncoder.hash(domain,gasPermitTypes,value));
  const signature=wallet.signingKey.sign(hexlify(input.Message)),s=BigInt(signature.s);
  return {KeyId:arn,SigningAlgorithm:'ECDSA_SHA_256',Signature:der(BigInt(signature.r),highS?order-s:s)};
 }};
 return {wallet,policy,requests,domain,value,transport,publicResult};
}
test('pins the KMS public key and signs one exact prehashed permit with Ethereum recovery',async()=>{
 for(const highS of [false,true]){
  const f=fixture(highS),signer=await createKmsGasSigner(f.transport,f.policy);
  const signature=await signer.signTypedData(f.domain,gasPermitTypes,f.value);
  assert.equal(verifyTypedData(f.domain,gasPermitTypes,f.value,signature),f.wallet.address);
  assert.deepEqual(f.requests.map(r=>r.method),['GetPublicKey','Sign']);
  assert.equal('privateKey' in signer,false);
 }
});
test('wrong key metadata, public identity and mutable aliases reject before signing',async()=>{
 for(const patch of [{KeySpec:'ECC_NIST_P256'},{KeyUsage:'ENCRYPT_DECRYPT'},{KeyId:arn+'0'},{SigningAlgorithms:[]},{PublicKey:Buffer.from([0])}]){
  const f=fixture();Object.assign(f.publicResult,patch);
  await assert.rejects(createKmsGasSigner(f.transport,f.policy),{message:'KMS public-key verification failed'});
  assert.equal(f.requests.length,1);
 }
 const f=fixture();await assert.rejects(createKmsGasSigner(f.transport,{...f.policy,signer:Wallet.createRandom().address}),/public-key verification/);
 for(const keyArn of ['alias/orio-key',arn.replace('720232346199','710096437887'),arn+'\n'])
  await assert.rejects(createKmsGasSigner(f.transport,{...f.policy,keyArn}));
});
test('mainnet, foreign domains/types and numeric monetary values never reach KMS Sign',async()=>{
 const f=fixture(),signer=await createKmsGasSigner(f.transport,f.policy);
 for(const domain of [{...f.domain,chainId:'8453'},{...f.domain,name:'arbitrary'},{...f.domain,verifyingContract:f.wallet.address},{...f.domain,salt:'0x'+'0'.repeat(64)}])
  await assert.rejects(signer.signTypedData(domain,gasPermitTypes,f.value));
 await assert.rejects(signer.signTypedData(f.domain,{Other:[]},f.value));
 await assert.rejects(signer.signTypedData(f.domain,gasPermitTypes,{...f.value,maximumPaymentUnits:1}));
 assert.equal(f.requests.length,1);
});
test('malformed DER, response substitutions and backend errors stay opaque',async()=>{
 for(const signature of [Buffer.alloc(0),Buffer.from('3006020100020101','hex'),Buffer.from('3006020180020101','hex'),Buffer.from('300702020001020101','hex'),Buffer.from('300602010102010100','hex')]){
  const f=fixture(),transport={request:async(method,input)=>method==='GetPublicKey'?f.transport.request(method,input):{KeyId:arn,SigningAlgorithm:'ECDSA_SHA_256',Signature:signature}};
  await assert.rejects((await createKmsGasSigner(transport,f.policy)).signTypedData(f.domain,gasPermitTypes,f.value),{message:'KMS gas signing failed'});
 }
 for(const patch of [{KeyId:arn+'0'},{SigningAlgorithm:'ECDSA_SHA_384'}]){
  const f=fixture(),transport={request:async(method,input)=>{
   const result=await f.transport.request(method,input);return method==='Sign'?{...result,...patch}:result;
  }};
  await assert.rejects((await createKmsGasSigner(transport,f.policy)).signTypedData(f.domain,gasPermitTypes,f.value),{message:'KMS gas signing failed'});
 }
 const f=fixture();
 const transport={request:async(method,input)=>{if(method==='GetPublicKey')return f.transport.request(method,input);throw new Error('synthetic-secret-credential');}};
 await assert.rejects((await createKmsGasSigner(transport,f.policy)).signTypedData(f.domain,gasPermitTypes,f.value),{message:'KMS gas signing failed'});
});


test('official SDK binding pins the AWS endpoint, bounds retries and cleans up its client',async()=>{
 const f=fixture();let destroyed=0;
 const factory=options=>{
  assert.deepEqual(options,{region:'us-east-1',endpoint:'https://kms.us-east-1.amazonaws.com',maxAttempts:1});
  return {send:command=>{
   assert.ok(command instanceof GetPublicKeyCommand || command instanceof SignCommand);
   return f.transport.request(command instanceof GetPublicKeyCommand?'GetPublicKey':'Sign',command.input);
  },destroy:()=>{destroyed++;}};
 };
 const backend=await createAwsKmsGasSigner(f.policy,factory);
 assert.equal(verifyTypedData(f.domain,gasPermitTypes,f.value,await backend.signTypedData(f.domain,gasPermitTypes,f.value)),f.wallet.address);
 backend.close();assert.equal(destroyed,1);
 f.publicResult.KeyUsage='ENCRYPT_DECRYPT';await assert.rejects(createAwsKmsGasSigner(f.policy,factory),/protected signer unavailable/);
 assert.equal(destroyed,2);
});
test('signer command rejects missing setup without disclosing database credentials',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/sign-company-gas.mjs',import.meta.url))],{
  encoding:'utf8',env:{...process.env,ORIO_GAS_SIGNER_POLICY_FILE:'',ORIO_GAS_SIGNER_DATABASE_URL:'postgresql://synthetic:private-secret@invalid.example/never-connect'}});
 assert.equal(result.status,1);assert.equal(result.stdout,'');assert.ok(!result.stderr.includes('private-secret'));
 assert.equal(JSON.parse(result.stderr).financialExecutionEnabled,false);
});
