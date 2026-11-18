interface ScopedJournal {
 qualify():Promise<void>;
 load(id:string):Promise<unknown>;
 claim(id:string,digest:string):Promise<void>;
 complete(id:string,digest:string,signature:string):Promise<void>;
}
const exact=(v:unknown,pattern:RegExp):v is string=>typeof v==='string'&&pattern.test(v);
/** Private synchronous IAM invocation only. This accepts no SQL, database
 * identity, evidence, policy or key selection. Deployment must grant Invoke
 * only to reviewed callers; event fields are not authentication evidence.
 * Errors are intentionally opaque. A failed claim/completion acknowledgement
 * must be reconciled, never automatically retried by a signing worker.
 */
export function createValuationJournalLambda(journal:ScopedJournal){
 return async(input:unknown)=>{
  try{
   if(input===null||typeof input!=='object'||Array.isArray(input)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Invalid event');
   const e=input as Record<string,unknown>;
   if(e.version!=='1'||typeof e.action!=='string')throw Error('Invalid protocol');
   const fields=e.action==='qualify'?['version','action']:e.action==='load'?['version','action','intentId']:
    e.action==='claim'?['version','action','intentId','digest']:e.action==='complete'?['version','action','intentId','digest','signature']:[];
   if(fields.length===0||Object.keys(e).length!==fields.length||fields.some(k=>!Object.hasOwn(e,k)))throw Error('Unexpected fields');
   if(e.action==='qualify'){await journal.qualify();return {version:'1',ok:true,result:{qualified:true,financialExecutionEnabled:false}};}
   if(!exact(e.intentId,/^[A-Za-z0-9:_-]{1,100}(?![\s\S])/))throw Error('Invalid intent');
   if(e.action==='load'){
    const result=await journal.load(e.intentId);
    if(Buffer.byteLength(JSON.stringify(result),'utf8')>131072)throw Error('Oversized result');
    return {version:'1',ok:true,result};
   }
   if(!exact(e.digest,/^0x[0-9a-f]{64}(?![\s\S])/))throw Error('Invalid digest');
   if(e.action==='claim')await journal.claim(e.intentId,e.digest);
   else{
    if(!exact(e.signature,/^0x[0-9a-f]{130}(?![\s\S])/))throw Error('Invalid signature');
    await journal.complete(e.intentId,e.digest,e.signature);
   }
   return {version:'1',ok:true,result:null};
  }catch{return {version:'1',ok:false,error:'SCOPED_JOURNAL_REQUEST_REJECTED'};}
 };
}
