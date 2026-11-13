import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const suffix = randomUUID();
const network = 'orio-metadata-test-' + suffix;
const database = network + '-db';
const application = network + '-app';
const image = 'orio-metadata-test:' + suffix;
const postgres = 'postgres@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1';
const directory = await mkdtemp(join(tmpdir(), 'orio-metadata-ca-'));
const caFile = join(directory, 'server.crt');
const containers = [];
let networkCreated = false;
let imageCreated = false;
let certCopied = false;
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
try {
  execFileSync('docker', ['build', '--tag', image, fileURLToPath(new URL('../', import.meta.url))], { stdio: 'inherit' });
  imageCreated = true;
  docker(['network', 'create', network]); networkCreated = true;
  docker(['run', '--detach', '--name', database, '--network', network, '--network-alias', 'orio-db',
    '--mount', 'type=tmpfs,destination=/var/lib/postgresql/data',
    '-e', 'POSTGRES_PASSWORD=orio-local-test-only', '-e', 'POSTGRES_DB=orio_test',
    '--entrypoint', 'sh', postgres, '-c', [
      'set -eu',
      'openssl req -new -x509 -nodes -days 1 -subj /CN=orio-db -addext subjectAltName=DNS:orio-db -newkey rsa:2048 -keyout /tmp/server.key -out /tmp/server.crt',
      'chown postgres:postgres /tmp/server.key /tmp/server.crt',
      'chmod 600 /tmp/server.key',
      'exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key',
    ].join('\n')]);
  containers.push(database);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (spawnSync('docker', ['exec', database, 'pg_isready', '-U', 'postgres', '-d', 'orio_test'],
      { stdio: 'pipe' }).status === 0) { ready = true; break; }
    await setTimeout(250);
  }
  if (!ready) throw new Error('Isolated TLS database failed to start');
  for (const migration of ['001_ledger.sql', '002_master_registry.sql']) {
    const sql = await readFile(new URL('../migrations/' + migration, import.meta.url), 'utf8');
    execFileSync('docker', ['exec', '-i', database, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'orio_test'],
      { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  docker(['exec', database, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'orio_test', '-c', [
    "CREATE ROLE orio_metadata_test LOGIN PASSWORD 'orio-local-test-only'",
    'GRANT USAGE ON SCHEMA orio_master TO orio_metadata_test',
    'GRANT SELECT ON orio_master.current_election,orio_master.elections,orio_master.assets TO orio_metadata_test',
  ].join(';')]);
  docker(['cp', database + ':/tmp/server.crt', caFile]); certCopied = true;
  function startApplication(name, databaseHost) {
    docker(['run', '--detach', '--name', name, '--network', network, '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--publish', '127.0.0.1::8080', '--mount', 'type=bind,source=' + caFile + ',target=/run/rds-ca.pem,readonly',
      '-e', 'ORIO_DATABASE_URL=postgresql://orio_metadata_test:orio-local-test-only@' + databaseHost + ':5432/orio_test',
      '-e', 'ORIO_PG_CA_FILE=/run/rds-ca.pem', image]);
    containers.push(name);
    const port = docker(['port', name, '8080']).trim().split(':').at(-1);
    if (!port || !/^[0-9]+$/.test(port)) throw new Error('Invalid loopback test port');
    return port;
  }
  async function waitForStatus(port, status) {
    let response;
    for (let i = 0; i < 80; i++) {
      try {
        response = await fetch('http://127.0.0.1:' + port + '/ready', { signal: AbortSignal.timeout(2000) });
        if (response.status === status) return response;
      } catch { /* Container startup may not have reached the listener. */ }
      await setTimeout(250);
    }
    throw new Error('Container readiness did not reach expected status');
  }
  const port = startApplication(application, 'orio-db');
  await waitForStatus(port, 200);
  assert.equal(docker(['exec', application, 'id', '-u']).trim(), '1000');
  const master = await fetch('http://127.0.0.1:' + port + '/v1/protocol/master');
  assert.equal(master.status, 200);
  assert.deepEqual(await master.json(), {
    master: { electionId: null, state: 'DEPOSIT_PAUSED', asset: null },
    financialExecutionEnabled: false,
  });
  const policyResponse = await fetch('http://127.0.0.1:' + port + '/v1/protocol/policy');
  assert.equal(policyResponse.status, 200);
  const policy = await policyResponse.json();
  assert.equal(policy.gas.paidBy, 'USER');
  assert.equal(policy.transfer.protocolFeeBasisPoints, '0');
  assert.equal(policy.transfer.networkFeePaidBy, 'USER');
  assert.equal(policy.financialExecutionEnabled, false);
  assert.equal(policy.proposals.roundingAndDust, 'AWAITING_APPROVAL');
  const tls = docker(['exec', database, 'psql', '-U', 'postgres', '-d', 'orio_test', '-Atc',
    "SELECT s.ssl FROM pg_stat_ssl s JOIN pg_stat_activity a USING(pid) WHERE a.usename='orio_metadata_test'"]);
  assert.equal(tls.trim(), 't');
  const restricted = spawnSync('docker', ['exec', database, 'psql', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'orio_test', '-c',
    'SET ROLE orio_metadata_test; SELECT * FROM orio_ledger.journals'], { stdio: 'pipe' });
  assert.notEqual(restricted.status, 0);
  const incorrectHostPort = startApplication(application + '-bad-host', database);
  const rejected = await waitForStatus(incorrectHostPort, 503);
  assert.deepEqual(await rejected.json(), { error: 'protocol_state_unavailable' });
  console.log('Verified container startup, TLS/hostname enforcement, non-root execution, paused state and restricted reader');
} finally {
  for (const name of containers.reverse()) docker(['rm', '--force', name]);
  if (networkCreated) docker(['network', 'rm', network]);
  if (imageCreated) docker(['image', 'rm', image]);
  if (certCopied) await unlink(caFile);
  await rmdir(directory);
}
