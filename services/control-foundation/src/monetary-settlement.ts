import type { Pool } from 'pg';
import { chainAddress } from './chain-evidence.ts';
import type { ChainReader } from './chain-evidence.ts';
import { verifyFinalizedMonetaryExecution } from './finalized-monetary.ts';
import { verifyFinalizedTokenTransfer } from './finalized-transfer.ts';
import type { ExpectedTokenTransfer } from './finalized-transfer.ts';
import { verifyFinalizedCompanyWithdrawal } from './finalized-company-withdrawal.ts';
import { initialMonetaryState, planPurchaseEpoch, planRedemptionEpoch, reconcileZeroSupply } from './monetary-engine.ts';
import type { MonetaryState, Ratio, ZeroSupplyReconciliation } from './monetary-engine.ts';
import { gasDigest } from './gas-policy.ts';
import type { Account, Posting } from './ledger.ts';
import { assessReserveMigration } from './reserve-migration.ts';

export interface MonetaryDeployment {
  id: string; chainId: string; controller: string; currency: string; vault: string; master: string;
  masterDecimals: number; registryEpoch: string; registry:string;
}
function configuration(input: MonetaryDeployment): MonetaryDeployment {
  const c = structuredClone(input);
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(c.id) || !['84532','31337'].includes(c.chainId) ||
      !Number.isInteger(c.masterDecimals) || c.masterDecimals < 0 || c.masterDecimals > 18 ||
      typeof c.registryEpoch !== 'string' || !/^[1-9][0-9]{0,77}$/.test(c.registryEpoch)) throw new Error('Invalid qualification deployment');
  for (const key of ['controller','currency','vault','master','registry'] as const) c[key] = chainAddress(c[key]);
  if (new Set([c.controller,c.currency,c.vault,c.master,c.registry]).size !== 5 ||
      [c.controller,c.currency,c.vault,c.master,c.registry].some(a => a === '0x'+'0'.repeat(40))) throw new Error('Invalid deployment identities');
  return c;
}
function ratio(numerator: bigint, denominator: bigint): Ratio {
  let a=numerator,b=denominator; while(b) [a,b]=[b,a%b];
  return {numerator:(numerator/a).toString(),denominator:(denominator/a).toString()};
}
const same = (a: unknown,b: unknown) => gasDigest(a) === gasDigest(b);

/** Owner-only finalized history importer. It neither signs nor sends transactions.
 * Versions, receipt ownership and all asset journals commit in one database transaction.
 * Unhandled lifecycle transitions or preclaimed receipts stop import for investigation.
 */
