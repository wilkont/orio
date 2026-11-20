import {readFile} from 'node:fs/promises';
import {HttpsReserveReader} from '../../services/control-foundation/src/chain-rpc.ts';
import {inspectSingleMigrationSource} from '../sdk/autonomous-migration.mjs';
try{
 const plan=JSON.parse(await readFile(new URL('../../infrastructure/aws/REMAINING_SEPOLIA_PLAN_2026-11-14.json',import.meta.url),'utf8'));
 const controller=plan.plans.find(p=>p.operationId==='controller');
 const policy={chainId:'84532',controller:controller.predictedAddress,master:plan.testUsdc,codeHashes:{controller:controller.expectedRuntimeCodeHash,master:plan.dependencies.testUsdc.codeHash}};
 for(const name of ['currency','vault']){const child=controller.children.find(c=>c.name===name);policy[name]=child.address;policy.codeHashes[name]=child.expectedRuntimeCodeHash;}
 const result=await inspectSingleMigrationSource(new HttpsReserveReader({sourceId:'base-official-public-sepolia',endpoint:'https://sepolia.base.org',timeoutMs:15000}),policy);
 console.log(JSON.stringify({...result,observedAt:new Date().toISOString(),limits:['Single public RPC source, not dual-provider admission','No target verification, signing, routing, migration, funding or financial activation']},null,2));
}catch{console.log(JSON.stringify({status:'EMPTY_SOURCE_DIAGNOSTIC_BLOCKED',productionQualified:false,financialExecutionEnabled:false}));process.exitCode=1;}
