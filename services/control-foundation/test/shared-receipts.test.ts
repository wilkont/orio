import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ConversionEntries } from '../src/conversion-entries.ts';
import { RedemptionClaims } from '../src/redemption-claims.ts';
import { MasterReceiptAccounting } from '../src/master-receipt-accounting.ts';
import { ControlLedger } from '../src/ledger.ts';

const rootUrl = new URL(process.env.ORIO_TEST_DATABASE_URL ?? 'about:blank');
if (!['127.0.0.1', 'localhost'].includes(rootUrl.hostname) || rootUrl.pathname !== '/orio_test')
  throw new Error('Use the isolated local PostgreSQL test harness');
const evidence = 'a'.repeat(64);
const registrySql = await readFile(new URL('../migrations/006_shared_receipt_claims.sql', import.meta.url), 'utf8');

async function fixture(run: (pool: Pool) => Promise<void>, installRegistry = true) {
  const root = new Pool({ connectionString: rootUrl.href });
  const name = 'orio_test_receipts_' + randomUUID().replaceAll('-', '');
  const runtime = name + '_rt';
  const url = new URL(rootUrl);
  url.pathname = '/' + name;
  let pool: Pool | undefined;
  let created = false;
  try {
    await root.query('CREATE DATABASE ' + name);
    created = true;
    pool = new Pool({ connectionString: url.href });
    for (const migration of [
      '001_ledger.sql', '002_master_registry.sql', '003_conversion_entries.sql',
      '004_conversion_route_start.sql', '005_redemption_claims.sql',
    ]) {
      const sql = (await readFile(new URL('../migrations/' + migration, import.meta.url), 'utf8'))
        .replaceAll('orio_ledger_runtime', runtime);
      await pool.query(sql);
    }
    await pool.query(`INSERT INTO orio_master.assets VALUES
      ('master','Synthetic issuer',84532,$1,6,'valuation','liquidity','redemption','test',$2)`,
    ['0x' + '1'.repeat(40), evidence]);
    await pool.query('SELECT orio_master.activate(NULL,$1,$2,$3,$3)', ['election', 'master', evidence]);
    if (installRegistry) await pool.query(registrySql);
    await run(pool);
  } finally {
    if (pool) await pool.end();
    if (created) {
      await root.query('DROP DATABASE ' + name);
      await root.query('DROP ROLE IF EXISTS ' + runtime);
    }
    await root.end();
  }
}
async function entry(pool: Pool, id: string) {
  await new ConversionEntries(pool).open({
    intentId: id, ownerRef: 'owner', sourceAssetId: 'master', sourceUnits: '100',
    electionId: 'election', reserveVaultId: 'vault', minimumMasterUnits: '99',
    quoteDigest: evidence, quoteExpiresAt: '2099-01-01T00:00:00Z',
  });
}
function deposit(pool: Pool, id: string, ref: string) {
  return new ConversionEntries(pool).record({
    eventId: id + ':deposit', intentId: id, expectedVersion: '0', kind: 'DEPOSIT_CONFIRMED',
    evidence: { intentId: id, digest: evidence, assetId: 'master', units: '100', externalRef: ref },
  });
}
async function redemption(pool: Pool, id: string) {
  await new RedemptionClaims(pool).open({
    requestId: id, ownerRef: 'owner', tokenAssetId: 'orio', tokenUnits: '100',
    payoutAssetId: 'master', payoutUnits: '99', recipientRef: 'recipient',
    electionId: 'election', quoteDigest: evidence, quoteExpiresAt: '2099-01-01T00:00:00Z',
  });
}
function claim(pool: Pool, id: string, ref: string) {
  return new RedemptionClaims(pool).record(id + ':claim', id, '0', 'CLAIM_VERIFIED', {
    requestId: id, electionId: 'election', digest: evidence,
    ownerRef: 'owner', tokenAssetId: 'orio', tokenUnits: '100', claimRef: ref,
  });
}

