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
