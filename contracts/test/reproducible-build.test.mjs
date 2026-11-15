import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {compileContracts} from '../scripts/compile.mjs';
test('LF and CRLF checkouts compile to identical creation and runtime bytecode',()=>{
 const lf=url=>readFileSync(url,'utf8').replace(/\r\n?/g,'\n');
 const first=compileContracts(false,lf),second=compileContracts(false,url=>lf(url).replaceAll('\n','\r\n'));
 for(const [source,contracts] of Object.entries(first))for(const [name,artifact] of Object.entries(contracts)){
  assert.equal(second[source][name].evm.bytecode.object,artifact.evm.bytecode.object,source+':'+name+' creation');
  assert.equal(second[source][name].evm.deployedBytecode.object,artifact.evm.deployedBytecode.object,source+':'+name+' runtime');
 }
});
