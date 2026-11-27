import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {bootstrapAutonomousQualification} from '../src/autonomous-qualification-bootstrap.ts';
import {metadataCaSha256} from '../src/metadata-iam.ts';
import {autonomousConfiguration} from '../src/finalized-autonomous.ts';
import type {AutonomousDeployment} from '../src/finalized-autonomous.ts';

const account='720232346199';
const region='us-east-1';
const database='orio_control_qualification';
const [instance,expectedResourceId,manifestPath,caPath]=process.argv.slice(2);
const aws=(...args:string[])=>JSON.parse(execFileSync('aws',[...args,'--region',region,'--output','json','--no-cli-pager'],{
 encoding:'utf8',timeout:30_000,stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024,
}));

try {
 if(process.argv.length!==6||!instance||!/^orio-autonomous-qualification-[a-z0-9-]+$/.test(instance)||
    !expectedResourceId||!/^db-[A-Z0-9]+$/.test(expectedResourceId)||!manifestPath||!caPath||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('Explicit qualification target required');
 const ca=await readFile(caPath);
 if(createHash('sha256').update(ca).digest('hex')!==metadataCaSha256)throw Error('Unexpected RDS trust bundle');
 const deployment=autonomousConfiguration(JSON.parse(await readFile(manifestPath,'utf8')) as AutonomousDeployment);
 if(deployment.chainId!=='84532'||aws('sts','get-caller-identity').Account!==account)throw Error('Unexpected AWS account or chain');
 const [db]=aws('rds','describe-db-instances','--db-instance-identifier',instance).DBInstances;
 const host=db?.Endpoint?.Address;
 const secretArn=db?.MasterUserSecret?.SecretArn;
 if(db?.DBInstanceArn!==`arn:aws:rds:${region}:${account}:db:${instance}`||db.DbiResourceId!==expectedResourceId||
    db.Engine!=='postgres'||db.DBInstanceStatus!=='available'||db.MasterUsername!=='orio_qualification_admin'||
    db.StorageEncrypted!==true||db.PubliclyAccessible!==false||db.IAMDatabaseAuthenticationEnabled!==true||
    db.Endpoint?.Port!==5432||typeof host!=='string'||!host.startsWith(instance+'.')||
    !/^orio-autonomous-qualification-[a-z0-9-]+\.[a-z0-9]+\.us-east-1\.rds\.amazonaws\.com$/.test(host)||
    typeof secretArn!=='string'||!secretArn.startsWith(`arn:aws:secretsmanager:${region}:${account}:secret:rds!db-`)||
    db.MasterUserSecret.SecretStatus!=='active')throw Error('Qualification RDS identity or protections rejected');
 const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id',secretArn,'--version-stage','AWSCURRENT').SecretString);
 if(secret.username!==db.MasterUsername||typeof secret.password!=='string'||!secret.password)throw Error('Unexpected managed secret identity');
 const options={host,port:5432,user:secret.username,password:secret.password,
  ssl:{ca:ca.toString('utf8'),rejectUnauthorized:true},connectionTimeoutMillis:5000};
 const root=new Client({...options,database:'postgres'});
 try{
  await root.connect();
  if(!(await root.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)
   await root.query('CREATE DATABASE orio_control_qualification TEMPLATE template0');
 }finally{await root.end();}
 const client=new Client({...options,database});
 try{
  await client.connect();
  console.log(JSON.stringify(await bootstrapAutonomousQualification(client,deployment)));
 }finally{await client.end();}
}catch{
 console.error('Qualification bootstrap stopped. Inspect the isolated target before retrying.');
 process.exitCode=1;
}
