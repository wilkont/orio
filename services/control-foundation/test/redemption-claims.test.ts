import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { RedemptionClaims } from '../src/redemption-claims.ts';
const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/orio_test') throw new Error('Use isolated test database');
const pool=new Pool({connectionString:url.href}); const store=new RedemptionClaims(pool); const digest='a'.repeat(64);
before(async()=>{
 await pool.query(`CREATE SCHEMA redemption_test; CREATE FUNCTION redemption_test.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only'; END $$;
 CREATE TABLE redemption_test.elections(election_id text PRIMARY KEY,asset_id text);
 CREATE TABLE redemption_test.current_election(singleton boolean PRIMARY KEY,election_id text,state text);
 INSERT INTO redemption_test.elections VALUES('e1','master'),('e2','replacement');
 INSERT INTO redemption_test.current_election VALUES(true,'e1','ACTIVE_MASTER')`);
 const sql=(await readFile(new URL('../migrations/005_redemption_claims.sql',import.meta.url),'utf8'))
 .replaceAll('orio_master.','redemption_test.').replaceAll('orio_ledger.reject_mutation','redemption_test.reject_mutation');
 await pool.query(sql);
});
after(async()=>{await pool.end();});
function request(id:string,lifetime=60000) { return {requestId:id,ownerRef:'owner',tokenAssetId:'orio',tokenUnits:'9007199254740993',payoutAssetId:'master',payoutUnits:'999999',recipientRef:'recipient',electionId:'e1',quoteDigest:digest,quoteExpiresAt:new Date(Date.now()+lifetime).toISOString()}; }
function evidence(id:string,extra:Record<string,unknown>={}) {return {requestId:id,electionId:'e1',digest,...extra};}
function claim(id:string,ref=id+':claim') {return store.record(id+':claim-event',id,'0','CLAIM_VERIFIED',evidence(id,{ownerRef:'owner',tokenAssetId:'orio',tokenUnits:'9007199254740993',claimRef:ref}));}
function prepared(id:string) {return store.record(id+':prepare',id,'1','SETTLEMENT_PREPARED',evidence(id,{quoteDigest:digest,recipientRef:'recipient',payoutAssetId:'master',payoutUnits:'999999'}));}
function finalEvidence(id:string) {return evidence(id,{ownerRef:'owner',tokenAssetId:'orio',tokenUnits:'9007199254740993',recipientRef:'recipient',payoutAssetId:'master',payoutUnits:'999999',burnRef:id+':burn',payoutRef:id+':payout'});}
async function pending(id:string) {await store.open(request(id));await claim(id);await prepared(id);}

