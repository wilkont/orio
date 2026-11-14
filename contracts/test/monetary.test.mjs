import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AbiCoder, Interface, TypedDataEncoder } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { monetaryFixture, artifacts, hash } from './helpers/monetary-fixture.mjs';
import { createFixture } from './helpers/vm.mjs';
import { gasDigest } from '../../services/control-foundation/src/gas-policy.ts';
import { planPurchaseEpoch, planRedemptionEpoch, reconcileZeroSupply, usdScale } from '../../services/control-foundation/src/monetary-engine.ts';
import { verifyFinalizedMonetaryExecution } from '../../services/control-foundation/src/finalized-monetary.ts';

let operation = 0;
const ok = result => assert.equal(result.execResult.exceptionError, undefined, bytesToHex(result.execResult.returnValue));
async function buy(f, amount = 100000000n, key = f.key) {
  const before = await f.state(), quote = await f.valuation((await f.read(f.vault, 'masterAsset'))[0]);
  const plan = planPurchaseEpoch(before, f.engineValuation(before, quote.value), [{ id: '0001', masterUnits: amount.toString() }], f.now());
  const id = hash('purchase-' + operation++), version = (await f.read(f.controller, 'stateVersion'))[0];
  const args = [id, version, amount, BigInt(plan.allocations[0].mintedAtoms), quote.value, quote.signature];
  const result = await f.call(f.controller, 'purchase', args, key); ok(result);
  assert.deepEqual(await f.state(), plan.next);
  const decoded = f.decodeCheckpoint(result);
  assert.equal(decoded.data[2], BigInt(plan.next.supplyAtoms));
  return { plan, result, args, id };
}
async function redeem(f, requests) {
  const before = await f.state(), epoch = await f.seal(requests), quote = await f.valuation((await f.read(f.vault, 'masterAsset'))[0]);
  const plan = planRedemptionEpoch(before, f.engineValuation(before, quote.value), epoch.requests.map(r => ({
    id: r.sequence.toString().padStart(20,'0'), tokenAtoms: r.atoms.toString() })), f.now());
  const result = await f.call(f.controller, 'redeemBatch', [epoch.requests, quote.value, quote.signature]); ok(result);
  assert.deepEqual(await f.state(), plan.next); return { plan, result, epoch, quote };
}
test('real reserve collection, company segregation and genesis/ordinary mint match the approved engine', async () => {
  const f = await monetaryFixture(); const first = await buy(f, 1000000000n);
  assert.equal(first.plan.companyMasterUnits, '10000000');
  assert.equal((await f.read(f.vault, 'companyFees', [f.master.address]))[0], 10000000n);
  assert.equal((await f.read(f.master, 'balanceOf', [f.vault.address]))[0], 1000000000n);
  await buy(f, 100000000n, f.outsiderKey);
  assert.equal((await f.read(f.master, 'balanceOf', [f.vault.address]))[0],
    (await f.read(f.vault, 'reserveUnits'))[0] + (await f.read(f.vault, 'companyFees', [f.master.address]))[0]);
});
test('valuation and redemption authorization hashes match standard EIP-712 tooling and bind deployment, epoch and recipient',async()=>{
  const f=await monetaryFixture(),quote=await f.valuation();
  const domain={name:'ORIO Monetary Controller',version:'1',chainId:84532,verifyingContract:f.controller.address};
  const fields=[['asset','address'],['usd36PerToken','uint256'],['registryEpoch','uint256'],['registryRevision','uint256'],
    ['controllerRevision','uint64'],['validAfter','uint48'],['validUntil','uint48'],['issuanceAllowed','bool'],['evidenceDigest','bytes32']]
    .map(([name,type])=>({name,type}));
  assert.equal((await f.read(f.controller,'valuationHash',[quote.value]))[0],TypedDataEncoder.hash(domain,{Valuation:fields},quote.value));
  await buy(f);const epoch=await f.seal([{atoms:10n**18n}]);
  const request=epoch.requests[0],snapshot=await f.read(f.controller,'sealedEpoch');
  const redemptionFields=[['epochId','bytes32'],['snapshotVersion','uint256'],['snapshotPrice','uint256'],['requestId','bytes32'],
    ['sequence','uint256'],['owner','address'],['recipient','address'],['atoms','uint256'],['minimumPayout','uint256'],
    ['nonce','uint256'],['deadline','uint48'],['controllerRevision','uint64']].map(([name,type])=>({name,type}));
  const value={...request,epochId:epoch.id,snapshotVersion:snapshot.version,snapshotPrice:snapshot.price,
    controllerRevision:(await f.read(f.controller,'revision'))[0]};
  assert.equal((await f.read(f.controller,'redemptionHash',[request]))[0],TypedDataEncoder.hash(domain,{Redemption:redemptionFields},value));
  assert.notEqual(TypedDataEncoder.hash({...domain,chainId:31337},{Redemption:redemptionFields},value),
    TypedDataEncoder.hash(domain,{Redemption:redemptionFields},value));
});
test('multi-wallet redemption uses one frozen price with actual burns/payouts and conserved residuals', async () => {
  const f = await monetaryFixture(); await buy(f, 1000000000n); await buy(f, 100000000n, f.outsiderKey);
  const a = (await f.read(f.master, 'balanceOf', [f.sender]))[0], b = (await f.read(f.master, 'balanceOf', [f.second.address]))[0];
  const result = await redeem(f, [{ atoms: 100n * 10n**18n }, { owner: f.second.address, atoms: 50n * 10n**18n }]);
  assert.equal((await f.read(f.master, 'balanceOf', [f.sender]))[0]-a, BigInt(result.plan.allocations[0].payoutMasterUnits));
  assert.equal((await f.read(f.master, 'balanceOf', [f.second.address]))[0]-b, BigInt(result.plan.allocations[1].payoutMasterUnits));
});
test('tiny positive supply receives full holder remainder and no extra ORIO is minted for appreciation', async () => {
  const f = await monetaryFixture(); await buy(f); const supply = (await f.read(f.currency, 'totalSupply'))[0];
  const result = await redeem(f, [{ atoms: supply-1n }]);
  assert.equal(result.plan.next.supplyAtoms, '1'); assert.ok(BigInt(result.plan.holderMasterUnits)>0n);
  assert.equal((await f.read(f.currency, 'totalSupply'))[0], 1n);
});
test('full redemption retains the reference, prevents premature reopening and resumes only after reconciled checkpoint', async () => {
  const f = await monetaryFixture(); await buy(f, 1000000000n); await buy(f);
  await redeem(f, [{ atoms: 100n*10n**18n }]); const before = await f.state();
  await redeem(f, [{ atoms: BigInt(before.supplyAtoms) }]); const zero = await f.state();
  assert.equal(zero.phase,'ZERO_SUPPLY_PENDING'); assert.deepEqual(zero.priceUsd36,before.priceUsd36);
  const quote = await f.valuation();
  assert.ok((await f.call(f.controller,'purchase',[hash('premature'),(await f.read(f.controller,'stateVersion'))[0],100000000n,1n,quote.value,quote.signature])).execResult.exceptionError);
  const expected = reconcileZeroSupply(zero,f.engineValuation(zero,quote.value),{expectedStateDigest:gasDigest(zero),checkpointDigest:hash('checkpoint').slice(2),
    reserveMasterUnits:zero.reserveMasterUnits,pendingRedemptionUnits:'0',unsettledCompanyFeeUnits:'0'},f.now());
  ok(await f.govern(f.controller,'reconcileZeroSupply',[hash('reconcile'),(await f.read(f.controller,'stateVersion'))[0],hash('checkpoint'),quote.value,quote.signature]));
  assert.deepEqual(await f.state(),expected); await buy(f);
});
test('no caller can directly mint, sweep reserve cash or withdraw more than recognized company funds', async () => {
  const f = await monetaryFixture(); await buy(f);
  assert.ok((await f.call(f.currency,'mint',[f.sender,1n])).execResult.exceptionError);
  assert.ok((await f.call(f.vault,'withdrawCompany',[f.master.address,f.sender,1n])).execResult.exceptionError);
  const before = await f.state(), company = (await f.read(f.vault,'companyFees',[f.master.address]))[0];
  assert.ok((await f.govern(f.controller,'withdrawCompany',[f.master.address,f.sender,company+1n])).execResult.exceptionError);
  ok(await f.govern(f.controller,'withdrawCompany',[f.master.address,f.sender,company]));
  assert.deepEqual(await f.state(),before); assert.equal((await f.read(f.vault,'companyFees',[f.master.address]))[0],0n);
  ok(await f.call(f.master,'mintFixture',[f.vault.address,123n]));
  assert.deepEqual(await f.state(),before); // Unsolicited donations do not create recognized backing/mints.
});
test('invalid/expired valuations, restricted issuance and stale/replayed purchases cannot consume user funds', async () => {
  const f = await monetaryFixture(); const quote = await f.valuation();
  const before = await f.state(); const base=[hash('invalid'),0n,100000000n,1n];
  assert.ok((await f.call(f.controller,'purchase',[...base,quote.value,'0x'+'00'.repeat(65)])).execResult.exceptionError);
  const blocked = await f.valuation(f.master.address,usdScale,false);
  assert.ok((await f.call(f.controller,'purchase',[...base,blocked.value,blocked.signature])).execResult.exceptionError);
  f.advance(121); assert.ok((await f.call(f.controller,'purchase',[...base,quote.value,quote.signature])).execResult.exceptionError);
  assert.deepEqual(await f.state(),before);
  const bought=await buy(f); const refreshed=await f.valuation();
  assert.ok((await f.call(f.controller,'purchase',[bought.id,1n,100000000n,1n,refreshed.value,refreshed.signature])).execResult.exceptionError);
});
test('sealed membership blocks purchases and substitution; expiry reopens admission without reusing epoch IDs', async () => {
  const f = await monetaryFixture(); await buy(f); const epoch=await f.seal([{atoms:10n**18n}]),quote=await f.valuation();
  assert.ok((await f.call(f.controller,'purchase',[hash('sealed'),1n,100000000n,1n,quote.value,quote.signature])).execResult.exceptionError);
  const altered=epoch.requests.map(r=>({...r,atoms:r.atoms+1n}));
  assert.ok((await f.call(f.controller,'redeemBatch',[altered,quote.value,quote.signature])).execResult.exceptionError);
  f.advance(61); ok(await f.call(f.controller,'expireRedemptionEpoch'));
  assert.ok((await f.call(f.controller,'sealRedemptionEpoch',[epoch.id,1n,hash('other'),f.time()+60n])).execResult.exceptionError);
  await buy(f);
});
test('failed stablecoin payout rolls back every burn, nonce, epoch and custody change and can retry safely', async () => {
  const f=await monetaryFixture(); await buy(f); const epoch=await f.seal([{atoms:10n**18n,nonce:77n}]),quote=await f.valuation(),before=await f.state();
  ok(await f.call(f.master,'setRejectTransfers',[true]));
  assert.ok((await f.call(f.controller,'redeemBatch',[epoch.requests,quote.value,quote.signature])).execResult.exceptionError);
  assert.deepEqual(await f.state(),before); assert.equal((await f.read(f.currency,'locked',[f.sender]))[0],10n**18n);
  ok(await f.call(f.master,'setRejectTransfers',[false])); ok(await f.call(f.controller,'redeemBatch',[epoch.requests,quote.value,quote.signature]));
  assert.equal((await f.read(f.locks,'usedNonces',[f.sender,77n]))[0],true);
});
test('deposit-only pause prevents new issuance while preserving solvent authorized exits', async () => {
  const f=await monetaryFixture(); await buy(f);
  ok(await f.govern(f.registry,'pauseMaster',[(await f.read(f.registry,'epoch'))[0],(await f.read(f.registry,'revision'))[0],hash('deposit-pause')]));
  const quote=await f.valuation();
  assert.ok((await f.call(f.controller,'purchase',[hash('paused-buy'),1n,100000000n,1n,quote.value,quote.signature])).execResult.exceptionError);
  await redeem(f,[{atoms:10n**18n}]);
});
test('migration executes actual replacement with no mint/burn/fee and rejects uncovered loss atomically', async () => {
  const f=await monetaryFixture(); await buy(f); const before=await f.state();
  const replacement=await f.deploy('test/MonetaryFixtures.sol','MockMasterToken',[6]); await f.approveAsset(replacement);
  const adapter=await f.deploy('test/MonetaryFixtures.sol','MockReserveSwap',[]);
  ok(await f.call(replacement,'mintFixture',[adapter.address,1000000000n]));
  ok(await f.govern(f.controller,'setMigrationAdapter',[adapter.address,true,(await f.read(f.controller,'revision'))[0]]));
  ok(await f.govern(f.registry,'beginMigration',[(await f.read(f.registry,'epoch'))[0],(await f.read(f.registry,'revision'))[0],await f.assetId(replacement),hash('migration')]));
  const old=await f.valuation(),next=await f.valuation(replacement.address);
  assert.ok((await f.govern(f.registry,'completeMigration',[(await f.read(f.registry,'epoch'))[0],(await f.read(f.registry,'revision'))[0],await f.assetId(replacement),hash('premature')])).execResult.exceptionError);
  const encode=amount=>AbiCoder.defaultAbiCoder().encode(['uint256'],[amount]);
  assert.ok((await f.govern(f.controller,'migrateMaster',[hash('loss'),adapter.address,encode(98000000n),98000000n,old.value,old.signature,next.value,next.signature])).execResult.exceptionError);
  assert.equal((await f.read(f.vault,'masterAsset'))[0].toLowerCase(),f.master.address.toLowerCase());
  ok(await f.govern(f.controller,'migrateMaster',[hash('replacement'),adapter.address,encode(99000000n),99000000n,old.value,old.signature,next.value,next.signature]));
  assert.equal((await f.read(f.registry,'currentMaster'))[0],await f.assetId(replacement));
  const after=await f.state(); assert.equal(after.supplyAtoms,before.supplyAtoms); assert.deepEqual(after.priceUsd36,before.priceUsd36);
  assert.deepEqual(after.roundingUsd36,before.roundingUsd36); assert.equal(after.reserveMasterUnits,'99000000');
  assert.equal((await f.read(f.vault,'companyFees',[f.master.address]))[0],1000000n);
  assert.equal((await f.read(f.vault,'companyFees',[replacement.address]))[0],0n);
});

