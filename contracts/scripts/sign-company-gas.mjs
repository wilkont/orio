import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {GasControls} from '../../services/control-foundation/src/gas-controls.ts';
import {signCompanyGasPermit} from '../sdk/protected-gas-signing.mjs';
import {createAwsKmsGasSigner} from '../sdk/aws-kms-client.mjs';
const {Pool}=createRequire(new URL('../../services/control-foundation/package.json',import.meta.url))('pg');

let pool,backend;
try{
 const policyPath=process.env.ORIO_GAS_SIGNER_POLICY_FILE,connectionString=process.env.ORIO_GAS_SIGNER_DATABASE_URL,caPath=process.env.ORIO_PG_CA_FILE;
 if(!policyPath||!connectionString||!caPath)throw new Error('Missing protected signer configuration');
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash)throw new Error('Database TLS override refused');
 let input='',bytes=0;
 for await(const part of process.stdin){bytes+=part.length;if(bytes>65536)throw new Error('Protected request exceeds limit');input+=part.toString('utf8');}
 const request=JSON.parse(input);
 if(request===null||typeof request!=='object'||Array.isArray(request)||Object.keys(request).sort().join(',')!=='operationId,transactionId,userOperation')
  throw new Error('Invalid protected request');
 const policy=JSON.parse(await readFile(policyPath,'utf8'));
 pool=new Pool({connectionString,max:2,connectionTimeoutMillis:5000,query_timeout:5000,
  ssl:{ca:await readFile(caPath,'utf8'),rejectUnauthorized:true},
  options:'-c statement_timeout=5000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000'});
 pool.on('error',()=>{process.exitCode=1;});
 backend=await createAwsKmsGasSigner(policy);
 const signed=await signCompanyGasPermit(new GasControls(pool),backend,policy,request,new Date().toISOString());
 // Dedicated trusted pipe output, not a general application log. Contains a permit
 // consent and must not be copied into public logs, telemetry or support records.
 process.stdout.write(JSON.stringify(signed)+'\n');
}catch{
 process.stderr.write(JSON.stringify({status:'BLOCKED',reason:'Protected signer configuration or verification failed',financialExecutionEnabled:false})+'\n');
 process.exitCode=1;
}finally{if(backend)backend.close();if(pool)await pool.end();}
