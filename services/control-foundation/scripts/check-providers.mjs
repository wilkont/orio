import { configuredChainProviders,qualifyChainProviders } from '../src/provider-qualification.ts';
try{
  const {first,second}=configuredChainProviders(process.env);
  const report=await qualifyChainProviders(first,second,{chainId:process.env.ORIO_CHAIN_ID??'84532',
    maximumFinalizedAgeSeconds:'3600',maximumHeightSkew:'128'},new Date().toISOString());
  console.log(JSON.stringify(report,null,2));
}catch{
  // Endpoint URLs, authentication and provider error bodies must never appear in reports.
  console.log(JSON.stringify({status:'BLOCKED',financialExecutionEnabled:false,reason:'Provider configuration or live finality checks failed'},null,2));
  process.exitCode=1;
}
