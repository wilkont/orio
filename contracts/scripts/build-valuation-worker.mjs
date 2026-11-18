// Local packaging only: no AWS calls, credentials, provisioning or signing.
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createValuationWorkerLambda} from '../sdk/valuation-worker-lambda.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const [configurationPath,expectedSha256,outputPath]=process.argv.slice(2);
if(!configurationPath||!outputPath||!outputPath.endsWith('.zip'))throw Error('Supply explicit configuration, reviewed SHA256 and new output ZIP paths');
const configuration=await readFile(resolve(configurationPath),'utf8');
createValuationWorkerLambda(configuration,expectedSha256); // Constructor does not call AWS.
const parsed=JSON.parse(configuration);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
if(!exact(parsed.journal,['functionArn'])||!exact(parsed.signingPolicy,['keyArn','signer','reservePolicy']))throw Error('Unexpected runtime configuration fields');
const fields=['riskPolicyId','issuanceMinimumUsd36','issuanceMaximumUsd36','maximumPriceDeviationPpm','maximumAgeSeconds','maximumCheckpointAgeSeconds','maximumValiditySeconds',
 'mode','chainId','controller','vault','currency','registry','master','gasTreasury','valuationSigner','masterDecimals','controllerRevision','registryEpoch','registryRevision','chainSources','priceSources','codeHashes'];
const reserve=parsed.signingPolicy.reservePolicy;
if(!exact(reserve,fields)||!exact(reserve.codeHashes,['controller','vault','currency','registry','master']))throw Error('Unexpected reserve configuration fields');
for(const sources of [reserve.chainSources,reserve.priceSources])if(!Array.isArray(sources)||sources.length!==2||new Set(sources).size!==2||
 sources.some(s=>typeof s!=='string'||!/^[A-Za-z0-9:_-]{1,128}(?![\s\S])/.test(s)))throw Error('Only source identifiers belong in the runtime policy');
const output=resolve(outputPath),build=await mkdtemp(join(tmpdir(),'orio-valuation-worker-'));
if(dirname(build)!==resolve(tmpdir())||!basename(build).startsWith('orio-valuation-worker-'))throw Error('Unsafe temporary build path');
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
 const stage=join(build,'package'),sdk=join(stage,'contracts/sdk'),control=join(stage,'services/control-foundation');
 await mkdir(sdk,{recursive:true});await mkdir(join(control,'src'),{recursive:true});await mkdir(join(control,'config'),{recursive:true});
 for(const name of ['valuation-worker-lambda','lambda-valuation-journal','aws-kms-valuation-signer','aws-kms-gas-signer','gas-permit','reserve-valuation','approved-reserve-risk']){
  const source=(await readFile(join(root,'contracts/sdk',name+'.mjs'),'utf8')).replaceAll('\r\n','\n')
   .replaceAll("../../services/control-foundation/src/gas-policy.ts'","../../services/control-foundation/src/gas-policy.js'")
   .replaceAll("../../services/control-foundation/src/monetary-engine.ts'","../../services/control-foundation/src/monetary-engine.js'");
  await writeFile(join(sdk,name+'.mjs'),source);
 }
 const service=join(root,'services/control-foundation');
 execFileSync(process.execPath,[join(service,'node_modules/typescript/bin/tsc'),'--ignoreConfig','--strict','--skipLibCheck','--target','ES2023','--module','NodeNext','--moduleResolution','NodeNext',
  '--types','node','--typeRoots',join(service,'node_modules/@types'),'--rewriteRelativeImportExtensions','--rootDir',join(service,'src'),'--outDir',join(control,'src'),'--newLine','lf',join(service,'src/monetary-engine.ts')],{stdio:'inherit'});
 await writeFile(join(control,'config/approved-reserve-risk-policy.json'),(await readFile(join(service,'config/approved-reserve-risk-policy.json'),'utf8')).replaceAll('\r\n','\n'));
 for(const name of ['package.json','package-lock.json'])await writeFile(join(stage,name),(await readFile(join(root,'packages/valuation-worker',name),'utf8')).replaceAll('\r\n','\n'));
 const userConfig=join(build,'empty-user-config'),globalConfig=join(build,'empty-global-config');await writeFile(userConfig,'');await writeFile(globalConfig,'');
 const npmCli=process.platform==='win32'?join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'):resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
 execFileSync(process.execPath,[npmCli,'ci','--ignore-scripts','--omit=dev','--no-audit','--no-fund','--registry=https://registry.npmjs.org/','--userconfig='+userConfig,'--globalconfig='+globalConfig],{cwd:stage,stdio:'inherit'});
 await writeFile(join(stage,'configuration.json'),configuration);
 await writeFile(join(stage,'index.mjs'),`import {readFileSync} from 'node:fs';\nimport {createValuationWorkerLambda} from './contracts/sdk/valuation-worker-lambda.mjs';\nexport const handler=createValuationWorkerLambda(readFileSync(new URL('./configuration.json',import.meta.url),'utf8'),'${expectedSha256}');\n`);
 execFileSync(process.execPath,['--input-type=module','-e',"import assert from 'node:assert/strict';const {handler}=await import('./index.mjs');assert.equal((await handler({version:'1',action:'sign',digest:'0x00'})).ok,false);console.log('PACKAGED_VALUATION_WORKER_REJECTION_PASSED');"],{cwd:stage,stdio:'inherit',env:{}});
 await mkdir(dirname(output),{recursive:true});
 const zip="import os,sys,zipfile\nroot,out=sys.argv[1:]\nwith zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for base,dirs,files in os.walk(root):\n  dirs.sort()\n  for name in sorted(files):\n   path=os.path.join(base,name)\n   if os.path.islink(path):raise RuntimeError('Symlink in runtime package')\n   info=zipfile.ZipInfo(os.path.relpath(path,root).replace(os.sep,'/'),(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16\n   with open(path,'rb') as f:z.writestr(info,f.read())\n";
 execFileSync(process.platform==='win32'?'python':'python3',['-c',zip,stage,output],{stdio:'inherit'});
 const bytes=await readFile(output),receipt={kind:'ORIO_VALUATION_WORKER_PACKAGE_ONLY',sha256:sha(bytes),configurationSha256:expectedSha256,bytes:bytes.length,
  handler:'index.handler',runtime:'nodejs24.x',lockSha256:sha(await readFile(join(stage,'package-lock.json'))),awsCalls:0,financialExecutionEnabled:false};
 await writeFile(output+'.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await rm(build,{recursive:true,force:true});}
