import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AbiCoder,Interface,Wallet,TypedDataEncoder,concat,keccak256,toUtf8Bytes } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { artifacts,paymasterFixture } from './helpers/paymaster-fixture.mjs';
import { prepareRecovery,prepareAccountAuthorization,prepareRecoveryCancellation } from '../sdk/recovery.mjs';
import { createFixture } from './helpers/vm.mjs';
const hash=value=>keccak256(toUtf8Bytes(value));
const ok=result=>assert.equal(result.execResult.exceptionError,undefined,bytesToHex(result.execResult.returnValue));
// Published deterministic fixture keys; never used with public RPCs or real assets.
async function fixture(){
  const f=await paymasterFixture(),third=new Wallet('0x'+'33'.repeat(32)),fourth=new Wallet('0x'+'44'.repeat(32)),replacement=new Wallet('0x'+'55'.repeat(32));
  const guardians=[f.operator,third,fourth].sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
  const factory=await f.deploy('src/ORIORecoverableGasAccountFactory.sol','ORIORecoverableGasAccountFactory',[f.entry.address,f.paymaster.address]);
  const settings=[f.owner.address,guardians.map(g=>g.address),2,172800,hash('recovery-salt')];
  const address=(await f.read(factory,'getAddress',settings))[0];ok(await f.call(factory,'createAccount',settings));
  const account={address,api:new Interface(artifacts['src/ORIORecoverableGasAccount.sol'].ORIORecoverableGasAccount.abi)};
  async function proposal(next=replacement){
    const deadline=f.time()+60n,digest=(await f.read(account,'recoveryHash',[next.address,deadline]))[0];
    const approvals=guardians.slice(0,2).map(g=>({guardian:g.address,signature:g.signingKey.sign(digest).serialized}));
    return {deadline,digest,approvals,next};
  }
  async function signature(wallet,digest){return wallet.signingKey.sign((await f.read(account,'authorizationHash',[digest]))[0]).serialized;}
  return {...f,account,factory,settings,guardians,replacement,proposal,signature};
}
async function signedOperation(f,wallet,callData){
  const {operation,permit}=await f.signOperation({callData});operation.sender=f.account.address;
  operation.nonce=(await f.read(f.entry,'getNonce',[f.account.address,0]))[0];
  const permitHash=(await f.read(f.paymaster,'permitHash',[operation,permit]))[0];
  operation.paymasterAndData=concat([operation.paymasterAndData.slice(0,106),AbiCoder.defaultAbiCoder().encode([
    'tuple(bytes32 reservationId,bytes32 quoteDigest,bytes32 paymentAsset,uint256 maximumPaymentUnits,uint256 maximumNetworkWei,uint48 validAfter,uint48 validUntil,uint64 revision)',
    'bytes','bytes'],[permit,await f.signature(wallet,permitHash),f.operator.signingKey.sign(permitHash).serialized])]);
  const userOpHash=(await f.read(f.entry,'getUserOpHash',[operation]))[0];operation.signature=await f.signature(wallet,userOpHash);
  return operation;
}
test('deterministic recovery factory binds all guardian settings and never resets a recovered account',async()=>{
  const f=await fixture();
  assert.notEqual((await f.read(f.factory,'getAddress',[...f.settings.slice(0,3),259200,f.settings[4]]))[0],f.account.address);
  const p=await f.proposal();ok(await f.call(f.account,'proposeRecovery',[p.next.address,p.deadline,p.approvals]));
  f.advance(172800);ok(await f.call(f.account,'finalizeRecovery',[],f.outsiderKey));
  ok(await f.call(f.factory,'createAccount',f.settings));assert.equal((await f.read(f.account,'owner'))[0],p.next.address);
});
test('one guardian, duplicate signers, wrong deployment signatures and expired proposals cannot authorize recovery',async()=>{
  const f=await fixture(),p=await f.proposal();
  for(const approvals of [p.approvals.slice(0,1),[p.approvals[0],p.approvals[0]],p.approvals.map(a=>({...a,signature:f.owner.signingKey.sign(p.digest).serialized}))])
    assert.ok((await f.call(f.account,'proposeRecovery',[p.next.address,p.deadline,approvals])).execResult.exceptionError);
  f.advance(61);assert.ok((await f.call(f.account,'proposeRecovery',[p.next.address,p.deadline,p.approvals])).execResult.exceptionError);
  assert.equal((await f.read(f.account,'recoveryNonce'))[0],0n);
});
test('delayed recovery freezes signatures, permits owner-signed cancellation, and rejects replay',async()=>{
  const f=await fixture(),digest=hash('authorized-action'),signature=await f.signature(f.owner,digest),p=await f.proposal();
  assert.equal((await f.read(f.account,'isValidSignature',[digest,signature]))[0],'0x1626ba7e');
  ok(await f.call(f.account,'proposeRecovery',[p.next.address,p.deadline,p.approvals]));
  assert.equal((await f.read(f.account,'isValidSignature',[digest,signature]))[0],'0xffffffff');
  assert.ok((await f.call(f.account,'finalizeRecovery')).execResult.exceptionError);
  const expiry=f.time()+60n,cancelHash=(await f.read(f.account,'cancellationHash',[expiry]))[0];
  assert.ok((await f.call(f.account,'cancelRecovery',[expiry,f.operator.signingKey.sign(cancelHash).serialized])).execResult.exceptionError);
  ok(await f.call(f.account,'cancelRecovery',[expiry,f.owner.signingKey.sign(cancelHash).serialized]));
  assert.equal((await f.read(f.account,'isValidSignature',[digest,signature]))[0],'0x1626ba7e');
  assert.ok((await f.call(f.account,'proposeRecovery',[p.next.address,p.deadline,p.approvals])).execResult.exceptionError);
});
test('replacement owner executes through the actual EntryPoint/paymaster with zero account ETH; old owner loses access',async()=>{
  const f=await fixture(),p=await f.proposal();ok(await f.call(f.account,'proposeRecovery',[p.next.address,p.deadline,p.approvals]));
  f.advance(172800);ok(await f.call(f.account,'finalizeRecovery'));
  const digest=hash('after-recovery');
  assert.equal((await f.read(f.account,'isValidSignature',[digest,await f.signature(f.owner,digest)]))[0],'0xffffffff');
  assert.equal((await f.read(f.account,'isValidSignature',[digest,await f.signature(f.replacement,digest)]))[0],'0x1626ba7e');
  const operation=await signedOperation(f,f.replacement);
  const result=await f.submit(operation);ok(result);
  assert.equal(f.logs(result,f.entry).find(e=>e?.name==='UserOperationEvent').args.success,true);
  assert.equal(await f.balance(f.account.address),0n);
});
test('recovery typed data binds account, chain, owner revision and monotonic proposal nonce',async()=>{
  const f=await fixture(),p=await f.proposal();
  const domain={name:'ORIO Recoverable Account',version:'1',chainId:84532,verifyingContract:f.account.address};
  const types={Recover:[{name:'nextOwner',type:'address'},{name:'ownerRevision',type:'uint256'},{name:'recoveryNonce',type:'uint256'},{name:'validUntil',type:'uint48'}]};
  const value={nextOwner:p.next.address,ownerRevision:0,recoveryNonce:0,validUntil:p.deadline};
  assert.equal(p.digest,TypedDataEncoder.hash(domain,types,value));
  assert.notEqual(p.digest,TypedDataEncoder.hash({...domain,chainId:31337},types,value));
  const input={chainId:'84532',account:f.account.address,nextOwner:p.next.address,ownerRevision:'0',recoveryNonce:'0',validUntil:p.deadline.toString()};
  assert.equal(prepareRecovery(input).digest,p.digest);
  assert.throws(()=>prepareRecovery({...input,ownerRevision:0}),/integer/);
  assert.throws(()=>prepareRecovery({...input,chainId:'8453'}),/Qualification/);
  const action=hash('action');assert.equal(prepareAccountAuthorization({...input,digest:action}).digest,
    (await f.read(f.account,'authorizationHash',[action]))[0]);
  ok(await f.call(f.account,'proposeRecovery',[p.next.address,p.deadline,p.approvals]));
  assert.equal(prepareRecoveryCancellation({...input,recoveryAuthorization:p.digest}).digest,
    (await f.read(f.account,'cancellationHash',[p.deadline]))[0]);
});
test('restoring a former owner does not revive signatures from its earlier revision',async()=>{
  const f=await fixture(),action=hash('long-lived-authorization'),old=await f.signature(f.owner,action),first=await f.proposal();
  ok(await f.call(f.account,'proposeRecovery',[first.next.address,first.deadline,first.approvals]));
  f.advance(172800);ok(await f.call(f.account,'finalizeRecovery'));
  const second=await f.proposal(f.owner);ok(await f.call(f.account,'proposeRecovery',[second.next.address,second.deadline,second.approvals]));
  f.advance(172800);ok(await f.call(f.account,'finalizeRecovery'));
  assert.equal((await f.read(f.account,'ownerRevision'))[0],2n);
  assert.equal((await f.read(f.account,'isValidSignature',[action,old]))[0],'0xffffffff');
  assert.equal((await f.read(f.account,'isValidSignature',[action,await f.signature(f.owner,action)]))[0],'0x1626ba7e');
  assert.ok((await f.call(f.account,'execute',[f.target.address,0,f.target.api.encodeFunctionData('record',[42])])).execResult.exceptionError);
});
test('factory rejects unilateral recovery, duplicate guardians and unsafe waiting periods',async()=>{
  const f=await fixture();
  for(const settings of [[f.owner.address,[f.guardians[0].address],1,172800,hash('one')],
    [f.owner.address,[f.guardians[0].address,f.guardians[0].address],2,172800,hash('dup')],
    [f.owner.address,f.guardians.map(g=>g.address),2,1,hash('short')]])
    assert.ok((await f.call(f.factory,'createAccount',settings)).execResult.exceptionError);
});
test('recovery proposed during a validated batch blocks its remaining calls and rolls the batch back',async()=>{
  const f=await fixture(),p=await f.proposal();
  const callData=f.account.api.encodeFunctionData('executeBatch',[[
    {target:f.account.address,value:0,data:f.account.api.encodeFunctionData('proposeRecovery',[p.next.address,p.deadline,p.approvals])},
    {target:f.target.address,value:0,data:f.target.api.encodeFunctionData('record',[42])}]]);
  const result=await f.submit(await signedOperation(f,f.owner,callData));ok(result);
  assert.equal(f.logs(result,f.entry).find(e=>e?.name==='UserOperationEvent').args.success,false);
  assert.equal((await f.read(f.account,'recoveryNonce'))[0],0n);
});
test('recovery account and factory reject Base mainnet deployment',async()=>{
  const f=await createFixture(artifacts,8453),guardian=new Wallet('0x'+'33'.repeat(32));
  await assert.rejects(f.deploy('src/ORIORecoverableGasAccount.sol','ORIORecoverableGasAccount',
    [f.authority.address,f.authority.address,new Wallet(bytesToHex(f.outsiderKey)).address,[f.sender,guardian.address],2,172800]));
  await assert.rejects(f.deploy('src/ORIORecoverableGasAccountFactory.sol','ORIORecoverableGasAccountFactory',[f.authority.address,f.authority.address]));
});
