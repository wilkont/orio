import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAddressFromString,bytesToHex,hexToBytes} from '@ethereumjs/util';
import {keccak256} from 'ethers';
import {monetaryFixture,hash} from './helpers/monetary-fixture.mjs';
import {verifyEmptyAutonomousMigrationSource} from '../sdk/autonomous-migration.mjs';
test('empty migration observer verifies actual legacy code/custody and rejects active or funded source without moving assets',async()=>{
 const f=await monetaryFixture();let pin;
 const policy={chainId:'84532',controller:f.controller.address,currency:f.currency.address,vault:f.vault.address,master:f.master.address,codeHashes:{}};
 for(const name of ['controller','currency','vault','master'])policy.codeHashes[name]=keccak256(await f.vm.stateManager.getCode(createAddressFromString(policy[name])));
 const source=sourceId=>({sourceId,request:async(method,args)=>{
  if(method==='eth_chainId')return '0x14a34';
  if(method==='eth_getBlockByNumber')return {number:'0x1',hash:hash('migration-anchor'),timestamp:'0x'+f.time().toString(16)};
  if(args[1]?.blockHash!==hash('migration-anchor')||args[1]?.requireCanonical!==true)throw Error('Missing canonical pin');pin=args[1];
  if(method==='eth_getCode')return bytesToHex(await f.vm.stateManager.getCode(createAddressFromString(args[0])));
  const r=await f.vm.evm.runCall({to:createAddressFromString(args[0].to),data:hexToBytes(args[0].data),isStatic:true,skipNonceIncrement:true});
  assert.equal(r.execResult.exceptionError,undefined);return bytesToHex(r.execResult.returnValue);
 }});
 const first=source('one'),second=source('two'),clock=()=>String(f.time());
 await assert.rejects(verifyEmptyAutonomousMigrationSource(first,second,policy,clock),/execution must remain disabled/);
 assert.equal((await f.govern(f.controller,'configure',[f.sender,f.sender,false,1])).execResult.exceptionError,undefined);
 const result=await verifyEmptyAutonomousMigrationSource(first,second,policy,clock);assert.equal(result.financialExecutionEnabled,false);assert.equal(result.state.supply,'0');assert.equal(pin.requireCanonical,true);
 await assert.rejects(verifyEmptyAutonomousMigrationSource(first,first,policy,clock));
 const bad=structuredClone(policy);bad.codeHashes.controller=hash('wrong');await assert.rejects(verifyEmptyAutonomousMigrationSource(first,second,bad,clock),/code mismatch/);
 // Even a direct donation makes this simple empty-state replacement inapplicable.
 assert.equal((await f.call(f.master,'transfer',[f.vault.address,1])).execResult.exceptionError,undefined);
 await assert.rejects(verifyEmptyAutonomousMigrationSource(first,second,policy,clock),/not empty original genesis/);
});
