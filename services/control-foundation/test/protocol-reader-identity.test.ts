import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {ProtocolReader} from '../src/protocol-api.ts';
const rootUrl=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootUrl.hostname)||rootUrl.pathname!=='/orio_test')throw new Error('Use isolated local PostgreSQL');
async function fixture(run:(root:Pool,service:Pool,names:{database:string;reader:string;delegate:string})=>Promise<void>){
 const suffix=randomUUID().replaceAll('-',''),database='orio_test_metadata_'+suffix,reader='orio_reader_'+suffix,delegate='orio_delegate_'+suffix,runtime='orio_reader_rt_'+suffix;
 const admin=new Pool({connectionString:rootUrl.href});let root:Pool|undefined,service:Pool|undefined;
 try{
  await admin.query('CREATE DATABASE '+database);const url=new URL(rootUrl);url.pathname='/'+database;root=new Pool({connectionString:url.href});
  for(const file of ['001_ledger.sql','002_master_registry.sql'])await root.query((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replaceAll('orio_ledger_runtime',runtime));
  await root.query("CREATE ROLE "+reader+" LOGIN NOINHERIT PASSWORD 'orio-local-reader-only'");
  await root.query('CREATE ROLE '+delegate+' NOLOGIN');
  await root.query('GRANT USAGE ON SCHEMA orio_master TO '+reader);
  await root.query('GRANT SELECT ON orio_master.assets,orio_master.elections,orio_master.current_election TO '+reader);
  url.username=reader;url.password='orio-local-reader-only';service=new Pool({connectionString:url.href});
  await run(root,service,{database,reader,delegate});
 }finally{
  if(service)await service.end();if(root)await root.end();await admin.query('DROP DATABASE IF EXISTS '+database);
  for(const role of [reader,delegate,runtime])await admin.query('DROP ROLE IF EXISTS '+role);await admin.end();
 }
}
const paused={electionId:null,state:'DEPOSIT_PAUSED',asset:null};
test('dedicated registry reader works and privilege changes are rechecked on every request',async()=>fixture(async(root,service,{reader})=>{
 const protocol=new ProtocolReader(service);assert.deepEqual(await protocol.master(),paused);
 await root.query('GRANT USAGE ON SCHEMA orio_ledger TO '+reader);await root.query('GRANT SELECT ON orio_ledger.journals TO '+reader);
 await assert.rejects(protocol.master(),/not sufficiently restricted/);
 await root.query('REVOKE SELECT ON orio_ledger.journals FROM '+reader);await root.query('REVOKE USAGE ON SCHEMA orio_ledger FROM '+reader);
 assert.deepEqual(await protocol.master(),paused);
 await root.query('GRANT EXECUTE ON FUNCTION orio_master.activate(text,text,text,text,text) TO '+reader);
 await assert.rejects(protocol.master(),/not sufficiently restricted/);
 await root.query('REVOKE EXECUTE ON FUNCTION orio_master.activate(text,text,text,text,text) FROM '+reader);
 await root.query('REVOKE SELECT ON orio_master.assets FROM '+reader);await assert.rejects(protocol.master(),/not sufficiently restricted/);
 await root.query('GRANT SELECT ON orio_master.assets TO '+reader);assert.deepEqual(await protocol.master(),paused);
}));
test('NOINHERIT membership cannot hide a latent privileged role',async()=>fixture(async(root,service,{reader,delegate})=>{
 await root.query('GRANT USAGE ON SCHEMA orio_ledger TO '+delegate);await root.query('GRANT SELECT ON orio_ledger.journals TO '+delegate);
 await root.query('GRANT '+delegate+' TO '+reader);
 const oid=(await root.query("SELECT 'orio_ledger.journals'::regclass::oid AS oid")).rows[0].oid;
 assert.equal((await service.query('SELECT has_table_privilege(current_user,$1::oid,\'SELECT\') AS allowed',[oid])).rows[0].allowed,false);
 await assert.rejects(new ProtocolReader(service).master(),/not sufficiently restricted/);
 await root.query('REVOKE '+delegate+' FROM '+reader);assert.deepEqual(await new ProtocolReader(service).master(),paused);
}));
test('database/schema owners and a privileged session masked by SET ROLE cannot serve metadata',async()=>fixture(async(root,service,{database,reader})=>{
 await assert.rejects(new ProtocolReader(root).master(),/not sufficiently restricted/);
 const url=new URL(rootUrl);url.pathname='/'+database;const masked=new Pool({connectionString:url.href,options:'-c role='+reader});
 try{await assert.rejects(new ProtocolReader(masked).master(),/not sufficiently restricted/);}finally{await masked.end();}
 await root.query('ALTER SCHEMA orio_master OWNER TO '+reader);await assert.rejects(new ProtocolReader(service).master(),/not sufficiently restricted/);
 await root.query('ALTER SCHEMA orio_master OWNER TO postgres');await root.query('GRANT USAGE ON SCHEMA orio_master TO '+reader);assert.deepEqual(await new ProtocolReader(service).master(),paused);
 await root.query('ALTER DATABASE '+database+' OWNER TO '+reader);await assert.rejects(new ProtocolReader(service).master(),/not sufficiently restricted/);
}));
