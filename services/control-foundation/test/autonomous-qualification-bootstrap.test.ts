import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Client} from 'pg';
import {bootstrapAutonomousQualification} from '../src/autonomous-qualification-bootstrap.ts';
import type {AutonomousDeployment} from '../src/finalized-autonomous.ts';

const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/orio_test')
 throw Error('Use isolated local PostgreSQL');

test('fresh qualification database binds one passwordless login and refuses replay or another database',async()=>{
 const address=(n:number)=>'0x'+String(n).padStart(40,'0');
 const config:AutonomousDeployment={id:'base-test',chainId:'84532',deploymentBlock:'123',controller:address(1),
  currency:address(2),vault:address(3),master:address(4),claims:address(5),companyRecipient:address(6),masterDecimals:6};
 const admin=new Client({connectionString:url.href});
 await admin.connect();
 let created=false,iamCreated=false;
 try{
  await assert.rejects(bootstrapAutonomousQualification(admin,config),/preflight rejected/);
  await admin.query('CREATE ROLE rds_iam NOLOGIN');iamCreated=true;
  await admin.query('CREATE DATABASE orio_control_qualification');created=true;
  const db=new URL(url);db.pathname='/orio_control_qualification';
  const client=new Client({connectionString:db.href});
  await client.connect();
  try{
   assert.equal((await bootstrapAutonomousQualification(client,config)).status,'QUALIFICATION_BOOTSTRAPPED');
   await assert.rejects(bootstrapAutonomousQualification(client,config),/preflight rejected/);
   assert.deepEqual((await client.query(`
     SELECT deployment_id,block_number::text,rolpassword IS NULL AS passwordless,
       pg_has_role('orio_autonomous_worker','rds_iam','MEMBER') AS iam,
       has_database_privilege('orio_autonomous_worker',current_database(),'TEMP') AS temp
     FROM orio_autonomous.import_bindings JOIN orio_autonomous.deployments ON id=deployment_id
      JOIN pg_authid ON rolname=login_role`
   )).rows,[{deployment_id:config.id,block_number:'123',passwordless:true,iam:true,temp:false}]);
  }finally{await client.end();}
 }finally{
  if(created){
   await admin.query('DROP DATABASE orio_control_qualification WITH (FORCE)');
   await admin.query('DROP ROLE IF EXISTS orio_autonomous_worker,orio_autonomous_import,orio_ledger_runtime');
  }
  if(iamCreated)await admin.query('DROP ROLE rds_iam');
  await admin.end();
 }
});
