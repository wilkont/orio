import {LambdaClient,InvokeCommand} from '@aws-sdk/client-lambda';
const exact=(v,p)=>typeof v==='string'&&p.test(v);
const identifier=v=>{if(!exact(v,/^[A-Za-z0-9:_-]{1,100}(?![\s\S])/))throw Error('Invalid journal intent');return v;};
const digest=v=>{if(!exact(v,/^0x[0-9a-f]{64}(?![\s\S])/))throw Error('Invalid journal digest');return v;};
/** Private worker transport only. An immutable qualified function ARN must come
 * from the reviewed deployment, never a request or signing intent. The caller's
 * IAM role must permit Invoke on that exact version only. No retries: a lost
 * claim/completion acknowledgement needs intent reconciliation before reuse.
 * This provisions no role, endpoint, credential or signing permission.
 */
export class LambdaValuationJournal {
 #arn;#version;#factory;
 constructor(policy,clientFactory=options=>new LambdaClient(options)){
  const arn=policy?.functionArn;
  if(!exact(arn,/^arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-valuation-journal:[1-9][0-9]{0,9}(?![\s\S])/))throw Error('An immutable ORIO journal version is required');
  this.#arn=arn;this.#version=arn.split(':').at(-1);this.#factory=clientFactory;
 }
 async #invoke(action,fields={}){
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('Scoped journal TLS is unsafe');
  let client;
  try{
   client=this.#factory({region:'us-east-1',endpoint:'https://lambda.us-east-1.amazonaws.com',maxAttempts:1});
   const r=await client.send(new InvokeCommand({FunctionName:this.#arn,InvocationType:'RequestResponse',LogType:'None',
    Payload:Buffer.from(JSON.stringify({version:'1',action,...fields}))}));
   if(r.StatusCode!==200||r.FunctionError!==undefined||r.ExecutedVersion!==this.#version||!(r.Payload instanceof Uint8Array)||r.Payload.length>132096)throw Error('Unexpected invocation result');
   const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(r.Payload));
   if(body===null||typeof body!=='object'||Array.isArray(body)||body.version!=='1'||body.ok!==true||
    Object.keys(body).sort().join(',')!=='ok,result,version')throw Error('Rejected journal request');
   return body.result;
  }catch{throw Error('Scoped journal response unavailable; reconcile the intent before retry');}
  finally{client?.destroy();}
 }
 async qualify(){const r=await this.#invoke('qualify');if(r?.qualified!==true||r.financialExecutionEnabled!==false)throw Error('Journal qualification rejected');}
 async load(intentId){
  const r=await this.#invoke('load',{intentId:identifier(intentId)});
  if(r===null||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='evidence,keyArn,policyDigest,preparedAt,signer,typedDigest'||
   r.evidence===null||typeof r.evidence!=='object'||Array.isArray(r.evidence)||!exact(r.preparedAt,/^(0|[1-9][0-9]{0,14})(?![\s\S])/))throw Error('Malformed scoped journal intent');
  digest(r.typedDigest);digest(r.policyDigest);
  if(!exact(r.keyArn,/^arn:aws:kms:us-east-1:720232346199:key\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/)
   ||!exact(r.signer,/^0x[0-9a-fA-F]{40}(?![\s\S])/))throw Error('Malformed scoped journal authority');
  return structuredClone(r);
 }
 async claim(intentId,typedDigest){if(await this.#invoke('claim',{intentId:identifier(intentId),digest:digest(typedDigest)})!==null)throw Error('Journal claim acknowledgement requires reconciliation');}
 async complete(intentId,typedDigest,signature){
  identifier(intentId);digest(typedDigest);if(!exact(signature,/^0x[0-9a-f]{130}(?![\s\S])/))throw Error('Invalid journal signature');
  if(await this.#invoke('complete',{intentId,digest:typedDigest,signature})!==null)throw Error('Journal completion acknowledgement requires reconciliation');
 }
}
