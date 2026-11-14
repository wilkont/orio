import { chainHash,chainObject,chainQuantity,requireChainSources } from './chain-evidence.ts';
import type { ChainReader } from './chain-evidence.ts';
import { HttpsChainReader,parseRpcHeaders } from './chain-rpc.ts';

export interface ProviderPolicy { chainId:string;maximumFinalizedAgeSeconds:string;maximumHeightSkew:string }
function quantity(value:unknown,positive=false):bigint{
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(value)||BigInt(value)>=(1n<<256n)||positive&&value==='0')
    throw new Error('Invalid provider qualification policy');return BigInt(value);
}
function clock(now:string){
  const time=Date.parse(now);if(!Number.isFinite(time)||new Date(time).toISOString()!==now)throw new Error('Invalid qualification clock');
  return BigInt(Math.floor(time/1000));
}
function block(value:unknown){
  const record=chainObject(value);return {number:chainQuantity(record.number),hash:chainHash(record.hash),timestamp:chainQuantity(record.timestamp)};
}
export async function probeChainSource(source:ChainReader,input:ProviderPolicy,now:string){
  const policy=structuredClone(input),expectedChain=quantity(policy.chainId,true),age=quantity(policy.maximumFinalizedAgeSeconds,true);
  quantity(policy.maximumHeightSkew);const current=clock(now);
  if(age>86400n)throw new Error('Finality freshness policy exceeds one day');
  if(chainQuantity(await source.request('eth_chainId',[]))!==expectedChain)throw new Error('Provider chain identity mismatch');
  const final=block(await source.request('eth_getBlockByNumber',['finalized',false]));
  if(final.timestamp>current+30n||current-final.timestamp>age)throw new Error('Provider finality is stale or future dated');
  const canonical=block(await source.request('eth_getBlockByNumber',['0x'+final.number.toString(16),false]));
  if(final.number!==canonical.number||final.hash!==canonical.hash||final.timestamp!==canonical.timestamp)throw new Error('Provider canonical block mismatch');
  return {sourceId:source.sourceId,chainId:policy.chainId,finalizedNumber:final.number.toString(),finalizedHash:final.hash,finalizedTimestamp:final.timestamp.toString()};
}
/** Connectivity/finality evidence only. Distinct operator labels are operator assertions,
 * not proof of organizational independence, availability, bundler compliance or custody. */
export async function qualifyChainProviders(first:{reader:ChainReader;operatorId:string},second:{reader:ChainReader;operatorId:string},input:ProviderPolicy,now:string){
  const policy=structuredClone(input);requireChainSources(first.reader,second.reader);
  if(!/^[a-z][a-z0-9_-]{0,63}$/.test(first.operatorId)||!/^[a-z][a-z0-9_-]{0,63}$/.test(second.operatorId)||first.operatorId===second.operatorId)
    throw new Error('Distinct configured provider operators are required');
  const [a,b]=await Promise.all([probeChainSource(first.reader,policy,now),probeChainSource(second.reader,policy,now)]);
  const ah=BigInt(a.finalizedNumber),bh=BigInt(b.finalizedNumber);
  if((ah>bh?ah-bh:bh-ah)>quantity(policy.maximumHeightSkew))throw new Error('Provider finality heights diverge');
  const height=ah<bh?ah:bh,tag='0x'+height.toString(16);
  const [x,y]=await Promise.all([first.reader.request('eth_getBlockByNumber',[tag,false]),second.reader.request('eth_getBlockByNumber',[tag,false])]);
  const one=block(x),two=block(y);
  if(one.number!==height||two.number!==height||one.hash!==two.hash||one.timestamp!==two.timestamp||
    (height===ah&&(one.hash!==a.finalizedHash||one.timestamp.toString()!==a.finalizedTimestamp))||
    (height===bh&&(one.hash!==b.finalizedHash||one.timestamp.toString()!==b.finalizedTimestamp)))throw new Error('Provider finalized histories disagree');
  return {status:'READ_ONLY_PROBE_PASSED',financialExecutionEnabled:false,observedAt:now,chainId:policy.chainId,
    commonFinalized:{number:height.toString(),hash:one.hash,timestamp:one.timestamp.toString()},
    sources:[{...a,operatorId:first.operatorId},{...b,operatorId:second.operatorId}]};
}
export function configuredChainProviders(environment:Record<string,string|undefined>){
  const endpoints:string[]=[];
  const providers=['PRIMARY','SECONDARY'].map(label=>{
    const endpoint=environment['ORIO_RPC_'+label+'_URL'],operatorId=environment['ORIO_RPC_'+label+'_OPERATOR_ID'];
    if(!endpoint||!operatorId)throw new Error('Two provider URLs and operator identities must be configured');
    let origin:string;try{origin=new URL(endpoint).origin;}catch{throw new Error('Invalid provider URL configuration');}
    endpoints.push(origin);
    const headers=parseRpcHeaders(environment['ORIO_RPC_'+label+'_HEADERS']);
    return {operatorId,reader:new HttpsChainReader({sourceId:'orio-rpc-'+label.toLowerCase(),endpoint,...(headers?{headers}:{})})};
  });
  if(endpoints[0]===endpoints[1])throw new Error('Provider endpoints must use distinct origins');
  return {first:providers[0]!,second:providers[1]!};
}
