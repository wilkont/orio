import assert from 'node:assert/strict';
import {Interface,Wallet,keccak256,toUtf8Bytes} from 'ethers';
import {bytesToHex} from '@ethereumjs/util';
import {compileAutonomousContracts} from '../../scripts/compile-autonomous.mjs';
import {createFixture} from './vm.mjs';
export const artifacts=compileAutonomousContracts(true),hash=s=>keccak256(toUtf8Bytes(s));
export const ok=r=>assert.equal(r.execResult.exceptionError,undefined,bytesToHex(r.execResult.returnValue));
export async function autonomousFixture(shared){
 const f=shared??await createFixture(artifacts,84532,false),owner=new Wallet(bytesToHex(f.key));
 async function deploy(file,name,args=[]){
  const a=artifacts[file][name],api=new Interface(a.abi),r=await f.transact('0x'+a.evm.bytecode.object+api.encodeDeploy(args).slice(2));ok(r);
  return {address:r.createdAddress.toString(),api};
 }
 const master=await deploy('test/AutonomousFixtures.sol','AutonomousTestAsset'),first=await deploy('test/AutonomousFixtures.sol','AutonomousTestFeed'),second=await deploy('test/AutonomousFixtures.sol','AutonomousTestFeed');
 const controller=await deploy('src/ORIOAutonomousController.sol','ORIOAutonomousController',[master.address,first.address,second.address,owner.address,60]);
 const child=async(name,getter)=>({address:(await f.read(controller,getter))[0],api:new Interface(artifacts['src/'+name+'.sol'][name].abi)});
 const currency=await child('ORIOCurrency','currency'),vault=await child('ORIOReserveVault','vault'),claims=await child('ORIOWithdrawalClaims','payouts');
 const configuration={id:'autonomous-qualification',chainId:'84532',deploymentBlock:'1',controller:controller.address,currency:currency.address,vault:vault.address,master:master.address,claims:claims.address,companyRecipient:owner.address.toLowerCase(),masterDecimals:6};
 return {...f,master,first,second,controller,currency,vault,claims,configuration,owner};
}
