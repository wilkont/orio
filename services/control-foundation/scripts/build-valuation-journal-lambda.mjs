// Local packaging only. No AWS credentials, API calls, deployment or signing.
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(process.argv[2]??'');
if(!process.argv[2]||!output.endsWith('.zip'))throw new Error('Supply an explicit output ZIP filename');
const build=await mkdtemp(join(tmpdir(),'orio-valuation-journal-build-'));
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
 const stage=join(build,'package');await mkdir(join(stage,'config'),{recursive:true});
 const response=await fetch('https://truststore.pki.rds.amazonaws.com/us-east-1/us-east-1-bundle.pem',{redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('RDS public CA unavailable');
 const ca=Buffer.from(await response.arrayBuffer());
 if(sha(ca)!=='b1711d12bae51838581281e23b6cb97b1074016873b4dafc80ed14002462dd77')throw new Error('RDS public CA changed; review required');
 await writeFile(join(stage,'config/rds-ca.pem'),ca);
 const config=join(build,'tsconfig.json');
 await writeFile(config,JSON.stringify({extends:join(root,'tsconfig.json'),compilerOptions:{noEmit:false,newLine:'lf',rewriteRelativeImportExtensions:true,rootDir:join(root,'src'),outDir:join(stage,'src')},include:[join(root,'src/valuation-journal-lambda-entry.ts')]}));
 execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--project',config],{stdio:'inherit'});
 for(const file of ['package.json','package-lock.json'])await writeFile(join(stage,file),(await readFile(join(root,file),'utf8')).replaceAll('\r\n','\n'));
 const userConfig=join(build,'empty-user-config'),globalConfig=join(build,'empty-global-config');
 await writeFile(userConfig,'');await writeFile(globalConfig,'');
 const npmCli=process.platform==='win32'?join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'):resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js');
 execFileSync(process.execPath,[npmCli,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org/','--userconfig='+userConfig,'--globalconfig='+globalConfig],{cwd:stage,stdio:'inherit'});
 // Import the actual compiled entry with pinned CA and production-only modules.
 // Rejected routes cannot reach token generation, AWS or the database.
 execFileSync(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';const {handler}=await import('./src/valuation-journal-lambda-entry.js');assert.equal((await handler({version:'1',action:'sign'})).ok,false);console.log('COMPILED_VALUATION_JOURNAL_ENTRY_SMOKE_PASSED');`],{cwd:stage,stdio:'inherit',env:{AWS_REGION:'us-east-1',AWS_LAMBDA_FUNCTION_NAME:'orio-spc-3-valuation-journal',ORIO_JOURNAL_MODE:'SCOPED_QUALIFICATION_IAM',ORIO_DATABASE_HOST:'orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com',ORIO_DATABASE_NAME:'orio_control',ORIO_DATABASE_USER:'orio_valuation_journal'}});
 await mkdir(resolve(output,'..'),{recursive:true});
 const zip=`import os,sys,zipfile\nroot,out=sys.argv[1:]\nwith zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for base,dirs,files in os.walk(root):\n  dirs.sort()\n  for name in sorted(files):\n   path=os.path.join(base,name)\n   if os.path.islink(path): raise RuntimeError('Symlink in artifact')\n   info=zipfile.ZipInfo(os.path.relpath(path,root).replace(os.sep,'/'),(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16\n   with open(path,'rb') as f:z.writestr(info,f.read())\n`;
 execFileSync(process.platform==='win32'?'python':'python3',['-c',zip,stage,output],{stdio:'inherit'});
 const bytes=await readFile(output);
 const receipt={kind:'ORIO_VALUATION_JOURNAL_LAMBDA_BUILD',sha256:sha(bytes),codeSha256Base64:createHash('sha256').update(bytes).digest('base64'),bytes:bytes.length,handler:'src/valuation-journal-lambda-entry.handler',runtime:'nodejs24.x',databaseAuthority:'THREE_AUTHORITY_SCOPED_FUNCTIONS_ONLY',financialExecutionEnabled:false,lockSha256:sha(await readFile(join(stage,'package-lock.json')))};
 await writeFile(output+'.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await rm(build,{recursive:true,force:true});}
