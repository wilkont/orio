import {createHash} from 'node:crypto';
import {Signer} from '@aws-sdk/rds-signer';
import {Pool} from 'pg';
import {metadataHost,metadataCaSha256} from './metadata-iam.ts';
export const valuationJournalUser='orio_valuation_journal';
export function valuationJournalIamConfiguration(env:Readonly<Record<string,string|undefined>>,ca:Uint8Array){
 if(env.AWS_REGION!=='us-east-1'||env.AWS_LAMBDA_FUNCTION_NAME!=='orio-spc-3-valuation-journal'||
  env.ORIO_JOURNAL_MODE!=='SCOPED_QUALIFICATION_IAM'||env.ORIO_DATABASE_HOST!==metadataHost||
  env.ORIO_DATABASE_NAME!=='orio_control'||env.ORIO_DATABASE_USER!==valuationJournalUser||
  env.ORIO_DATABASE_URL!==undefined||env.PGPASSWORD!==undefined||env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||
  createHash('sha256').update(ca).digest('hex')!==metadataCaSha256)throw Error('Invalid scoped journal configuration');
 return Object.freeze({host:metadataHost,port:5432,database:'orio_control',user:valuationJournalUser,region:'us-east-1'});
}
export function valuationJournalTokenPassword(issue:(target:Readonly<{hostname:string;port:number;username:string;region:string}>)=>Promise<string>){
 const target=Object.freeze({hostname:metadataHost,port:5432,username:valuationJournalUser,region:'us-east-1'});
 return async()=>{try{const token=await issue(target);if(typeof token!=='string'||token.length===0)throw Error('Missing token');return token;}
  catch{throw Error('Scoped journal authentication unavailable');}};
}
/** No permanent password or administrator fallback. Mutations are possible only
 * through the three authority-scoped functions and rechecked on every lease.
 * IAM token generation is local signing, not a network call to RDS/STS.
 */
export function createValuationJournalIamPool(env:Readonly<Record<string,string|undefined>>,ca:Uint8Array){
 const configuration=valuationJournalIamConfiguration(env,ca);
 const pool=new Pool({...configuration,password:valuationJournalTokenPassword(t=>new Signer(t).getAuthToken()),max:1,
  idleTimeoutMillis:30000,connectionTimeoutMillis:5000,query_timeout:5000,
  ssl:{ca:Buffer.from(ca).toString('utf8'),rejectUnauthorized:true},
  options:'-c search_path=pg_catalog -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000'});
 pool.on('error',()=>{console.error('Scoped journal database connection unavailable');});return pool;
}
