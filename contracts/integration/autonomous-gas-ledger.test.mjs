import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {sha256} from 'ethers';
import {bytesToHex} from '@ethereumjs/util';
import pg from '../../services/control-foundation/node_modules/pg/lib/index.js';
import {paymasterFixture} from '../test/helpers/paymaster-fixture.mjs';
import {autonomousFixture,ok,hash} from '../test/helpers/autonomous-fixture.mjs';
import {autonomousWallet} from '../sdk/autonomous-wallet.mjs';
import {AutonomousSettlement} from '../../services/control-foundation/src/autonomous-settlement.ts';
import {ControlLedger} from '../../services/control-foundation/src/ledger.ts';
import {GasControls,gasAccounts} from '../../services/control-foundation/src/gas-controls.ts';
import {quoteGas} from '../../services/control-foundation/src/gas-policy.ts';
import {createAwsKmsGasSigner} from '../sdk/aws-kms-client.mjs';
import {kmsFixtureClient,fixtureKeyArn} from '../test/helpers/kms-signing-fixture.mjs';
import {signCompanyGasPermit} from '../sdk/protected-gas-signing.mjs';
import {attachGasConsents} from '../sdk/gas-permit.mjs';
import {verifyFinalizedUserOperation} from '../../services/control-foundation/src/finalized-user-operation.ts';
import {autonomousTopics} from '../../services/control-foundation/src/finalized-autonomous.ts';
const url=new URL(process.env.ORIO_TEST_DATABASE_URL??'about:blank');
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/orio_test')throw Error('Use isolated local PostgreSQL');
test('all autonomous wallet phases collect bounded user gas and refund unused estimates separately from actual reserve/claim journals',async()=>{
 const root=new pg.Pool({connectionString:url.href}),name='orio_test_aut_gas_'+randomUUID().replaceAll('-',''),runtime=name+'_rt';
 let pool,created=false;
 try{
  await root.query('CREATE DATABASE '+name);created=true;const db=new URL(url);db.pathname='/'+name;pool=new pg.Pool({connectionString:db.href});
  const directory=new URL('../../services/control-foundation/migrations/',import.meta.url);
  for(const file of(await readdir(directory)).filter(f=>/^\d{3}_.*\.sql$/.test(f)).sort())await pool.query((await readFile(new URL(file,directory),'utf8')).replaceAll('orio_ledger_runtime',runtime));
  await pool.query(await readFile(new URL('../../services/control-foundation/pending-migrations/022_autonomous_settlement.sql',import.meta.url),'utf8'));
  const p=await paymasterFixture();p.setTime(Math.floor(Date.now()/1000));const f=await autonomousFixture(p),wallet=autonomousWallet(f.configuration);
  const ledger=new ControlLedger(pool),controls=new GasControls(pool);let current,height=0n,sequence=0,funded=false,accounts;const history=[];
  const source=sourceId=>({sourceId,request:async(method,params)=>{
   if(method==='eth_chainId')return '0x14a34';
   if(method==='eth_getLogs'){const q=params[0];return structuredClone(history.flatMap(r=>r.logs).filter(l=>BigInt(l.blockNumber)>=BigInt(q.fromBlock)&&BigInt(l.blockNumber)<=BigInt(q.toBlock)&&q.address.includes(l.address)&&q.topics[0].includes(l.topics[0])));}
   if(method==='eth_getTransactionReceipt')return structuredClone(history.find(r=>r.transactionHash===params[0]));
   const r=params[0]==='finalized'?current:history.find(r=>r.blockNumber===params[0]);return {number:r.blockNumber,hash:r.blockHash};
  }});
  const importer=new AutonomousSettlement(pool,source('one'),source('two'),f.configuration);await importer.initialize();
  ok(await f.call(f.master,'mintFixture',[p.account.address,1000000000n]));
  const policy={keyArn:fixtureKeyArn,chainId:'84532',revision:'1',signer:p.operator.address,entryPoint:p.entry.address,paymaster:p.paymaster.address};
  async function execute(phase){
   const id='autonomous-gas-'+ ++sequence,now=new Date().toISOString(),evidence='b'.repeat(64);
   const callData=p.account.api.encodeFunctionData('executeBatch',[phase.calls]);
   const {operation}=await p.signOperation({callData,callGasLimit:2000000n});
   operation.nonce=String(operation.nonce);operation.preVerificationGas=String(operation.preVerificationGas);operation.paymasterAndData=operation.paymasterAndData.slice(0,106);
   const quote=quoteGas({transactionId:id,ownerRef:p.account.address,chainId:'84532',action:phase.phase==='TRANSFER'?'TRANSFER':phase.phase==='PURCHASE'?'PURCHASE':'REDEMPTION',
    actionDigest:phase.actionDigest.slice(2),paymentAsset:'USDC_SYNTHETIC',paymentKind:'STABLECOIN',paymentMethod:'PREPAID',
    rate:{unitsNumerator:'1',weiDenominator:'1000000000000',evidenceDigest:evidence},estimatedAt:now,expiresAt:new Date(Date.parse(now)+300000).toISOString(),
    operations:[{operationId:'operation',callDigest:sha256(callData).slice(2),executionGasLimit:'5000000',maxFeePerGasWei:'1000000000',l1DataFeeCapWei:'0',otherNetworkFeeCapWei:'0'}]},now);
   accounts=gasAccounts(quote);
   if(!funded){
    for(const [id,asset,normalSide] of [[accounts.prepaid,quote.paymentAsset,'credit'],['gas-fixture-cash',quote.paymentAsset,'debit'],[accounts.ethAvailable,'native:84532:ETH','debit'],['gas-fixture-capital','native:84532:ETH','credit']])await ledger.createAccount({id,asset,normalSide,allowNegative:false});
    await ledger.post({idempotencyKey:'fixture-gas-funding',externalRef:'fixture-only',description:'Disconnected synthetic prepaid gas and company ETH',postings:[
     {accountId:accounts.prepaid,side:'credit',units:'100000'},{accountId:'gas-fixture-cash',side:'debit',units:'100000'},
     {accountId:accounts.ethAvailable,side:'debit',units:'1000000000000000000'},{accountId:'gas-fixture-capital',side:'credit',units:'1000000000000000000'}]});funded=true;
   }
   const consent=p.owner.signingKey.sign('0x'+quote.digest).serialized;
   await controls.reserve(quote,{ownerRef:quote.ownerRef,quoteDigest:quote.digest,actionDigest:quote.actionDigest,maximumPaymentUnits:quote.maximumPaymentUnits,authorizationDigest:createHash('sha256').update(consent).digest('hex')});
   const backend=await createAwsKmsGasSigner(policy,()=>kmsFixtureClient(p.operator,async()=>{
    assert.equal((await pool.query('SELECT count(*) FROM orio_gas.signing_preparations')).rows[0].count,String(sequence));
   }));let signed;
   try{signed=await signCompanyGasPermit(controls,backend,policy,{transactionId:id,operationId:'operation',userOperation:operation},now);}finally{backend.close();}
   operation.paymasterAndData=attachGasConsents(signed.material,p.owner.signingKey.sign(signed.material.digest).serialized,signed.operatorConsent);
   const userOperationHash=(await p.read(p.entry,'getUserOpHash',[operation]))[0];operation.signature=p.owner.signingKey.sign(userOperationHash).serialized;
   const executionRef='eip155:84532:userop:'+userOperationHash.slice(2);
   await controls.bindExecution(id,'operation',signed.preparedRef,executionRef,createHash('sha256').update(JSON.stringify(operation)).digest('hex'));
   const inclusion=BigInt(signed.material.permit.validAfter)+1n;
   p.setTime(p.time()>inclusion?p.time():inclusion);
   const result=await p.submit(operation);ok(result);
   const completed=p.logs(result,p.entry).find(l=>l?.name==='UserOperationEvent');assert.equal(completed.args.success,true);
   const transactionHash=hash('gas-tx-'+ ++height),blockHash=hash('gas-block-'+height),blockNumber='0x'+height.toString(16);
   current={status:'0x1',transactionHash,blockHash,blockNumber,logs:result.execResult.logs.map(([address,topics,data],i)=>({address:bytesToHex(address),topics:topics.map(bytesToHex),data:bytesToHex(data),logIndex:'0x'+i.toString(16),transactionHash,blockHash,blockNumber,removed:false}))};
   history.push(structuredClone(current));
   const entryLog=current.logs.find(l=>l.address===p.entry.address&&l.topics[0]===p.entry.api.getEvent('UserOperationEvent').topicHash);
   const observed=await verifyFinalizedUserOperation(source('one'),source('two'),{chainId:'84532',entryPointAddress:p.entry.address,accountAddress:p.account.address,paymasterAddress:p.paymaster.address,userOperationHash,nonce:operation.nonce,transactionHash,logIndex:String(BigInt(entryLog.logIndex))});
   const checkpoint=current.logs.find(l=>l.topics[0]===autonomousTopics.checkpoint),claim=current.logs.find(l=>l.topics[0]===autonomousTopics.claim);
   if(checkpoint)await importer.importExecution(transactionHash,String(BigInt(checkpoint.logIndex)));
   else if(claim)await importer.importClaim(transactionHash,String(BigInt(claim.logIndex)));
   else if(phase.phase==='TRANSFER'){
    const transfer=current.logs.find(l=>l.address.toLowerCase()===f.currency.address.toLowerCase()&&l.topics[0]===autonomousTopics.transfer);
    await importer.importTransfer({transactionHash,logIndex:String(BigInt(transfer.logIndex)),senderAddress:p.account.address,recipientAddress:p.operator.address,units:'1000000000000000000'});
   }
   await controls.recordCost(id,{operationId:'operation',executionRef,evidenceDigest:evidence,outcome:'SUCCESS',executionWei:observed.entryPointDebitWei,l1DataWei:'0',otherNetworkWei:'0'});
   const closure=await controls.settle(id,evidence);assert.equal(closure.status,'SETTLED');
   assert.equal(BigInt(closure.chargeUnits)+BigInt(closure.refundUnits),BigInt(quote.maximumPaymentUnits));assert.ok(BigInt(closure.refundUnits)>0n);
   assert.deepEqual(await controls.settle(id,evidence),closure);assert.equal(await p.balance(p.account.address),0n);
  }
  await execute(wallet.purchase({requestId:hash('aa-ledger-purchase'),version:'0',grossMasterUnits:'1000000000',minimumAtoms:'1'}));
  const origin=(await f.read(f.controller,'origin'))[0],epoch=(await f.read(f.controller,'currentEpochId'))[0],close=origin+epoch*60n;
  const consent=wallet.withdrawal({requestId:hash('aa-ledger-withdrawal'),epochId:String(epoch),owner:p.account.address,recipient:p.account.address,atoms:'100000000000000000000',minimumPayout:'99000000',nonce:'1',deadline:String(close+120n)},
   {origin:String(origin),period:'60',now:String(f.time())});
  await execute(wallet.admission(consent,p.owner.signingKey.sign(consent.digest).serialized));f.setTime(close);
  await execute(wallet.settlement());await execute(wallet.claim(p.account.address));await execute(wallet.transfer({recipient:p.operator.address,atoms:'1000000000000000000'}));
  assert.equal((await f.read(f.master,'balanceOf',[p.account.address]))[0],99000000n);
  const balances=await ledger.balances();assert.equal(BigInt(balances.find(a=>a.id===accounts.ethAvailable).units),(await p.read(p.paymaster,'getDeposit'))[0]);
  assert.equal((await ledger.verify()).ok,true);assert.equal((await pool.query('SELECT count(*) FROM orio_gas.reservations')).rows[0].count,'5');
  // Synthetic block anchors and zero L1 charges are VM evidence, not live Base fee/finality qualification.
 }finally{
  if(pool)await pool.end();if(created)await root.query('DROP DATABASE '+name+' WITH (FORCE)');await root.query('DROP ROLE IF EXISTS '+runtime);await root.end();
 }
});
