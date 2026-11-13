import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { approvalBytes,evaluateRelease,gates,releasePolicy } from '../src/release.ts';
import type { Approval,Deployment,TrustedSigner } from '../src/release.ts';

const now=1_800_000_000_000;
function fixture() {
  const deployment:Deployment={mode:'controlled-live',releaseDigest:'a'.repeat(64),contractSetDigest:'b'.repeat(64),
    projectId:'orio-spc-3-prod',chainId:'8453'};
  const keypairs=gates.map(()=>generateKeyPairSync('ed25519'));
  const trust:TrustedSigner[]=gates.map((gate,i)=>({id:`reviewer-${i}`,principalId:`independent-${i}`,roles:[gate],
    publicKeyPem:keypairs[i]!.publicKey.export({type:'spki',format:'pem'}).toString(),revoked:false}));
  const approvals:Approval[]=gates.map((gate,i)=>{
    const data={...deployment,gate,evidenceDigest:String(i+1).repeat(64),signerId:trust[i]!.id,issuedAt:now-1000,expiresAt:now+60000};
    return {...data,signature:sign(null,approvalBytes(data),keypairs[i]!.privateKey).toString('base64')};
  });
  return {deployment,trust,approvals,keypairs};
}

test('live finance starts disabled without configured accountable approvals',()=>{
  const f=fixture();
  assert.equal(evaluateRelease(f.deployment,[],[],now).financialEnabled,false);
  assert.equal(evaluateRelease(f.deployment,[],f.trust,now).allowed,false);
});
test('read-only and testnet grant no live financial capabilities',()=>{
  const f=fixture();
  const read=evaluateRelease({...f.deployment,mode:'production-read-only'},[],[],now);
  assert.deepEqual(read.capabilities,['read']);
  assert.equal(read.financialEnabled,false);
  const simulation=evaluateRelease({...f.deployment,mode:'testnet',chainId:'84532'},[],[],now);
  assert.equal(simulation.allowed,true);
  assert.equal(simulation.financialEnabled,false);
  assert.equal(evaluateRelease({...f.deployment,mode:'testnet'},[],[],now).allowed,false);
});
test('five valid distinct gate approvals authorize the exact controlled release',()=>{
  const f=fixture(); const result=evaluateRelease(f.deployment,f.approvals,f.trust,now);
  assert.equal(result.allowed,true); assert.equal(result.financialEnabled,true); assert.deepEqual(result.errors,[]);
});
test('public-live requires fresh public-live signatures from all five gates',()=>{
  const f=fixture(); const deployment={...f.deployment,mode:'public-live'};
  assert.equal(evaluateRelease(deployment,f.approvals,f.trust,now).allowed,false);
  const approvals=f.approvals.map((a,i)=>{
    const data={...a,mode:'public-live' as const};
    return {...data,signature:sign(null,approvalBytes(data),f.keypairs[i]!.privateKey).toString('base64')};
  });
  assert.equal(evaluateRelease(deployment,approvals,f.trust,now).allowed,true);
});
test('approval cannot be replayed against another release, deployment, chain, contracts, or mode',()=>{
  const f=fixture();
  for (const mutation of [{releaseDigest:'c'.repeat(64)},{projectId:'orio-other-prod'},
    {contractSetDigest:'d'.repeat(64)},{chainId:'84532'},{mode:'public-live'}])
    assert.equal(evaluateRelease({...f.deployment,...mutation},f.approvals,f.trust,now).allowed,false);
});
test('modified evidence or signature is rejected',()=>{
  const f=fixture();
  for (const mutation of [{evidenceDigest:'e'.repeat(64)},{signature:'A'.repeat(88)}]) {
    const approvals=f.approvals.map((a,i)=>i===0?{...a,...mutation}:a);
    assert.equal(evaluateRelease(f.deployment,approvals,f.trust,now).allowed,false);
  }
});
test('expired approvals, future approvals, and invalid clock fail closed',()=>{
  const f=fixture();
  assert.equal(evaluateRelease(f.deployment,f.approvals,f.trust,now+60000).allowed,false);
  assert.equal(evaluateRelease(f.deployment,f.approvals,f.trust,now-2000).allowed,false);
  assert.equal(evaluateRelease(f.deployment,f.approvals,f.trust,NaN).allowed,false);
});
test('one accountable principal or key may approve multiple authorized roles without external reviewers',()=>{
  const f=fixture();
  const samePrincipal=f.trust.map(s=>({...s,principalId:'single-person'}));
  assert.equal(evaluateRelease(f.deployment,f.approvals,samePrincipal,now).allowed,true);
  const oneKey=f.trust.map(s=>({...s,publicKeyPem:f.trust[0]!.publicKeyPem}));
  const approvals=f.approvals.map(a=>({...a,signature:sign(null,approvalBytes(a),f.keypairs[0]!.privateKey).toString('base64')}));
  assert.equal(evaluateRelease(f.deployment,approvals,oneKey,now).allowed,true);
  const owner = { ...f.trust[0]!, principalId: 'owner', roles: [...gates] };
  const ownerApprovals = f.approvals.map(a => {
    const data = { ...a, signerId: owner.id };
    return { ...data, signature: sign(null, approvalBytes(data), f.keypairs[0]!.privateKey).toString('base64') };
  });
  assert.equal(evaluateRelease(f.deployment, ownerApprovals, [owner], now).allowed, true);
  assert.equal(releasePolicy.externalReviewRequired, false);
  assert.equal(evaluateRelease(f.deployment, ownerApprovals.slice(1), [owner], now).allowed, false);
});

