import {test} from 'node:test';
import assert from 'node:assert/strict';
import {originalRecoveryCoverage} from '../src/original-recovery-coverage.ts';
const id='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc',arn='arn:aws:rds:us-east-1:720232346199:db:'+id;
const kms='arn:aws:kms:us-east-1:720232346199:key/00000000-0000-0000-0000-000000000000';
const now=new Date('2026-11-17T05:10:00Z');
function evidence(){return {
 instance:{DBInstanceIdentifier:id,DBInstanceArn:arn,DbiResourceId:'db-EXAMPLE123',DBInstanceStatus:'available',BackupRetentionPeriod:14,StorageEncrypted:true,PubliclyAccessible:false,MultiAZ:true,DeletionProtection:true,KmsKeyId:kms},
 snapshot:{DBSnapshotIdentifier:'orio-spc-3-pre-upgrade-20261117',DBSnapshotArn:'arn:aws:rds:us-east-1:720232346199:snapshot:orio-spc-3-pre-upgrade-20261117',DBInstanceIdentifier:id,DbiResourceId:'db-EXAMPLE123',Status:'available',Encrypted:true,SnapshotType:'manual',KmsKeyId:kms,SnapshotCreateTime:'2026-11-17T04:15:00Z'},
 backups:[{DBInstanceIdentifier:id,DBInstanceArn:arn,DbiResourceId:'db-EXAMPLE123',Status:'active',Encrypted:true,BackupRetentionPeriod:14,KmsKeyId:kms,RestoreWindow:{EarliestTime:'2026-11-03T06:00:00Z',LatestTime:'2026-11-17T05:08:00Z'}}],
 receipt:{status:'ATOMIC_UPGRADE_COMMITTED',target:'ORIGINAL_HOSTED_DATABASE',resultingCatalogFingerprint:'c4d12f3655980558f8e87bc526b2e6ea630ae06cc937b6fba7efce70278c67db',existingHistoryVerified:true,syntheticProbeRolledBack:true,financialActivationPerformed:false,secretPrintedOrPersisted:false,completedAt:'2026-11-17T05:05:00Z'}};}
function assess(e= evidence(),clock=now){return originalRecoveryCoverage(e.instance,e.snapshot,e.backups,e.receipt,clock);}
test('manual checkpoint cleanup requires actual recovery coverage before and after the accepted original upgrade',()=>{
 const e=evidence(),r=assess(e);assert.equal(r.status,'RECOVERY_COVERS_ACCEPTED_UPGRADE');assert.equal(r.mayDeleteCheckpoint,true);
 e.backups[0]!.RestoreWindow.LatestTime='2026-11-17T05:01:00Z';assert.equal(r.mayDeleteCheckpoint,true);assert.equal(Reflect.set(r,'mayDeleteCheckpoint',false),false);
});
test('a recent window that has not caught up retains the manual checkpoint',()=>{
 const e=evidence();e.backups[0]!.RestoreWindow.LatestTime='2026-11-17T05:01:00Z';assert.equal(assess(e).status,'RETAIN_MANUAL_CHECKPOINT');assert.equal(assess(e).mayDeleteCheckpoint,false);
});
test('a window that excludes the pre-upgrade checkpoint cannot justify deleting it',()=>{
 const e=evidence();e.backups[0]!.RestoreWindow.EarliestTime='2026-11-17T04:16:00Z';assert.equal(assess(e).mayDeleteCheckpoint,false);
});
test('backup substitution, duplicates and another physical database identity fail closed',()=>{
 const bad=evidence();bad.backups[0]!.DbiResourceId='db-OTHER';assert.throws(()=>assess(bad));
 const duplicate=evidence();duplicate.backups.push(structuredClone(duplicate.backups[0]!));assert.throws(()=>assess(duplicate));
 const snapshot=evidence();snapshot.snapshot.DbiResourceId='db-OTHER';assert.throws(()=>assess(snapshot));
 const source=evidence();source.instance.DBInstanceArn=arn+'other';assert.throws(()=>assess(source));
});
test('clone receipts, ambiguous commits and missing preservation checks cannot authorize checkpoint cleanup',()=>{
 for(const change of [{target:'DISPOSABLE_PRIVATE_CLONE'},{status:'COMMIT_UNKNOWN'},{resultingCatalogFingerprint:'0'.repeat(64)},
  {existingHistoryVerified:false},{syntheticProbeRolledBack:false},{financialActivationPerformed:true},{secretPrintedOrPersisted:true}]){
  const e=evidence();Object.assign(e.receipt,change);assert.throws(()=>assess(e));
 }
});
test('reduced recovery protection, stale windows and invalid timelines reject',()=>{
 for(const change of [{BackupRetentionPeriod:0},{Encrypted:false},{KmsKeyId:'another'}]){const e=evidence();Object.assign(e.backups[0]!,change);assert.throws(()=>assess(e));}
 const stale=evidence();stale.backups[0]!.RestoreWindow.LatestTime='2026-11-17T04:00:00Z';assert.throws(()=>assess(stale));
 const future=evidence();future.receipt.completedAt='2026-11-17T05:12:00Z';assert.throws(()=>assess(future));
 const reversed=evidence();reversed.snapshot.SnapshotCreateTime='2026-11-17T05:06:00Z';assert.throws(()=>assess(reversed));
 const zone=evidence();zone.backups[0]!.RestoreWindow.LatestTime='2026-11-17T05:08:00';assert.throws(()=>assess(zone));
 assert.throws(()=>assess(evidence(),new Date('invalid')));
});
