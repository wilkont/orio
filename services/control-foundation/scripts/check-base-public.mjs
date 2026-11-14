import { HttpsChainReader } from '../src/chain-rpc.ts';
import { probeChainSource } from '../src/provider-qualification.ts';
try{
  const observedAt=new Date().toISOString();
  const evidence=await probeChainSource(new HttpsChainReader({sourceId:'base-official-public-sepolia',endpoint:'https://sepolia.base.org'}),
    {chainId:'84532',maximumFinalizedAgeSeconds:'3600',maximumHeightSkew:'128'},observedAt);
  console.log(JSON.stringify({status:'SINGLE_PUBLIC_SOURCE_DIAGNOSTIC',financialExecutionEnabled:false,productionQualified:false,
    observedAt,evidence,documentation:'https://docs.base.org/get-started/connect-to-base'},null,2));
}catch{console.log(JSON.stringify({status:'PUBLIC_SOURCE_UNAVAILABLE',financialExecutionEnabled:false},null,2));process.exitCode=1;}
