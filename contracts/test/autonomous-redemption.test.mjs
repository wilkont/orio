import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Interface,Wallet,TypedDataEncoder,keccak256,toUtf8Bytes} from 'ethers';
import {bytesToHex} from '@ethereumjs/util';
import {compileAutonomousContracts} from '../scripts/compile-autonomous.mjs';
import {createFixture} from './helpers/vm.mjs';
import {initialMonetaryState,planPurchaseEpoch,planRedemptionEpoch} from '../../services/control-foundation/src/monetary-engine.ts';
const artifacts=compileAutonomousContracts(true),atom=10n**18n,usd=10n**36n;
const hash=s=>keccak256(toUtf8Bytes(s));
const ok=r=>assert.equal(r.execResult.exceptionError,undefined,bytesToHex(r.execResult.returnValue));
const rejects=r=>assert.notEqual(r.execResult.exceptionError,undefined);
async function fixture(){
 const f=await createFixture(artifacts,84532,false),owner=new Wallet(bytesToHex(f.key)),second=new Wallet(bytesToHex(f.outsiderKey));
 const master=await f.deploy('test/AutonomousFixtures.sol','AutonomousTestAsset',[]);
 const a=await f.deploy('test/AutonomousFixtures.sol','AutonomousTestFeed',[]),b=await f.deploy('test/AutonomousFixtures.sol','AutonomousTestFeed',[]);
 const controller=await f.deploy('src/ORIOAutonomousController.sol','ORIOAutonomousController',[master.address,a.address,b.address,owner.address,60]);
 const child=async(name,getter)=>({address:(await f.read(controller,getter))[0],api:new Interface(artifacts['src/'+name+'.sol'][name].abi)});
 const currency=await child('ORIOCurrency','currency'),vault=await child('ORIOReserveVault','vault'),payouts=await child('ORIOWithdrawalClaims','payouts');
 for(const [account,key] of [[owner.address,f.key],[second.address,f.outsiderKey]]){
  ok(await f.call(master,'mintFixture',[account,10n**12n]));ok(await f.call(master,'approve',[vault.address,10n**12n],key));
 }
 const phases=['GENESIS','ACTIVE','ZERO_SUPPLY_PENDING','ZERO_SUPPLY_RECONCILED'];
 const state=async()=>{
  let n=(await f.read(controller,'roundingUsd54'))[0],d=atom,x=n,y=d;while(y)[x,y]=[y,x%y];n/=x;d/=x;
  return {...initialMonetaryState('erc20:84532:'+master.address.toLowerCase(),'autonomous:fixed-master',6),
   supplyAtoms:String((await f.read(currency,'totalSupply'))[0]),reserveMasterUnits:String((await f.read(vault,'reserveUnits'))[0]),
   priceUsd36:{numerator:String((await f.read(controller,'referencePriceUsd36'))[0]),denominator:'1'},roundingUsd36:{numerator:String(n),denominator:String(d)},
   phase:phases[Number((await f.read(controller,'phase'))[0])],cycle:String((await f.read(controller,'cycle'))[0])};
 };
 const now=()=>new Date(Number(f.time())*1000).toISOString();
 const value=s=>({masterAssetId:s.masterAssetId,electionId:s.electionId,usd36PerToken:String(usd),evidenceDigest:'a'.repeat(64),observedAt:now(),expiresAt:new Date(Number(f.time()+120n)*1000).toISOString(),issuanceAllowed:true});
 let sequence=0;
 async function buy(gross=1000000000n,key=f.key){
  const before=await state(),plan=planPurchaseEpoch(before,value(before),[{id:'purchase',masterUnits:String(gross)}],now());
  ok(await f.call(controller,'purchase',[hash('purchase-'+sequence++),(await f.read(controller,'stateVersion'))[0],gross,1],key));
  assert.deepEqual(await state(),plan.next);return plan;
 }
 async function request(atoms,options={}){
  const wallet=options.wallet??owner,id=(await f.read(controller,'currentEpochId'))[0];
  const close=(await f.read(controller,'origin'))[0]+id*60n;
  const r={requestId:hash('request-'+sequence++),epochId:id,owner:wallet.address,recipient:options.recipient??wallet.address,
   atoms,minimumPayout:options.minimumPayout??1n,nonce:BigInt(sequence),deadline:options.deadline??close+120n};
  const signature=wallet.signingKey.sign((await f.read(controller,'withdrawalHash',[r]))[0]).serialized;
  if(options.enqueue!==false)ok(await f.call(controller,'enqueue',[r,signature],options.relayerKey??f.outsiderKey));
  return {r,signature};
 }
 async function close(){const e=await f.read(controller,'activeEpoch');f.setTime(e.closesAt);}
 async function fresh(price=100000000n){for(const feed of [a,b])ok(await f.call(feed,'set',[price,f.time()]));}
 return {...f,owner,second,master,a,b,controller,currency,vault,payouts,state,value,now,buy,request,close,fresh};
}

