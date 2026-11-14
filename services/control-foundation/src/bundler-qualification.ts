import { chainAddress,chainQuantity } from './chain-evidence.ts';
import { HttpsBundlerReader,parseRpcHeaders } from './chain-rpc.ts';
import type { BundlerReader } from './chain-rpc.ts';

export interface BundlerExpectation { chainId:string; entryPointAddress:string; entryPointVersion:'0.8' }
/** Provider capability assertion only. It is not proof of deployed bytecode, ERC-7562
 * admission, signer safety, paymaster prefund, costs, transaction finality or readiness. */
export async function qualifyBundler(reader:BundlerReader,input:BundlerExpectation,now:string){
  const expected=structuredClone(input);
  if(typeof expected.chainId!=='string'||!/^[1-9][0-9]{0,77}$/.test(expected.chainId)||BigInt(expected.chainId)>=(1n<<256n)||
      expected.entryPointVersion!=='0.8')throw new Error('Invalid bundler expectation');
  const address=chainAddress(expected.entryPointAddress);
  if(address==='0x'+'0'.repeat(40))throw new Error('EntryPoint identity is required');
  const time=Date.parse(now);
  if(!Number.isFinite(time)||new Date(time).toISOString()!==now)throw new Error('Invalid bundler qualification clock');
  if(chainQuantity(await reader.request('eth_chainId',[])).toString()!==expected.chainId)throw new Error('Bundler chain identity mismatch');
  const response=await reader.request('eth_supportedEntryPoints',[]);
  if(!Array.isArray(response)||response.length===0||response.length>32)throw new Error('Invalid supported EntryPoints response');
  const entries=response.map(chainAddress);
  if(entries.includes('0x'+'0'.repeat(40))||new Set(entries).size!==entries.length||!entries.includes(address))
    throw new Error('Required EntryPoint is not uniquely supported');
  return {status:'READ_ONLY_BUNDLER_CAPABILITY_PASSED',financialExecutionEnabled:false,productionQualified:false,
    customContractAdmissionVerified:false,observedAt:now,sourceId:reader.sourceId,chainId:expected.chainId,
    entryPointAddress:address,expectedEntryPointVersion:expected.entryPointVersion,supportedEntryPoints:entries.sort()};
}
export function configuredBundler(environment:Record<string,string|undefined>){
  const endpoint=environment.ORIO_BUNDLER_URL;
  if(!endpoint)throw new Error('Bundler URL must be configured');
  const headers=parseRpcHeaders(environment.ORIO_BUNDLER_HEADERS);
  return new HttpsBundlerReader({sourceId:'orio-bundler-primary',endpoint,...(headers?{headers}:{})});
}
