import {KMSClient,GetPublicKeyCommand,SignCommand} from '@aws-sdk/client-kms';
import {getAddress,getBytes,recoverAddress,Signature} from 'ethers';
import {publicAddress,derSignature} from './aws-kms-gas-signer.mjs';
import {prepareReserveValuation} from './reserve-valuation.mjs';

/** Private qualification worker: input selects only an owner-staged intent ID.
 * The journal is the authenticated, persistent authorization boundary. It must
 * claim before Sign and fence completion against revocation/ledger changes.
 * A failed/ambiguous Sign leaves the claim consumed: never blindly retry it.
 * This exports no arbitrary digest signer, transaction sender or mainnet path.
 */
export async function signCommittedReserveValuation(journal,inputPolicy,intentId,clock,
 clientFactory=options=>new KMSClient(options)){
 const p=structuredClone(inputPolicy);
 if(typeof intentId!=='string'||intentId!==intentId.trim()||!/^[a-zA-Z0-9:_-]{1,100}$/.test(intentId)||
  typeof p.keyArn!=='string'||p.keyArn!==p.keyArn.trim()||!/^arn:aws:kms:us-east-1:720232346199:key\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.keyArn))throw Error('Invalid reserve signing identity');
 let client,claimed=false,claimAttempted=false;
 try{
  const intent=await journal.load(intentId);
  const material=prepareReserveValuation(p.reservePolicy,intent.evidence,intent.preparedAt);
  if(material.digest!==intent.typedDigest||material.policyDigest!==intent.policyDigest||intent.keyArn!==p.keyArn||
   getAddress(intent.signer)!==getAddress(p.signer)||getAddress(p.signer)!==getAddress(p.reservePolicy.valuationSigner))throw Error('Prepared reserve authority mismatch');
  const live=()=>{const now=clock();if(typeof now!=='string'||now!==now.trim()||!/^(0|[1-9][0-9]*)$/.test(now)||BigInt(now)<BigInt(material.value.validAfter)||BigInt(now)>=BigInt(material.value.validUntil))throw Error('Reserve valuation expired');};
  live();
  client=clientFactory({region:'us-east-1',endpoint:'https://kms.us-east-1.amazonaws.com',maxAttempts:1});
  if(publicAddress(await client.send(new GetPublicKeyCommand({KeyId:p.keyArn})),p.keyArn)!==getAddress(p.signer))throw Error('Wrong reserve public key');
  live();claimAttempted=true;await journal.claim(intentId,material.digest);claimed=true;live();
  const result=await client.send(new SignCommand({KeyId:p.keyArn,Message:getBytes(material.digest),MessageType:'DIGEST',SigningAlgorithm:'ECDSA_SHA_256'}));
  if(result.KeyId!==p.keyArn||result.SigningAlgorithm!=='ECDSA_SHA_256')throw Error('Wrong reserve signing response');
  const {r,s}=derSignature(result.Signature);let signature;
  for(const v of [27,28]){const candidate=Signature.from({r,s,v}).serialized;
   if(getAddress(recoverAddress(material.digest,candidate))===getAddress(p.signer)){signature=candidate;break;}}
  if(!signature)throw Error('Reserve signature recovery failed');
  live();await journal.complete(intentId,material.digest,signature);
  return {intentId,domain:material.domain,value:material.value,digest:material.digest,signature,financialExecutionEnabled:false};
 }catch{
  throw Error(claimed?'Reserve signing outcome requires reconciliation; claim remains consumed':claimAttempted?
   'Reserve signing outcome requires reconciliation; claim acknowledgement is unknown':'Reserve signing authorization failed');
 }finally{client?.destroy();}
}
