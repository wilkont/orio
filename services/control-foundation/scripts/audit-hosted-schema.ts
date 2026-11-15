import {readFile,writeFile} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {auditHostedSchema} from '../src/schema-audit.ts';
let pool:Pool|undefined;
try{
 const connection=process.env.ORIO_SCHEMA_AUDIT_DATABASE_URL,ca=process.env.ORIO_PG_CA_FILE,output=process.argv[2];
 if(!connection||!ca||!output||!isAbsolute(output))throw new Error('Configure an authorized audit connection and absolute private output path');
 const repo=fileURLToPath(new URL('../../../',import.meta.url)),within=relative(repo,resolve(output));
 if(!within.startsWith('..'+sep)&&!isAbsolute(within))throw new Error('Private catalog output must stay outside the versioned repository');
 const url=new URL(connection);
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||url.pathname!=='/orio_control'||
  url.hostname!=='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com'||(url.port!==''&&url.port!=='5432'))throw new Error('Wrong target or TLS override');
 pool=new Pool({connectionString:connection,max:1,connectionTimeoutMillis:5000,query_timeout:10000,
  ssl:{ca:await readFile(ca,'utf8'),rejectUnauthorized:true},options:'-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=2000'});
 pool.on('error',()=>{process.exitCode=1;});
 const client=await pool.connect();let report;
 try{report=await auditHostedSchema(client,'orio_control');}finally{client.release();}
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:report.status,catalogFingerprint:report.catalogFingerprint,baselineStatus:report.baselineStatus,financialExecutionEnabled:false}));
}catch{console.error('Hosted schema audit blocked; no migration or financial operation was performed');process.exitCode=1;}
finally{if(pool)await pool.end();}
