import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymasterFixture} from './helpers/paymaster-fixture.mjs';
import {autonomousFixture,ok,hash} from './helpers/autonomous-fixture.mjs';
import {autonomousWallet} from '../sdk/autonomous-wallet.mjs';
test('wallet purchase, ERC1271 withdrawal, public settlement, payout claim and transfer execute through the actual EntryPoint without user ETH',async()=>{
 const p=await paymasterFixture(),f=await autonomousFixture(p),wallet=autonomousWallet(f.configuration);
 ok(await f.call(f.master,'mintFixture',[p.account.address,1000000000n]));
 async function execute(phase){
  const calls=phase.calls.map(c=>({...c,value:BigInt(c.value)}));
  const callData=p.account.api.encodeFunctionData('executeBatch',[calls]);
  const signed=await p.signOperation({callData,callGasLimit:2000000n,maximumNetworkWei:10n**16n});
  const r=await p.submit(signed.operation);ok(r);
  assert.equal(p.logs(r,p.entry).filter(l=>l?.name==='UserOperationEvent')[0].args.success,true);
  assert.equal(await p.balance(p.account.address),0n);return r;
 }
 await execute(wallet.purchase({requestId:hash('aa-autonomous'),version:'0',grossMasterUnits:'1000000000',minimumAtoms:'1'}));
 assert.equal((await f.read(f.currency,'balanceOf',[p.account.address]))[0],990n*10n**18n);
 const origin=(await f.read(f.controller,'origin'))[0],epoch=(await f.read(f.controller,'currentEpochId'))[0],close=origin+epoch*60n;
 const consent=wallet.withdrawal({requestId:hash('aa-withdrawal'),epochId:String(epoch),owner:p.account.address,recipient:p.account.address,
  atoms:String(100n*10n**18n),minimumPayout:'99000000',nonce:'1',deadline:String(close+120n)},{origin:String(origin),period:'60',now:String(f.time())});
 assert.equal(consent.digest,(await f.read(f.controller,'withdrawalHash',[consent.message]))[0]);
 await execute(wallet.admission(consent,p.owner.signingKey.sign(consent.digest).serialized));
 f.setTime(close);await execute(wallet.settlement());
 assert.equal((await f.read(f.claims,'claimable',[p.account.address]))[0],99000000n);
 await execute(wallet.claim(p.account.address));
 assert.equal((await f.read(f.master,'balanceOf',[p.account.address]))[0],99000000n);
 await execute(wallet.transfer({recipient:p.operator.address,atoms:'1000000000000000000'}));
 assert.equal((await f.read(f.currency,'balanceOf',[p.operator.address]))[0],10n**18n);
 // Company gas infrastructure may withhold its service. The protocol still accepts
 // the smart-account owner's signed request through an unrelated native-gas relay.
 const next=(await f.read(f.controller,'currentEpochId'))[0];
 const alternate=wallet.withdrawal({...consent.message,requestId:hash('alternate-relay'),epochId:String(next),nonce:'2',deadline:String(origin+next*60n+120n)},
  {origin:String(origin),period:'60',now:String(f.time())});
 ok(await p.govern(p.paymaster,'configure',[p.operator.address,false,1]));
 const action=wallet.admission(alternate,p.owner.signingKey.sign(alternate.digest).serialized).calls[0];
 ok(await f.transact(action.data,action.target,p.outsiderKey));
 assert.equal((await f.read(f.currency,'locked',[p.account.address]))[0],100n*10n**18n);
});
test('wallet builder rejects number money, mainnet, substituted consent, wrong epochs and incomplete expiry',()=>{
 const a=n=>'0x'+n.toString(16).padStart(40,'0'),configuration={chainId:'84532',controller:a(1),currency:a(2),vault:a(3),master:a(4),claims:a(5)};
 const wallet=autonomousWallet(configuration);
 assert.throws(()=>autonomousWallet({...configuration,chainId:'8453'}));
 assert.throws(()=>wallet.purchase({requestId:hash('x'),version:'0',grossMasterUnits:100,minimumAtoms:'1'}));
 const r={requestId:hash('x'),epochId:'1',owner:a(6),recipient:a(7),atoms:'1',minimumPayout:'1',nonce:'1',deadline:'180'};
 const consent=wallet.withdrawal(r,{origin:'0',period:'60',now:'1'});
 assert.throws(()=>wallet.admission({...consent,message:{...consent.message,recipient:a(8)}},'0x12'));
 assert.throws(()=>wallet.withdrawal({...r,epochId:'2'},{origin:'0',period:'60',now:'1'}));
 assert.throws(()=>wallet.withdrawal({...r,deadline:'179'},{origin:'0',period:'60',now:'1'}));
});
