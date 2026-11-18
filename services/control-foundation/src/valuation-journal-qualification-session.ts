import {qualificationSession} from './qualification-session.ts';
export {qualificationTemplateSha256} from './qualification-session.ts';
export const journalHostedBaseline='141a8c8aedd1ea45af794d2de847c836798e19d21cf1223334b740e9082b33f7';
function object(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))throw Error('Invalid journal qualification metadata');return Object.fromEntries(Object.entries(v));}
/** Clone-only extension of the already reviewed private rehearsal boundary.
 * Captured metadata is trusted administrator evidence, not an independent
 * attestation. The known hosted fingerprint includes the retained IAM reader.
 * Existing named disposable resources must be absent before new creation.
 */
export function valuationJournalQualificationSession(value:unknown,now=new Date()){
 const c=object(value),snapshot=object(c.snapshot),observed=Date.parse(String(c.observedAt)),created=Date.parse(String(snapshot.SnapshotCreateTime));
 if(c.purpose!=='VALUATION_JOURNAL_REHEARSAL'||!Number.isFinite(now.getTime())||!Number.isFinite(observed)||
  observed>now.getTime()+30000||now.getTime()-observed>900000||!Number.isFinite(created)||
  created>now.getTime()+30000||now.getTime()-created>7200000)throw Error('Stale journal rehearsal evidence');
 const session=qualificationSession(c,now),group=object(c.originalSecurityGroup),source=object(c.originalInstance);
 if(source.DBInstanceIdentifier!=='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'||source.DBInstanceStatus!=='available'||
  source.StorageEncrypted!==true||source.PubliclyAccessible!==false||source.DeletionProtection!==true||source.BackupRetentionPeriod!==14||
  source.IAMDatabaseAuthenticationEnabled!==true||group.GroupId!=='sg-030c057c133762083'||group.OwnerId!=='720232346199'||
  group.VpcId!=='vpc-05613af21236d6911'||!Array.isArray(group.IpPermissions)||group.IpPermissions.length!==1||
  typeof c.metadataReaderSecurityGroupId!=='string'||!/^sg-[a-f0-9]{17}(?![\s\S])/.test(c.metadataReaderSecurityGroupId))throw Error('Original source protections changed');
 const rule=object(group.IpPermissions[0]);
 if(rule.IpProtocol!=='tcp'||rule.FromPort!==5432||rule.ToPort!==5432||
  ['IpRanges','Ipv6Ranges','PrefixListIds'].some(k=>!Array.isArray(rule[k])||rule[k].length!==0)||
  !Array.isArray(rule.UserIdGroupPairs)||rule.UserIdGroupPairs.length!==1)throw Error('Original ingress changed');
 const pair=object(rule.UserIdGroupPairs[0]);
 if(pair.GroupId!==c.metadataReaderSecurityGroupId||pair.UserId!=='720232346199'||pair.VpcPeeringConnectionId!==undefined||
  (pair.VpcId!==undefined&&pair.VpcId!=='vpc-05613af21236d6911'))throw Error('Original ingress source changed');
 return Object.freeze({target:session.target,baselineFingerprint:journalHostedBaseline});
}
