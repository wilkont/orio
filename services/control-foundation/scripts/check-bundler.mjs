import { configuredBundler,qualifyBundler } from '../src/bundler-qualification.ts';
try{
  if(!process.env.ORIO_ENTRYPOINT_ADDRESS)throw new Error('EntryPoint address must be pinned');
  const evidence=await qualifyBundler(configuredBundler(process.env),{chainId:process.env.ORIO_CHAIN_ID??'84532',
    entryPointAddress:process.env.ORIO_ENTRYPOINT_ADDRESS,entryPointVersion:'0.8'},new Date().toISOString());
  console.log(JSON.stringify(evidence,null,2));
}catch{
  console.log(JSON.stringify({status:'BLOCKED',financialExecutionEnabled:false,reason:'Bundler configuration or read-only capability checks failed'},null,2));
  process.exitCode=1;
}
