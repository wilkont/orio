import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Wallet,sha256} from 'ethers';
import {quoteGas} from '../../services/control-foundation/src/gas-policy.ts';
import {signCompanyGasPermit} from '../sdk/protected-gas-signing.mjs';

function fixture(){
 const owner=Wallet.createRandom(),operator=Wallet.createRandom();
 const policy={chainId:'84532',revision:'1',signer:operator.address,entryPoint:'0x'+'2'.repeat(40),paymaster:'0x'+'3'.repeat(40)};
 const word=(a,b)=>'0x'+a.toString(16).padStart(32,'0')+b.toString(16).padStart(32,'0');
 const operation={sender:owner.address,nonce:'0',initCode:'0x',callData:'0x1234',accountGasLimits:word(1n,1n),
  gasFees:word(1n,1n),preVerificationGas:'1',paymasterAndData:policy.paymaster+word(1n,1n).slice(2)};
 const now=new Date().toISOString();
 const quote=quoteGas({transactionId:'protected-test',ownerRef:owner.address,chainId:'84532',action:'TRANSFER',actionDigest:'a'.repeat(64),
  paymentAsset:'USDC_TEST',paymentKind:'STABLECOIN',paymentMethod:'PREPAID',rate:{unitsNumerator:'1',weiDenominator:'1',evidenceDigest:'b'.repeat(64)},
  estimatedAt:now,expiresAt:new Date(Date.now()+60000).toISOString(),operations:[{operationId:'op',callDigest:sha256(operation.callData).slice(2),
   executionGasLimit:'100',maxFeePerGasWei:'1',l1DataFeeCapWei:'0',otherNetworkFeeCapWei:'0'}]},now);
 const events=[],pins=new Map();
 const ledger={signingReservation:async()=>{events.push('loaded');return {quote:structuredClone(quote),reserveReceipt:{sequence:'1',requestHash:'c'.repeat(64),eventHash:'d'.repeat(64)}};},
  prepare:async()=>{events.push('prepared');},prepareProtectedSignature:async(_id,_op,ref,digest)=>{
   events.push('pinned');if(pins.has(ref)&&pins.get(ref)!==digest)throw new Error('Protected signing payload conflict');pins.set(ref,digest);
  }};
 const backend={signTypedData:async(...args)=>{events.push('signed');return operator.signTypedData(...args);}};
 return {policy,operation,now,ledger,backend,events,operator,input:{transactionId:quote.transactionId,operationId:'op',userOperation:operation}};
}
test('protected backend is called only after preparation and exact permit binding',async()=>{
 const f=fixture();const result=await signCompanyGasPermit(f.ledger,f.backend,f.policy,f.input,f.now);
 assert.deepEqual(f.events,['loaded','prepared','pinned','signed']);
 assert.equal(result.financialExecutionEnabled,false);assert.match(result.preparedRef,/^eip155:84532:reservation:/);
 const retry=await signCompanyGasPermit(f.ledger,f.backend,f.policy,f.input,f.now);
 assert.equal(result.operatorConsent,retry.operatorConsent);
 await assert.rejects(signCompanyGasPermit(f.ledger,f.backend,f.policy,{...f.input,userOperation:{...f.operation,nonce:'1'}},f.now),/payload conflict/);
 assert.equal(f.events.filter(e=>e==='signed').length,2);
});
test('failed preparation, wrong deployment and mainnet cannot invoke the backend',async()=>{
 const f=fixture();
 await assert.rejects(signCompanyGasPermit(f.ledger,f.backend,{...f.policy,chainId:'8453'},f.input,f.now));
 assert.deepEqual(f.events,[]);
 await assert.rejects(signCompanyGasPermit({...f.ledger,prepare:async()=>{throw new Error('Unfunded');}},f.backend,f.policy,f.input,f.now),/Unfunded/);
 assert.ok(!f.events.includes('signed'));
 await assert.rejects(signCompanyGasPermit(f.ledger,f.backend,{...f.policy,paymaster:'0x'+'4'.repeat(40)},f.input,f.now),/paymaster header/);
});
test('wrong-key signatures and protected backend errors preserve the prepared boundary',async()=>{
 const f=fixture(),other=Wallet.createRandom();
 await assert.rejects(signCompanyGasPermit(f.ledger,{signTypedData:(...args)=>other.signTypedData(...args)},f.policy,f.input,f.now),
  {message:'Protected signing failed; reservation remains prepared'});
 await assert.rejects(signCompanyGasPermit(f.ledger,{signTypedData:async()=>{throw new Error('synthetic-private-key-reference');}},f.policy,f.input,f.now),
  {message:'Protected signing failed; reservation remains prepared'});
 assert.ok(f.events.includes('pinned'));
});
