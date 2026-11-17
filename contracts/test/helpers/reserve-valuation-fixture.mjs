import {Wallet} from 'ethers';
import {initialMonetaryState} from '../../../services/control-foundation/src/monetary-engine.ts';
import {prepareReserveValuation} from '../../sdk/reserve-valuation.mjs';
import {fixtureKeyArn,kmsFixtureClient} from './kms-signing-fixture.mjs';
const addr=i=>'0x'+i.toString(16).padStart(40,'0');
export function reserveFixture(now='1800000000'){
 const one=10n**36n,wallet=new Wallet('0x'+'33'.repeat(32));
 const policy={mode:'qualification',chainId:'84532',controller:addr(1),vault:addr(2),currency:addr(3),registry:addr(4),master:addr(5),gasTreasury:addr(6),
  valuationSigner:wallet.address,masterDecimals:6,controllerRevision:'1',registryEpoch:'1',registryRevision:'4',maximumAgeSeconds:'300',maximumValiditySeconds:'120',
  issuanceMinimumUsd36:(one*995n/1000n).toString(),issuanceMaximumUsd36:(one*1005n/1000n).toString(),maximumPriceDeviationPpm:'20000',
  chainSources:['chain-a','chain-b'],priceSources:['price-a','price-b'],codeHashes:Object.fromEntries(['controller','vault','currency','registry','master'].map(k=>[k,'0x'+'a'.repeat(64)]))};
 const state=initialMonetaryState('erc20:84532:'+addr(5),'onchain-epoch:1',6);
 const snapshot={chainId:'84532',controller:addr(1),vault:addr(2),currency:addr(3),registry:addr(4),master:addr(5),gasTreasury:addr(6),
  valuationSigner:wallet.address,masterDecimals:6,controllerRevision:'1',registryEpoch:'1',registryRevision:'4',blockNumber:'100',blockHash:'0x'+'b'.repeat(64),
  blockTimestamp:now,finalized:true,masterState:'ACTIVE_MASTER',codeHashes:policy.codeHashes,phase:state.phase,cycle:state.cycle,
  supplyAtoms:state.supplyAtoms,reserveMasterUnits:state.reserveMasterUnits,companyMasterUnits:'0',physicalMasterUnits:'0',
  referencePriceUsd36:one.toString(),roundingUsd54:'0',stateVersion:'0'};
 const evidence={deploymentId:'qualification',ledgerVersion:'0',ledgerState:state,companyMasterUnits:'0',
  observations:policy.chainSources.map(sourceId=>({...structuredClone(snapshot),sourceId})),
  prices:policy.priceSources.map(sourceId=>({sourceId,usd36PerToken:one.toString(),observedAt:now,evidenceDigest:'0x'+'c'.repeat(64)}))};
 const signingPolicy={keyArn:fixtureKeyArn,signer:wallet.address,reservePolicy:policy};
 const prepare=()=>prepareReserveValuation(policy,evidence,now);
 const client=beforeSign=>kmsFixtureClient(wallet,beforeSign);
 return {policy,evidence,signingPolicy,prepare,client,wallet,now,one};
}
