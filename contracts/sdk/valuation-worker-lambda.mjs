import {createHash} from 'node:crypto';
import {LambdaValuationJournal} from './lambda-valuation-journal.mjs';
import {signCommittedReserveValuation} from './aws-kms-valuation-signer.mjs';

/** Private qualification entry. Deployment supplies checksum-pinned configuration;
 * callers select only an already committed intent. No HTTP, arbitrary digest,
 * evidence, key, policy, SQL or mainnet request is accepted. IAM caller admission
 * remains a deployment responsibility. A failed/unknown claim must be reconciled.
 * This factory performs no AWS call, provisioning or financial activation.
 */
export function createValuationWorkerLambda(configurationJson,expectedSha256,
 {journalClientFactory,kmsClientFactory,clock=()=>String(Math.floor(Date.now()/1000))}={}){
 if(typeof configurationJson!=='string'||Buffer.byteLength(configurationJson)>65536||
  typeof expectedSha256!=='string'||!/^[a-f0-9]{64}(?![\s\S])/.test(expectedSha256)||
  createHash('sha256').update(configurationJson).digest('hex')!==expectedSha256)throw Error('Unreviewed valuation worker configuration');
 const config=JSON.parse(configurationJson);
 if(config===null||typeof config!=='object'||Array.isArray(config)||
  Object.keys(config).sort().join(',')!=='journal,mode,signingPolicy,version'||
  config.version!=='1'||config.mode!=='BASE_SEPOLIA_QUALIFICATION'||
  config.signingPolicy?.reservePolicy?.mode!=='qualification'||config.signingPolicy.reservePolicy.chainId!=='84532'||
  typeof config.signingPolicy.keyArn!=='string'||
  !/^arn:aws:kms:us-east-1:720232346199:key\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/.test(config.signingPolicy.keyArn))throw Error('Invalid valuation worker configuration');
 const journal=new LambdaValuationJournal(config.journal,journalClientFactory);
 return async input=>{
  try{
   if(input===null||typeof input!=='object'||Array.isArray(input)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(input))||
    Object.keys(input).sort().join(',')!=='action,intentId,version'||input.version!=='1'||input.action!=='signCommittedIntent'||
    typeof input.intentId!=='string'||!/^[A-Za-z0-9:_-]{1,100}(?![\s\S])/.test(input.intentId))throw Error('Invalid worker request');
   const result=await signCommittedReserveValuation(journal,config.signingPolicy,input.intentId,clock,kmsClientFactory);
   return {version:'1',ok:true,result};
  }catch{
   // Do not disclose whether a claim/signature exists. Never retry automatically.
   return {version:'1',ok:false,error:'VALUATION_REQUEST_REJECTED_RECONCILE_BEFORE_RETRY'};
  }
 };
}