test('one finalized receipt cannot fund conversion and a redemption claim', async () => fixture(async pool => {
  await entry(pool, 'entry'); await redemption(pool, 'redemption');
  await deposit(pool, 'entry', 'canonical-ref');
  await assert.rejects(claim(pool, 'redemption', 'canonical-ref'), /another operation/);
  assert.equal((await pool.query('SELECT count(*) FROM orio_redemption.events')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT count(*) FROM orio_redemption.receipts')).rows[0].count, '0');
  assert.deepEqual(await deposit(pool, 'entry', 'canonical-ref'), { state: 'FUNDED', version: '1' });
}));

test('concurrent cross-module claims commit exactly one owner', async () => fixture(async pool => {
  await entry(pool, 'entry'); await redemption(pool, 'redemption');
  const results = await Promise.allSettled([
    deposit(pool, 'entry', 'shared'), claim(pool, 'redemption', 'shared'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await pool.query('SELECT count(*) FROM orio_settlement.receipt_claims')).rows[0].count, '1');
}));

test('direct-master receipt alias remains valid inside its original intent', async () => fixture(async pool => {
  await entry(pool, 'direct'); await deposit(pool, 'direct', 'direct-ref');
  assert.deepEqual(await new ConversionEntries(pool).record({
    eventId: 'direct:master', intentId: 'direct', expectedVersion: '1', kind: 'MASTER_RECEIVED',
    evidence: { intentId: 'direct', digest: evidence, assetId: 'master',
      units: '100', vaultId: 'vault', externalRef: 'direct-ref' },
  }), { state: 'MASTER_RECEIVED', version: '2' });
  assert.equal((await pool.query('SELECT count(*) FROM orio_settlement.receipt_claims')).rows[0].count, '1');
  await assert.rejects(pool.query('DELETE FROM orio_settlement.receipt_claims'), /append-only/);
}));

test('upgrade backfills historical claims and refuses pre-existing cross-module conflicts', async () => fixture(async pool => {
  await entry(pool, 'entry'); await redemption(pool, 'redemption');
  await deposit(pool, 'entry', 'legacy-ref'); await claim(pool, 'redemption', 'legacy-ref');
  await assert.rejects(pool.query(registrySql), /duplicate key/);
  await pool.query('ROLLBACK');
  assert.equal((await pool.query("SELECT to_regclass('orio_settlement.receipt_claims') AS relation")).rows[0].relation, null);
  assert.equal((await pool.query('SELECT count(*) FROM orio_conversion.external_receipts')).rows[0].count, '1');
  assert.equal((await pool.query('SELECT count(*) FROM orio_redemption.receipts')).rows[0].count, '1');
}, false));

test('upgrade preserves nonconflicting history and deduplicates subsequent events', async () => fixture(async pool => {
  await entry(pool, 'entry'); await redemption(pool, 'redemption');
  await deposit(pool, 'entry', 'conversion-ref'); await claim(pool, 'redemption', 'claim-ref');
  await pool.query(registrySql);
  assert.equal((await pool.query('SELECT count(*) FROM orio_settlement.receipt_claims')).rows[0].count, '2');
  await entry(pool, 'another');
  await assert.rejects(deposit(pool, 'another', 'claim-ref'), /another operation/);
}, false));

async function readyForCredit(pool: Pool, id: string) {
  await entry(pool, id); await deposit(pool, id, id + ':receipt');
  await new ConversionEntries(pool).record({
    eventId: id + ':master', intentId: id, expectedVersion: '1', kind: 'MASTER_RECEIVED',
    evidence: { intentId: id, digest: evidence, assetId: 'master',
      units: '100', vaultId: 'vault', externalRef: id + ':receipt' },
  });
}
async function installAccounting(pool: Pool) {
  await pool.query(await readFile(new URL('../migrations/007_master_receipt_accounting.sql', import.meta.url), 'utf8'));
}

test('master receipt credits reserve and customer claim once with journal and outbox', async () => fixture(async pool => {
  await installAccounting(pool); await readyForCredit(pool, 'credit');
  const writer = new MasterReceiptAccounting(pool);
  const [first, second] = await Promise.all([writer.credit('credit', '2'), writer.credit('credit', '2')]);
  assert.deepEqual(first, second);
  assert.equal(first.sequence, '1');
  const ledger = new ControlLedger(pool);
  const balances = await ledger.balances();
  assert.equal(balances.length, 2);
  assert.deepEqual(balances.map(balance => balance.units), ['100','100']);
  assert.ok(balances.every(balance => balance.asset === 'erc20:84532:0x' + '1'.repeat(40)));
  assert.equal((await ledger.verify()).ok, true);
  assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.outbox')).rows[0].count, '1');
  assert.equal((await pool.query('SELECT count(*) FROM orio_settlement.entry_journals')).rows[0].count, '1');
}));

test('failed accounting linkage rolls back accounts, journal, chain and outbox together', async () => fixture(async pool => {
  await installAccounting(pool); await readyForCredit(pool, 'rollback');
  await pool.query(`CREATE FUNCTION orio_settlement.reject_test_link() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected link failure'; END $$`);
  await pool.query(`CREATE TRIGGER reject_test_link BEFORE INSERT ON orio_settlement.entry_journals
    FOR EACH ROW EXECUTE FUNCTION orio_settlement.reject_test_link()`);
  const writer = new MasterReceiptAccounting(pool);
  await assert.rejects(writer.credit('rollback', '2'), /Injected link failure/);
  assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.accounts')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.journals')).rows[0].count, '0');
  assert.equal((await pool.query('SELECT sequence FROM orio_ledger.chain_head')).rows[0].sequence, '0');
  assert.equal((await pool.query('SELECT count(*) FROM orio_ledger.outbox')).rows[0].count, '0');
  assert.equal((await pool.query("SELECT state FROM orio_conversion.entries WHERE intent_id='rollback'")).rows[0].state, 'MASTER_RECEIVED');
  await pool.query('DROP TRIGGER reject_test_link ON orio_settlement.entry_journals');
  assert.equal((await writer.credit('rollback', '2')).sequence, '1');
}));

test('historical receipt remains account-able after a pause but unfunded entries cannot create backing', async () => fixture(async pool => {
  await installAccounting(pool); await readyForCredit(pool, 'historical');
  await entry(pool, 'unfunded');
  await pool.query("UPDATE orio_master.current_election SET state='DEPOSIT_PAUSED'");
  const writer = new MasterReceiptAccounting(pool);
  await assert.rejects(writer.credit('unfunded', '0'), /not a current verified/);
  await assert.rejects(writer.credit('historical', '1'), /not a current verified/);
  assert.equal((await writer.credit('historical', '2')).sequence, '1');
  await assert.rejects(pool.query('DELETE FROM orio_settlement.entry_journals'), /append-only/);
}));
