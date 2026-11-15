import {execFileSync} from 'node:child_process';
import {auditSecretArn,auditConnection} from '../src/hosted-audit-identity.ts';

// Invoke only inside the separately approved private AWS maintenance session.
// AWS CLI credentials remain with the session; the RDS password is never an
// argument, file, shell command, log entry or child-process environment variable.
try{
 if(process.env.ORIO_SCHEMA_AUDIT_DATABASE_URL)throw new Error('Unexpected preconfigured audit credential');
 const response:unknown=JSON.parse(execFileSync('aws',['secretsmanager','get-secret-value','--region','us-east-1','--secret-id',auditSecretArn,'--output','json'],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000,maxBuffer:65536,env:{...process.env,AWS_PAGER:''}}));
 process.env.ORIO_SCHEMA_AUDIT_DATABASE_URL=auditConnection(response);
 // Same-process import: no password-bearing child process is spawned.
 await import('./audit-hosted-schema.ts');
}catch{console.error('Private AWS schema audit blocked; no schema upgrade performed');process.exitCode=1;}
finally{delete process.env.ORIO_SCHEMA_AUDIT_DATABASE_URL;}
