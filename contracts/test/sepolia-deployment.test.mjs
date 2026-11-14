import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Transaction} from 'ethers';
const planUrl=new URL('../../infrastructure/aws/BASE_SEPOLIA_TIMELOCK_PLAN_2026-11-14.json',import.meta.url);
const plan=JSON.parse(readFileSync(planUrl));
test('fixed deployment authorization binds Base Sepolia, creation bytecode, nonce and zero value',()=>{
 const p=plan.transaction,tx=Transaction.from({...p,type:Number(p.type),nonce:Number(p.nonce)});
 assert.equal(tx.unsignedHash,'0x72899bbab0f9257a20a808c60788a982f7ae0315ec3c0b99bbf1a07887d7e0c2');
 assert.equal(tx.chainId,84532n);assert.equal(tx.value,0n);assert.equal(tx.to,null);
 assert.notEqual(Transaction.from({...p,type:2,nonce:0,chainId:8453}).unsignedHash,tx.unsignedHash);
 assert.notEqual(Transaction.from({...p,type:2,nonce:1}).unsignedHash,tx.unsignedHash);
 const template=JSON.parse(readFileSync(new URL('../../infrastructure/aws/protected-timelock-deployment.json',import.meta.url)));
 const code=template.Resources.QualificationFunction.Properties.Code.ZipFile;
 assert.ok(code.includes(tx.unsignedHash.slice(2)));assert.ok(code.includes('event != {}'));
 assert.ok(!Object.values(template.Resources).some(r=>r.Type==='AWS::Lambda::Url'));
});
test('non-monetary challenge proof cannot authorize the deployment',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/submit-sepolia-timelock.ts',import.meta.url)),
  fileURLToPath(planUrl),fileURLToPath(new URL('../../infrastructure/aws/KEY_QUALIFICATION_RESPONSE_2026-11-14.json',import.meta.url))],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/no transaction submitted/);assert.equal(result.stdout,'');
});
