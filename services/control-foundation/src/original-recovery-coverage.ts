/** Read-only decision support, not deletion authority. The caller must obtain
 * fresh authenticated AWS metadata and checksum-verify the private SQL receipt.
 * No AWS call, password access, restore or deletion is performed here. */
const original='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc';
const arn='arn:aws:rds:us-east-1:720232346199:db:'+original;
const checkpoint='orio-spc-3-pre-upgrade-20261117';
const resultFingerprint='c4d12f3655980558f8e87bc526b2e6ea630ae06cc937b6fba7efce70278c67db';
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid recovery evidence');
 return Object.fromEntries(Object.entries(value));
}
function time(value:unknown){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|\+00:00)$/.test(value))throw new Error('UTC recovery evidence required');
 const result=Date.parse(value);if(!Number.isFinite(result))throw new Error('Invalid recovery time');return result;
}
export function originalRecoveryCoverage(instance:unknown,snapshot:unknown,automatedBackups:unknown,receipt:unknown,now=new Date()){
 const d=object(instance),s=object(snapshot),r=object(receipt);
 if(!Number.isFinite(now.getTime())||d.DBInstanceIdentifier!==original||d.DBInstanceArn!==arn||typeof d.DbiResourceId!=='string'||
  !/^db-[A-Z0-9]+$/.test(d.DbiResourceId)||d.DBInstanceStatus!=='available'||d.BackupRetentionPeriod!==14||d.StorageEncrypted!==true||
  d.PubliclyAccessible!==false||d.MultiAZ!==true||d.DeletionProtection!==true||!Array.isArray(automatedBackups))throw new Error('Original database or backup protection changed');
 if(s.DBSnapshotIdentifier!==checkpoint||s.DBSnapshotArn!=='arn:aws:rds:us-east-1:720232346199:snapshot:'+checkpoint||s.DBInstanceIdentifier!==original||
  s.DbiResourceId!==d.DbiResourceId||s.Status!=='available'||s.Encrypted!==true||s.SnapshotType!=='manual'||typeof d.KmsKeyId!=='string'||s.KmsKeyId!==d.KmsKeyId)throw new Error('Wrong encrypted recovery checkpoint');
 if(r.status!=='ATOMIC_UPGRADE_COMMITTED'||r.target!=='ORIGINAL_HOSTED_DATABASE'||r.resultingCatalogFingerprint!==resultFingerprint||
  r.existingHistoryVerified!==true||r.syntheticProbeRolledBack!==true||r.financialActivationPerformed!==false||r.secretPrintedOrPersisted!==false)throw new Error('Successful original SQL acceptance required');
 const checkpointAt=time(s.SnapshotCreateTime),committedAt=time(r.completedAt),current=now.getTime();
 if(checkpointAt>committedAt||committedAt>current+30000||current-committedAt>86400000)throw new Error('Invalid maintenance timeline');
 const active=automatedBackups.map(object).filter(b=>b.DBInstanceArn===arn&&b.DbiResourceId===d.DbiResourceId&&b.Status==='active');
 if(active.length!==1)throw new Error('Ambiguous active recovery window');
 const b=active[0]!;
 if(b.DBInstanceIdentifier!==original||b.Encrypted!==true||b.BackupRetentionPeriod!==14||b.KmsKeyId!==d.KmsKeyId)throw new Error('Backup identity or protection changed');
 const w=object(b.RestoreWindow),earliest=time(w.EarliestTime),latest=time(w.LatestTime);
 if(earliest>latest||latest>current+30000||current-latest>900000)throw new Error('Stale or invalid recovery window');
 return Object.freeze({status:earliest<=checkpointAt&&latest>=committedAt?'RECOVERY_COVERS_ACCEPTED_UPGRADE':'RETAIN_MANUAL_CHECKPOINT',
  mayDeleteCheckpoint:earliest<=checkpointAt&&latest>=committedAt,checkpointIdentifier:checkpoint,
  earliestRestorableAt:new Date(earliest).toISOString(),latestRestorableAt:new Date(latest).toISOString(),
  checkpointCreatedAt:new Date(checkpointAt).toISOString(),acceptedUpgradeAt:new Date(committedAt).toISOString(),financialActivationPerformed:false});
}
