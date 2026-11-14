import {KMSClient,GetPublicKeyCommand,SignCommand} from '@aws-sdk/client-kms';
import {createKmsGasSigner} from './aws-kms-gas-signer.mjs';

/** Official SDK binding. Runtime credentials come from the workload's AWS identity;
 * no access key is accepted from a financial request or stored by this adapter.
 * The optional factory is a trusted test/deployment seam, never an HTTP parameter.
 */
export async function createAwsKmsGasSigner(policy,clientFactory=options=>new KMSClient(options)){
 const client=clientFactory({region:'us-east-1',endpoint:'https://kms.us-east-1.amazonaws.com',maxAttempts:1});
 try{
  const backend=await createKmsGasSigner({request:async(method,input)=>{
   if(method==='GetPublicKey')return client.send(new GetPublicKeyCommand(input));
   if(method==='Sign')return client.send(new SignCommand(input));
   throw new Error('Unsupported protected KMS request');
  }},policy);
  return Object.freeze({signTypedData:backend.signTypedData,close:()=>client.destroy()});
 }catch{
  client.destroy();throw new Error('AWS protected signer unavailable');
 }
}