export class MonetarySettlement {
  private readonly deployment: MonetaryDeployment;
  private readonly pool: Pool;
  private readonly first: ChainReader;
  private readonly second: ChainReader;
  constructor(pool: Pool, first: ChainReader, second: ChainReader, input: MonetaryDeployment) {
    this.pool=pool;this.first=first;this.second=second;
    this.deployment = configuration(input);
  }
  async initialize(): Promise<void> {
    const c=this.deployment, state=initialMonetaryState(`erc20:${c.chainId}:${c.master}`,`onchain-epoch:${c.registryEpoch}`,c.masterDecimals);
    await this.pool.query('INSERT INTO orio_monetary.deployments(id,configuration,state) VALUES($1,$2::jsonb,$3::jsonb) ON CONFLICT DO NOTHING',
      [c.id,JSON.stringify(c),JSON.stringify(state)]);
    const result=await this.pool.query<{configuration: MonetaryDeployment}>('SELECT configuration FROM orio_monetary.deployments WHERE id=$1',[c.id]);
    if (!same(result.rows[0]?.configuration,c)) throw new Error('Deployment configuration conflict');
    await this.pool.query('INSERT INTO orio_monetary.master_history VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[c.id,c.registryEpoch,JSON.stringify(c)]);
  }
  async importMigration(input:{transactionHash:string;checkpointLogIndex:string;operationId:string;version:string;nextDeployment:MonetaryDeployment}){
    const request=structuredClone(input),c=this.deployment,next=configuration(request.nextDeployment);
    if(!same({...next,master:c.master,masterDecimals:c.masterDecimals,registryEpoch:c.registryEpoch},c)||next.master===c.master||
      BigInt(next.registryEpoch)!==BigInt(c.registryEpoch)+1n)throw new Error('Invalid master migration configuration');
    if(typeof request.version!=='string'||!/^[1-9][0-9]{0,77}$/.test(request.version))throw new Error('Invalid migration version');
    const previous=(await this.pool.query<{evidence:{masterAssetHash:string}}>(
      'SELECT evidence FROM orio_monetary.executions WHERE deployment_id=$1 AND version=$2',
      [c.id,(BigInt(request.version)-1n).toString()])).rows[0];
    if(!previous&&request.version!=='1')throw new Error('Previous monetary checkpoint is required');
    const proof=await verifyFinalizedMonetaryExecution(this.first,this.second,{...request,...next,kind:'MASTER_MIGRATION',
      previousMaster:c.master,...(previous?{previousMasterHash:previous.evidence.masterAssetHash}:{})});
    if(proof.registryEpoch!==next.registryEpoch||!proof.migration)throw new Error('Migration election mismatch');
    const migration=proof.migration,client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const row=(await client.query<{configuration:MonetaryDeployment;version:string;state:MonetaryState}>(
        'SELECT configuration,version::text,state FROM orio_monetary.deployments WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      const prior=(await client.query<{evidence:unknown;journal_sequence:string|null}>(
        'SELECT evidence,journal_sequence FROM orio_monetary.executions WHERE deployment_id=$1 AND version=$2',[c.id,proof.version])).rows[0];
      if(prior){if(!same(prior.evidence,proof))throw new Error('Migration idempotency conflict');
        await client.query('COMMIT');return {journalSequence:prior.journal_sequence,configuration:next};}
      if(!row||!same(row.configuration,c)||row.version!==proof.previousVersion||migration.previousUnits!==row.state.reserveMasterUnits)
        throw new Error('Missing or out-of-order reserve migration');
      if(!previous&&(row.state.phase!=='GENESIS'||migration.previousUnits!=='0'||migration.receivedUnits!=='0'))
        throw new Error('Original genesis migration must remain empty');
      const phases=['GENESIS','ACTIVE','ZERO_SUPPLY_PENDING','ZERO_SUPPLY_RECONCILED'];
      const oldResidual=BigInt(row.state.roundingUsd36.numerator)*10n**18n/BigInt(row.state.roundingUsd36.denominator);
      if(proof.supplyAtoms!==row.state.supplyAtoms||proof.referencePriceUsd36!==row.state.priceUsd36.numerator||
        proof.roundingUsd54!==oldResidual.toString()||proof.cycle!==row.state.cycle||phases[Number(proof.phase)]!==row.state.phase||
        BigInt(proof.reserveMasterUnits)*BigInt(proof.masterUsd36PerToken)*10n**BigInt(18-next.masterDecimals)!==BigInt(migration.currentValueUsd54))
        throw new Error('Migration changes monetary liabilities or misvalues received reserves');
      const invariant={orioSupplyUnits:row.state.supplyAtoms,ownershipCommitment:gasDigest([c.currency,row.state.supplyAtoms]),companyFeeUnits:'0',holderAllocationUnits:'0'};
      const result=assessReserveMigration(invariant,invariant,
        {assetId:c.master,units:migration.previousUnits,usdValueUnits:migration.previousValueUsd54,evidenceDigest:proof.evidenceDigest.slice(2)},
        {assetId:next.master,units:migration.receivedUnits,usdValueUnits:migration.currentValueUsd54,evidenceDigest:proof.evidenceDigest.slice(2)},
        (BigInt(row.state.supplyAtoms)*BigInt(proof.referencePriceUsd36)+oldResidual).toString());
      if(result.requiresDeficiencyProcedure)throw new Error('Replacement cannot support outstanding obligations');
      const postings:Posting[]=[],oldAsset=`erc20:${c.chainId}:${c.master}`,newAsset=`erc20:${c.chainId}:${next.master}`;
      const post=async(label:string,asset:string,normal:'debit'|'credit',side:'debit'|'credit',units:string)=>{
        if(units==='0')return;const id='mon_'+gasDigest([c.id,asset,label]);
        await client.query('SELECT orio_ledger.create_account($1,$2,$3,$4)',[id,asset,normal,label==='migration_valuation']);postings.push({accountId:id,side,units});
      };
      await post('reserve_cash',oldAsset,'debit','credit',migration.previousUnits);await post('backing',oldAsset,'credit','debit',migration.previousUnits);
      await post('reserve_cash',newAsset,'debit','debit',migration.receivedUnits);await post('backing',newAsset,'credit','credit',migration.receivedUnits);
      const loss=BigInt(migration.previousValueUsd54)-BigInt(migration.currentValueUsd54);
      if(loss!==0n){const units=(loss>0n?loss:-loss).toString();
        await post('migration_valuation','USD54_MIGRATION_MEMO','debit',loss>0n?'credit':'debit',units);
        await post(loss>0n?'migration_loss':'migration_gain','USD54_MIGRATION_MEMO',loss>0n?'debit':'credit',loss>0n?'debit':'credit',units);}
      const ref=(index:string)=>`eip155:${c.chainId}/tx:${proof.transactionHash}/log:${index}`;
      for(const index of [proof.checkpointLogIndex,migration.electionLogIndex,migration.replacementLogIndex,migration.outgoingLogIndex,migration.incomingLogIndex])
        if(index!==null)await client.query('INSERT INTO orio_settlement.receipt_claims VALUES($1,$2,$3)',[ref(index),'monetary',c.id+':'+proof.version]);
      const sequence=postings.length?(await client.query<{sequence:string}>('SELECT sequence::text FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',
        ['monetary:'+c.id+':'+proof.version,ref(proof.checkpointLogIndex),'Finalized master reserve replacement; loss/gain disclosed, no mint or conversion fee',JSON.stringify(postings)])).rows[0]!.sequence:null;
      for(const [asset,label,units] of [[oldAsset,'reserve_cash','0'],[oldAsset,'company_cash',migration.previousCompanyUnits],
        [newAsset,'reserve_cash',proof.reserveMasterUnits],[newAsset,'company_cash',proof.companyMasterUnits]]){
        const actual=(await client.query<{units:string}>('SELECT units::text FROM orio_ledger.balances WHERE id=$1',['mon_'+gasDigest([c.id,asset,label])])).rows[0]?.units??'0';
        if(actual!==units)throw new Error('Reserve migration cash does not reconcile');
      }
      const state={...row.state,masterAssetId:newAsset,electionId:`onchain-epoch:${next.registryEpoch}`,masterDecimals:next.masterDecimals,reserveMasterUnits:proof.reserveMasterUnits};
      await client.query('INSERT INTO orio_monetary.executions VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',[c.id,proof.version,proof.operationId,JSON.stringify(proof),JSON.stringify(state),sequence]);
      await client.query('INSERT INTO orio_monetary.master_history VALUES($1,$2,$3::jsonb)',[c.id,next.registryEpoch,JSON.stringify(next)]);
      await client.query('UPDATE orio_monetary.deployments SET version=$2,configuration=$3::jsonb,state=$4::jsonb WHERE id=$1',
        [c.id,proof.version,JSON.stringify(next),JSON.stringify(state)]);
      await client.query('COMMIT');return {journalSequence:sequence,configuration:next};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async importCompanyWithdrawal(input:{transactionHash:string;startLogIndex:string;completionLogIndex:string;asset?:string}){
    const c=this.deployment,request=structuredClone(input),assetAddress=request.asset===undefined?c.master:chainAddress(request.asset);
    const proof=await verifyFinalizedCompanyWithdrawal(this.first,this.second,{...request,...c,master:assetAddress});
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const row=(await client.query<{configuration:MonetaryDeployment}>('SELECT configuration FROM orio_monetary.deployments WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      if(!row||!same(row.configuration,c))throw new Error('Deployment is not initialized');
      const history=await client.query('SELECT 1 FROM orio_monetary.master_history WHERE deployment_id=$1 AND configuration->>\'master\'=$2',[c.id,assetAddress]);
      if(!history.rowCount)throw new Error('Withdrawal asset was never a master of this deployment');
      const prior=(await client.query<{evidence:unknown;journal_sequence:string}>(
        'SELECT evidence,journal_sequence FROM orio_monetary.company_withdrawals WHERE external_ref=$1',[proof.settlementRef])).rows[0];
      if(prior){if(!same(prior.evidence,proof))throw new Error('Company withdrawal idempotency conflict');
        await client.query('COMMIT');return prior.journal_sequence;}
      for(const ref of [proof.startRef,proof.cashRef,proof.settlementRef])await client.query(
        'INSERT INTO orio_settlement.receipt_claims VALUES($1,$2,$3)',[ref,'monetary',c.id+':company-withdrawal']);
      const asset=`erc20:${c.chainId}:${assetAddress}`,cash='mon_'+gasDigest([c.id,asset,'company_cash']),
        distribution='mon_'+gasDigest([c.id,asset,'company_distributions']);
      await client.query('SELECT orio_ledger.create_account($1,$2,$3,$4)',[cash,asset,'debit',false]);
      await client.query('SELECT orio_ledger.create_account($1,$2,$3,$4)',[distribution,asset,'debit',false]);
      const sequence=(await client.query<{sequence:string}>('SELECT sequence::text FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',
        ['company_withdrawal:'+gasDigest(proof.settlementRef),proof.settlementRef,'Finalized distribution of recognized company fees; reserve untouched',
          JSON.stringify([{accountId:cash,side:'credit',units:proof.units},{accountId:distribution,side:'debit',units:proof.units}])])).rows[0]!.sequence;
      await client.query('INSERT INTO orio_monetary.company_withdrawals VALUES($1,$2,$3::jsonb,$4)',[proof.settlementRef,c.id,JSON.stringify(proof),sequence]);
      await client.query('COMMIT');return sequence;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async importTransfer(input: Omit<ExpectedTokenTransfer,'chainId'|'tokenAddress'>) {
    const c=this.deployment;
    const proof=await verifyFinalizedTokenTransfer(this.first,this.second,{...structuredClone(input),chainId:c.chainId,tokenAddress:c.currency});
    if([proof.senderAddress,proof.recipientAddress].includes('0x'+'0'.repeat(40))) throw new Error('Mint and burn require monetary settlement');
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row=(await client.query<{configuration:MonetaryDeployment}>(
        'SELECT configuration FROM orio_monetary.deployments WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      if(!row||!same(row.configuration,c))throw new Error('Deployment is not initialized');
      const prior=(await client.query<{evidence:unknown;journal_sequence:string|null}>(
        'SELECT evidence,journal_sequence FROM orio_monetary.transfers WHERE external_ref=$1',[proof.settlementRef])).rows[0];
      if(prior){if(!same(prior.evidence,proof))throw new Error('Transfer idempotency conflict');
        await client.query('COMMIT');return prior.journal_sequence;}
      await client.query('INSERT INTO orio_settlement.receipt_claims VALUES($1,$2,$3)',[proof.settlementRef,'monetary',c.id+':transfer']);
      let sequence:string|null=null;
      if(proof.senderAddress!==proof.recipientAddress){
        const asset=`erc20:${c.chainId}:${c.currency}`;
        const accounts=[proof.senderAddress,proof.recipientAddress].map(owner=>'mon_'+gasDigest([c.id,asset,'wallet:'+owner]));
        for(const id of accounts)await client.query('SELECT orio_ledger.create_account($1,$2,$3,$4)',[id,asset,'credit',false]);
        sequence=(await client.query<{sequence:string}>('SELECT sequence::text FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',
          ['monetary_transfer:'+gasDigest(proof.settlementRef),proof.settlementRef,'Finalized ORIO ownership transfer; no conversion fee',
            JSON.stringify([{accountId:accounts[0],side:'debit',units:proof.units},{accountId:accounts[1],side:'credit',units:proof.units}])])).rows[0]!.sequence;
      }
      await client.query('INSERT INTO orio_monetary.transfers VALUES($1,$2,$3::jsonb,$4)',[proof.settlementRef,c.id,JSON.stringify(proof),sequence]);
      await client.query('COMMIT');return sequence;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async import(input: { transactionHash: string; checkpointLogIndex: string; operationId: string; version: string;
    kind: 'PURCHASE'|'REDEMPTION'|'ZERO_SUPPLY_RECONCILIATION'; reconciliation?:ZeroSupplyReconciliation }) {
    const c=this.deployment,request=structuredClone(input);
    const proof=await verifyFinalizedMonetaryExecution(this.first,this.second,{...request,...c});
    if(proof.registryEpoch !== c.registryEpoch) throw new Error('Master election transition requires reconciliation');
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row=(await client.query<{configuration: MonetaryDeployment;version:string;state:MonetaryState}>(
        'SELECT configuration,version::text,state FROM orio_monetary.deployments WHERE id=$1 FOR UPDATE',[c.id])).rows[0];
      if(!row || !same(row.configuration,c)) throw new Error('Deployment is not initialized');
      const prior=(await client.query<{evidence:unknown;journal_sequence:string|null}>(
        'SELECT evidence,journal_sequence FROM orio_monetary.executions WHERE deployment_id=$1 AND version=$2',[c.id,proof.version])).rows[0];
      if(prior) {
        if(!same(prior.evidence,proof)) throw new Error('Monetary execution idempotency conflict');
        await client.query('COMMIT'); return {journalSequence:prior.journal_sequence,version:proof.version};
      }
      if(row.version !== proof.previousVersion) throw new Error('Missing or out-of-order monetary execution');
      // Historical replay checks arithmetic only. Contract finality establishes that the signed
      // valuation was accepted at execution; these synthetic replay times authorize no new action.
      const valuation={masterAssetId:row.state.masterAssetId,electionId:row.state.electionId,
        usd36PerToken:proof.masterUsd36PerToken,evidenceDigest:proof.evidenceDigest.slice(2),issuanceAllowed:true,
        observedAt:'2000-01-01T00:00:00.000Z',expiresAt:'2000-01-01T00:00:02.000Z'};
      const now='2000-01-01T00:00:01.000Z';
      const indexed=proof.allocations.map((allocation,index)=>({allocation,id:index.toString().padStart(6,'0')}));
      const purchases=proof.kind==='PURCHASE' ? indexed.map(({allocation,id})=>{
        if(!('gross' in allocation)) throw new Error('Unexpected purchase allocation');
        return {id,masterUnits:allocation.gross!};
      }) : [];
      const reconciliation=request.reconciliation;
      if(proof.kind==='ZERO_SUPPLY_RECONCILIATION' && (!reconciliation || reconciliation.checkpointDigest!==proof.evidenceDigest.slice(2)))
        throw new Error('Zero-supply reconciliation must match finalized governance checkpoint');
      const plan=proof.kind==='ZERO_SUPPLY_RECONCILIATION' ? {
        next:reconcileZeroSupply(row.state,valuation,reconciliation!,now),allocations:[]
      } : proof.kind==='PURCHASE' ? planPurchaseEpoch(row.state,valuation,purchases,now) :
        planRedemptionEpoch(row.state,valuation,indexed.map(({allocation,id})=>{
          if(!('burned' in allocation)) throw new Error('Unexpected redemption allocation');
          return {id,tokenAtoms:allocation.burned};
        }),now);
      const actual={...row.state,supplyAtoms:proof.supplyAtoms,priceUsd36:{numerator:proof.referencePriceUsd36,denominator:'1'},
        reserveMasterUnits:proof.reserveMasterUnits,roundingUsd36:ratio(BigInt(proof.roundingUsd54),10n**18n),cycle:proof.cycle,
        phase:proof.phase==='1'?'ACTIVE':proof.phase==='2'?'ZERO_SUPPLY_PENDING':proof.phase==='3'?'ZERO_SUPPLY_RECONCILED':'GENESIS'};
      if(!same(actual,plan.next)) throw new Error('Contract and control monetary states disagree');
      for(let i=0;i<indexed.length;i++) {
        const a=indexed[i]!.allocation,p=plan.allocations[i]!;
        if(a.fee!==p.feeMasterUnits || a.company!==p.companyMasterUnits ||
          ('minted' in a ? !('mintedAtoms' in p) || a.minted!==p.mintedAtoms :
            !('payoutMasterUnits' in p) || a.payout!==p.payoutMasterUnits)) throw new Error('Contract allocation differs from monetary engine');
      }
      const accounts=new Map<string,Account>(), amounts=new Map<string,bigint>();
      const post=(label:string,asset:string,normalSide:'debit'|'credit',side:'debit'|'credit',units:bigint)=>{
        if(units===0n)return;
        const id='mon_'+gasDigest([c.id,asset,label]); accounts.set(id,{id,asset,normalSide,allowNegative:false});
        amounts.set(id,(amounts.get(id)??0n)+(side==='debit'?units:-units));
      };
      const masterAsset=`erc20:${c.chainId}:${c.master}`,tokenAsset=`erc20:${c.chainId}:${c.currency}`;
      for(const {allocation:a} of indexed) {
        const company=BigInt(a.company);
        if('gross' in a) {
          const backing=BigInt(a.gross!)-company;
          post('reserve_cash',masterAsset,'debit','debit',backing); post('backing',masterAsset,'credit','credit',backing);
          post('company_cash',masterAsset,'debit','debit',company);post('company_revenue',masterAsset,'credit','credit',company);
          post('issuance',tokenAsset,'debit','debit',BigInt(a.minted!));post('wallet:'+a.owner,tokenAsset,'credit','credit',BigInt(a.minted!));
        } else {
          const released=BigInt(a.payout)+company;
          post('reserve_cash',masterAsset,'debit','credit',released);post('backing',masterAsset,'credit','debit',released);
          post('company_cash',masterAsset,'debit','debit',company);post('company_revenue',masterAsset,'credit','credit',company);
          post('issuance',tokenAsset,'debit','credit',BigInt(a.burned));post('wallet:'+a.owner,tokenAsset,'credit','debit',BigInt(a.burned));
        }
      }
      const previousResidual=BigInt(row.state.roundingUsd36.numerator)*10n**18n/BigInt(row.state.roundingUsd36.denominator);
      const residual=BigInt(proof.roundingUsd54)-previousResidual;
      if(residual<0n)throw new Error('Rounding obligations cannot be released by a conversion');
      post('rounding_control','USD54_MONETARY_MEMO','debit','debit',residual);
      post('restricted_rounding','USD54_MONETARY_MEMO','credit','credit',residual);
      const ref=(index:string)=>`eip155:${c.chainId}/tx:${proof.transactionHash}/log:${index}`;
      const operation=c.id+':'+proof.version;
      for(const index of [proof.checkpointLogIndex,...proof.allocations.flatMap(a=>[a.cashLogIndex,a.tokenLogIndex])])
        await client.query('INSERT INTO orio_settlement.receipt_claims(external_ref,consumer,operation_id) VALUES($1,$2,$3)',[ref(index),'monetary',operation]);
      for(const a of accounts.values()) await client.query('SELECT orio_ledger.create_account($1,$2,$3,$4)',[a.id,a.asset,a.normalSide,false]);
      const postings:Posting[]=[...amounts].filter(([,n])=>n!==0n).map(([accountId,n])=>({accountId,side:n>0n?'debit':'credit',units:(n>0n?n:-n).toString()}));
      const sequence=postings.length ? (await client.query<{sequence:string}>('SELECT sequence::text FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',
        ['monetary:'+operation,ref(proof.checkpointLogIndex),'Finalized '+proof.kind.toLowerCase()+'; segregated monetary reserve and company cash',JSON.stringify(postings)])).rows[0]!.sequence : null;
      for(const [label,units] of [['reserve_cash',proof.reserveMasterUnits],['company_cash',proof.companyMasterUnits]] as const){
        const balance=(await client.query<{units:string}>('SELECT units::text FROM orio_ledger.balances WHERE id=$1',
          ['mon_'+gasDigest([c.id,masterAsset,label])])).rows[0]?.units??'0';
        if(balance!==units)throw new Error('Unreconciled reserve or company cash movement');
      }
      await client.query('INSERT INTO orio_monetary.executions VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
        [c.id,proof.version,proof.operationId,JSON.stringify(proof),JSON.stringify(plan.next),sequence]);
      await client.query('UPDATE orio_monetary.deployments SET version=$2,state=$3::jsonb WHERE id=$1',[c.id,proof.version,JSON.stringify(plan.next)]);
      await client.query('COMMIT');return {journalSequence:sequence,version:proof.version};
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }
}
