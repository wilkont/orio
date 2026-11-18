// Synthetic local package qualification. No deployment policy or AWS identity
// is admitted; no API call, credential access, signing or activation occurs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {reserveFixture} from '../test/helpers/reserve-valuation-fixture.mjs';
const build=fileURLToPath(new URL('./build-valuation-worker.mjs',import.meta.url));
const folder=await mkdtemp(join(tmpdir(),'orio-worker-package-test-'));
if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('orio-worker-package-test-'))throw Error('Unsafe test path');
try{
 const f=reserveFixture();
 const config={version:'1',mode:'BASE_SEPOLIA_QUALIFICATION',journal:{functionArn:'arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-valuation-journal:1'},signingPolicy:f.signingPolicy};
 const text=JSON.stringify(config),hash=createHash('sha256').update(text).digest('hex'),input=join(folder,'synthetic-configuration.json');
 await writeFile(input,text);
 // Wrong hash rejects before the build creates an output or runs npm.
 const rejected=spawnSync(process.execPath,[build,input,'0'.repeat(64),join(folder,'rejected.zip')],{encoding:'utf8'});
 assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Unreviewed valuation worker configuration/);
 const first=join(folder,'first.zip'),second=join(folder,'second.zip');
 for(const output of [first,second])execFileSync(process.execPath,[build,input,hash,output],{stdio:'inherit'});
 const a=JSON.parse(await readFile(first+'.json','utf8')),b=JSON.parse(await readFile(second+'.json','utf8'));
 assert.deepEqual(a,b);assert.equal(a.configurationSha256,hash);assert.equal(a.awsCalls,0);assert.equal(a.financialExecutionEnabled,false);
 assert.equal(a.sha256,createHash('sha256').update(await readFile(first)).digest('hex'));
 assert.ok((await readFile(first)).equals(await readFile(second)));
 console.log('REPRODUCIBLE_SYNTHETIC_WORKER_PACKAGE_PASSED');
}finally{await rm(folder,{recursive:true,force:true});}
