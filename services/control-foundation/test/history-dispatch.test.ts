import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Pool} from 'pg';
import {HistoryDispatch} from '../src/history-dispatch.ts';
import type {HistoryHandler} from '../src/history-dispatch.ts';
import {FinalizedHistory} from '../src/finalized-history.ts';
import {ControlLedger} from '../src/ledger.ts';
import {historyDatabase} from './history-database.ts';
import {historyConfig,historyReader} from './history-fixture.ts';

const consumer={streamId:'history',consumerId:'accounting',handlerDigest:'a'.repeat(64)};
const acknowledge:HistoryHandler=async input=>({outcome:'NO_FINANCIAL_EFFECT',evidenceReferences:['observed:'+input.deliveryId]});
async function seed(pool:Pool){
 const scanner=new FinalizedHistory(pool,historyReader('first'),historyReader('second'),historyConfig);
 await scanner.initialize();await scanner.scanOne();await scanner.scanOne();
}
test('discovery and dispatch advance separately, preserving receipt and empty-block completion',async()=>historyDatabase(async pool=>{
 await seed(pool);
 const worker=new HistoryDispatch(pool,consumer,acknowledge);await worker.initialize();
 assert.equal((await worker.dispatchOne()).state,'DELIVERED');
 assert.equal((await worker.dispatchOne()).state,'BLOCK_COMPLETE');
 assert.equal((await worker.dispatchOne()).state,'BLOCK_COMPLETE');
 assert.deepEqual(await worker.dispatchOne(),{state:'WAITING',height:'12'});
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.deliveries')).rows[0].count,'1');
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.completions')).rows[0].count,'2');
}));
test('unsupported transition errors leave delivery and consumer cursors unchanged',async()=>historyDatabase(async pool=>{
 await seed(pool);
 const failed=new HistoryDispatch(pool,consumer,async()=>{throw new Error('Missing authoritative reconciliation adapter');});
 await failed.initialize();await assert.rejects(failed.dispatchOne(),/authoritative reconciliation/);
 assert.equal((await pool.query('SELECT receipt_offset FROM orio_history.consumers')).rows[0].receipt_offset,0);
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.deliveries')).rows[0].count,'0');
 // Restart with the same approved handler revision after its transient failure.
 assert.equal((await new HistoryDispatch(pool,consumer,acknowledge).dispatchOne()).state,'DELIVERED');
}));
test('journal commit followed by failed ACK retries the same immutable journal once',async()=>historyDatabase(async pool=>{
 await seed(pool);const ledger=new ControlLedger(pool);
 await ledger.createAccount({id:'history_cash',asset:'SYNTHETIC',normalSide:'debit',allowNegative:false});
 await ledger.createAccount({id:'history_claim',asset:'SYNTHETIC',normalSide:'credit',allowNegative:false});
 const ids:string[]=[];
 const handler:HistoryHandler=async input=>{
  ids.push(input.deliveryId);
  const receipt=await ledger.post({idempotencyKey:'history:'+input.deliveryId,externalRef:'history:'+input.deliveryId,
   description:'Synthetic handler crash-retry test',postings:[{accountId:'history_cash',side:'debit',units:'15'},{accountId:'history_claim',side:'credit',units:'15'}]});
  return {outcome:'IMPORTED',evidenceReferences:['journal:'+receipt.sequence]};
 };
 const worker=new HistoryDispatch(pool,consumer,handler);await worker.initialize();
 await pool.query("CREATE FUNCTION orio_history.fail_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected ACK failure'; END $$; CREATE TRIGGER fail_ack BEFORE UPDATE ON orio_history.consumers FOR EACH ROW EXECUTE FUNCTION orio_history.fail_ack()");
 await assert.rejects(worker.dispatchOne(),/Injected ACK failure/);
 assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count,'1');
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.deliveries')).rows[0].count,'0');
 await pool.query('DROP TRIGGER fail_ack ON orio_history.consumers');
 assert.equal((await worker.dispatchOne()).state,'DELIVERED');
 assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
 assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count,'1');
 assert.equal((await pool.query('SELECT count(*) FROM orio_history.deliveries')).rows[0].count,'1');
}));
test('concurrent dispatch is busy without duplicate handler invocation and releases the lock',async()=>historyDatabase(async pool=>{
 await seed(pool);let start:()=>void=()=>{},finish:()=>void=()=>{},calls=0;
 const entered=new Promise<void>(resolve=>{start=resolve;}),gate=new Promise<void>(resolve=>{finish=resolve;});
 const worker=new HistoryDispatch(pool,consumer,async input=>{calls++;start();await gate;return acknowledge(input);});
 await worker.initialize();const pending=worker.dispatchOne();await entered;
 assert.deepEqual(await new HistoryDispatch(pool,consumer,acknowledge).dispatchOne(),{state:'BUSY'});
 finish();assert.equal((await pending).state,'DELIVERED');assert.equal(calls,1);
 assert.equal((await worker.dispatchOne()).state,'BLOCK_COMPLETE');
}));
test('rejects revision drift, skipped acknowledgements and immutable evidence mutation',async()=>historyDatabase(async pool=>{
 await seed(pool);const worker=new HistoryDispatch(pool,consumer,acknowledge);await worker.initialize();
 await assert.rejects(new HistoryDispatch(pool,{...consumer,handlerDigest:'b'.repeat(64)},acknowledge).initialize(),/revision conflict/);
 await pool.query('UPDATE orio_history.consumers SET receipt_offset=1');
 await assert.rejects(worker.dispatchOne(),/skipped receipt/);
 await pool.query('UPDATE orio_history.consumers SET next_block=11,receipt_offset=0');
 await assert.rejects(worker.dispatchOne(),/no completed predecessor/);
 await pool.query('UPDATE orio_history.consumers SET next_block=10');
 await worker.dispatchOne();await worker.dispatchOne();
 for(const table of ['deliveries','completions'])for(const operation of ['UPDATE '+table+' SET height=height','DELETE FROM '+table,'TRUNCATE '+table]){
  const sql=operation.replaceAll(table,'orio_history.'+table);await assert.rejects(pool.query(sql));
 }
}));
