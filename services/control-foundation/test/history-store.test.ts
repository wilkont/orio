import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {FinalizedHistory} from '../src/finalized-history.ts';
import {hash,historyConfig,historyReader} from './history-fixture.ts';

const rootURL=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(rootURL.hostname)||rootURL.pathname!=='/orio_test')
 throw new Error('Use the isolated local PostgreSQL test harness');
async function fixture(run:(pool:Pool,role:string)=>Promise<void>){
 const root=new Pool({connectionString:rootURL.href}),name='orio_test_history_'+randomUUID().replaceAll('-',''),role=name+'_rt';
 const url=new URL(rootURL);url.pathname='/'+name;
 let pool:Pool|undefined,created=false;
 try{
  await root.query('CREATE DATABASE '+name);created=true;pool=new Pool({connectionString:url.href});
  for(const file of ['001_ledger.sql','016_finalized_history.sql'])
   await pool.query((await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replaceAll('orio_ledger_runtime',role));
  await run(pool,role);
 }finally{if(pool)await pool.end();if(created){await root.query('DROP DATABASE '+name);await root.query('DROP ROLE IF EXISTS '+role);}await root.end();}
}
const worker=(pool:Pool)=>new FinalizedHistory(pool,historyReader('first'),historyReader('second'),historyConfig);

test('commits complete evidence with cursor and resumes through an empty block',async()=>fixture(async pool=>{
 const observer=worker(pool);await observer.initialize();await observer.initialize();
 assert.deepEqual(await observer.scanOne(),{state:'COMMITTED',height:'10'});
 const restarted=worker(pool);await restarted.initialize();
 assert.deepEqual(await restarted.scanOne(),{state:'COMMITTED',height:'11'});
 const row=(await pool.query('SELECT next_block::text,parent_hash FROM orio_history.streams')).rows[0];
 assert.deepEqual(row,{next_block:'12',parent_hash:hash(11)});
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.blocks')).rows[0].count,'2');
 assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count,'0');
}));
test('concurrent workers cannot double-append or advance past a block',async()=>fixture(async pool=>{
 let arrivals=0,release:()=>void=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const base=historyReader('first');
 const first={sourceId:base.sourceId,request:async(...args:Parameters<typeof base.request>)=>{
  if(args[0]==='eth_chainId' && ++arrivals<=2){if(arrivals===2)release();await gate;}
  return base.request(...args);
 }};
 const observer=new FinalizedHistory(pool,first,historyReader('second'),historyConfig);await observer.initialize();
 const results=await Promise.all([observer.scanOne(),observer.scanOne()]);
 assert.equal(results.filter(r=>r.state==='COMMITTED').length,1);
 assert.equal(results.filter(r=>r.state==='REPLAY').length,1);
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.blocks')).rows[0].count,'1');
 assert.equal((await pool.query('SELECT next_block::text FROM orio_history.streams')).rows[0].next_block,'11');
}));
test('failure to advance cursor rolls back evidence and permits a clean retry',async()=>fixture(async pool=>{
 const observer=worker(pool);await observer.initialize();
 await pool.query("CREATE FUNCTION orio_history.fail_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected cursor failure'; END $$; CREATE TRIGGER fail_cursor BEFORE UPDATE ON orio_history.streams FOR EACH ROW EXECUTE FUNCTION orio_history.fail_cursor()");
 await assert.rejects(observer.scanOne(),/Injected cursor failure/);
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.blocks')).rows[0].count,'0');
 assert.equal((await pool.query('SELECT next_block::text FROM orio_history.streams')).rows[0].next_block,'10');
 await pool.query('DROP TRIGGER fail_cursor ON orio_history.streams');
 assert.equal((await observer.scanOne()).state,'COMMITTED');
}));
test('refuses configuration drift, cursor skips and history mutation',async()=>fixture(async pool=>{
 const observer=worker(pool);await observer.initialize();await observer.scanOne();
 await assert.rejects(new FinalizedHistory(pool,historyReader('first'),historyReader('second'),{...historyConfig,firstBlock:'11'}).initialize(),/configuration conflict/);
 for(const sql of ['UPDATE orio_history.blocks SET block_hash=block_hash','DELETE FROM orio_history.blocks','TRUNCATE orio_history.blocks'])
  await assert.rejects(pool.query(sql));
 await pool.query("UPDATE orio_history.streams SET next_block=12,parent_hash=$1",[hash(11)]);
 await assert.rejects(observer.scanOne(),/no committed predecessor/);
}));


test('ordinary ledger runtime cannot read or write observer evidence',async()=>fixture(async(pool,role)=>{
 const observer=worker(pool);await observer.initialize();await observer.scanOne();
 const client=await pool.connect();
 try{
  for(const sql of ['SELECT * FROM orio_history.blocks',"UPDATE orio_history.streams SET next_block=100"]){
   await client.query('BEGIN');await client.query('SET LOCAL ROLE '+role);
   await assert.rejects(client.query(sql),/permission denied/);await client.query('ROLLBACK');
  }
 }finally{client.release();}
}));
