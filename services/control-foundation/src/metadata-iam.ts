import {createHash} from 'node:crypto';
import {Signer} from '@aws-sdk/rds-signer';
import {Pool} from 'pg';
import {assertProtocolReaderIdentity} from './protocol-reader-identity.ts';
export const metadataHost='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com';
export const metadataDatabaseUser='orio_protocol_reader';
export const metadataCaSha256='b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77';
export function metadataIamConfiguration(env:Readonly<Record<string,string|undefined>>,ca:Uint8Array){
 if(env.AWS_REGION!=='us-east-1'||env.AWS_LAMBDA_FUNCTION_NAME!=='orio-spc-3-protocol-metadata'||env.ORIO_METADATA_MODE!=='READ_ONLY_IAM'||
  env.ORIO_DATABASE_HOST!==metadataHost||env.ORIO_DATABASE_NAME!=='orio_control'||env.ORIO_DATABASE_USER!==metadataDatabaseUser||
  env.ORIO_DATABASE_URL!==undefined||env.PGPASSWORD!==undefined||env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||
  createHash('sha256').update(ca).digest('hex')!==metadataCaSha256)throw new Error('Invalid restricted metadata configuration');
 return Object.freeze({host:metadataHost,port:5432,database:'orio_control',user:metadataDatabaseUser,region:'us-east-1'});
}
/** Each new connection gets a fresh short-lived token. Existing established
 * sessions do not store a permanent database password. Signer targets are fixed. */
export function metadataTokenPassword(configuration:Readonly<{host:string;port:number;database:string;user:string;region:string}>,issue:(target:Readonly<{hostname:string;port:number;username:string;region:string}>)=>Promise<string>){
 const target=Object.freeze({hostname:configuration.host,port:configuration.port,username:configuration.user,region:configuration.region});
 if(target.hostname!==metadataHost||target.username!==metadataDatabaseUser||target.port!==5432||target.region!=='us-east-1')throw new Error('Unexpected metadata token target');
 return async()=>{try{const token=await issue(target);if(typeof token!=='string'||token.length<1)throw new Error('Missing token');return token;}catch{throw new Error('Metadata authentication unavailable');}};
}
export function createMetadataIamPool(env:Readonly<Record<string,string|undefined>>,ca:Uint8Array){
 const configuration=metadataIamConfiguration(env,ca);
 const password=metadataTokenPassword(configuration,target=>new Signer(target).getAuthToken());
 const pool=new Pool({...configuration,password,max:1,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,query_timeout:5000,
  ssl:{ca:Buffer.from(ca).toString('utf8'),rejectUnauthorized:true},options:'-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000'});
 pool.on('error',()=>{console.error('Metadata database connection unavailable');});
 let qualification:Promise<void>|undefined;
 const ensureQualified=()=>qualification??=(async()=>{
  const client=await pool.connect();
  try{await client.query('BEGIN READ ONLY');await client.query('SET LOCAL search_path=pg_catalog');await assertProtocolReaderIdentity(client);}
  finally{try{await client.query('ROLLBACK');}finally{client.release();}}
 })().catch(()=>{qualification=undefined;throw new Error('Metadata database qualification unavailable');});
 return {pool,ensureQualified};
}
