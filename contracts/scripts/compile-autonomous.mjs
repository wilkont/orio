import {readFileSync} from 'node:fs';
import solc from 'solc';
// Separate compilation preserves all deployed legacy artifacts and manifests.
export function compileAutonomousContracts(fixtures=false){
 const files=['src/ORIOAutonomousController.sol','src/ORIOAutonomousLocks.sol','src/ORIORuleReserveOracle.sol',
  'src/ORIOWithdrawalClaims.sol','src/ORIOCurrency.sol','src/ORIOReserveVault.sol','src/ORIOBaseSequencerPriceFeed.sol'];
 if(fixtures)files.push('test/AutonomousFixtures.sol');
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
 const sources=Object.fromEntries(files.map(file=>[file,{content:read(file)}]));
 const result=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:1},viaIR:true,evmVersion:'cancun',
  outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}}),{import:path=>
  path.startsWith('@openzeppelin/contracts/')?{contents:read('node_modules/'+path)}:{error:'Unexpected autonomous import'}}));
 const errors=(result.errors??[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
 for(const [file,items] of Object.entries(result.contracts))for(const [name,a] of Object.entries(items))if(file.startsWith('src/')&&
  (a.evm.bytecode.object.length/2>49152||a.evm.deployedBytecode.object.length/2>24576))throw Error(name+' exceeds deployment limits');
 return result.contracts;
}
