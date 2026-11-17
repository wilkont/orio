import type {Pool,PoolClient} from 'pg';
import {gasDigest} from './gas-policy.ts';

interface Evidence {
 deploymentId:string;ledgerVersion:string;ledgerState:Record<string,unknown>;companyMasterUnits:string;
 observations:unknown[];prices:unknown[];
}
interface Intent {
 id:string;authority_id:string;deployment_id:string;typed_digest:string;evidence:Evidence;prepared_at:string;valid_until:string;
 key_arn:string;signer:string;policy_digest:string;
}
export interface StagedValuation {
 digest:string;policyDigest:string;evidence:Evidence;value:{validAfter:string;validUntil:string};
}
const identifier=(v:string)=>{if(typeof v!=='string'||v!==v.trim()||!/^[A-Za-z0-9:_-]{1,100}$/.test(v))throw Error('Invalid signing intent');return v;};
const hash=(v:string)=>{if(typeof v!=='string'||v!==v.trim()||!/^0x[0-9a-f]{64}$/.test(v))throw Error('Invalid signing digest');return v;};

/** Trusted owner-only qualification journal, not an HTTP service or runtime grant.
 * Immutable intents/claims survive worker crashes. Authority and deployment row
 * locks serialize claim/completion against revocation and monetary settlement.
 * A consumed claim never authorizes retry, including an ambiguous COMMIT/Sign.
 * Production least-privilege workload bootstrap remains a separate deployment.
 */
export class ValuationSigningJournal {
 private readonly pool:Pool;
 constructor(pool:Pool){this.pool=pool;}
 async load(id:string){
  const row=(await this.pool.query<Intent>(`SELECT i.*,a.key_arn,a.signer,a.policy_digest
   FROM orio_signing.valuation_intents i JOIN orio_signing.authorities a ON a.id=i.authority_id WHERE i.id=$1`,[identifier(id)])).rows[0];
  if(!row)throw Error('Unknown reserve signing intent');
  return {evidence:row.evidence,preparedAt:row.prepared_at,typedDigest:row.typed_digest,policyDigest:row.policy_digest,keyArn:row.key_arn,signer:row.signer};
 }
 private async current(client:PoolClient,row:Intent){
  await client.query('SELECT id FROM orio_signing.authorities WHERE id=$1 FOR UPDATE',[row.authority_id]);
  if((await client.query('SELECT 1 FROM orio_signing.revocations WHERE authority_id=$1',[row.authority_id])).rowCount)throw Error('Reserve authority revoked');
  const state=(await client.query<{version:string;state:Record<string,unknown>;configuration:Record<string,unknown>}>(
   'SELECT version::text,state,configuration FROM orio_monetary.deployments WHERE id=$1 FOR UPDATE',[row.deployment_id])).rows[0];
  if(!state||state.version!==row.evidence.ledgerVersion||gasDigest(state.state)!==gasDigest(row.evidence.ledgerState))throw Error('Committed reserve state changed');
  const c=state.configuration,s=row.evidence.observations[0] as Record<string,unknown>|undefined;
  if(!s||['chainId','controller','currency','vault','registry','master','masterDecimals','registryEpoch'].some(k=>
   typeof c[k]==='string'&&typeof s[k]==='string'?c[k].toLowerCase()!==s[k].toLowerCase():c[k]!==s[k]))throw Error('Committed deployment mismatch');
  const asset=state.state.masterAssetId;
  for(const [label,expected] of [['reserve_cash',state.state.reserveMasterUnits],['company_cash',row.evidence.companyMasterUnits]]){
   const actual=(await client.query<{units:string}>('SELECT units::text FROM orio_ledger.balances WHERE id=$1',
    ['mon_'+gasDigest([row.deployment_id,asset,label])])).rows[0]?.units;
   const emptyGenesis=state.version==='0'&&state.state.phase==='GENESIS'&&expected==='0';
   if(actual!==expected&&!(actual===undefined&&emptyGenesis))throw Error('Committed reserve cash mismatch');
  }
  const now=(await client.query<{seconds:string}>('SELECT floor(extract(epoch FROM clock_timestamp()))::text AS seconds')).rows[0]!.seconds;
  if(BigInt(now)<BigInt(row.prepared_at)||BigInt(now)>=BigInt(row.valid_until))throw Error('Reserve intent expired');
 }
 async stage(id:string,authorityId:string,input:StagedValuation){
  const material=structuredClone(input);
  identifier(id);identifier(authorityId);hash(material.digest);hash(material.policyDigest);
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const authority=(await client.query<{key_arn:string;signer:string;policy_digest:string}>(
    'SELECT key_arn,signer,policy_digest FROM orio_signing.authorities WHERE id=$1 FOR UPDATE',[authorityId])).rows[0];
   if(!authority||authority.policy_digest!==material.policyDigest)throw Error('Unknown reserve signing authority');
   const row:Intent={id,authority_id:authorityId,deployment_id:material.evidence.deploymentId,typed_digest:material.digest,
    evidence:structuredClone(material.evidence),prepared_at:material.value.validAfter,valid_until:material.value.validUntil,...authority};
   await this.current(client,row);
   await client.query('INSERT INTO orio_signing.valuation_intents VALUES($1,$2,$3,$4,$5::jsonb,$6,$7)',
    [id,authorityId,row.deployment_id,row.typed_digest,JSON.stringify(row.evidence),row.prepared_at,row.valid_until]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 private async mutate(id:string,digest:string,signature?:string){
  identifier(id);hash(digest);const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const row=(await client.query<Intent>('SELECT * FROM orio_signing.valuation_intents WHERE id=$1',[id])).rows[0];
   if(!row||row.typed_digest!==digest)throw Error('Unknown reserve digest');
   await this.current(client,row);
   if(signature===undefined)await client.query('INSERT INTO orio_signing.claims(intent_id) VALUES($1)',[id]);
   else await client.query('INSERT INTO orio_signing.completions(intent_id,signature) VALUES($1,$2)',[id,signature]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async claim(id:string,digest:string){await this.mutate(id,digest);}
 async complete(id:string,digest:string,signature:string){await this.mutate(id,digest,signature);}
 async revoke(authorityId:string,evidenceDigest:string){
  identifier(authorityId);hash(evidenceDigest);const client=await this.pool.connect();
  try{await client.query('BEGIN');
   await client.query('SELECT id FROM orio_signing.authorities WHERE id=$1 FOR UPDATE',[authorityId]);
   await client.query('INSERT INTO orio_signing.revocations(authority_id,evidence_digest) VALUES($1,$2)',[authorityId,evidenceDigest]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
}