test('previous independent-review policy signatures cannot authorize the new policy',()=>{
  const f = fixture();
  const oldApprovals = f.approvals.map((approval, index) => {
    const oldBytes = Buffer.from(approvalBytes(approval).toString('utf8').replace(
      'ORIO-SPC-RELEASE-APPROVAL/v2', 'ORIO-SPC-RELEASE-APPROVAL/v1'));
    return { ...approval, signature: sign(null, oldBytes, f.keypairs[index]!.privateKey).toString('base64') };
  });
  assert.equal(evaluateRelease(f.deployment, oldApprovals, f.trust, now).allowed, false);
});
test('duplicate gate approvals do not substitute for missing gates',()=>{
  const f=fixture();
  assert.equal(evaluateRelease(f.deployment,Array(5).fill(f.approvals[0]),f.trust,now).allowed,false);
});
test('revoked, unknown, and wrong-role signers are rejected',()=>{
  const f=fixture();
  assert.equal(evaluateRelease(f.deployment,f.approvals,f.trust.map(s=>({...s,revoked:true})),now).allowed,false);
  assert.equal(evaluateRelease(f.deployment,f.approvals,f.trust.slice(1),now).allowed,false);
  assert.equal(evaluateRelease(f.deployment,f.approvals,f.trust.map(s=>({...s,roles:['legal']})),now).allowed,false);
});
test('malformed inputs, unsupported algorithms, and additional invalid evidence fail closed',()=>{
  const f=fixture();
  for (const invalid of [null,{},1,{...f.deployment,unknown:true},{...f.deployment,chainId:8453},
    {...f.deployment,releaseDigest:'a'.repeat(64)+'\n'},{...f.deployment,projectId:'orio-spc-3-prod\n'}])
    assert.equal(evaluateRelease(invalid,f.approvals,f.trust,now).allowed,false);
  assert.equal(evaluateRelease(f.deployment,[...f.approvals,{}],f.trust,now).allowed,false);
  assert.equal(evaluateRelease(f.deployment,f.approvals,[...f.trust,f.trust[0]],now).allowed,false);
  const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  assert.equal(evaluateRelease(f.deployment,f.approvals,f.trust.map(s=>({...s,publicKeyPem:ec.publicKey.export({type:'spki',format:'pem'}).toString()})),now).allowed,false);
});