test('immutable request retries agree and conflicting ownership/amounts are rejected',async()=>{
 const r=request('open'); await store.open(r);await store.open(r);
 await assert.rejects(store.open({...r,payoutUnits:'1'}),/idempotency conflict/);
 for(const amount of [1,null,'01','1.1','0','9'.repeat(79)]) await assert.rejects(store.open({...request('bad'),tokenUnits:amount} as typeof r),/quantity/);
 await assert.rejects(store.open({...request('infinite'),quoteExpiresAt:'infinity'}));
 for(const table of ['requests','events','receipts']) await assert.rejects(pool.query(`TRUNCATE orio_redemption.${table} CASCADE`));
 await assert.rejects(pool.query("UPDATE orio_redemption.requests SET payout_units='1' WHERE request_id='open'"),/Append-only/);
});
test('exact final evidence discharges claim once; event retries are historical receipts',async()=>{
 await pending('complete'); const e=finalEvidence('complete');
 const a=await store.record('complete:final','complete','2','SETTLEMENT_CONFIRMED',e);
 assert.deepEqual(a,{state:'SETTLED',version:'3'});
 assert.deepEqual(await store.record('complete:final','complete','2','SETTLEMENT_CONFIRMED',e),a);
 await assert.rejects(store.record('complete:final','complete','2','SETTLEMENT_CONFIRMED',{...e,payoutUnits:'1'}),/idempotency conflict/);
 await assert.rejects(store.record('again','complete','3','SETTLEMENT_PREPARED',e),/Invalid redemption transition/);
});
test('competing events and duplicate claim references cannot claim twice',async()=>{
 await store.open(request('race'));
 const results=await Promise.allSettled(['a','b'].map(key=>store.record(key,'race','0','CLAIM_VERIFIED',evidence('race',{ownerRef:'owner',tokenAssetId:'orio',tokenUnits:'9007199254740993',claimRef:'race:claim'}))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await store.open(request('duplicate'));await assert.rejects(claim('duplicate','race:claim'),/duplicate key/);
 assert.equal((await pool.query("SELECT count(*)::int n FROM orio_redemption.events WHERE request_id='duplicate'")).rows[0].n,0);
});
test('failed/mismatched and partial settlement evidence preserves pending claim atomically',async()=>{
 await pending('wrong');const e=finalEvidence('wrong');
 for(const patch of [{ownerRef:'other'},{tokenUnits:'9007199254740992'},{payoutUnits:'999998'},{payoutUnits:999999},{recipientRef:'other'},{electionId:'e2'},{burnRef:null},{payoutRef:''},{payoutRef:'wrong:burn'},{payoutRef:'wrong:claim'}])
   await assert.rejects(store.record('wrong:final','wrong','2','SETTLEMENT_CONFIRMED',{...e,...patch}));
 assert.equal((await pool.query("SELECT count(*)::int n FROM orio_redemption.receipts WHERE request_id='wrong' AND kind<>'CLAIM'")).rows[0].n,0);
 assert.equal((await pool.query("SELECT max(resulting_version)::text v FROM orio_redemption.events WHERE request_id='wrong'")).rows[0].v,'2');
});
test('burn/payout identities cannot discharge another request or masquerade as claim receipts',async()=>{
 await pending('first');await store.record('first:final','first','2','SETTLEMENT_CONFIRMED',finalEvidence('first'));
 await pending('second');
 for(const patch of [{burnRef:'first:burn'},{payoutRef:'first:payout'},{burnRef:'first:payout'},{payoutRef:'first:burn'}])
   await assert.rejects(store.record('second:final','second','2','SETTLEMENT_CONFIRMED',{...finalEvidence('second'),...patch}),/duplicate key/);
});
test('uncertain execution preserves claim, disallows retry, and accepts authenticated historical completion after pause',async()=>{
 await pending('uncertain');
 assert.deepEqual(await store.record('uncertain:review','uncertain','2','EXECUTION_UNCERTAIN',evidence('uncertain')),{state:'REVIEW_REQUIRED',version:'3'});
 await assert.rejects(store.record('uncertain:retry','uncertain','3','SETTLEMENT_PREPARED',evidence('uncertain')),/Invalid redemption transition/);
 await pool.query("UPDATE redemption_test.current_election SET election_id='e2',state='DEPOSIT_PAUSED'");
 assert.deepEqual(await store.record('uncertain:final','uncertain','3','SETTLEMENT_CONFIRMED',finalEvidence('uncertain')),{state:'SETTLED',version:'4'});
 await pool.query("UPDATE redemption_test.current_election SET election_id='e1',state='ACTIVE_MASTER'");
});
test('preparation rejects stale election, expired quotes and changed frozen economics',async()=>{
 await store.open(request('prepare'));await claim('prepare');
 await pool.query("UPDATE redemption_test.current_election SET state='DEPOSIT_PAUSED'");await assert.rejects(prepared('prepare'),/unavailable/);
 await pool.query("UPDATE redemption_test.current_election SET state='ACTIVE_MASTER'");
 await assert.rejects(store.record('prepare:bad','prepare','1','SETTLEMENT_PREPARED',evidence('prepare',{quoteDigest:digest,recipientRef:'recipient',payoutAssetId:'master',payoutUnits:'1'})),/differs/);
 await store.open(request('expired',-1));await claim('expired');await assert.rejects(prepared('expired'),/expired/);
});
test('preparation rechecks expiry after election-lock wait without losing verified claim',async()=>{
 await store.open(request('wait',200));await claim('wait');const blocker=await pool.connect();
 try {await blocker.query('BEGIN');await blocker.query('SELECT * FROM redemption_test.current_election FOR UPDATE');
 const rejected=assert.rejects(prepared('wait'),/expired/);await new Promise(r=>setTimeout(r,350));await blocker.query('COMMIT');await rejected;
 assert.equal((await pool.query("SELECT max(resulting_version)::text v FROM orio_redemption.events WHERE request_id='wait'")).rows[0].v,'1');
 }finally{await blocker.query('ROLLBACK');blocker.release();}
});
