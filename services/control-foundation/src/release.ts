import { createPublicKey, verify } from 'node:crypto';

export const gates=['legal','security','custody','financial','operations'] as const;
export const releasePolicy = {
  version: 'owner-accountable-v2', externalReviewRequired: false,
  distinctApproverPrincipalsRequired: false, distinctApproverKeysRequired: false,
} as const;
export type Gate=typeof gates[number];
export type Mode='testnet' | 'production-read-only' | 'controlled-live' | 'public-live';
export interface Deployment {
  mode: Mode; releaseDigest: string; projectId: string; chainId: string; contractSetDigest: string;
}
export interface Approval extends Deployment {
  gate: Gate; evidenceDigest: string; signerId: string; issuedAt: number; expiresAt: number; signature: string;
}
export interface TrustedSigner {
  id: string; principalId: string; roles: Gate[]; publicKeyPem: string; revoked: boolean;
}
export interface ReleaseDecision {
  allowed: boolean; financialEnabled: boolean; capabilities: string[]; missingGates: Gate[]; errors: string[];
}
const hash=/^[a-f0-9]{64}(?![\s\S])/;
const identifier=/^[A-Za-z0-9:_-]{1,100}(?![\s\S])/;
const modes=['testnet','production-read-only','controlled-live','public-live'];
function object(value: unknown): value is Record<string,unknown> {
  return value!==null && typeof value==='object' && !Array.isArray(value);
}
function keys(value: Record<string,unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length===expected.length && expected.every(k=>Object.hasOwn(value,k));
}
const deploymentFields=['mode','releaseDigest','projectId','chainId','contractSetDigest'];
function deploymentValid(value: Record<string,unknown>): boolean {
  return typeof value.mode==='string' && modes.includes(value.mode)
    && typeof value.releaseDigest==='string' && hash.test(value.releaseDigest)
    && typeof value.contractSetDigest==='string' && hash.test(value.contractSetDigest)
    && typeof value.projectId==='string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9](?![\s\S])/.test(value.projectId)
    && typeof value.chainId==='string' && ['8453','84532','31337'].includes(value.chainId)
    && (value.mode==='testnet' ? value.chainId!=='8453' : value.chainId==='8453');
}
function approvalValid(value: unknown): value is Approval {
  return object(value) && keys(value,[...deploymentFields,'gate','evidenceDigest','signerId','issuedAt','expiresAt','signature'])
    && deploymentValid(value) && gates.includes(value.gate as Gate)
    && typeof value.evidenceDigest==='string' && hash.test(value.evidenceDigest)
    && typeof value.signerId==='string' && identifier.test(value.signerId)
    && Number.isSafeInteger(value.issuedAt) && Number.isSafeInteger(value.expiresAt)
    && typeof value.signature==='string';
}
function signerValid(value: unknown): value is TrustedSigner {
  return object(value) && keys(value,['id','principalId','roles','publicKeyPem','revoked'])
    && typeof value.id==='string' && identifier.test(value.id)
    && typeof value.principalId==='string' && identifier.test(value.principalId)
    && Array.isArray(value.roles) && value.roles.length>0 && value.roles.every(r=>gates.includes(r))
    && new Set(value.roles).size===value.roles.length
    && typeof value.publicKeyPem==='string' && value.publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----')
    && typeof value.revoked==='boolean';
}

/** Domain-separated signing bytes. Authorized accountable owners may cover multiple roles.
 * v2 prevents signatures issued under the previous independent-review policy being reused. */
export function approvalBytes(approval: Omit<Approval,'signature'>): Buffer {
  return Buffer.from(JSON.stringify(['ORIO-SPC-RELEASE-APPROVAL/v2',approval.mode,approval.releaseDigest,
    approval.projectId,approval.chainId,approval.contractSetDigest,approval.gate,approval.evidenceDigest,
    approval.signerId,approval.issuedAt,approval.expiresAt]),'utf8');
}

/** No environment flag, unsigned boolean, or number of repeated signatures can enable finance. */
export function evaluateRelease(deployment: unknown, approvals: unknown, trust: unknown, now=Date.now()): ReleaseDecision {
  const denied=(errors:string[],missingGates:Gate[]=[...gates]): ReleaseDecision=>
    ({allowed:false,financialEnabled:false,capabilities:[],missingGates,errors});
  if (!Number.isSafeInteger(now) || now<0 || !object(deployment) || !keys(deployment,deploymentFields) || !deploymentValid(deployment))
    return denied(['Invalid deployment identity or clock']);
  if (deployment.mode==='testnet') return {allowed:true,financialEnabled:false,capabilities:['read','simulate','testnet-settle'],missingGates:[],errors:[]};
  if (deployment.mode==='production-read-only') return {allowed:true,financialEnabled:false,capabilities:['read'],missingGates:[],errors:[]};
  if (!Array.isArray(approvals) || !Array.isArray(trust) || trust.length===0 || approvals.length>100 || trust.length>100)
    return denied(['Financial release requires a configured trust registry and signed approvals']);
  const signers=new Map<string,TrustedSigner>();
  for (const signer of trust) {
    if (!signerValid(signer) || signers.has(signer.id)) return denied(['Invalid or duplicate trust-registry entry']);
    try {
      const key=createPublicKey(signer.publicKeyPem);
      if (key.asymmetricKeyType!=='ed25519') return denied(['Trust registry must use Ed25519 keys']);
      signers.set(signer.id,signer);
    } catch { return denied(['Invalid trust-registry public key']); }
  }
  const approved=new Set<Gate>();
  const errors:string[]=[];
  for (const approval of approvals) {
    if (!approvalValid(approval)) { errors.push('Malformed approval'); continue; }
    const signer=signers.get(approval.signerId);
    if (!signer || signer.revoked || !signer.roles.includes(approval.gate)) { errors.push('Unauthorized or revoked signer'); continue; }
    if (deploymentFields.some(k=>deployment[k]!==approval[k as keyof Deployment])) { errors.push('Approval deployment mismatch'); continue; }
    if (approval.issuedAt<0 || approval.issuedAt>now || approval.expiresAt<=now || approval.expiresAt<=approval.issuedAt) {
      errors.push('Approval expired or not yet valid'); continue;
    }
    try {
      const signature=Buffer.from(approval.signature,'base64');
      if (signature.length!==64 || signature.toString('base64')!==approval.signature ||
          !verify(null,approvalBytes(approval),signer.publicKeyPem,signature)) {
        errors.push('Invalid approval signature'); continue;
      }
    } catch { errors.push('Invalid approval signature'); continue; }
    if (approved.has(approval.gate)) {
      errors.push('Duplicate gate approval'); continue;
    }
    approved.add(approval.gate);
  }
  const missing=gates.filter(g=>!approved.has(g));
  if (errors.length>0 || missing.length>0) return denied(errors,missing);
  return {allowed:true,financialEnabled:true,capabilities:['read','mint','redeem','reserve-move'],missingGates:[],errors:[]};
}
