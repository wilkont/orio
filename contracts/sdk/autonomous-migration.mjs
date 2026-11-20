import {Interface,getAddress,keccak256} from 'ethers';
const api=new Interface([
 'function currency() view returns(address)','function vault() view returns(address)','function controller() view returns(address)',
 'function masterAsset() view returns(address)','function executionEnabled() view returns(bool)',
 'function totalSupply() view returns(uint256)','function reserveUnits() view returns(uint256)','function companyFees(address) view returns(uint256)',
 'function balanceOf(address) view returns(uint256)','function referencePriceUsd36() view returns(uint256)',
 'function roundingUsd54() view returns(uint256)','function stateVersion() view returns(uint256)','function cycle() view returns(uint256)','function phase() view returns(uint8)',
 'function sealedEpoch() view returns(bytes32,bytes32,uint256,uint256,uint256,uint48)',
]);
const qty=v=>{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(v))throw Error('Invalid migration block quantity');return BigInt(v);};
const hash=v=>{if(typeof v!=='string'||!/^0x[0-9a-f]{64}$/.test(v))throw Error('Invalid migration hash');return v;};
/** Empty original-genesis source qualification ONLY. No funded migration, routing,
 * governance change, address replacement, signing or financial authority is returned.
 * Provider independence and code-hash admission are trusted deployment configuration.
 */
async function observe(first,second,input,clock,diagnostic){
 const p=structuredClone(input),now=clock();
 if(p.chainId!=='84532'||!diagnostic&&first.sourceId===second.sourceId||!first.sourceId?.trim()||!second.sourceId?.trim()||typeof now!=='string'||!/^(0|[1-9][0-9]*)$/.test(now))throw Error('Invalid empty migration observers');
 for(const key of ['controller','currency','vault','master']){p[key]=getAddress(p[key]);hash(p.codeHashes?.[key]);}
 if(new Set(['controller','currency','vault','master'].map(k=>p[k])).size!==4)throw Error('Conflicting migration identities');
 const readers=[first,second],heads=await Promise.all(readers.map(async r=>{
  if(qty(await r.request('eth_chainId',[])).toString()!==p.chainId)throw Error('Wrong migration chain');
  const b=await r.request('eth_getBlockByNumber',['finalized',false]);qty(b.number);hash(b.hash);return b;
 }));
 const height=heads.map(h=>qty(h.number)).reduce((a,b)=>a<b?a:b),tag='0x'+height.toString(16);
 const blocks=await Promise.all(readers.map(r=>r.request('eth_getBlockByNumber',[tag,false])));
 const b=blocks[0];
 if(blocks.some((v,i)=>qty(v.number)!==height||hash(v.hash)!==hash(b.hash)||qty(v.timestamp)!==qty(b.timestamp)||
  qty(heads[i].number)===height&&hash(heads[i].hash)!==hash(v.hash))||qty(b.timestamp)>BigInt(now)||BigInt(now)-qty(b.timestamp)>3600n)throw Error('Stale or inconsistent finalized migration anchor');
 const pin={blockHash:b.hash,requireCanonical:true};
 const states=await Promise.all(readers.map(async r=>{
  const read=async(target,name,args=[])=>api.decodeFunctionResult(name,await r.request('eth_call',[{to:target.toLowerCase(),data:api.encodeFunctionData(name,args)},pin]));
  const single=async(target,name,args=[])=>(await read(target,name,args))[0];
  for(const key of ['controller','currency','vault','master']){
   const code=await r.request('eth_getCode',[p[key].toLowerCase(),pin]);if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+$/.test(code)||keccak256(code)!==p.codeHashes[key])throw Error('Migration source code mismatch');
  }
  for(const [target,name,expected] of [[p.controller,'currency',p.currency],[p.controller,'vault',p.vault],[p.currency,'controller',p.controller],[p.vault,'controller',p.controller],[p.vault,'masterAsset',p.master]])
   if(getAddress(await single(target,name))!==expected)throw Error('Migration custody identity mismatch');
  if(await single(p.controller,'executionEnabled'))throw Error('Legacy execution must remain disabled');
  const epoch=await read(p.controller,'sealedEpoch');if(epoch[0]!=='0x'+'0'.repeat(64))throw Error('Legacy epoch remains outstanding');
  const state={};
  for(const [key,target,name,args] of [
   ['supply',p.currency,'totalSupply'],['reserve',p.vault,'reserveUnits'],['companyFees',p.vault,'companyFees',[p.master]],
   ['physicalCash',p.master,'balanceOf',[p.vault]],['rounding',p.controller,'roundingUsd54'],['version',p.controller,'stateVersion'],
   ['cycle',p.controller,'cycle'],['phase',p.controller,'phase'],['referencePriceUsd36',p.controller,'referencePriceUsd36']])state[key]=String(await single(target,name,args));
  for(const [key,value] of Object.entries(state))if(value!==(key==='referencePriceUsd36'?String(10n**36n):'0'))throw Error('Source is not empty original genesis; funded/non-genesis migration requires a separate plan');
  const check=await r.request('eth_getBlockByNumber',[tag,false]);if(qty(check.number)!==height||hash(check.hash)!==b.hash)throw Error('Migration anchor changed');return state;
 }));
 if(JSON.stringify(states[0])!==JSON.stringify(states[1]))throw Error('Migration observers disagree');
 return {status:diagnostic?'SINGLE_SOURCE_EMPTY_STATE_DIAGNOSTIC':'EMPTY_SOURCE_VERIFIED_NO_MIGRATION_AUTHORITY',productionQualified:false,chainId:p.chainId,blockNumber:String(height),blockHash:b.hash,
  sourceController:p.controller,sourceVault:p.vault,master:p.master,state:states[0],financialExecutionEnabled:false};
}
const clock=()=>String(Math.floor(Date.now()/1000));
export function verifyEmptyAutonomousMigrationSource(first,second,input,now=clock){return observe(first,second,input,now,false);}
export function inspectSingleMigrationSource(source,input,now=clock){return observe(source,source,input,now,true);}
