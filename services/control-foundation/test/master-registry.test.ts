import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { initialMasterAsset } from '../src/initial-master.ts';
import { ProtocolReader } from '../src/protocol-api.ts';

const url = new URL(process.env.ORIO_TEST_DATABASE_URL ?? 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/orio_test')
  throw new Error('Use the isolated local PostgreSQL test database');

const admin = new Pool({ connectionString: url.href });
const publicUrl=new URL(url);publicUrl.username='orio_master_public_reader';publicUrl.password='orio-local-reader-only';
const publicPool=new Pool({connectionString:publicUrl.href});
const initialAsset = initialMasterAsset(84532);
const evidence = 'a'.repeat(64);
const activate = (expected: string | null, election: string, asset: string) =>
  admin.query('SELECT orio_master.activate($1, $2, $3, $4, $5)', [expected, election, asset, evidence, evidence]);
const current = async () => (await admin.query(
  'SELECT election_id, state FROM orio_master.current_election',
)).rows;

before(async () => {
  const migration = await readFile(new URL('../migrations/002_master_registry.sql', import.meta.url), 'utf8');
  await admin.query(migration);
  await admin.query('CREATE ROLE orio_master_test_unprivileged NOLOGIN');
  await admin.query("CREATE ROLE orio_master_public_reader LOGIN PASSWORD 'orio-local-reader-only';GRANT USAGE ON SCHEMA orio_master TO orio_master_public_reader;GRANT SELECT ON orio_master.assets,orio_master.elections,orio_master.current_election TO orio_master_public_reader");
  for (const asset of [initialAsset, ...['2', '3'].map(suffix => ({
    assetId: `asset-${suffix}`, issuer: 'Test issuer', tokenAddress: `0x${suffix.repeat(40)}`,
  }))]) {
    await admin.query(
      'INSERT INTO orio_master.assets VALUES ($1, $2, 84532, $3, 6, $4, $5, $6, $7, $8)',
      [asset.assetId, asset.issuer, asset.tokenAddress, 'Oracle policy', 'Liquidity policy',
        'Redemption policy', 'Synthetic', evidence],
    );
  }
});

after(async () => {
 await publicPool.end();await admin.query('REVOKE ALL ON ALL TABLES IN SCHEMA orio_master FROM orio_master_public_reader;REVOKE ALL ON SCHEMA orio_master FROM orio_master_public_reader;DROP ROLE orio_master_public_reader');await admin.end();
});

test('serializes competing elections and preserves the predecessor on replacement', async () => {
  assert.deepEqual(await current(), [{ election_id: null, state: 'DEPOSIT_PAUSED' }]);
  assert.deepEqual(await new ProtocolReader(publicPool).master(), {
    electionId: null, state: 'DEPOSIT_PAUSED', asset: null,
  });
  const initial = await Promise.allSettled([activate(null, 'initial-a', initialAsset.assetId), activate(null, 'initial-b', initialAsset.assetId)]);
  assert.equal(initial.filter(result => result.status === 'fulfilled').length, 1);
  const [first] = await current();
  await assert.rejects(activate(first.election_id, 'premature', 'asset-2'), /requires migration/);

  await admin.query("UPDATE orio_master.current_election SET state = 'MIGRATING'");
  await assert.rejects(activate(first.election_id, 'missing-asset', 'unknown'), /foreign key/);
  assert.deepEqual(await current(), [{ election_id: first.election_id, state: 'MIGRATING' }]);

  const replacements = await Promise.allSettled([
    activate(first.election_id, 'replacement-a', 'asset-2'),
    activate(first.election_id, 'replacement-b', 'asset-3'),
  ]);
  assert.equal(replacements.filter(result => result.status === 'fulfilled').length, 1);
  const [active] = await current();
  assert.equal(active.state, 'ACTIVE_MASTER');
  const publicMaster = await new ProtocolReader(publicPool).master();
  assert.equal(publicMaster.electionId, active.election_id);
  assert.equal(publicMaster.state, 'ACTIVE_MASTER');
  assert.equal(publicMaster.asset?.chainId, '84532');
  const history = await admin.query('SELECT predecessor FROM orio_master.elections WHERE election_id = $1', [active.election_id]);
  assert.deepEqual(history.rows, [{ predecessor: first.election_id }]);
  assert.equal((await admin.query('SELECT election_id FROM orio_master.elections')).rowCount, 2);
});

test('unprivileged roles cannot change the elected master', async () => {
  const client = await admin.connect();
  try {
    await client.query('SET ROLE orio_master_test_unprivileged');
    await assert.rejects(client.query("UPDATE orio_master.current_election SET state = 'ACTIVE_MASTER'"), /permission denied/);
    await assert.rejects(client.query('SELECT orio_master.activate(NULL, $1, $2, $3, $4)',
      ['unauthorized', initialAsset.assetId, evidence, evidence]), /permission denied/);
  } finally {
    await client.query('RESET ROLE');
    client.release();
  }
});

test('selects the native Circle contract for each supported chain', () => {
  const mainnet = initialMasterAsset(8453);
  assert.equal(mainnet.tokenAddress, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  assert.equal(initialAsset.tokenAddress, '0x036cbd53842c5426634e7929541ec2318f3dcf7e');
  assert.equal(mainnet.decimals, 6);
  assert.equal(initialAsset.decimals, 6);
  assert.notEqual(mainnet.assetId, initialAsset.assetId);
  assert.throws(() => initialMasterAsset(1), /Unsupported initial master chain/);
});
