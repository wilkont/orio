import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GetPublicKeyCommand,SignCommand} from '@aws-sdk/client-kms';
import {verifyTypedData} from 'ethers';
import {prepareReserveValuation,valuationTypes} from '../sdk/reserve-valuation.mjs';
import {signCommittedReserveValuation} from '../sdk/aws-kms-valuation-signer.mjs';
import {reserveFixture} from './helpers/reserve-valuation-fixture.mjs';

test('reserve valuation is reproducible, exact and conservative; unassigned assets never become backing',()=>{
 const f=reserveFixture(),first=f.prepare();
 const e=structuredClone(f.evidence);e.prices.reverse();e.observations.reverse();
 assert.equal(prepareReserveValuation(f.policy,e,f.now).digest,first.digest);
 f.evidence.prices[1].usd36PerToken=(f.one-1n).toString();
 f.evidence.observations.forEach(o=>o.physicalMasterUnits='123');
 const m=f.prepare();assert.equal(m.value.usd36PerToken,(f.one-1n).toString());assert.equal(m.unassignedMasterUnits,'123');
 assert.equal(m.liabilitiesUsd54,'0');assert.equal(m.financialExecutionEnabled,false);
});

test('missing, stale, substituted, disagreeing or nonfinal reserve evidence rejects',()=>{
 const changes=[f=>f.evidence.observations.pop(),f=>f.evidence.prices.pop(),f=>f.evidence.observations[0].finalized=false,
  f=>f.evidence.observations[0].blockHash='0x'+'e'.repeat(64),f=>f.evidence.observations.forEach(o=>o.blockTimestamp='1'),
  f=>f.evidence.prices[0].observedAt='1',f=>f.evidence.prices[0].observedAt=(BigInt(f.now)+1n).toString(),
  f=>f.evidence.prices[0].sourceId='unconfigured',f=>f.evidence.observations[0].sourceId='chain-b',
  f=>f.evidence.observations.forEach(o=>o.codeHashes.master='0x'+'f'.repeat(64)),
  f=>f.evidence.observations.forEach(o=>o.supplyAtoms=0),f=>f.evidence.ledgerState.priceUsd36.numerator='2',
  f=>f.policy.gasTreasury=f.policy.vault,f=>f.policy.chainId='8453',f=>delete f.policy.maximumAgeSeconds,
  f=>f.evidence.prices[0].usd36PerToken=(f.one*2n).toString()];
 for(const change of changes){const f=reserveFixture();change(f);assert.throws(f.prepare);}
});

test('depegged genesis restricts issuance; reserve or custody shortfalls never get a valuation signature',()=>{
 const f=reserveFixture();f.evidence.prices.forEach(p=>p.usd36PerToken=(f.one*99n/100n).toString());
 assert.equal(f.prepare().value.issuanceAllowed,false);
 Object.assign(f.evidence.ledgerState,{phase:'ACTIVE',supplyAtoms:(990n*10n**18n).toString(),reserveMasterUnits:'990000000'});
 f.evidence.companyMasterUnits='10000000';
 f.evidence.observations.forEach(o=>Object.assign(o,{phase:'ACTIVE',supplyAtoms:f.evidence.ledgerState.supplyAtoms,
  reserveMasterUnits:'990000000',companyMasterUnits:'10000000',physicalMasterUnits:'1000000000'}));
 assert.throws(f.prepare,/support liabilities/);
 f.evidence.prices.forEach(p=>p.usd36PerToken=f.one.toString());assert.doesNotThrow(f.prepare);
 f.evidence.observations.forEach(o=>o.physicalMasterUnits='999999999');assert.throws(f.prepare,/custody shortfall/);
});

function staged(f){
 const m=f.prepare();let claimed=false,complete=false;
 return {material:m,get claimed(){return claimed;},get completed(){return complete;},
  load:async()=>({evidence:m.evidence,preparedAt:m.value.validAfter,typedDigest:m.digest,policyDigest:m.policyDigest,keyArn:f.signingPolicy.keyArn,signer:f.wallet.address}),
  claim:async(id,digest)=>{assert.equal(digest,m.digest);if(claimed)throw Error('Already claimed');claimed=true;},
  complete:async()=>{assert.ok(claimed);complete=true;}};
}
test('only an immutable committed intent reaches one prehashed KMS Sign, with signature recovery and no retry',async()=>{
 const f=reserveFixture(),journal=staged(f);let signs=0,closed=0;
 const backend=f.client(async()=>{assert.ok(journal.claimed);signs++;});
 const factory=options=>{assert.deepEqual(options,{region:'us-east-1',endpoint:'https://kms.us-east-1.amazonaws.com',maxAttempts:1});
  return {send:c=>backend.send(c),destroy:()=>closed++};};
 const result=await signCommittedReserveValuation(journal,f.signingPolicy,'intent-1',()=>f.now,factory);
 assert.equal(verifyTypedData(result.domain,valuationTypes,result.value,result.signature),f.wallet.address);
 assert.equal(result.financialExecutionEnabled,false);assert.ok(journal.completed);assert.equal(signs,1);
 await assert.rejects(signCommittedReserveValuation(journal,f.signingPolicy,'intent-1',()=>f.now,factory));
 assert.equal(signs,1);assert.equal(closed,2);
});

test('expiry, identity substitution and authority revocation prevent signing; ambiguous failures stay consumed and opaque',async()=>{
 const f=reserveFixture();let signs=0;
 const factory=()=>f.client(async()=>signs++);
 await assert.rejects(signCommittedReserveValuation(staged(f),f.signingPolicy,'expired',()=>String(BigInt(f.now)+120n),factory));
 const bad=staged(f);bad.load=async()=>({...await staged(f).load(),typedDigest:'0x'+'0'.repeat(64)});
 await assert.rejects(signCommittedReserveValuation(bad,f.signingPolicy,'bad',()=>f.now,factory));
 const revoked=staged(f);revoked.claim=async()=>{throw Error('revoked');};
 await assert.rejects(signCommittedReserveValuation(revoked,f.signingPolicy,'revoked',()=>f.now,factory));assert.equal(signs,0);
 const unknown=staged(f),backend=f.client(async()=>{});
 await assert.rejects(signCommittedReserveValuation(unknown,f.signingPolicy,'unknown',()=>f.now,()=>({
  send:c=>{if(c instanceof GetPublicKeyCommand)return backend.send(c);assert.ok(c instanceof SignCommand);throw Error('synthetic-secret-do-not-log');},destroy:()=>{}})),
  {message:'Reserve signing outcome requires reconciliation; claim remains consumed'});
 assert.ok(unknown.claimed);assert.equal(unknown.completed,false);
 const race=staged(f);race.complete=async()=>{throw Error('revoked during KMS call');};
 await assert.rejects(signCommittedReserveValuation(race,f.signingPolicy,'race',()=>f.now,factory),/requires reconciliation/);
});
