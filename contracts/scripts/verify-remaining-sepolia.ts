import {writeFile} from 'node:fs/promises';
import {Interface,keccak256,ZeroAddress,ZeroHash} from 'ethers';
import {manifest,operation,readRpc,object,quantity} from '../sdk/remaining-sepolia.ts';
try{
 const id=process.argv[2],hash=process.argv[3];if(!/^0x[0-9a-f]{64}$/.test(hash??''))throw new Error('Invalid transaction reference');
 const m=await manifest(),p=await operation(id);
 if(await readRpc('eth_chainId',[])!=='0x14a34')throw new Error('Wrong network');
 const receipt=object(await readRpc('eth_getTransactionReceipt',[hash])),tx=object(await readRpc('eth_getTransactionByHash',[hash]));
 if(receipt.transactionHash!==hash||receipt.status!=='0x1'||String(receipt.contractAddress).toLowerCase()!==p.predictedAddress.toLowerCase()||
  String(tx.from).toLowerCase()!==m.sender.toLowerCase()||tx.to!==null||tx.input!==p.transaction.data||quantity(tx.chainId)!==84532n||
  quantity(tx.nonce)!==BigInt(p.transaction.nonce)||quantity(tx.value)!==0n)throw new Error('Receipt or creation payload mismatch');
 const block=object(await readRpc('eth_getBlockByNumber',[receipt.blockNumber,false]));if(block.hash!==receipt.blockHash)throw new Error('Deployment block changed');
 async function code(address:string,expected:string):Promise<void>{
  const raw=await readRpc('eth_getCode',[address,receipt.blockNumber]);if(typeof raw!=='string'||raw==='0x'||keccak256(raw)!==expected)throw new Error('Runtime code mismatch');
 }
 await code(p.predictedAddress,p.expectedRuntimeCodeHash);
 for(const child of p.children)await code(child.address,child.expectedRuntimeCodeHash);
 async function check(address:string,signature:string,args:unknown[],expected:unknown):Promise<void>{
  const api=new Interface(['function '+signature]),name=signature.slice(0,signature.indexOf('('));
  const raw=await readRpc('eth_call',[{to:address,data:api.encodeFunctionData(name,args)},receipt.blockNumber]);if(typeof raw!=='string')throw new Error('Invalid identity read');
  const actual:unknown=api.decodeFunctionResult(name,raw)[0];
  if(typeof actual==='string'&&typeof expected==='string'?actual.toLowerCase()!==expected.toLowerCase():actual!==expected)throw new Error('Unexpected paused configuration: '+name);
 }
 if(p.operationId==='registry'){
  await check(p.predictedAddress,'governance() view returns(address)',[],m.governance);
  await check(p.predictedAddress,'currentMaster() view returns(bytes32)',[],ZeroHash);
  await check(p.predictedAddress,'monetaryController() view returns(address)',[],ZeroAddress);
  await check(p.predictedAddress,'monetaryVault() view returns(address)',[],ZeroAddress);
 }else if(p.operationId==='paymaster'){
  await check(p.predictedAddress,'owner() view returns(address)',[],m.governance);
  await check(p.predictedAddress,'entryPoint() view returns(address)',[],m.entryPoint);
  await check(p.predictedAddress,'executionEnabled() view returns(bool)',[],false);
  await check(p.predictedAddress,'reservationSigner() view returns(address)',[],ZeroAddress);
 }else if(p.operationId==='accountFactory'||p.operationId==='recoveryFactory'){
  await check(p.predictedAddress,'entryPoint() view returns(address)',[],m.entryPoint);
  await check(p.predictedAddress,'paymaster() view returns(address)',[],(await operation('paymaster')).predictedAddress);
 }else{
  await check(p.predictedAddress,'governance() view returns(address)',[],m.governance);
  await check(p.predictedAddress,'registry() view returns(address)',[],(await operation('registry')).predictedAddress);
  await check(p.predictedAddress,'executionEnabled() view returns(bool)',[],false);
  await check(p.predictedAddress,'valuationSigner() view returns(address)',[],ZeroAddress);
  await check(p.predictedAddress,'settlementOperator() view returns(address)',[],ZeroAddress);
  await check(p.predictedAddress,'stateVersion() view returns(uint256)',[],0n);
  await check(p.predictedAddress,'referencePriceUsd36() view returns(uint256)',[],10n**36n);
  for(const child of p.children){
   await check(p.predictedAddress,child.name+'() view returns(address)',[],child.address);
   await check(child.address,'controller() view returns(address)',[],p.predictedAddress);
  }
  const currency=p.children.find(c=>c.name==='currency'),vault=p.children.find(c=>c.name==='vault'),locks=p.children.find(c=>c.name==='redemptionLocks');
  if(!currency||!vault||!locks)throw new Error('Missing child identities');
  await check(currency.address,'totalSupply() view returns(uint256)',[],0n);
  await check(currency.address,'settlementLocker() view returns(address)',[],locks.address);
  await check(vault.address,'masterAsset() view returns(address)',[],m.testUsdc);
  await check(vault.address,'reserveUnits() view returns(uint256)',[],0n);
  await check(vault.address,'companyFees(address) view returns(uint256)',[m.testUsdc],0n);
  await check(m.testUsdc,'balanceOf(address) view returns(uint256)',[vault.address],0n);
  await check(locks.address,'currency() view returns(address)',[],currency.address);
 }
 const gasUsed=quantity(receipt.gasUsed),execution=gasUsed*quantity(receipt.effectiveGasPrice),l1=quantity(receipt.l1Fee);
 const fees=new Interface(['function getOperatorFee(uint256) view returns(uint256)']);
 const raw=await readRpc('eth_call',[{to:'0x420000000000000000000000000000000000000F',data:fees.encodeFunctionData('getOperatorFee',[gasUsed])},receipt.blockNumber]);
 if(typeof raw!=='string')throw new Error('Missing operator fee');const operator:unknown=fees.decodeFunctionResult('getOperatorFee',raw)[0];
 if(typeof operator!=='bigint'||operator<0n)throw new Error('Invalid operator fee');
 const finalized=object(await readRpc('eth_getBlockByNumber',['finalized',false]));
 const report={status:'VERIFIED_PAUSED_TESTNET_DEPLOYMENT',operationId:id,contract:p.contract,address:p.predictedAddress,children:p.children,
  chainId:'84532',transactionHash:hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,runtimeCodeHash:p.expectedRuntimeCodeHash,
  creationInputMatchesPinnedPlan:true,pausedConfigurationVerified:true,executionFeeWei:execution.toString(),l1FeeWei:l1.toString(),
  operatorFeeAtReceiptBlockWei:operator.toString(),observedNetworkFeeWei:(execution+l1+operator).toString(),
  finalizedAtObservation:quantity(finalized.number)>=quantity(receipt.blockNumber),observedAt:new Date().toISOString(),financialExecutionEnabled:false,
  limits:['Single public source diagnostic; no independent state proof verification','No asset election, customer issuance, paymaster operation or wallet creation is implied']};
 await writeFile(process.argv[4]??new URL('../artifacts/remaining-'+p.operationId+'-receipt.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
}catch{console.error('Remaining deployment verification blocked; no chain write performed');process.exitCode=1;}
