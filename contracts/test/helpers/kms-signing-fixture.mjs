import {createPublicKey} from 'node:crypto';
import {GetPublicKeyCommand,SignCommand} from '@aws-sdk/client-kms';
import {hexlify} from 'ethers';
export const fixtureKeyArn='arn:aws:kms:us-east-1:720232346199:key/12345678-1234-1234-1234-123456789abc';
/** Synthetic local KMS protocol fixture, never AWS credentials or a deployed key. */
export function kmsFixtureClient(wallet,beforeSign){
 const point=Buffer.from(wallet.signingKey.publicKey.slice(4),'hex');
 const PublicKey=createPublicKey({key:{kty:'EC',crv:'secp256k1',x:point.subarray(0,32).toString('base64url'),y:point.subarray(32).toString('base64url')},format:'jwk'}).export({format:'der',type:'spki'});
 const integer=value=>{let hex=value.toString(16);if(hex.length%2)hex='0'+hex;let bytes=Buffer.from(hex,'hex');
  if(bytes[0]&128)bytes=Buffer.concat([Buffer.from([0]),bytes]);return Buffer.concat([Buffer.from([2,bytes.length]),bytes]);};
 return {send:async command=>{
  if(command.input.KeyId!==fixtureKeyArn)throw new Error('Wrong fixture key identity');
  if(command instanceof GetPublicKeyCommand)return {KeyId:fixtureKeyArn,KeySpec:'ECC_SECG_P256K1',KeyUsage:'SIGN_VERIFY',SigningAlgorithms:['ECDSA_SHA_256'],PublicKey};
  if(!(command instanceof SignCommand)||command.input.MessageType!=='DIGEST'||command.input.SigningAlgorithm!=='ECDSA_SHA_256')throw new Error('Invalid fixture signing command');
  await beforeSign();
  const signature=wallet.signingKey.sign(hexlify(command.input.Message));
  // Deliberately high-S so the real adapter's canonicalization is exercised on chain.
  const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const body=Buffer.concat([integer(BigInt(signature.r)),integer(order-BigInt(signature.s))]);
  return {KeyId:fixtureKeyArn,SigningAlgorithm:'ECDSA_SHA_256',Signature:Buffer.concat([Buffer.from([0x30,body.length]),body])};
 },destroy:()=>{}};
}
