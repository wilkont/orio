import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpsBundlerReader,HttpsChainReader } from '../src/chain-rpc.ts';
import type { BundlerReader } from '../src/chain-rpc.ts';
import { configuredBundler,qualifyBundler } from '../src/bundler-qualification.ts';
const entry='0x4337084d9e255ff0702461cf8895ce9e3b5ff108',other='0x'+'a'.repeat(40),now='2026-11-14T12:00:00.000Z';
const expected={chainId:'84532',entryPointAddress:entry,entryPointVersion:'0.8' as const};
const reader=(entries:unknown=[entry],chain:unknown='0x14a34'):BundlerReader=>({sourceId:'test-bundler',request:async method=>method==='eth_chainId'?chain:entries});
test('matches the pinned chain and EntryPoint while explicitly withholding production/admission authorization',async()=>{
  const proof=await qualifyBundler(reader([other,entry]),expected,now);
  assert.equal(proof.financialExecutionEnabled,false);assert.equal(proof.productionQualified,false);
  assert.equal(proof.customContractAdmissionVerified,false);assert.equal(proof.entryPointAddress,entry);
});
test('wrong chain, missing/duplicate/malformed EntryPoints and unsupported version reject',async()=>{
  await assert.rejects(qualifyBundler(reader([entry],'0x2105'),expected,now),/chain identity/);
  for(const entries of [[],[other],[entry,entry],[entry,'invalid'],[entry,'0x'+'0'.repeat(40)],{entries:[entry]}])
    await assert.rejects(qualifyBundler(reader(entries),expected,now));
  await assert.rejects(qualifyBundler(reader(),{...expected,entryPointVersion:'0.7' as '0.8'},now),/expectation/);
});
test('a caller mutation during network waits cannot replace the pinned EntryPoint or chain',async()=>{
  const input={...expected},client:BundlerReader={sourceId:'delayed',request:async method=>{
    input.entryPointAddress=other;input.chainId='8453';return method==='eth_chainId'?'0x14a34':[entry];}};
  const proof=await qualifyBundler(client,input,now);assert.equal(proof.entryPointAddress,entry);assert.equal(proof.chainId,'84532');
});
test('read-only bundler transport rejects signing, sponsorship, simulation and broadcast before any network call',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;return Response.json({jsonrpc:'2.0',id:1,result:[entry]});};
  const config={sourceId:'configured',endpoint:'https://bundler.example/secret-path'};
  const bundler=new HttpsBundlerReader(config,fetcher),chain=new HttpsChainReader(config,fetcher);
  for(const method of ['eth_sendUserOperation','eth_sendRawTransaction','pm_sponsorUserOperation','eth_estimateUserOperationGas','eth_getTransactionReceipt'])
    await assert.rejects(bundler.request(method as Parameters<BundlerReader['request']>[0],[]));
  await assert.rejects(chain.request('eth_supportedEntryPoints' as Parameters<HttpsChainReader['request']>[0],[]));
  assert.equal(calls,0);
  assert.deepEqual(await bundler.request('eth_supportedEntryPoints',[]),[entry]);assert.equal(calls,1);
});
test('bundler errors and malformed secret headers do not disclose credentials',async()=>{
  const client=new HttpsBundlerReader({sourceId:'configured',endpoint:'https://bundler.example/private-token'},
    async()=>{throw new Error('private-token');});
  await assert.rejects(client.request('eth_chainId',[]),{message:'Chain RPC request failed'});
  assert.throws(()=>configuredBundler({}),/must be configured/);
  assert.throws(()=>configuredBundler({ORIO_BUNDLER_URL:'https://bundler.example',ORIO_BUNDLER_HEADERS:'private-token'}),
    error=>error instanceof Error&&!error.message.includes('private-token'));
});