test('maximum canonical epoch settles within the transaction budget and excludes a 65th admission',async t=>{
 const f=await fixture();await f.buy();
 for(let i=0;i<64;i++){
  const wallet=new Wallet('0x'+BigInt(i+1000).toString(16).padStart(64,'0'));
  ok(await f.call(f.currency,'transfer',[wallet.address,atom]));await f.request(atom,{wallet});
 }
 const extra=await f.request(atom,{enqueue:false});rejects(await f.call(f.controller,'enqueue',[extra.r,extra.signature]));
 await f.close();const result=await f.call(f.controller,'settleEpoch',[],f.outsiderKey);ok(result);
 t.diagnostic(`64 distinct-owner settlement charged gas: ${result.totalGasSpent}`);assert.ok(result.totalGasSpent<25000000n);assert.equal((await f.read(f.currency,'totalSupply'))[0],926n*atom);
 assert.equal((await f.read(f.payouts,'totalOwed'))[0],63360000n);
 assert.equal((await f.read(f.controller,'queueLength'))[0],0n);
});

test('one atomic residual receives the entire ordinary holder allocation without an escrow or company override',async()=>{
 const f=await fixture();await f.buy();const before=await f.state();const atoms=BigInt(before.supplyAtoms)-1n;
 await f.request(atoms);await f.close();
 const plan=planRedemptionEpoch(before,f.value(before),[{id:'residual',tokenAtoms:String(atoms)}],f.now());
 ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));assert.deepEqual(await f.state(),plan.next);
 assert.equal((await f.read(f.currency,'totalSupply'))[0],1n);
 assert.ok(BigInt(plan.holderMasterUnits)>0n);
});

test('customer-signed admission, public settlement and public payout work without a company operator or valuation signature',async()=>{
 const f=await fixture();await f.buy();const before=await f.state();const {r}=await f.request(100n*atom);
 const plan=planRedemptionEpoch(before,f.value(before),[{id:'0001',tokenAtoms:r.atoms.toString()}],f.now());
 rejects(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 await f.close();ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 assert.deepEqual(await f.state(),plan.next);assert.equal((await f.read(f.payouts,'claimable',[f.owner.address]))[0],99000000n);
 const balance=(await f.read(f.master,'balanceOf',[f.owner.address]))[0];
 ok(await f.call(f.payouts,'claimFor',[f.owner.address],f.outsiderKey));
 assert.equal((await f.read(f.master,'balanceOf',[f.owner.address]))[0],balance+99000000n);
 rejects(await f.call(f.payouts,'claimFor',[f.owner.address],f.outsiderKey));
});

test('deployer and outsiders cannot pause, select a subset, change an oracle or sweep customer backing',async()=>{
 const f=await fixture();await f.buy();await f.buy(100000000n,f.outsiderKey);
 const before=await f.state(),one=await f.request(10n*atom),two=await f.request(5n*atom,{wallet:f.second});
 const old=new Interface(['function configure(address,address,bool,uint64)','function setOracle(address)','function pause()']);
 for(const [name,args] of [['configure',[f.owner.address,f.owner.address,false,0]],['setOracle',[f.a.address]],['pause',[]]])
  rejects(await f.transact(old.encodeFunctionData(name,args),f.controller.address));
 rejects(await f.call(f.vault,'withdrawCompany',[f.master.address,f.second.address,1]));
 rejects(await f.call(f.payouts,'credit',[f.second.address,1]));
 rejects(await f.call(f.controller,'purchase',[hash('during-admission'),(await f.read(f.controller,'stateVersion'))[0],1000000,1]));
 await f.close();const plan=planRedemptionEpoch(before,f.value(before),[one,two].map((x,i)=>({id:String(i+1).padStart(4,'0'),tokenAtoms:String(x.r.atoms)})),f.now());
 ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));assert.deepEqual(await f.state(),plan.next);
 assert.ok((await f.read(f.payouts,'claimable',[f.owner.address]))[0]>0n);assert.ok((await f.read(f.payouts,'claimable',[f.second.address]))[0]>0n);
 const reserve=(await f.read(f.vault,'reserveUnits'))[0],company=(await f.read(f.vault,'companyFees',[f.master.address]))[0];
 rejects(await f.call(f.controller,'deliverCompanyFees',[company+1n],f.outsiderKey));
 ok(await f.call(f.controller,'deliverCompanyFees',[company],f.outsiderKey));assert.equal((await f.read(f.vault,'reserveUnits'))[0],reserve);
});

