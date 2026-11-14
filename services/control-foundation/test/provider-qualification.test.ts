import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuredChainProviders,qualifyChainProviders,probeChainSource } from '../src/provider-qualification.ts';
import type { ChainReader } from '../src/chain-evidence.ts';
const now='2026-11-13T12:00:00.000Z',timestamp='0x'+Math.floor(Date.parse(now)/1000-100).toString(16),hash='0x'+'a'.repeat(64);
const policy={chainId:'84532',maximumFinalizedAgeSeconds:'3600',maximumHeightSkew:'128'};
function reader(sourceId:string,changes:Record<string,unknown>={}):ChainReader{
  return {sourceId,request:async(method,params)=>method==='eth_chainId'?'0x14a34':
    {number:params[0]==='finalized'?'0x10':params[0],hash,timestamp,...changes}};
}
test('two configured sources agree on a canonical finalized common block without enabling finance',async()=>{
  const result=await qualifyChainProviders({reader:reader('one'),operatorId:'operator_a'},{reader:reader('two'),operatorId:'operator_b'},policy,now);
  assert.equal(result.status,'READ_ONLY_PROBE_PASSED');assert.equal(result.financialExecutionEnabled,false);assert.equal(result.commonFinalized.number,'16');
});
test('wrong chains, stale finality, divergent histories and duplicate operator assertions reject',async()=>{
  await assert.rejects(probeChainSource({sourceId:'wrong',request:async()=> '0x1'},policy,now),/chain identity/);
  await assert.rejects(probeChainSource(reader('old',{timestamp:'0x1'}),policy,now),/stale/);
  await assert.rejects(qualifyChainProviders({reader:reader('one'),operatorId:'operator_a'},
    {reader:reader('two',{hash:'0x'+'b'.repeat(64)}),operatorId:'operator_b'},policy,now),/histories disagree/);
  await assert.rejects(qualifyChainProviders({reader:reader('one'),operatorId:'operator_a'},{reader:reader('two'),operatorId:'operator_a'},policy,now),/Distinct/);
});
test('provider configuration rejects missing inputs and shared origins without leaking URL credentials',()=>{
  assert.throws(()=>configuredChainProviders({}),/must be configured/);
  assert.throws(()=>configuredChainProviders({ORIO_RPC_PRIMARY_URL:'https://one.example/secret',ORIO_RPC_SECONDARY_URL:'https://one.example/other',
    ORIO_RPC_PRIMARY_OPERATOR_ID:'one',ORIO_RPC_SECONDARY_OPERATOR_ID:'two'}),/distinct origins/);
  assert.throws(()=>configuredChainProviders({ORIO_RPC_PRIMARY_URL:'https://user:secret@one.example',ORIO_RPC_SECONDARY_URL:'https://two.example',
    ORIO_RPC_PRIMARY_OPERATOR_ID:'one',ORIO_RPC_SECONDARY_OPERATOR_ID:'two'}),error=>error instanceof Error&&!error.message.includes('secret'));
});
