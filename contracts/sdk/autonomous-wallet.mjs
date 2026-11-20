import {Interface,TypedDataEncoder,getAddress,keccak256,AbiCoder} from 'ethers';
const requestType='tuple(bytes32 requestId,uint256 epochId,address owner,address recipient,uint256 atoms,uint256 minimumPayout,uint256 nonce,uint48 deadline)';
const controller=new Interface([
 'function purchase(bytes32,uint256,uint256,uint256)',`function enqueue(${requestType},bytes)`,
 'function settleEpoch()','function cancel(bytes32)','function releaseExpired(bytes32)',
]);
const claims=new Interface(['function claimFor(address)']),token=new Interface(['function approve(address,uint256)','function transfer(address,uint256)']);
export const autonomousWithdrawalTypes={Withdrawal:[['requestId','bytes32'],['epochId','uint256'],['owner','address'],['recipient','address'],['atoms','uint256'],['minimumPayout','uint256'],['nonce','uint256'],['deadline','uint48']].map(([name,type])=>({name,type}))};
const uint=(n,positive=false)=>{
 if(typeof n!=='string'||!/^(0|[1-9][0-9]*)$/.test(n)||BigInt(n)>=2n**256n||positive&&BigInt(n)===0n)throw Error('Use canonical integer monetary strings');return n;
};
const address=a=>{const v=getAddress(a);if(v==='0x'+'0'.repeat(40))throw Error('Zero wallet address');return v;};
const hash=h=>{if(typeof h!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(h)||BigInt(h)===0n)throw Error('Invalid wallet request ID');return h;};
function configuration(input){
 const c=structuredClone(input);if(!['84532','31337'].includes(c.chainId))throw Error('Autonomous wallet qualification chains only');
 for(const k of ['controller','currency','vault','master','claims'])c[k]=address(c[k]);
 if(new Set(['controller','currency','vault','master','claims'].map(k=>c[k])).size!==5)throw Error('Conflicting wallet identities');return c;
}
const call=(target,data)=>({target,value:'0',data});
const plan=(phase,calls)=>({phase,calls,actionDigest:keccak256(AbiCoder.defaultAbiCoder().encode(['string','tuple(address target,uint256 value,bytes data)[]'],[phase,calls]))});
/** Browser-compatible calldata/consent builder. No signing, RPC, custody or gas sponsorship.
 * Deployment and snapshot must come from admitted chain readers, never a website form.
 * Each returned phase needs a separately authorized full network-cost quote.
 */
export function autonomousWallet(input){
 const c=configuration(input);
 return {
  purchase({requestId,version,grossMasterUnits,minimumAtoms}){
   hash(requestId);uint(version);uint(grossMasterUnits,true);uint(minimumAtoms,true);
   return plan('PURCHASE',[call(c.master,token.encodeFunctionData('approve',[c.vault,grossMasterUnits])),call(c.controller,controller.encodeFunctionData('purchase',[requestId,version,grossMasterUnits,minimumAtoms]))]);
  },
  withdrawal(request,snapshot){
   const r=structuredClone(request),s=structuredClone(snapshot);
   for(const k of ['epochId','atoms','minimumPayout','nonce','deadline'])uint(r[k],['epochId','atoms','minimumPayout'].includes(k));
   hash(r.requestId);r.owner=address(r.owner);r.recipient=address(r.recipient);
   for(const k of ['origin','period','now'])uint(s[k]);
   const period=BigInt(s.period),now=BigInt(s.now),origin=BigInt(s.origin);
   if(period<1n||period>300n||now<origin)throw Error('Invalid epoch snapshot');
   const epoch=(now-origin)/period+1n,close=origin+epoch*period;
   if(BigInt(r.epochId)!==epoch||BigInt(r.deadline)!==close+120n||BigInt(r.deadline)>=2n**48n||[c.vault,c.claims].includes(r.recipient))throw Error('Wrong epoch, recipient or common expiry');
   const typedData={domain:{name:'ORIO Autonomous Withdrawal',version:'1',chainId:c.chainId,verifyingContract:c.controller},types:structuredClone(autonomousWithdrawalTypes),message:r};
   return {...typedData,digest:TypedDataEncoder.hash(typedData.domain,typedData.types,r)};
  },
  admission(consent,signature){
   if(consent.domain?.verifyingContract!==c.controller||String(consent.domain?.chainId)!==c.chainId||
    consent.domain.name!=='ORIO Autonomous Withdrawal'||consent.domain.version!=='1'||
    TypedDataEncoder.hash(consent.domain,autonomousWithdrawalTypes,consent.message)!==consent.digest)throw Error('Changed wallet consent');
   if(typeof signature!=='string'||!/^0x(?:[a-fA-F0-9]{2})+$/.test(signature))throw Error('Missing customer signature');
   return plan('REDEMPTION_ADMISSION',[call(c.controller,controller.encodeFunctionData('enqueue',[consent.message,signature]))]);
  },
  settlement:()=>plan('REDEMPTION_SETTLEMENT',[call(c.controller,controller.encodeFunctionData('settleEpoch'))]),
  claim:recipient=>plan('REDEMPTION_CLAIM',[call(c.claims,claims.encodeFunctionData('claimFor',[address(recipient)]))]),
  cancel:requestId=>plan('REDEMPTION_CANCEL',[call(c.controller,controller.encodeFunctionData('cancel',[hash(requestId)]))]),
  release:requestId=>plan('REDEMPTION_RELEASE',[call(c.controller,controller.encodeFunctionData('releaseExpired',[hash(requestId)]))]),
  transfer:({recipient,atoms})=>plan('TRANSFER',[call(c.currency,token.encodeFunctionData('transfer',[address(recipient),uint(atoms,true)]))]),
 };
}