test('one restricted payout recipient cannot veto the epoch or another recipient and keeps its funded claim',async()=>{
 const f=await fixture();await f.buy();ok(await f.call(f.currency,'transfer',[f.second.address,100n*atom]));
 await f.request(10n*atom);await f.request(10n*atom,{wallet:f.second});
 ok(await f.call(f.master,'setBlocked',[f.owner.address,true]));await f.close();ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 const owed=(await f.read(f.payouts,'claimable',[f.owner.address]))[0];assert.ok(owed>0n);
 rejects(await f.call(f.payouts,'claimFor',[f.owner.address],f.outsiderKey));assert.equal((await f.read(f.payouts,'claimable',[f.owner.address]))[0],owed);
 ok(await f.call(f.payouts,'claimFor',[f.second.address]));assert.equal((await f.read(f.payouts,'totalOwed'))[0],owed);
 ok(await f.call(f.master,'setBlocked',[f.owner.address,false]));ok(await f.call(f.payouts,'claimFor',[f.owner.address],f.outsiderKey));
});

test('withheld/stale prices cannot force an unsafe payout or trap expired customer token locks',async()=>{
 const f=await fixture();await f.buy();const {r}=await f.request(10n*atom);await f.close();
 ok(await f.call(f.a,'set',[100000000,1]));rejects(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 assert.equal((await f.read(f.currency,'locked',[f.owner.address]))[0],10n*atom);
 f.setTime(r.deadline+1n);ok(await f.call(f.controller,'releaseExpired',[r.requestId],f.outsiderKey));
 assert.equal((await f.read(f.currency,'locked',[f.owner.address]))[0],0n);
 ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));assert.equal((await f.read(f.controller,'activeEpoch'))[0],0n);
});

test('minimum payouts, expiry, cancellation, signature substitution and replay follow public rules',async()=>{
 const f=await fixture();await f.buy();const tooHigh=await f.request(10n*atom,{minimumPayout:9900000n}),valid=await f.request(10n*atom);
 const pending=await f.request(atom,{enqueue:false});
 rejects(await f.call(f.controller,'enqueue',[{...pending.r,recipient:f.second.address},pending.signature]));
 ok(await f.call(f.controller,'enqueue',[pending.r,pending.signature]));ok(await f.call(f.controller,'cancel',[pending.r.requestId]));
 rejects(await f.call(f.controller,'enqueue',[pending.r,pending.signature]));
 const locked=(await f.read(f.currency,'locked',[f.owner.address]))[0];assert.equal(locked,20n*atom);
 rejects(await f.call(f.currency,'transfer',[f.second.address,980n*atom]));
 await f.close();await f.fresh(100500000n);rejects(await f.call(f.controller,'cancel',[valid.r.requestId]));ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 assert.equal((await f.read(f.currency,'totalSupply'))[0],980n*atom);assert.equal((await f.read(f.currency,'locked',[f.owner.address]))[0],0n);
 assert.equal((await f.read(f.payouts,'claimable',[f.owner.address]))[0],9850745n);
 rejects(await f.call(f.controller,'releaseExpired',[tooHigh.r.requestId]));
});

