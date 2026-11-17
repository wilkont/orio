import { execFileSync,spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

const name=`orio-control-test-${randomUUID()}`;
const image='postgres@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1';
let created=false;
try {
  execFileSync('docker',['run','--detach','--rm','--name',name,'--mount','type=tmpfs,destination=/var/lib/postgresql/data',
    '-e','POSTGRES_PASSWORD=orio-local-test-only','-e','POSTGRES_DB=orio_test','-p','127.0.0.1::5432',image],{stdio:'pipe'});
  created=true;
  let ready=false;
  for (let i=0;i<120;i++) {
    // The temporary init server is socket-only; TCP readiness identifies final startup.
    if (spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','orio_test'],{stdio:'pipe'}).status===0) { ready=true;break; }
    await setTimeout(250);
  }
  if (!ready) throw new Error('PostgreSQL test container did not become ready');
  const port=execFileSync('docker',['port',name,'5432'],{encoding:'utf8'}).trim().split(':').at(-1);
  if (!port || !/^\d+$/.test(port)) throw new Error('Invalid isolated database port');
  // Run the exact-role upgrade rehearsal before tests that deliberately mutate shared role privileges.
  const atomic=spawnSync(process.execPath,['--test','--test-concurrency=1','test/metadata-bootstrap.test.ts','test/atomic-hosted-upgrade.test.ts'],{
    stdio:'inherit',env:{...process.env,ORIO_TEST_DATABASE_URL:`postgresql://postgres:orio-local-test-only@127.0.0.1:${port}/orio_test`}});
  if(atomic.status!==0)throw new Error('Atomic upgrade qualification failed');
  const result=spawnSync(process.execPath,['--test','test/original-recovery-coverage.test.ts','test/hosted-maintenance-session.test.ts','test/protocol-reader-identity.test.ts','test/sql-qualification-template.test.ts','test/qualification-session.test.ts','test/restore-qualification-target.test.ts','test/managed-extension.test.ts','test/hosted-audit-identity.test.ts','test/hosted-upgrade.test.ts','test/schema-audit.test.ts','test/release.test.ts','test/ledger.test.ts','test/master-entry.test.ts','test/master-registry.test.ts','test/reconciliation.test.ts','test/reserve-migration.test.ts','test/conversion-entries.test.ts','test/conversion-route.test.ts','test/redemption-claims.test.ts','test/protocol-api.test.ts','test/metadata-lambda.test.ts','test/metadata-template.test.ts','test/metadata-public-template.test.ts','test/metadata-bootstrap-context.test.ts','test/server-startup.test.ts','test/finalized-transfer.test.ts','test/finalized-user-operation.test.ts','test/shared-receipts.test.ts','test/chain-rpc.test.ts','test/history-discovery.test.ts','test/history-store.test.ts','test/history-dispatch.test.ts','test/provider-qualification.test.ts','test/bundler-qualification.test.ts','test/gas-policy.test.ts','test/gas-controls.test.ts','test/gas-funding.test.ts','test/monetary-simulation.test.ts','test/monetary-engine.test.ts','../../contracts/integration/gas-ledger.test.mjs','../../contracts/integration/monetary-ledger.test.mjs'],{
    stdio:'inherit',env:{...process.env,ORIO_TEST_CONTAINER:name,ORIO_TEST_DATABASE_URL:`postgresql://postgres:orio-local-test-only@127.0.0.1:${port}/orio_test`}});
  process.exitCode=result.status??1;
} finally {
  if (created) execFileSync('docker',['rm','--force',name],{stdio:'pipe'});
}