test('signed redemption locks prevent transfer sabotage, reject reuse and release after expiry without operator cooperation', async () => {
  const f=await monetaryFixture(); await buy(f);
  const balance=(await f.read(f.currency,'balanceOf',[f.sender]))[0], epoch=await f.seal([{atoms:balance}]);
  assert.ok((await f.call(f.currency,'transfer',[f.second.address,1n])).execResult.exceptionError);
  assert.ok((await f.call(f.locks,'releaseRedemption',[epoch.requests[0].requestId])).execResult.exceptionError);
  assert.ok((await f.call(f.locks,'lockRedemption',[epoch.requests[0]])).execResult.exceptionError);
  f.advance(61); ok(await f.call(f.controller,'expireRedemptionEpoch',[],f.outsiderKey));
  ok(await f.call(f.locks,'releaseRedemption',[epoch.requests[0].requestId],f.outsiderKey));
  assert.equal((await f.read(f.currency,'locked',[f.sender]))[0],0n);
  ok(await f.call(f.currency,'transfer',[f.second.address,balance]));
});

function chainEvidence(f, result, id, kind, version) {
  const tx=hash('executed-'+id), block=hash('canonical-block');
  const logs=result.execResult.logs.map(([address,topics,data],i)=>({address:bytesToHex(address),topics:topics.map(bytesToHex),
    data:bytesToHex(data),logIndex:'0x'+i.toString(16),transactionHash:tx,blockHash:block,blockNumber:'0x1',removed:false}));
  const checkpoint=logs.find(log=>log.topics[0]==='0x20898450f31a91406bb3ae22abdc1bc501e0d5f8fd28bbcbd0f334fd60381bf2');
  const receipt={status:'0x1',transactionHash:tx,blockHash:block,blockNumber:'0x1',logs};
  const reader=(sourceId,value=receipt)=>({sourceId,request:async method=>method==='eth_chainId'?'0x14a34':
    method==='eth_getTransactionReceipt'?value:{number:'0x1',hash:block}});
  const expected={chainId:'84532',controller:f.controller.address,currency:f.currency.address,vault:f.vault.address,master:f.master.address,
    transactionHash:tx,checkpointLogIndex:BigInt(checkpoint.logIndex).toString(),operationId:id,version,kind};
  return {reader,expected,receipt};
}
test('actual controller purchase and redemption receipts verify against two canonical sources; missing cash and source divergence fail closed', async () => {
  const f=await monetaryFixture(), purchase=await buy(f);
  let proof=chainEvidence(f,purchase.result,purchase.id,'PURCHASE','1');
  const verified=await verifyFinalizedMonetaryExecution(proof.reader('first'),proof.reader('second'),proof.expected);
  assert.equal(verified.allocations[0].minted,purchase.plan.allocations[0].mintedAtoms);
  const changed=structuredClone(proof.receipt); changed.logs.find(log=>log.address.toLowerCase()===f.master.address.toLowerCase()).data='0x'+'0'.repeat(64);
  await assert.rejects(verifyFinalizedMonetaryExecution(proof.reader('first'),proof.reader('second',changed),proof.expected));
  const redemption=await redeem(f,[{atoms:10n**18n}]);
  proof=chainEvidence(f,redemption.result,redemption.epoch.id,'REDEMPTION','2');
  const redeemed=await verifyFinalizedMonetaryExecution(proof.reader('first'),proof.reader('second'),proof.expected);
  assert.equal(redeemed.allocations[0].payout,redemption.plan.allocations[0].payoutMasterUnits);
  const missing=structuredClone(proof.receipt); missing.logs=missing.logs.filter(log=>log.address.toLowerCase()!==f.master.address.toLowerCase());
  await assert.rejects(verifyFinalizedMonetaryExecution(proof.reader('first',missing),proof.reader('second',missing),proof.expected),/movement missing/);
  await assert.rejects(verifyFinalizedMonetaryExecution(proof.reader('same'),proof.reader('same'),proof.expected),/Distinct/);
});
test('many executed transitions agree with the separate TypeScript engine, including rounded native dust', async () => {
  const f=await monetaryFixture();
  for(let i=0;i<35;i++) {
    await buy(f,100000000n+BigInt(i)*137n);
    if(i%4===0) await redeem(f,[{atoms:(await f.read(f.currency,'balanceOf',[f.sender]))[0]/7n}]);
  }
});
test('monetary controller refuses Base mainnet deployment',async()=>{
  const f=await createFixture(artifacts,8453),registry=await f.deploy('src/MasterAssetRegistry.sol','MasterAssetRegistry',[f.authority.address]);
  const master=await f.deploy('test/MonetaryFixtures.sol','MockMasterToken',[6]),artifact=artifacts['src/ORIOMonetaryController.sol'].ORIOMonetaryController,api=new Interface(artifact.abi);
  assert.ok((await f.transact('0x'+artifact.evm.bytecode.object+api.encodeDeploy([f.authority.address,registry.address,master.address]).slice(2))).execResult.exceptionError);
});
