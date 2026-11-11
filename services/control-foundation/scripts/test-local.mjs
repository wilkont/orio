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
    if (spawnSync('docker',['exec',name,'pg_isready','-U','postgres','-d','orio_test'],{stdio:'pipe'}).status===0) { ready=true;break; }
    await setTimeout(250);
  }
  if (!ready) throw new Error('PostgreSQL test container did not become ready');
  const port=execFileSync('docker',['port',name,'5432'],{encoding:'utf8'}).trim().split(':').at(-1);
  if (!port || !/^\d+$/.test(port)) throw new Error('Invalid isolated database port');
  const result=spawnSync(process.execPath,['--test','test/release.test.ts','test/ledger.test.ts','test/master-entry.test.ts'],{
    stdio:'inherit',env:{...process.env,ORIO_TEST_DATABASE_URL:`postgresql://postgres:orio-local-test-only@127.0.0.1:${port}/orio_test`}});
  process.exitCode=result.status??1;
} finally {
  if (created) execFileSync('docker',['rm','--force',name],{stdio:'pipe'});
}
