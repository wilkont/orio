import { chainAddress, chainHash, chainObject, chainQuantity, finalizedLog, finalizedReceipt, indexedAddress, requireChainSources } from './chain-evidence.ts';
import type { ChainReader } from './chain-evidence.ts';
export interface CompanyWithdrawalExpectation {
  chainId:string;controller:string;vault:string;master:string;transactionHash:string;startLogIndex:string;completionLogIndex:string;
}
const startTopic='0x6efb57bab88eb4ed99e96162cee44c8c3ff872b5592e1bfe653892361c4b1f3c';
const completionTopic='0x43a6d8f6bad16eaced31863c7e9ab7c704d67766f34db60587a4000dcf7c54f6';
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function topics(log:Record<string,unknown>){
  if(!Array.isArray(log.topics))throw new Error('Missing company withdrawal topics');return log.topics.map(chainHash);
}
async function verifySource(source:ChainReader,expected:CompanyWithdrawalExpectation){
  const snapshot=await finalizedReceipt(source,expected.chainId,expected.transactionHash);
  const start=finalizedLog(snapshot,expected.transactionHash,expected.startLogIndex),end=finalizedLog(snapshot,expected.transactionHash,expected.completionLogIndex);
  const a=topics(start),b=topics(end),units=BigInt(chainHash(start.data)).toString();
  if(chainAddress(start.address)!==expected.vault||chainAddress(end.address)!==expected.controller||a.length!==3||b.length!==3||
    a[0]!==startTopic||b[0]!==completionTopic||a[1]!==b[1]||a[2]!==b[2]||indexedAddress(a[1])!==expected.master||
    chainHash(start.data)!==chainHash(end.data)||units==='0')throw new Error('Company withdrawal identity mismatch');
  const recipient=indexedAddress(a[2]);
  if(!Array.isArray(snapshot.receipt.logs))throw new Error('Missing company withdrawal logs');
  const segment=snapshot.receipt.logs.map(chainObject).filter(log=>chainQuantity(log.logIndex)>BigInt(expected.startLogIndex)&&
    chainQuantity(log.logIndex)<BigInt(expected.completionLogIndex)).map(log=>finalizedLog(snapshot,expected.transactionHash,chainQuantity(log.logIndex).toString()));
  if(segment.some(log=>(chainAddress(log.address)===expected.vault&&topics(log)[0]===startTopic)||
    (chainAddress(log.address)===expected.controller&&topics(log)[0]===completionTopic)))throw new Error('Ambiguous company withdrawal boundary');
  const transfers=segment.filter(log=>chainAddress(log.address)===expected.master&&topics(log)[0]===transferTopic);
  if(transfers.length!==1)throw new Error('Company withdrawal must have one exact cash movement');
  const cash=transfers[0]!,t=topics(cash);
  if(t.length!==3||indexedAddress(t[1])!==expected.vault||indexedAddress(t[2])!==recipient||
    chainHash(cash.data)!==chainHash(start.data))throw new Error('Company withdrawal cash mismatch');
  const ref=(index:string)=>`eip155:${expected.chainId}/tx:${expected.transactionHash}/log:${index}`;
  return {...expected,blockHash:snapshot.blockHash,blockNumber:snapshot.blockNumber,recipientAddress:recipient,units,
    startRef:ref(expected.startLogIndex),settlementRef:ref(expected.completionLogIndex),cashRef:ref(chainQuantity(cash.logIndex).toString())};
}
/** Exact bounded company-fee withdrawal proof. It cannot authorize a withdrawal or classify an arbitrary vault payout as company cash. */
export async function verifyFinalizedCompanyWithdrawal(first:ChainReader,second:ChainReader,input:CompanyWithdrawalExpectation){
  requireChainSources(first,second);const expected=structuredClone(input);
  if(typeof expected.chainId!=='string'||!/^[1-9][0-9]{0,77}$/.test(expected.chainId))throw new Error('Invalid withdrawal chain');
  for(const key of ['startLogIndex','completionLogIndex'] as const)
    if(typeof expected[key]!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(expected[key]))throw new Error('Invalid withdrawal event position');
  if(BigInt(expected.startLogIndex)>=BigInt(expected.completionLogIndex))throw new Error('Invalid withdrawal boundary');
  for(const key of ['controller','vault','master'] as const)expected[key]=chainAddress(expected[key]);
  expected.transactionHash=chainHash(expected.transactionHash);
  const [a,b]=await Promise.all([verifySource(first,expected),verifySource(second,expected)]);
  if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Company withdrawal sources disagree');return a;
}
