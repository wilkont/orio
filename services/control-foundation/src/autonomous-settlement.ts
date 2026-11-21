import type {Pool} from 'pg';
import {autonomousConfiguration,verifyAutonomousExecution,verifyAutonomousClaim,verifyAutonomousCoverage} from './finalized-autonomous.ts';
import type {AutonomousDeployment,AutonomousReader} from './finalized-autonomous.ts';
import {initialMonetaryState,planPurchaseEpoch,planRedemptionEpoch,reconcileZeroSupply} from './monetary-engine.ts';
import type {MonetaryState,Ratio} from './monetary-engine.ts';
import {gasDigest} from './gas-policy.ts';
import type {Posting,Account} from './ledger.ts';
import {verifyFinalizedTokenTransfer} from './finalized-transfer.ts';
import {chainHash,chainObject,chainQuantity} from './chain-evidence.ts';
const same=(a:unknown,b:unknown)=>gasDigest(a)===gasDigest(b);
function ratio(n:bigint,d:bigint):Ratio{let a=n,b=d;while(b)[a,b]=[b,a%b];return {numerator:String(n/a),denominator:String(d/a)};}
interface StateRow {configuration:AutonomousDeployment;state:MonetaryState;version:string;pending_units:string;company_units:string;block_number:string;log_index:string}
interface Position {transactionHash:string;blockNumber:string;logIndex:string}
/** Qualification-only trusted importer. It never signs, sends or grants access.
 * Finalized two-source facts, receipt ownership, cash/claim journals and cursor commit atomically.
 * Facts must arrive in chain log order; missing transfers/distributions fail reconciliation.
 */
