import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {FinalizedHistory} from '../src/finalized-history.ts';
import {configuredChainProviders,qualifyChainProviders} from '../src/provider-qualification.ts';

let pool;
try {
 const configPath=process.env.ORIO_HISTORY_CONFIG_FILE;
 const limit=process.env.ORIO_HISTORY_MAX_BLOCKS??'1';
 if(!configPath||!/^(?:[1-9]|1[0-9]|2[0-5])$/.test(limit))throw new Error('Missing bounded scan configuration');
 const connectionString=process.env.ORIO_HISTORY_DATABASE_URL,caPath=process.env.ORIO_PG_CA_FILE;
 if(!connectionString||!caPath)throw new Error('Missing observer database configuration');
 const database=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(database.protocol)||database.search||database.hash)
  throw new Error('Database TLS must use the trusted CA');
 const config=JSON.parse(await readFile(configPath,'utf8'));
 const {first,second}=configuredChainProviders(process.env);
 // The class rejects mainnet and freezes the input before any network operation.
 pool=new Pool({connectionString,max:2,connectionTimeoutMillis:5000,query_timeout:10000,
  ssl:{ca:await readFile(caPath,'utf8'),rejectUnauthorized:true},
  options:'-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000'});
 pool.on('error',()=>{console.error('Observer database unavailable');process.exitCode=1;});
 const observer=new FinalizedHistory(pool,first.reader,second.reader,config);
 await qualifyChainProviders(first,second,{chainId:config.chainId,maximumFinalizedAgeSeconds:'3600',maximumHeightSkew:'128'},new Date().toISOString());
 await observer.initialize();
 for(let i=0;i<Number(limit);i++) {
  const result=await observer.scanOne();
  console.log(JSON.stringify({...result,financialExecutionEnabled:false,accountingImported:false}));
  if(result.state==='WAITING')break;
 }
} catch {
 // Never print provider bodies, endpoint URLs, database credentials or raw SQL errors.
 console.error(JSON.stringify({status:'BLOCKED',reason:'Finalized history configuration or verification failed',financialExecutionEnabled:false}));
 process.exitCode=1;
} finally { if(pool)await pool.end(); }
