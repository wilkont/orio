import { test,before,beforeEach,after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { ControlLedger } from '../src/ledger.ts';
import type { JournalRequest,Receipt } from '../src/ledger.ts';

const url=process.env.ORIO_TEST_DATABASE_URL;
if (!url) throw new Error('Use npm run test:local; integration tests require an isolated local PostgreSQL database');
const target=new URL(url);
if (!['127.0.0.1','localhost'].includes(target.hostname) || target.pathname!=='/orio_test')
  throw new Error('Integration tests may reset only loopback database orio_test');
const admin=new Pool({connectionString:url});
const runtime=new Pool({connectionString:url,options:'-c role=orio_ledger_runtime',max:30});
const ledger=new ControlLedger(runtime);
const migration=await readFile(new URL('../migrations/001_ledger.sql',import.meta.url),'utf8');
before(async()=>{ await admin.query('SELECT 1'); });
beforeEach(async()=>{
  await admin.query('DROP SCHEMA IF EXISTS orio_ledger CASCADE');
  await admin.query(migration);
  await ledger.createAccount({id:'reserve',asset:'USD_MICRO',normalSide:'debit',allowNegative:false});
  await ledger.createAccount({id:'customer',asset:'USD_MICRO',normalSide:'credit',allowNegative:false});
  await ledger.createAccount({id:'company',asset:'USD_MICRO',normalSide:'credit',allowNegative:false});
});
after(async()=>{ await runtime.end(); await admin.end(); });
function deposit(key='deposit-1',units='100000000'):JournalRequest {
  return {idempotencyKey:key,externalRef:`chain:finalized:${key}`,description:'Verified deposit accounting test',postings:[
    {accountId:'reserve',side:'debit',units},{accountId:'customer',side:'credit',units}]};
}
function payout(key:string,units:string):JournalRequest {
  return {idempotencyKey:key,externalRef:`payout:${key}`,description:'Secured obligation accounting test',postings:[
    {accountId:'customer',side:'debit',units},{accountId:'reserve',side:'credit',units}]};
}

test('records exact large units and commits postings, chain, and outbox together',async()=>{
  const units='123456789012345678901234567890123456789012345678901234567890';
  const result=await ledger.post(deposit('large',units));
  assert.equal(result.sequence,'1');
  assert.equal((await ledger.balances()).find(a=>a.id==='reserve')?.units,units);
  assert.equal((await ledger.verify()).ok,true);
  const counts=await admin.query('SELECT (SELECT count(*) FROM orio_ledger.journals) j,(SELECT count(*) FROM orio_ledger.postings) p,(SELECT count(*) FROM orio_ledger.outbox) o');
  assert.deepEqual(counts.rows[0],{j:'1',p:'2',o:'1'});
});
test('same semantic request replays one receipt, even with posting order reversed',async()=>{
  const request=deposit(); const first=await ledger.post(request);
  assert.deepEqual(await ledger.post({...request,postings:[...request.postings].reverse()}),first);
  await assert.rejects(ledger.post({...request,description:'Changed request'}),/Idempotency conflict/);
});
test('different retry keys cannot post the same external settlement twice',async()=>{
  const request=deposit(); await ledger.post(request);
  await assert.rejects(ledger.post({...request,idempotencyKey:'different-key'}),/already recorded/);
  assert.equal((await ledger.verify()).head.sequence,'1');
});
test('rejections leave no accounting or outbox side effects',async()=>{
  const request=deposit();
  request.postings[1]!.units='999';
  await assert.rejects(ledger.post(request),/Unbalanced/);
  assert.equal((await ledger.verify()).head.sequence,'0');
  assert.deepEqual(await ledger.claim(10,10),[]);
  await assert.rejects(ledger.post(payout('unfunded','1')),/Insufficient/);
});
test('database boundary rejects floats, numeric JSON, zero, signs, exponent notation, oversized amounts and duplicate accounts',async()=>{
  for (const invalid of ['1.5',1,'0','-1','+1','01','1e3','1'.repeat(79),null]) {
    await assert.rejects(runtime.query('SELECT * FROM orio_ledger.post_journal($1,$2,$3,$4)',[
      'invalid','invalid','Invalid units',JSON.stringify([{accountId:'reserve',side:'debit',units:invalid},{accountId:'customer',side:'credit',units:invalid}])]),/Invalid posting/);
  }
  await assert.rejects(ledger.post({...deposit(),postings:[
    {accountId:'reserve',side:'debit',units:'1'},{accountId:'reserve',side:'credit',units:'1'}]}),/Duplicate account/);
  await assert.rejects(ledger.post({...deposit(),postings:[
    {accountId:'missing',side:'debit',units:'1'},{accountId:'customer',side:'credit',units:'1'}]}),/Unknown account/);
});
test('cross-asset debits and credits never offset each other',async()=>{
  await ledger.createAccount({id:'other',asset:'ORIO_ATOMIC',normalSide:'credit',allowNegative:false});
  const request=deposit();request.postings[1]!.accountId='other';
  await assert.rejects(ledger.post(request),/Unbalanced journal for asset/);
});
test('concurrent identical requests produce one journal and one outbox event',async()=>{
  const receipts=await Promise.all(Array.from({length:25},()=>ledger.post(deposit())));
  assert.equal(new Set(receipts.map(r=>r.eventHash)).size,1);
  assert.equal((await ledger.verify()).head.sequence,'1');
  assert.equal((await ledger.claim(100,10)).length,1);
});
test('concurrent independent journals form one unbroken chain',async()=>{
  await Promise.all(Array.from({length:30},(_,i)=>ledger.post(deposit(`concurrent-${i}`,'100'))));
  const verification=await ledger.verify();
  assert.equal(verification.ok,true,verification.issues.join(';'));
  assert.equal(verification.head.sequence,'30');
  assert.equal((await ledger.balances()).find(a=>a.id==='customer')?.units,'3000');
});
test('concurrent spending cannot overdraw a protected account',async()=>{
  await ledger.post(deposit('seed','100'));
  const results=await Promise.allSettled([ledger.post(payout('a','80')),ledger.post(payout('b','80'))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await ledger.balances()).find(a=>a.id==='customer')?.units,'20');
  assert.equal((await ledger.verify()).ok,true);
});
test('a failure while writing the outbox rolls back the whole journal',async()=>{
  await admin.query(`CREATE FUNCTION orio_ledger.fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected outbox failure'; END $$;
    CREATE TRIGGER fail_outbox BEFORE INSERT ON orio_ledger.outbox FOR EACH ROW EXECUTE FUNCTION orio_ledger.fail_outbox()`);
  await assert.rejects(ledger.post(deposit()),/Injected outbox failure/);
  assert.equal((await ledger.verify()).head.sequence,'0');
  assert.equal((await ledger.balances()).find(a=>a.id==='reserve')?.units,'0');
});
test('runtime database role cannot rewrite or truncate accounting or forge delivery state',async()=>{
  await ledger.post(deposit());
  for (const query of ['UPDATE orio_ledger.journals SET external_ref=\'tampered\'','DELETE FROM orio_ledger.postings',
    'TRUNCATE orio_ledger.journals CASCADE','INSERT INTO orio_ledger.accounts VALUES(\'fake\',\'USD\',\'debit\',true)',
    'UPDATE orio_ledger.outbox SET delivered_at=now()','UPDATE orio_ledger.chain_head SET sequence=0'])
    await assert.rejects(runtime.query(query),/permission denied/);
  await assert.rejects(admin.query('UPDATE orio_ledger.journals SET external_ref=\'tampered\''),/append-only/);
  await assert.rejects(ledger.createAccount({id:'customer',asset:'OTHER',normalSide:'credit',allowNegative:false}),/definition conflict/);
});
test('compensating journals preserve history and external checkpoints',async()=>{
  const original=await ledger.post(deposit()); await ledger.post(payout('reversal','100000000'));
  const result=await ledger.verify(original);
  assert.equal(result.ok,true); assert.equal(result.head.sequence,'2');
  assert.equal((await ledger.balances()).find(a=>a.id==='customer')?.units,'0');
  assert.equal((await ledger.verify({sequence:'1',eventHash:'f'.repeat(64)})).ok,false);
});
test('concurrent workers claim distinct events; successful acknowledgements are idempotently fenced',async()=>{
  await Promise.all(Array.from({length:10},(_,i)=>ledger.post(deposit(`event-${i}`))));
  const batches=await Promise.all([ledger.claim(5,10),ledger.claim(5,10)]);
  const events=batches.flat();assert.equal(events.length,10);
  assert.equal(new Set(events.map(e=>e.sequence)).size,10);
  const first=events[0]!;
  assert.equal(await ledger.finish(first.sequence,first.token,true),true);
  assert.equal(await ledger.finish(first.sequence,first.token,true),false);
  assert.deepEqual(await ledger.claim(10,10),[]);
});
test('expired leases are redelivered with new tokens and stale worker completion fails',async()=>{
  await ledger.post(deposit());const first=(await ledger.claim(1,1))[0]!;
  await admin.query('UPDATE orio_ledger.outbox SET leased_until=now()-interval \'1 second\'');
  assert.equal(await ledger.finish(first.sequence,first.token,true),false);
  const next=(await ledger.claim(1,10))[0]!;
  assert.notEqual(next.token,first.token);assert.equal(next.attempts,2);
  assert.equal(await ledger.finish(first.sequence,first.token,true),false);
  assert.equal(await ledger.finish(next.sequence,next.token,true),true);
});
test('retry delay and bounded attempts produce a dead-letter record',async()=>{
  await ledger.post(deposit());const first=(await ledger.claim(1,10))[0]!;
  assert.equal(await ledger.finish(first.sequence,first.token,false,60),true);
  assert.deepEqual(await ledger.claim(1,10),[]);
  await admin.query('UPDATE orio_ledger.outbox SET next_attempt_at=now()-interval \'1 second\'');
  for (let attempt=2;attempt<=10;attempt++) {
    const event=(await ledger.claim(1,10))[0]!;
    assert.equal(event.attempts,attempt);assert.equal(await ledger.finish(event.sequence,event.token,false),true);
  }
  assert.deepEqual(await ledger.claim(1,10),[]);
  assert.equal((await admin.query('SELECT dead_letter_at IS NOT NULL AS dead FROM orio_ledger.outbox')).rows[0].dead,true);
});
test('verification detects owner-level tampering with payloads and account definitions',async()=>{
  let checkpoint:Receipt=await ledger.post(deposit());
  await admin.query('ALTER TABLE orio_ledger.journals DISABLE TRIGGER immutable_rows');
  await admin.query(`UPDATE orio_ledger.journals SET payload=jsonb_set(payload,'{description}','"rewritten"')`);
  assert.equal((await ledger.verify(checkpoint)).ok,false);
  await admin.query('ALTER TABLE orio_ledger.journals ENABLE TRIGGER immutable_rows');
  await admin.query('ALTER TABLE orio_ledger.accounts DISABLE TRIGGER immutable_rows');
  await admin.query(`UPDATE orio_ledger.accounts SET asset='ALTERED'`);
  const result=await ledger.verify();
  assert.ok(result.issues.some(i=>i.includes('Account definition mismatch')));
});
