import {getAddress,keccak256,toUtf8Bytes,TypedDataEncoder} from 'ethers';

export const valuationTypes=Object.freeze({Valuation:Object.freeze([
 ['asset','address'],['usd36PerToken','uint256'],['registryEpoch','uint256'],['registryRevision','uint256'],
 ['controllerRevision','uint64'],['validAfter','uint48'],['validUntil','uint48'],['issuanceAllowed','bool'],['evidenceDigest','bytes32'],
].map(([name,type])=>Object.freeze({name,type})))});
const uint=(v,bits=256)=>{
 if(typeof v!=='string'||v!==v.trim()||!/^(0|[1-9][0-9]{0,77})$/.test(v)||BigInt(v)>=(1n<<BigInt(bits)))throw Error('Invalid exact reserve quantity');
 return BigInt(v);
};
const digest=v=>{if(typeof v!=='string'||v!==v.trim()||!/^0x[0-9a-f]{64}$/.test(v)||/^0x0+$/.test(v))throw Error('Missing reserve evidence digest');return v;};
const address=v=>{if(typeof v!=='string')throw Error('Invalid reserve identity');const a=getAddress(v);if(a==='0x'+'0'.repeat(40))throw Error('Zero reserve identity');return a;};
function canonical(v){
 if(Array.isArray(v))return v.map(canonical);
 if(v!==null&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
 return v;
}
export const reserveEvidenceDigest=v=>keccak256(toUtf8Bytes(JSON.stringify(canonical(v))));
const states=['GENESIS','ACTIVE','ZERO_SUPPLY_PENDING','ZERO_SUPPLY_RECONCILED'];
const amounts=['supplyAtoms','reserveMasterUnits','companyMasterUnits','physicalMasterUnits','referencePriceUsd36','roundingUsd54','stateVersion','cycle'];

/** Trusted, already authenticated observers and deployment policy only. This does
 * not fetch prices, establish custody, accept customer-supplied attestations or
 * authorize financial release. Every amount is exact; missing evidence fails closed.
 * Policy thresholds are explicit qualification inputs, never silently live defaults.
 */
export function prepareReserveValuation(inputPolicy,inputEvidence,nowSeconds){
 const p=structuredClone(inputPolicy),e=structuredClone(inputEvidence),now=uint(nowSeconds,48);
 if(p.mode!=='qualification'||p.chainId!=='84532')throw Error('Only Base Sepolia qualification is supported');
 for(const k of ['controller','vault','currency','registry','master','gasTreasury','valuationSigner'])p[k]=address(p[k]);
 if(new Set(['controller','vault','currency','registry','master','gasTreasury','valuationSigner'].map(k=>p[k])).size!==7)throw Error('Reserve and gas authority must be separate');
 if(!Number.isInteger(p.masterDecimals)||p.masterDecimals<0||p.masterDecimals>18)throw Error('Invalid master precision');
 const age=uint(p.maximumAgeSeconds,48),checkpointAge=uint(p.maximumCheckpointAgeSeconds,48),life=uint(p.maximumValiditySeconds,48),deviation=uint(p.maximumPriceDeviationPpm);
 const lower=uint(p.issuanceMinimumUsd36),upper=uint(p.issuanceMaximumUsd36);
 if(age===0n||age>300n||checkpointAge<age||checkpointAge>3600n||life===0n||life>300n||deviation>1000000n||lower===0n||upper<lower)throw Error('Invalid explicit reserve risk policy');
 if(!Array.isArray(e.observations)||e.observations.length!==2||!Array.isArray(e.prices)||e.prices.length!==2)throw Error('Two configured observations and prices are required');
 for(const rows of [e.observations,e.prices]){
  if(rows.some(x=>typeof x.sourceId!=='string'||x.sourceId!==x.sourceId.trim()||!/^[a-zA-Z0-9:_-]{1,128}$/.test(x.sourceId))||new Set(rows.map(x=>x.sourceId)).size!==2)throw Error('Distinct reserve sources are required');
  rows.sort((a,b)=>a.sourceId<b.sourceId?-1:a.sourceId>b.sourceId?1:0);
 }
 if(!Array.isArray(p.chainSources)||!Array.isArray(p.priceSources)||
   JSON.stringify([...p.chainSources].sort())!==JSON.stringify(e.observations.map(x=>x.sourceId).sort())||
   JSON.stringify([...p.priceSources].sort())!==JSON.stringify(e.prices.map(x=>x.sourceId).sort()))throw Error('Unconfigured reserve source');
 const s=e.observations[0];
 for(const o of e.observations){
  if(o.chainId!==p.chainId||o.finalized!==true||o.masterDecimals!==p.masterDecimals||(!states.includes(o.phase)||!['ACTIVE_MASTER','DEPOSIT_PAUSED'].includes(o.masterState)))throw Error('Unqualified reserve snapshot');
  digest(o.blockHash);uint(o.blockNumber);const at=uint(o.blockTimestamp,48),observed=uint(o.observedAt,48);
  if(at>observed||observed>now||now-observed>age||now-at>checkpointAge)throw Error('Stale reserve snapshot');
  for(const k of ['controller','vault','currency','registry','master','gasTreasury','valuationSigner'])if(address(o[k])!==p[k])throw Error('Reserve deployment mismatch');
  for(const k of ['controllerRevision','registryEpoch','registryRevision'])if(uint(o[k],k==='controllerRevision'?64:256)!==uint(p[k],k==='controllerRevision'?64:256))throw Error('Reserve revision mismatch');
  for(const k of amounts)uint(o[k]);
  if(!o.codeHashes||!p.codeHashes)throw Error('Missing pinned code identity');
  for(const k of ['controller','vault','currency','registry','master'])if(digest(o.codeHashes[k])!==digest(p.codeHashes[k]))throw Error('Reserve code mismatch');
  const {sourceId:ignored,...snapshot}=o;const {sourceId:other,...first}=s;
  if(reserveEvidenceDigest(snapshot)!==reserveEvidenceDigest(first))throw Error('Reserve observers disagree');
 }
 if(typeof e.deploymentId!=='string'||e.deploymentId!==e.deploymentId.trim()||!/^[a-z][a-z0-9_-]{0,63}$/.test(e.deploymentId)||!e.ledgerState)throw Error('Missing committed reserve ledger');
 const l=e.ledgerState;
 if(l.supplyAtoms!==s.supplyAtoms||l.reserveMasterUnits!==s.reserveMasterUnits||l.phase!==s.phase||
   l.priceUsd36?.numerator!==s.referencePriceUsd36||l.priceUsd36?.denominator!=='1'||
   l.cycle!==s.cycle||l.masterDecimals!==p.masterDecimals||l.masterAssetId!==`erc20:${p.chainId}:${p.master.toLowerCase()}`||
   l.electionId!==`onchain-epoch:${p.registryEpoch}`||e.ledgerVersion!==s.stateVersion||e.companyMasterUnits!==s.companyMasterUnits)
  throw Error('Reserve ledger and chain disagree');
 const rn=uint(l.roundingUsd36?.numerator),rd=uint(l.roundingUsd36?.denominator);
 if(rd===0n||rn*10n**18n%rd!==0n||rn*10n**18n/rd!==uint(s.roundingUsd54))throw Error('Rounding ledger mismatch');
 const values=e.prices.map(x=>{digest(x.evidenceDigest);const at=uint(x.observedAt,48),value=uint(x.usd36PerToken);
  if(at>now||now-at>age||value===0n)throw Error('Stale or invalid reserve price');return value;});
 const minimum=values.reduce((a,b)=>a<b?a:b),maximum=values.reduce((a,b)=>a>b?a:b);
 if((maximum-minimum)*1000000n>minimum*deviation)throw Error('Reserve prices disagree');
 const backing=uint(s.reserveMasterUnits),company=uint(s.companyMasterUnits),physical=uint(s.physicalMasterUnits);
 if(physical<backing+company)throw Error('Reserve custody shortfall');
 const liabilities=uint(s.supplyAtoms)*uint(s.referencePriceUsd36)+uint(s.roundingUsd54);
 if(minimum*10n**BigInt(18-p.masterDecimals)>=1n<<256n||liabilities>=1n<<256n||backing*minimum*10n**BigInt(18-p.masterDecimals)>=1n<<256n)throw Error('Reserve arithmetic exceeds contract precision');
 if(backing*minimum*10n**BigInt(18-p.masterDecimals)<liabilities)throw Error('Reserve value cannot support liabilities');
 if(s.phase==='GENESIS'&&(uint(s.supplyAtoms)!==0n||backing!==0n))throw Error('Original genesis must be empty');
 const oldest=[uint(s.observedAt,48),...e.prices.map(x=>uint(x.observedAt,48))].reduce((a,b)=>a<b?a:b);
 const until=[now+life,oldest+age,uint(s.blockTimestamp,48)+checkpointAge].reduce((a,b)=>a<b?a:b);
 if(until<=now)throw Error('Reserve evidence expires before signing');
 const domain={name:'ORIO Monetary Controller',version:'1',chainId:p.chainId,verifyingContract:p.controller};
 const value={asset:p.master,usd36PerToken:minimum.toString(),registryEpoch:p.registryEpoch,registryRevision:p.registryRevision,
  controllerRevision:p.controllerRevision,validAfter:now.toString(),validUntil:until.toString(),
  issuanceAllowed:s.masterState==='ACTIVE_MASTER'&&values.every(v=>v>=lower&&v<=upper),evidenceDigest:reserveEvidenceDigest(e)};
 return {domain,types:valuationTypes,value,digest:TypedDataEncoder.hash(domain,valuationTypes,value),
  evidence:e,policyDigest:reserveEvidenceDigest(p),unassignedMasterUnits:(physical-backing-company).toString(),
  liabilitiesUsd54:liabilities.toString(),financialExecutionEnabled:false};
}