test('invalid admissions cannot freeze purchases and sole cancellation immediately restores purchase progress',async()=>{
 const f=await fixture();await f.buy();
 for(let i=0;i<3;i++){
  const tiny=await f.request(1n,{enqueue:false});rejects(await f.call(f.controller,'enqueue',[tiny.r,tiny.signature]));
  const impossible=await f.request(atom,{minimumPayout:10000000n,enqueue:false});rejects(await f.call(f.controller,'enqueue',[impossible.r,impossible.signature]));
  const nonuniform=await f.request(atom,{deadline:f.time()+61n,enqueue:false});rejects(await f.call(f.controller,'enqueue',[nonuniform.r,nonuniform.signature]));
  assert.equal((await f.read(f.controller,'queueLength'))[0],0n);await f.buy(1000000n);
  const valid=await f.request(atom);ok(await f.call(f.controller,'cancel',[valid.r.requestId]));
  assert.equal((await f.read(f.controller,'activeEpoch'))[0],0n);await f.buy(1000000n);
 }
});

test('full redemption assigns the full fee to company and permissionless reconciliation retains price and funded prior claims',async()=>{
 const f=await fixture();await f.buy();await f.request(100n*atom);await f.close();ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 const price=(await f.read(f.controller,'referencePriceUsd36'))[0];assert.ok(price>usd);
 const supply=(await f.read(f.currency,'totalSupply'))[0],before=await f.state();
 await f.request(supply);await f.close();await f.fresh();
 const plan=planRedemptionEpoch(before,f.value(before),[{id:'0001',tokenAtoms:String(supply)}],f.now());
 ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));assert.deepEqual(await f.state(),plan.next);
 assert.equal((await f.read(f.controller,'phase'))[0],2n);
 rejects(await f.call(f.controller,'purchase',[hash('premature'),(await f.read(f.controller,'stateVersion'))[0],1000000,1]));
 ok(await f.call(f.controller,'reconcileZeroSupply',[],f.outsiderKey));
 assert.equal((await f.read(f.controller,'referencePriceUsd36'))[0],price);
 assert.ok((await f.read(f.payouts,'totalOwed'))[0]>0n);await f.buy(100000000n,f.outsiderKey);
});

test('oracle disagreement, stale/future/zero prices and depeg issuance fail closed without a human override',async()=>{
 const f=await fixture();await f.buy();await f.request(10n*atom);await f.close();
 for(const [answer,time] of [[103000000n,f.time()],[100000000n,f.time()+1n],[0n,f.time()],[-1n,f.time()]]){
  ok(await f.call(f.a,'set',[answer,time]));rejects(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 }
 await f.fresh();ok(await f.call(f.controller,'settleEpoch',[],f.outsiderKey));
 await f.fresh(99000000n);rejects(await f.call(f.controller,'purchase',[hash('depeg'),(await f.read(f.controller,'stateVersion'))[0],1000000,1]));
});

test('typed customer consent binds chain, deployment, epoch, recipient and limits',async()=>{
 const f=await fixture();await f.buy();const {r}=await f.request(atom,{enqueue:false});
 const domain={name:'ORIO Autonomous Withdrawal',version:'1',chainId:84532,verifyingContract:f.controller.address};
 const types={Withdrawal:[['requestId','bytes32'],['epochId','uint256'],['owner','address'],['recipient','address'],['atoms','uint256'],['minimumPayout','uint256'],['nonce','uint256'],['deadline','uint48']].map(([name,type])=>({name,type}))};
 assert.equal((await f.read(f.controller,'withdrawalHash',[r]))[0],TypedDataEncoder.hash(domain,types,r));
 for(const changed of [{...domain,chainId:8453},{...domain,verifyingContract:f.master.address}]){
  const signature=await f.owner.signTypedData(changed,types,r);rejects(await f.call(f.controller,'enqueue',[r,signature]));
 }
});
