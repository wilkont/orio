import {qualificationSession} from './qualification-session.ts';
import {journalQualifiedCatalog} from './journal-original-context.ts';
export {qualificationTemplateSha256} from './qualification-session.ts';
const object=(v:unknown):Record<string,unknown>=>{if(v===null||typeof v!=='object'||Array.isArray(v))throw Error('Invalid autonomous rehearsal metadata');return Object.fromEntries(Object.entries(v));};
/** Clone-only extension of the reviewed twelve-resource rehearsal template.
 * Captured administrator metadata is trusted evidence, not an attestation.
 * Original database connection/secret access is never returned by this helper.
 */
export function autonomousQualificationSession(value:unknown,now=new Date()){
 const c=object(value),s=object(c.snapshot),original=object(c.originalInstance),group=object(c.originalSecurityGroup);
 const observed=Date.parse(String(c.observedAt)),created=Date.parse(String(s.SnapshotCreateTime));
 if(c.purpose!=='AUTONOMOUS_SCHEMA_REHEARSAL'||!Number.isFinite(now.getTime())||!Number.isFinite(observed)||observed>now.getTime()+30000||
  now.getTime()-observed>900000||!Number.isFinite(created)||created>now.getTime()+30000||now.getTime()-created>7200000)throw Error('Unapproved or stale autonomous rehearsal');
 const base=qualificationSession(c,now);
 if(original.DBInstanceIdentifier!=='orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc'||original.DBInstanceStatus!=='available'||
  original.StorageEncrypted!==true||original.PubliclyAccessible!==false||original.DeletionProtection!==true||original.BackupRetentionPeriod!==14||
  original.IAMDatabaseAuthenticationEnabled!==true||group.GroupId!=='sg-030c057c133762083'||group.OwnerId!=='720232346199'||group.VpcId!=='vpc-05613af21236d6911'||
  c.metadataReaderSecurityGroupId!=='sg-035e5f2d33504884b'||typeof c.journalSecurityGroupId!=='string'||!/^sg-[a-f0-9]{17}$/.test(c.journalSecurityGroupId)||
  new Set([c.journalSecurityGroupId,c.metadataReaderSecurityGroupId,group.GroupId,c.maintenanceSecurityGroupId]).size!==4||!Array.isArray(group.IpPermissions))throw Error('Original source protections changed');
 const allowed=[c.metadataReaderSecurityGroupId,c.journalSecurityGroupId],found:string[]=[];
 for(const item of group.IpPermissions){const rule=object(item);
  if(rule.IpProtocol!=='tcp'||rule.FromPort!==5432||rule.ToPort!==5432||['IpRanges','Ipv6Ranges','PrefixListIds'].some(k=>!Array.isArray(rule[k])||rule[k].length!==0)||!Array.isArray(rule.UserIdGroupPairs))throw Error('Original ingress changed');
  for(const item of rule.UserIdGroupPairs){const pair=object(item);
   if(typeof pair.GroupId!=='string'||pair.UserId!=='720232346199'||pair.VpcPeeringConnectionId!==undefined||(pair.VpcId!==undefined&&pair.VpcId!=='vpc-05613af21236d6911'))throw Error('Wrong original ingress identity');found.push(pair.GroupId);
  }
 }
 if(found.length!==2||new Set(found).size!==2||found.some(id=>!allowed.includes(id)))throw Error('Unexpected original client access');
 return Object.freeze({target:base.target,baselineFingerprint:journalQualifiedCatalog});
}
