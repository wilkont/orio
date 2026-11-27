import {createHash} from 'node:crypto';
import {Signer} from '@aws-sdk/rds-signer';
import {Pool} from 'pg';
import {AutonomousImportWorker} from './autonomous-import-worker.ts';
import {AutonomousSettlement} from './autonomous-settlement.ts';
import {HttpsAutonomousReader} from './chain-rpc.ts';
import {autonomousConfiguration} from './finalized-autonomous.ts';
import type {AutonomousDeployment} from './finalized-autonomous.ts';
import {metadataCaSha256,metadataHost} from './metadata-iam.ts';

export const autonomousWorkerLogin='orio_autonomous_worker';
const database='orio_control_qualification';
const region='us-east-1';

/** The private invocation can select no deployment, database, provider or action. */
export function createAutonomousImportHandler(worker:Pick<AutonomousImportWorker,'step'>){
 return async (event:unknown)=>{
  try {
   if(event===null||typeof event!=='object'||Object.getPrototypeOf(event)!==Object.prototype||
      Object.keys(event).length!==1||!Object.hasOwn(event,'action')||Reflect.get(event,'action')!=='step')
    throw Error('Invalid importer invocation');
   return {ok:true,result:await worker.step()};
  } catch {
   // Provider endpoints and postgres diagnostics can contain private details.
   return {ok:false,error:'AUTONOMOUS_IMPORT_REJECTED'};
  }
 };
}

export function qualificationImportConfiguration(env:Readonly<Record<string,string|undefined>>,ca:Uint8Array){
 const host=env.ORIO_DATABASE_HOST;
 if(env.AWS_REGION!==region||env.ORIO_AUTONOMOUS_MODE!=='SCOPED_SEPOLIA_IAM'||
    env.ORIO_DATABASE_NAME!==database||env.ORIO_DATABASE_USER!==autonomousWorkerLogin||
    !host||host===metadataHost||!/^orio-autonomous-qualification-[a-z0-9-]+\.[a-z0-9]+\.us-east-1\.rds\.amazonaws\.com$/.test(host)||
    env.ORIO_DATABASE_URL!==undefined||env.PGPASSWORD!==undefined||env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||
    createHash('sha256').update(ca).digest('hex')!==metadataCaSha256)throw Error('Invalid qualification database configuration');
 try {
  const deployment=autonomousConfiguration(JSON.parse(env.ORIO_AUTONOMOUS_DEPLOYMENT??'null') as AutonomousDeployment);
  if(deployment.chainId!=='84532')throw Error('Wrong chain');
  const endpoints=[new URL(env.ORIO_AUTONOMOUS_RPC_FIRST??''),new URL(env.ORIO_AUTONOMOUS_RPC_SECOND??'')] as const;
  if(endpoints[0].hostname===endpoints[1].hostname)throw Error('Distinct provider hosts required');
  return {host,deployment,endpoints};
 } catch {
  throw Error('Invalid qualification deployment or providers');
 }
}

export function createQualificationAutonomousImporter(env:Readonly<Record<string,string|undefined>>,ca:Uint8Array){
 const {host,deployment,endpoints}=qualificationImportConfiguration(env,ca);
 const first=new HttpsAutonomousReader({sourceId:'first',endpoint:endpoints[0].href});
 const second=new HttpsAutonomousReader({sourceId:'second',endpoint:endpoints[1].href});
 const signer=new Signer({hostname:host,port:5432,username:autonomousWorkerLogin,region});
 const pool=new Pool({host,port:5432,database,user:autonomousWorkerLogin,password:()=>signer.getAuthToken(),max:1,
  ssl:{ca:Buffer.from(ca).toString('utf8'),rejectUnauthorized:true},
  idleTimeoutMillis:30_000,connectionTimeoutMillis:5_000,query_timeout:10_000,
  options:'-c search_path=pg_catalog -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=40000'});
 pool.on('error',()=>console.error('Qualification importer database connection unavailable'));
 const target=new AutonomousSettlement(pool,first,second,deployment,'scoped');
 // The public Base Sepolia RPC rejected larger eth_getLogs ranges during qualification.
 return createAutonomousImportHandler(new AutonomousImportWorker(first,second,deployment,target,200n));
}