export class AutonomousSettlement {
 private readonly c:AutonomousDeployment;private readonly pool:Pool;private readonly first:AutonomousReader;private readonly second:AutonomousReader;
 constructor(pool:Pool,first:AutonomousReader,second:AutonomousReader,input:AutonomousDeployment){this.pool=pool;this.first=first;this.second=second;this.c=autonomousConfiguration(input);}
 async initialize(){
  const state=initialMonetaryState(`erc20:${this.c.chainId}:${this.c.master}`,'autonomous:fixed-master',this.c.masterDecimals);
  await this.pool.query('INSERT INTO orio_autonomous.deployments(id,configuration,state,block_number) VALUES($1,$2::jsonb,$3::jsonb,$4) ON CONFLICT DO NOTHING',[this.c.id,JSON.stringify(this.c),JSON.stringify(state),this.c.deploymentBlock]);
  const row=(await this.pool.query<{configuration:AutonomousDeployment}>('SELECT configuration FROM orio_autonomous.deployments WHERE id=$1',[this.c.id])).rows[0];
  if(!same(row?.configuration,this.c))throw Error('Autonomous configuration conflict');
 }
 async cursor(){
  const row=(await this.pool.query<StateRow>('SELECT configuration,block_number::text,log_index::text FROM orio_autonomous.deployments WHERE id=$1',[this.c.id])).rows[0];
  if(!row||!same(row.configuration,this.c))throw Error('Unknown or changed autonomous deployment');
  return {blockNumber:row.block_number,logIndex:row.log_index};
 }
 private ref(tx:string,index:string){return `eip155:${this.c.chainId}/tx:${tx}/log:${index}`;}
 private async apply(proof:Position,indices:string[],fact:unknown,transition:(row:StateRow,post:(label:string,token:boolean|'USD54_MONETARY_MEMO',normal:'debit'|'credit',side:'debit'|'credit',units:bigint)=>void)=>StateRow){
  const client=await this.pool.connect(),ref=this.ref(proof.transactionHash,proof.logIndex);
  try{
   await client.query('BEGIN');
   const row=(await client.query<StateRow>('SELECT configuration,state,version::text,pending_units::text,company_units::text,block_number::text,log_index::text FROM orio_autonomous.deployments WHERE id=$1 FOR UPDATE',[this.c.id])).rows[0];
   if(!row||!same(row.configuration,this.c))throw Error('Unknown or changed autonomous deployment');
   const prior=(await client.query<{proof:unknown;journal_sequence:string|null}>('SELECT proof,journal_sequence::text FROM orio_autonomous.facts WHERE external_ref=$1',[ref])).rows[0];
   if(prior){if(!same(prior.proof,fact))throw Error('Autonomous replay conflict');await client.query('COMMIT');return prior.journal_sequence;}
   if(BigInt(proof.blockNumber)<BigInt(row.block_number)||BigInt(proof.blockNumber)===BigInt(row.block_number)&&BigInt(proof.logIndex)<=BigInt(row.log_index))throw Error('Autonomous history is out of order');
   await verifyAutonomousCoverage(this.first,this.second,this.c,row,proof,indices);
   const accounts=new Map<string,Account>(),amounts=new Map<string,bigint>();
   const post=(label:string,token:boolean|'USD54_MONETARY_MEMO',normal:'debit'|'credit',side:'debit'|'credit',units:bigint)=>{
    if(units===0n)return;if(units<0n)throw Error('Negative autonomous posting');
    const asset=typeof token==='string'?token:`erc20:${this.c.chainId}:${token?this.c.currency:this.c.master}`,id='aut_'+gasDigest([this.c.id,asset,label]);
    accounts.set(id,{id,asset,normalSide:normal,allowNegative:false});amounts.set(id,(amounts.get(id)??0n)+(side==='debit'?units:-units));
   };
   const next=transition(row,post);
   for(const index of new Set(indices))await client.query('INSERT INTO orio_settlement.receipt_claims VALUES($1,$2,$3)',[this.ref(proof.transactionHash,index),'monetary','autonomous:'+this.c.id]);
   for(const a of accounts.values())await client.query('SELECT orio_ledger.create_account($1,$2,$3,$4)',[a.id,a.asset,a.normalSide,false]);
   const postings:Posting[]=[...amounts].filter(([,n])=>n!==0n).map(([accountId,n])=>({accountId,side:n>0n?'debit':'credit',units:String(n>0n?n:-n)}));
   const sequence=postings.length?(await client.query<{sequence:string}>('SELECT sequence::text FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',
    ['autonomous:'+ref,ref,'Finalized autonomous reserve, token and funded-claim accounting',JSON.stringify(postings)])).rows[0]!.sequence:null;
   for(const [label,units] of [['reserve_cash',next.state.reserveMasterUnits],['company_cash',next.company_units],['claim_cash',next.pending_units]]){
    const id='aut_'+gasDigest([this.c.id,`erc20:${this.c.chainId}:${this.c.master}`,label]);
    const actual=(await client.query<{units:string}>('SELECT units::text FROM orio_ledger.balances WHERE id=$1',[id])).rows[0]?.units??'0';
    if(actual!==units)throw Error('Unreconciled autonomous cash');
   }
   await client.query('INSERT INTO orio_autonomous.facts VALUES($1,$2,$3::jsonb,$4)',[ref,this.c.id,JSON.stringify(fact),sequence]);
   await client.query('UPDATE orio_autonomous.deployments SET state=$2::jsonb,version=$3,pending_units=$4,company_units=$5,block_number=$6,log_index=$7 WHERE id=$1',
    [this.c.id,JSON.stringify(next.state),next.version,next.pending_units,next.company_units,proof.blockNumber,proof.logIndex]);
   await client.query('COMMIT');return sequence;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async importExecution(transactionHash:string,checkpointLogIndex:string){
  const p=await verifyAutonomousExecution(this.first,this.second,this.c,transactionHash,checkpointLogIndex);
  return this.apply({...p,logIndex:p.checkpointLogIndex},p.receiptIndexes,p,(row,post)=>{
   if(row.version!==p.previousVersion)throw Error('Missing autonomous version');
   const now=new Date().toISOString(),valuation={masterAssetId:row.state.masterAssetId,electionId:row.state.electionId,usd36PerToken:p.masterUsd36,
    evidenceDigest:gasDigest(p),observedAt:now,expiresAt:new Date(Date.parse(now)+1000).toISOString(),issuanceAllowed:BigInt(p.masterUsd36)>=995n*10n**33n&&BigInt(p.masterUsd36)<=1005n*10n**33n};
   const requests=p.allocations.map((a,i)=>({id:String(i).padStart(4,'0'),masterUnits:a.gross,tokenAtoms:a.amount}));
   const plan=p.kind==='0'?planPurchaseEpoch(row.state,valuation,requests,now):p.kind==='1'&&requests.length?planRedemptionEpoch(row.state,valuation,requests,now):null;
   let state=plan?.next??row.state;
   if(p.kind==='2')state=reconcileZeroSupply(row.state,valuation,{expectedStateDigest:gasDigest(row.state),checkpointDigest:gasDigest(p),reserveMasterUnits:row.state.reserveMasterUnits,pendingRedemptionUnits:'0',unsettledCompanyFeeUnits:'0'},now);
   const actual={...row.state,supplyAtoms:p.supplyAtoms,priceUsd36:{numerator:p.referencePriceUsd36,denominator:'1'},reserveMasterUnits:p.reserveMasterUnits,
    roundingUsd36:ratio(BigInt(p.roundingUsd54),10n**18n),cycle:p.cycle,phase:(['GENESIS','ACTIVE','ZERO_SUPPLY_PENDING','ZERO_SUPPLY_RECONCILED'] as const)[Number(p.phase)]};
   if(!same(actual,state))throw Error('Autonomous contract and monetary engine disagree');
   let pending=BigInt(row.pending_units),company=BigInt(row.company_units);
   p.allocations.forEach((a,i)=>{
    const expected=plan?.allocations[i];if(!expected||a.fee!==expected.feeMasterUnits||a.company!==expected.companyMasterUnits||
     ('mintedAtoms' in expected?a.amount!==expected.mintedAtoms:a.payout!==expected.payoutMasterUnits))throw Error('Autonomous allocation mismatch');
    const fee=BigInt(a.company);company+=fee;
    if(p.kind==='0'){
     const backing=BigInt(a.gross)-fee;post('reserve_cash',false,'debit','debit',backing);post('backing',false,'credit','credit',backing);
     post('issuance',true,'debit','debit',BigInt(a.amount));post('wallet:'+a.owner,true,'credit','credit',BigInt(a.amount));
    }else{
     const payout=BigInt(a.payout),released=payout+fee;pending+=payout;
     post('reserve_cash',false,'debit','credit',released);post('backing',false,'credit','debit',released);
     post('claim_cash',false,'debit','debit',payout);post('claim_due:'+a.recipient,false,'credit','credit',payout);
     post('issuance',true,'debit','credit',BigInt(a.amount));post('wallet:'+a.owner,true,'credit','debit',BigInt(a.amount));
    }
    post('company_cash',false,'debit','debit',fee);post('company_revenue',false,'credit','credit',fee);
   });
   if(p.companyWithdrawal){const units=BigInt(p.companyWithdrawal.units);company-=units;post('company_cash',false,'debit','credit',units);post('company_distributions',false,'debit','debit',units);}
   const previousRounding=BigInt(row.state.roundingUsd36.numerator)*10n**18n/BigInt(row.state.roundingUsd36.denominator);
   const residual=BigInt(p.roundingUsd54)-previousRounding;
   if(residual<0n)throw Error('Rounding obligations cannot be released');
   post('rounding_control','USD54_MONETARY_MEMO','debit','debit',residual);post('restricted_rounding','USD54_MONETARY_MEMO','credit','credit',residual);
   if(String(pending)!==p.pendingClaims||String(company)!==p.companyUnits)throw Error('Unreconciled pending claims or company funds');
   return {...row,state,version:p.version,pending_units:String(pending),company_units:String(company)};
  });
 }
 async importClaim(transactionHash:string,logIndex:string){
  const p=await verifyAutonomousClaim(this.first,this.second,this.c,transactionHash,logIndex);
  return this.apply(p,[p.logIndex,p.transferLogIndex],p,(row,post)=>{
   const n=BigInt(p.units);post('claim_cash',false,'debit','credit',n);post('claim_due:'+p.recipient,false,'credit','debit',n);
   return {...row,pending_units:String(BigInt(row.pending_units)-n)};
  });
 }
 async importTransfer(input:{transactionHash:string;logIndex:string;senderAddress:string;recipientAddress:string;units:string}){
  const request=structuredClone(input);
  const p=await verifyFinalizedTokenTransfer(this.first,this.second,{...request,chainId:this.c.chainId,tokenAddress:this.c.currency});
  if([p.senderAddress,p.recipientAddress].includes('0x'+'0'.repeat(40)))throw Error('Mint and burn require monetary settlement');
  return this.apply({...p,transactionHash:request.transactionHash.toLowerCase(),logIndex:request.logIndex},[request.logIndex],p,(row,post)=>{
   const n=BigInt(p.units);post('wallet:'+p.senderAddress,true,'credit','debit',n);post('wallet:'+p.recipientAddress,true,'credit','credit',n);return row;
  });
 }
 /** Progress across a quiet finalized interval without inventing or skipping financial facts. */
 async advanceEmptyHistory(throughBlock:string){
  if(typeof throughBlock!=='string'||!/^(0|[1-9][0-9]{0,77})$/.test(throughBlock))throw Error('Invalid history catch-up block');
  const end=BigInt(throughBlock),client=await this.pool.connect(),ref=`eip155:${this.c.chainId}/autonomous:${this.c.id}/empty-through:${throughBlock}`;
  const lastIndex=((1n<<256n)-1n).toString();
  try{
   await client.query('BEGIN');
   const row=(await client.query<StateRow>('SELECT configuration,state,version::text,pending_units::text,company_units::text,block_number::text,log_index::text FROM orio_autonomous.deployments WHERE id=$1 FOR UPDATE',[this.c.id])).rows[0];
   if(!row||!same(row.configuration,this.c))throw Error('Unknown or changed autonomous deployment');
   if((await client.query('SELECT 1 FROM orio_autonomous.facts WHERE external_ref=$1',[ref])).rowCount){await client.query('COMMIT');return;}
   if(end<BigInt(row.block_number)||end===BigInt(row.block_number)&&row.log_index===lastIndex)throw Error('History catch-up is out of order');
   const read=async(source:AutonomousReader)=>{
    if(chainQuantity(await source.request('eth_chainId',[])).toString()!==this.c.chainId)throw Error('History chain mismatch');
    const final=chainObject(await source.request('eth_getBlockByNumber',['finalized',false]));
    if(chainQuantity(final.number)<end)throw Error('History interval is not finalized');
    const block=chainObject(await source.request('eth_getBlockByNumber',['0x'+end.toString(16),false]));
    if(chainQuantity(block.number)!==end||chainQuantity(final.number)===end&&chainHash(final.hash)!==chainHash(block.hash))throw Error('History block mismatch');return chainHash(block.hash);
   };
   const [a,b]=await Promise.all([read(this.first),read(this.second)]);if(a!==b)throw Error('History canonical sources disagree');
   await verifyAutonomousCoverage(this.first,this.second,this.c,row,{blockNumber:throughBlock,logIndex:lastIndex,transactionHash:'0x'+'0'.repeat(64)},null);
   const proof={kind:'EMPTY_RANGE',fromBlock:row.block_number,afterLog:row.log_index,throughBlock,blockHash:a};
   await client.query('INSERT INTO orio_settlement.receipt_claims VALUES($1,$2,$3)',[ref,'monetary','autonomous-empty:'+this.c.id]);
   await client.query('INSERT INTO orio_autonomous.facts VALUES($1,$2,$3::jsonb,NULL)',[ref,this.c.id,JSON.stringify(proof)]);
   await client.query('UPDATE orio_autonomous.deployments SET block_number=$2,log_index=$3 WHERE id=$1',[this.c.id,throughBlock,lastIndex]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
}
