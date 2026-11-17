import {Interface,getAddress,keccak256} from 'ethers';
const api=new Interface([
 'function valuationSigner() view returns(address)','function vault() view returns(address)','function currency() view returns(address)','function registry() view returns(address)',
 'function controller() view returns(address)','function masterAsset() view returns(address)','function decimals() view returns(uint8)',
 'function revision() view returns(uint256)','function stateVersion() view returns(uint256)','function referencePriceUsd36() view returns(uint256)',
 'function roundingUsd54() view returns(uint256)','function cycle() view returns(uint256)','function phase() view returns(uint8)',
 'function epoch() view returns(uint256)','function monetaryController() view returns(address)','function monetaryVault() view returns(address)',
 'function currentMaster() view returns(bytes32)','function assets(bytes32) view returns(address,uint8,uint8,bytes32)',
 'function reserveUnits() view returns(uint256)','function companyFees(address) view returns(uint256)',
 'function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)',
]);
const qty=v=>{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)(?![\s\S])/.test(v))throw Error('Invalid reserve block quantity');return BigInt(v);};
const hash=v=>{if(typeof v!=='string'||!/^0x[0-9a-f]{64}(?![\s\S])/.test(v))throw Error('Invalid reserve block hash');return v;};
const phases=['GENESIS','ACTIVE','ZERO_SUPPLY_PENDING','ZERO_SUPPLY_RECONCILED'];
const masterStates=['CANDIDATE','APPROVED','ACTIVE_MASTER','MIGRATING','RETIRED','AUTHORIZED_SECONDARY','DEPOSIT_PAUSED'];

/** Authenticated provider adapters are trusted deployment configuration. Both
 * observers pin the same block hash with requireCanonical and recheck finality.
 * Matching providers are evidence agreement, not proof of oracle independence.
 * This reads only: no financial, custody, signing or release authority is created.
 */
export async function observeReserve(first,second,inputPolicy,clock=()=>Math.floor(Date.now()/1000).toString()){
 const p=structuredClone(inputPolicy);
 const observedAt=clock();
 if(typeof observedAt!=='string'||!/^(0|[1-9][0-9]{0,14})(?![\s\S])/.test(observedAt))throw Error('Invalid reserve observation clock');
 if(p.mode!=='qualification'||p.chainId!=='84532'||first.sourceId===second.sourceId||
  JSON.stringify([first.sourceId,second.sourceId].sort())!==JSON.stringify([...p.chainSources].sort()))throw Error('Unconfigured reserve observers');
 for(const k of ['controller','vault','currency','registry','master','gasTreasury','valuationSigner'])p[k]=getAddress(p[k]);
 const heads=await Promise.all([first,second].map(async r=>{
  if(qty(await r.request('eth_chainId',[])).toString()!==p.chainId)throw Error('Reserve observer chain mismatch');
  const b=await r.request('eth_getBlockByNumber',['finalized',false]);qty(b.number);hash(b.hash);qty(b.timestamp);return b;
 }));
 const height=heads.map(b=>qty(b.number)).reduce((a,b)=>a<b?a:b),tag='0x'+height.toString(16);
 const blocks=await Promise.all([first,second].map(r=>r.request('eth_getBlockByNumber',[tag,false])));
 if(blocks.some(b=>qty(b.number)!==height||hash(b.hash)!==hash(blocks[0].hash)||qty(b.timestamp)!==qty(blocks[0].timestamp)))throw Error('Reserve canonical blocks disagree');
 const block=blocks[0],pin={blockHash:block.hash,requireCanonical:true};
 return Promise.all([first,second].map(async r=>{
  const call=async(target,name,args=[])=>{
   const data=await r.request('eth_call',[{to:target.toLowerCase(),data:api.encodeFunctionData(name,args)},pin]);
   if(typeof data!=='string'||!/^0x(?:[0-9a-f]{64})+(?![\s\S])/.test(data))throw Error('Malformed reserve contract response');
   return api.decodeFunctionResult(name,data);
  };
  const single=async(target,name,args=[])=>(await call(target,name,args))[0];
  const codeHashes={};
  for(const k of ['controller','vault','currency','registry','master']){
   const code=await r.request('eth_getCode',[p[k].toLowerCase(),pin]);
   if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+(?![\s\S])/.test(code)||code.length>100000||keccak256(code)!==p.codeHashes[k])throw Error('Reserve bytecode identity mismatch');
   codeHashes[k]=keccak256(code);
  }
  for(const [target,name,expected] of [[p.controller,'valuationSigner',p.valuationSigner],[p.controller,'vault',p.vault],[p.controller,'currency',p.currency],[p.controller,'registry',p.registry],
   [p.vault,'controller',p.controller],[p.vault,'masterAsset',p.master],[p.registry,'monetaryController',p.controller],[p.registry,'monetaryVault',p.vault]])
   if(getAddress(await single(target,name))!==expected)throw Error('Reserve contract binding mismatch');
  const selected=await single(p.registry,'currentMaster'),asset=await call(p.registry,'assets',[selected]);
  const decimals=Number(await single(p.master,'decimals'));
  if(getAddress(asset[0])!==p.master||Number(asset[1])!==decimals||decimals!==p.masterDecimals)throw Error('Elected reserve asset mismatch');
  const out={sourceId:r.sourceId,chainId:p.chainId,blockNumber:height.toString(),blockHash:block.hash,observedAt,
   blockTimestamp:qty(block.timestamp).toString(),finalized:true,codeHashes,masterDecimals:decimals,
   masterState:masterStates[Number(asset[2])]};
  for(const k of ['controller','vault','currency','registry','master','gasTreasury','valuationSigner'])out[k]=p[k];
  for(const [key,target,name,args] of [
   ['controllerRevision',p.controller,'revision'],['registryEpoch',p.registry,'epoch'],['registryRevision',p.registry,'revision'],
   ['stateVersion',p.controller,'stateVersion'],['referencePriceUsd36',p.controller,'referencePriceUsd36'],
   ['roundingUsd54',p.controller,'roundingUsd54'],['cycle',p.controller,'cycle'],['supplyAtoms',p.currency,'totalSupply'],
   ['reserveMasterUnits',p.vault,'reserveUnits'],['companyMasterUnits',p.vault,'companyFees',[p.master]],
   ['physicalMasterUnits',p.master,'balanceOf',[p.vault]]])out[key]=(await single(target,name,args)).toString();
  out.phase=phases[Number(await single(p.controller,'phase'))];
  const canonical=await r.request('eth_getBlockByNumber',[tag,false]);
  if(qty(canonical.number)!==height||hash(canonical.hash)!==block.hash)throw Error('Reserve observation was reorganized');
  return out;
 }));
}
