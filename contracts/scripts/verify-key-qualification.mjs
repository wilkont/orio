import {readFile} from 'node:fs/promises';
import {recoverAddress,Signature,TypedDataEncoder,id} from 'ethers';
import {derSignature,publicAddress} from '../sdk/aws-kms-gas-signer.mjs';
const keyArn='arn:aws:kms:us-east-1:720232346199:key/479ae4e7-483e-4d17-8f46-232f08c5c6ee';
const signer='0xB1E1d791a518931042Fed65778a2f8E11938eae1';
const expected=TypedDataEncoder.hash({name:'ORIO Protected Signer Qualification',version:'1',chainId:'84532'},
 {Qualification:[{name:'purpose',type:'string'},{name:'release',type:'bytes32'}]},
 {purpose:'Non-monetary protected-key verification only',release:id('ORIO-SPC-3 AWS qualification 2026-11-14')});
try{
 const bytes=await readFile(process.argv[2]);if(bytes.length>8192)throw new Error('Oversized response');
 const p=JSON.parse(bytes);
 if(p.keyArn!==keyArn||p.digest!==expected||p.financialExecutionEnabled!==false)throw new Error('Wrong qualification identity');
 const address=publicAddress({KeyId:p.keyArn,KeySpec:'ECC_SECG_P256K1',KeyUsage:'SIGN_VERIFY',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey:Buffer.from(p.publicKey,'base64')},keyArn);
 if(address!==signer)throw new Error('Wrong public key');
 const scalars=derSignature(Buffer.from(p.signature,'base64'));
 if(![27,28].some(v=>recoverAddress(expected,Signature.from({...scalars,v}))===signer))throw new Error('Invalid signature');
 console.log(JSON.stringify({status:'VERIFIED',keyArn,signer,digest:expected,financialExecutionEnabled:false}));
}catch{console.error('Protected-key qualification failed');process.exitCode=1;}
