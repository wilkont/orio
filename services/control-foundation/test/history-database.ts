import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
const rootURL=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootURL.hostname)||rootURL.pathname!=='/orio_test')
 throw new Error('Use the isolated local PostgreSQL test harness');
export async function historyDatabase(run:(pool:Pool,role:string)=>Promise<void>){
 const root=new Pool({connectionString:rootURL.href}),name='orio_test_history_'+randomUUID().replaceAll('-',''),role=name+'_rt';
 const url=new URL(rootURL);url.pathname='/'+name;
 let pool:Pool|undefined,created=false;
 try{
  await root.query('CREATE DATABASE '+name);created=true;pool=new Pool({connectionString:url.href});
  for(const file of ['001_ledger.sql','016_finalized_history.sql','017_history_consumers.sql'])
   await pool.query((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replaceAll('orio_ledger_runtime',role));
  await run(pool,role);
 }finally{if(pool)await pool.end();if(created){await root.query('DROP DATABASE '+name);await root.query('DROP ROLE IF EXISTS '+role);}await root.end();}
}
