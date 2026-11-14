import {createPublicKey} from 'node:crypto';
import {computeAddress,getAddress,getBytes,recoverAddress,Signature,TypedDataEncoder} from 'ethers';
import {gasPermitTypes} from './gas-permit.mjs';

const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export function derSignature(input){
 if(!(input instanceof Uint8Array)||input.length<8||input.length>72)throw new Error('Invalid ECDSA encoding');
 const bytes=Buffer.from(input);let offset=2;
 if(bytes[0]!==0x30||bytes[1]!==bytes.length-2)throw new Error('Invalid ECDSA sequence');
 const integer=()=>{
  if(bytes[offset++]!==2)throw new Error('Invalid ECDSA integer');
  const length=bytes[offset++];
  if(!length||length>33||offset+length>bytes.length)throw new Error('Invalid ECDSA length');
  const part=bytes.subarray(offset,offset+length);offset+=length;
  if(part[0]&128||(part[0]===0&&(length===1||!(part[1]&128))))throw new Error('Noncanonical ECDSA integer');
  const value=BigInt('0x'+part.toString('hex'));
  if(value===0n||value>=order)throw new Error('ECDSA scalar out of range');
  return value;
 };
 const r=integer(),s=integer();if(offset!==bytes.length)throw new Error('Trailing ECDSA bytes');
 return {r:'0x'+r.toString(16).padStart(64,'0'),s:'0x'+(s>order/2n?order-s:s).toString(16).padStart(64,'0')};
}
export function publicAddress(response,keyArn){
 if(response?.KeyId!==keyArn||response.KeySpec!=='ECC_SECG_P256K1'||response.KeyUsage!=='SIGN_VERIFY'||
  !Array.isArray(response.SigningAlgorithms)||!response.SigningAlgorithms.includes('ECDSA_SHA_256')||
  !(response.PublicKey instanceof Uint8Array)||response.PublicKey.length>256)throw new Error('Unexpected KMS key');
 const key=createPublicKey({key:Buffer.from(response.PublicKey),format:'der',type:'spki'});
 if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='secp256k1')throw new Error('Unexpected key curve');
 const jwk=key.export({format:'jwk'});
 if(jwk.kty!=='EC'||jwk.crv!=='secp256k1'||typeof jwk.x!=='string'||typeof jwk.y!=='string')throw new Error('Invalid public key');
 const x=Buffer.from(jwk.x,'base64url'),y=Buffer.from(jwk.y,'base64url');
 if(x.length!==32||y.length!==32)throw new Error('Invalid public coordinates');
 return getAddress(computeAddress('0x04'+x.toString('hex')+y.toString('hex')));
}

/** Narrow AWS KMS protocol adapter. transport.request accepts only GetPublicKey/Sign
 * and must be backed by an authenticated official AWS client in the deployed broker.
 * This module creates no key/credential, provisions no access and never broadcasts.
 * The broker must not expose this backend directly: the committed-reservation
 * coordinator is the authority boundary; KMS cannot interpret a monetary digest.
 */
export async function createKmsGasSigner(transport,inputPolicy){
 const p=structuredClone(inputPolicy);
 if(typeof p.keyArn!=='string'||!/^arn:aws:kms:us-east-1:720232346199:key\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.keyArn)||p.chainId!=='84532')
  throw new Error('Invalid qualification KMS identity');
 const expected=getAddress(p.signer),paymaster=getAddress(p.paymaster);
 if([expected,paymaster].includes('0x'+'0'.repeat(40))||expected===paymaster)throw new Error('Invalid KMS signing policy');
 try{
  if(publicAddress(await transport.request('GetPublicKey',{KeyId:p.keyArn}),p.keyArn)!==expected)throw new Error('Wrong KMS public key');
 }catch{throw new Error('KMS public-key verification failed');}
 return Object.freeze({signTypedData:async(domainInput,typesInput,valueInput)=>{
  const domain=structuredClone(domainInput),types=structuredClone(typesInput),value=structuredClone(valueInput);
  if(domain?.name!=='ORIO Gas Permit'||domain.version!=='1'||domain.chainId!==p.chainId||
   Object.keys(domain).sort().join(',')!=='chainId,name,verifyingContract,version'||getAddress(domain.verifyingContract)!==paymaster||
   JSON.stringify(types)!==JSON.stringify(gasPermitTypes))throw new Error('KMS signing domain not authorized');
  const expectedFields=['operationDigest',...gasPermitTypes.GasPermit.map(field=>field.name)].filter((key,index,all)=>all.indexOf(key)===index).sort();
  if(value===null||typeof value!=='object'||Object.keys(value).sort().join(',')!==expectedFields.join(','))throw new Error('Invalid gas permit fields');
  for(const field of gasPermitTypes.GasPermit){
   const item=value[field.name];
   if(typeof item!=='string'||(field.type==='bytes32'?!/^0x[0-9a-f]{64}$/.test(item):
    !/^(0|[1-9][0-9]*)$/.test(item)||item.length>78||BigInt(item)>=(1n<<BigInt(field.type.slice(4)))))
    throw new Error('Invalid exact gas permit value');
  }
  const digest=TypedDataEncoder.hash(domain,types,value);
  try{
   const result=await transport.request('Sign',{KeyId:p.keyArn,Message:getBytes(digest),MessageType:'DIGEST',SigningAlgorithm:'ECDSA_SHA_256'});
   if(result?.KeyId!==p.keyArn||result.SigningAlgorithm!=='ECDSA_SHA_256')throw new Error('Unexpected KMS signing response');
   const {r,s}=derSignature(result.Signature);
   for(const v of [27,28]){
    const signature=Signature.from({r,s,v}).serialized;
    if(getAddress(recoverAddress(digest,signature))===expected)return signature;
   }
   throw new Error('KMS signature does not match configured authority');
  }catch{throw new Error('KMS gas signing failed');}
 }});
}
