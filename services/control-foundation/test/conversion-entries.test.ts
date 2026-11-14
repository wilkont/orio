import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { ConversionEntries } from '../src/conversion-entries.ts';

const url = new URL(process.env.ORIO_TEST_DATABASE_URL ?? 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/orio_test')
  throw new Error('Use the isolated local PostgreSQL test database');
const pool = new Pool({ connectionString: url.href });
const digest = 'a'.repeat(64);
const store = new ConversionEntries(pool);

before(async () => {
  // Independent schemas avoid cross-file test resets.
  // This suite uses the ledger's append-only trigger only, without its tables.
  await pool.query('CREATE SCHEMA conversion_test_helpers');
  await pool.query(`CREATE FUNCTION conversion_test_helpers.reject_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only'; END $$`);
  await pool.query('CREATE SCHEMA conversion_test_master');
  await pool.query('CREATE TABLE conversion_test_master.elections (election_id text PRIMARY KEY, asset_id text)');
  await pool.query(`CREATE TABLE conversion_test_master.current_election
    (singleton boolean PRIMARY KEY, election_id text REFERENCES conversion_test_master.elections, state text)`);
  await pool.query("INSERT INTO conversion_test_master.elections VALUES ('election-1','master'), ('election-2','replacement')");
  await pool.query("INSERT INTO conversion_test_master.current_election VALUES (true,'election-1','ACTIVE_MASTER')");
  const sql = (await readFile(new URL('../migrations/003_conversion_entries.sql', import.meta.url), 'utf8'))
    .replaceAll('orio_ledger.reject_mutation', 'conversion_test_helpers.reject_mutation')
    .replaceAll('orio_master.', 'conversion_test_master.');
  await pool.query(sql);
});
after(async () => { await pool.end(); });

async function open(id: string, source = 'secondary') {
  await pool.query(`INSERT INTO orio_conversion.entries
    (intent_id,owner_ref,source_asset_id,source_units,election_id,reserve_vault_id,
     minimum_master_units,quote_digest,quote_expires_at)
    VALUES ($1,'owner',$2,'100000000','election-1','vault','99000000',$3,clock_timestamp()+interval '5 minutes')`,
  [id, source, digest]);
}
async function event(id: string, version: string, kind: string, evidence: object, key = id + ':' + version) {
  return (await pool.query(`SELECT * FROM orio_conversion.record_event($1,$2,$3,$4,$5::jsonb)`,
    [key, id, version, kind, JSON.stringify({ intentId: id, digest, ...evidence })])).rows[0];
}
const deposit = (id: string, assetId = 'secondary') =>
  event(id, '0', 'DEPOSIT_CONFIRMED', { assetId, units: '100000000', externalRef: id + ':deposit' });

test('persists finalized source receipt and serializes repeated conversion attempts', async () => {
  await open('entry');
  const first = await deposit('entry');
  assert.equal(first.resulting_state, 'FUNDED');
  assert.deepEqual(await deposit('entry'), first);
  await assert.rejects(event('entry', '0', 'DEPOSIT_CONFIRMED',
    { assetId: 'secondary', units: '1', externalRef: 'entry:deposit' }), /idempotency conflict/);
  const attempts = await Promise.allSettled([
    event('entry', '1', 'CONVERSION_STARTED', {}, 'attempt-a'),
    event('entry', '1', 'CONVERSION_STARTED', {}, 'attempt-b'),
  ]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const receipt = await event('entry', '2', 'MASTER_RECEIVED',
    { assetId: 'master', units: '99500000', vaultId: 'vault', externalRef: 'entry:swap' });
  assert.equal(receipt.resulting_state, 'MASTER_RECEIVED');
});

test('preserves failed conversions as durable source refund claims', async () => {
  await open('failed');
  await deposit('failed');
  await assert.rejects(event('failed', '1', 'CONVERSION_FAILED', {}), /refund claim/);
  const failure = await event('failed', '1', 'CONVERSION_FAILED',
    { refundableAssetId: 'secondary', refundableUnits: '100000000' });
  assert.equal(failure.resulting_state, 'REFUND_DUE');
  await assert.rejects(event('failed', '2', 'REFUND_CONFIRMED',
    { assetId: 'secondary', units: '100000000', ownerRef: 'wrong', externalRef: 'refund' }), /discharge/);
  assert.equal((await event('failed', '2', 'REFUND_CONFIRMED',
    { assetId: 'secondary', units: '100000000', ownerRef: 'owner', externalRef: 'refund' })).resulting_state, 'REFUNDED');
  await assert.rejects(event('failed', '3', 'CONVERSION_STARTED', {}), /Invalid conversion transition/);
});

test('accepts direct master deposits and prevents secondary assets bypassing conversion', async () => {
  await open('direct', 'master');
  await deposit('direct', 'master');
  assert.equal((await event('direct', '1', 'MASTER_RECEIVED',
    { assetId: 'master', units: '100000000', vaultId: 'vault', externalRef: 'direct:deposit' })).resulting_state,
  'MASTER_RECEIVED');
  await open('bypass');
  await deposit('bypass');
  await assert.rejects(event('bypass', '1', 'MASTER_RECEIVED',
    { assetId: 'master', units: '100000000', vaultId: 'vault', externalRef: 'bypass:master' }), /requires conversion/);
});

test('refuses duplicate external receipts without advancing the second intent', async () => {
  await open('duplicate');
  await assert.rejects(event('duplicate', '0', 'DEPOSIT_CONFIRMED',
    { assetId: 'secondary', units: '100000000', externalRef: 'entry:deposit' }), /another intent/);
  assert.equal((await pool.query("SELECT state FROM orio_conversion.entries WHERE intent_id='duplicate'")).rows[0].state, 'REQUESTED');
});

test('rejects low proceeds, numeric money and wrong vault before recording master credit', async () => {
  await open('limits'); await deposit('limits');
  await event('limits', '1', 'CONVERSION_STARTED', {});
  for (const invalid of [{ units: '98999999' }, { units: 100000000 }, { vaultId: 'wrong' }]) {
    await assert.rejects(event('limits', '2', 'MASTER_RECEIVED',
      { assetId: 'master', units: '100000000', vaultId: 'vault', externalRef: 'limits:swap', ...invalid }));
  }
  assert.equal((await pool.query("SELECT state FROM orio_conversion.entries WHERE intent_id='limits'")).rows[0].state, 'CONVERTING');
});

test('blocks stale-election master receipts and preserves pending claims', async () => {
  await pool.query("UPDATE conversion_test_master.current_election SET election_id='election-2'");
  await assert.rejects(event('limits', '2', 'MASTER_RECEIVED',
    { assetId: 'master', units: '100000000', vaultId: 'vault', externalRef: 'limits:swap' }), /election/);
  assert.equal((await pool.query("SELECT state FROM orio_conversion.entries WHERE intent_id='limits'")).rows[0].state, 'CONVERTING');
  await assert.rejects(pool.query("DELETE FROM orio_conversion.events"), /Append-only/);
});

test('public store API opens one immutable intent and returns durable event receipts', async () => {
  const intent = {
    intentId: 'api', ownerRef: 'owner', sourceAssetId: 'secondary', sourceUnits: '100000000',
    electionId: 'election-2', reserveVaultId: 'vault', minimumMasterUnits: '99000000',
    quoteDigest: digest, quoteExpiresAt: '2099-01-01T00:00:00.000Z',
  };
  await store.open(intent);
  await store.open(intent);
  await assert.rejects(store.open({ ...intent, ownerRef: 'another-owner' }), /idempotency conflict/);
  assert.deepEqual(await store.record({
    eventId: 'api:deposit', intentId: 'api', expectedVersion: '0', kind: 'DEPOSIT_CONFIRMED',
    evidence: { intentId: 'api', digest, assetId: 'secondary', units: '100000000', externalRef: 'api:deposit' },
  }), { state: 'FUNDED', version: '1' });
});

test('rejects numeric source amounts and deposit receipts reused as refund evidence', async () => {
  await open('replay');
  await assert.rejects(event('replay', '0', 'DEPOSIT_CONFIRMED',
    { assetId: 'secondary', units: 100000000, externalRef: 'replay:deposit' }), /does not match/);
  await deposit('replay');
  await event('replay', '1', 'CONVERSION_FAILED',
    { refundableAssetId: 'secondary', refundableUnits: '100000000' });
  await assert.rejects(event('replay', '2', 'REFUND_CONFIRMED',
    { assetId: 'secondary', units: '100000000', ownerRef: 'owner', externalRef: 'replay:deposit' }),
  /another operation/);
  assert.equal((await pool.query("SELECT state FROM orio_conversion.entries WHERE intent_id='replay'")).rows[0].state, 'REFUND_DUE');
});

test('expired quotes and changed elections prevent routing while preserving the deposit', async () => {
  await open('expired');
  await deposit('expired');
  await pool.query("UPDATE orio_conversion.entries SET quote_expires_at='2000-01-01' WHERE intent_id='expired'");
  await assert.rejects(event('expired', '1', 'CONVERSION_STARTED', {}), /expired/);
  await open('changed');
  await deposit('changed');
  await assert.rejects(event('changed', '1', 'CONVERSION_STARTED', {}), /election/);
  assert.equal((await pool.query("SELECT state FROM orio_conversion.entries WHERE intent_id='changed'")).rows[0].state, 'FUNDED');
});

// Additive migration 004 is applied only after the legacy 003 behavior tests above.
test('atomic route-start guard (migration 004)', async t => {
  const { recordConversionRouteStart } = await import('../src/conversion-route-start.ts');
  await t.test('recorder fails closed before migration 004 is installed', async () => {
    const q = {} as Parameters<typeof recordConversionRouteStart>[3];
    const lim = {} as Parameters<typeof recordConversionRouteStart>[4];
    await assert.rejects(recordConversionRouteStart(pool,'missing-migration','0',q,lim), /record_route_start.*does not exist/);
  });
  const sql = (await readFile(new URL('../migrations/004_conversion_route_start.sql', import.meta.url), 'utf8'))
    .replaceAll('orio_master.', 'conversion_test_master.');
  await pool.query(sql);
  await pool.query("UPDATE conversion_test_master.current_election SET election_id='election-1',state='ACTIVE_MASTER'");
  await pool.query("INSERT INTO orio_conversion.eligible_routes VALUES ('provider','route','secondary','master',true)");
  async function prepared(id: string, lifetime = 60000) {
    await open(id); const now = Date.now(); const expiry = now + lifetime;
    await pool.query('UPDATE orio_conversion.entries SET quote_expires_at=$2::timestamptz WHERE intent_id=$1', [id, new Date(expiry).toISOString()]);
    await deposit(id);
    const binding = { intentId: id, sourceAssetId: 'secondary', sourceUnits: '100000000', masterAssetId: 'master', electionId: 'election-1', reserveVaultId: 'vault' };
    const quote = { ...binding, providerId: 'provider', routeId: 'route', quoteDigest: digest, minimumMasterUnits: '99000000', issuedAtMs: now - 1000, expiresAtMs: expiry };
    const independent = { ...binding, evidenceDigest: 'b'.repeat(64), minimumMasterUnits: '99000000', issuedAtMs: now - 1000, expiresAtMs: expiry };
    return { quote, independent };
  }
  async function unchanged(id: string) {
    assert.deepEqual((await pool.query('SELECT state,version::text FROM orio_conversion.entries WHERE intent_id=$1',[id])).rows[0], { state: 'FUNDED', version: '1' });
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM orio_conversion.events WHERE intent_id=$1 AND kind='CONVERSION_STARTED'",[id])).rows[0].n, 0);
  }
  await t.test('typed recorder commits once, identical retries replay and conflicting event IDs fail', async () => {
    const { quote, independent } = await prepared('atomic');
    const a = await recordConversionRouteStart(pool,'atomic:start','1',quote,independent);
    assert.deepEqual(a,{state:'CONVERTING',version:'2'});
    assert.deepEqual(await recordConversionRouteStart(pool,'atomic:start','1',quote,independent),a);
    await assert.rejects(recordConversionRouteStart(pool,'atomic:start','1',{...quote,routeId:'other'},independent), /idempotency conflict/);
    await assert.rejects(recordConversionRouteStart(pool,'atomic:second','1',quote,independent), /version changed/);
  });
  await t.test('generic event path cannot bypass full route evidence and rolls back state', async () => {
    await prepared('generic');
    await assert.rejects(event('generic','1','CONVERSION_STARTED',{}), /Missing authenticated/);
    await unchanged('generic');
  });
  await t.test('stored quote, independent bindings, floor and route policy are authoritative', async () => {
    const {quote,independent}=await prepared('mismatch');
    for (const patch of [{quoteDigest:'c'.repeat(64)},{minimumMasterUnits:'99000001'},{expiresAtMs:quote.expiresAtMs+1},{reserveVaultId:'other'},{providerId:'other'},{sourceUnits:100000000}]) {
      await assert.rejects(recordConversionRouteStart(pool,'mismatch:start','1',{...quote,...patch} as typeof quote,independent));
      await unchanged('mismatch');
    }
    for (const patch of [{minimumMasterUnits:'99000001'},{minimumMasterUnits:99000000},{expiresAtMs:Date.now()-1},{issuedAtMs:Date.now()+60000},{evidenceDigest:'bad'},{intentId:'other'}]) {
      await assert.rejects(recordConversionRouteStart(pool,'mismatch:start','1',quote,{...independent,...patch} as typeof independent));
      await unchanged('mismatch');
    }
    await pool.query('UPDATE orio_conversion.eligible_routes SET enabled=false');
    await assert.rejects(recordConversionRouteStart(pool,'mismatch:start','1',quote,independent), /not eligible/);
    await unchanged('mismatch');
    await pool.query('UPDATE orio_conversion.eligible_routes SET enabled=true');
  });
  await t.test('concurrent independent start IDs produce one durable transition', async () => {
    const {quote,independent}=await prepared('race');
    const results=await Promise.allSettled(['a','b'].map(key=>recordConversionRouteStart(pool,'race:'+key,'1',quote,independent)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM orio_conversion.events WHERE intent_id='race' AND kind='CONVERSION_STARTED'")).rows[0].n,1);
  });
  for (const lock of ['election','route'] as const) await t.test(`expiration after waiting on ${lock} lock rolls back transition`, async () => {
    const id='wait-'+lock;
    const {quote,independent}=await prepared(id,200);
    const blocker=await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(lock==='election'?'SELECT * FROM conversion_test_master.current_election FOR UPDATE':'SELECT * FROM orio_conversion.eligible_routes FOR UPDATE');
      const attempt=recordConversionRouteStart(pool,id+':start','1',quote,independent);
      // Attach rejection handling immediately so rejection after release is observed.
      const rejection=assert.rejects(attempt,/expired/i);
      await new Promise(resolve=>setTimeout(resolve,350));
      await blocker.query('COMMIT');
      await rejection;
      await unchanged(id);
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  });
  await t.test('changed election and preserved refund claim cannot start', async () => {
    const {quote,independent}=await prepared('gate');
    await pool.query("UPDATE conversion_test_master.current_election SET state='DEPOSIT_PAUSED'");
    await assert.rejects(recordConversionRouteStart(pool,'gate:start','1',quote,independent), /unavailable/);
    await unchanged('gate');
    await pool.query("UPDATE conversion_test_master.current_election SET state='ACTIVE_MASTER'");
    await event('gate','1','CONVERSION_FAILED',{refundableAssetId:'secondary',refundableUnits:'100000000'});
    await assert.rejects(recordConversionRouteStart(pool,'gate:start','2',quote,independent),/Invalid conversion transition/);
  });
});
