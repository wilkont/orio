import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {journalRuntimeDenialProbe,probeCode} from '../../infrastructure/aws/journal-runtime-denial-probe.mjs';
import {journalObservedStartupCorrection} from '../../infrastructure/aws/journal-startup-correction.mjs';
test('temporary denial probe copies the exact KMS boundary without database, key-enablement or caller grants',async()=>{
 const source=await readFile(new URL('../../infrastructure/aws/valuation-journal-private-lambda.json',import.meta.url),'utf8');
 const p=journalRuntimeDenialProbe(source),r=p.Resources;
 assert.equal(Object.keys(r).length,3);assert.equal(r.ProbeFunction.Properties.ReservedConcurrentExecutions,0);
 const expected=journalObservedStartupCorrection(source).Resources.JournalRole.Properties.Policies[0].PolicyDocument.Statement.filter(s=>s.Sid);
 assert.deepEqual(r.ProbeRole.Properties.Policies[0].PolicyDocument.Statement.slice(0,expected.length),expected);
 assert.ok(!Object.values(r).some(v=>v.Type==='AWS::Lambda::Permission'||v.Type==='AWS::KMS::Key'));
 assert.ok(!('Environment' in r.ProbeFunction.Properties));assert.ok(!('VpcConfig' in r.ProbeFunction.Properties));
 assert.match(probeCode,/DryRun=True, DryRunModifiers=\['IGNORE_CIPHERTEXT'\]/);
 assert.doesNotMatch(probeCode,/\.sign\(|\.encrypt\(|CiphertextBlob|os\.environ|print\(/);
 assert.match(probeCode,/'runtimeDenialAttributionVerified': False/);
});

test('actual Python probe handler cannot accept caller operations or turn a non-denial into qualified enforcement',()=>{
 const harness=`import sys,types
source=sys.stdin.read()
calls=[]
class ClientError(Exception):
 def __init__(self,code): self.response={'Error':{'Code':code},'ResponseMetadata':{'RequestId':'synthetic-request'}}
class Config:
 def __init__(self,**kw):
  assert kw['retries']=={'total_max_attempts':1}
class Client:
 code='AccessDeniedException'
 def decrypt(self,**kw):
  assert kw['DryRun'] is True and kw['DryRunModifiers']==['IGNORE_CIPHERTEXT']
  assert 'CiphertextBlob' not in kw
  assert kw['KeyId']=='arn:aws:kms:us-east-1:720232346199:key/722d2b07-23f1-4fd1-bb4f-baa53d96caff'
  assert kw['EncryptionContext']=={'aws:lambda:FunctionArn':'arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-valuation-journal'}
  calls.append(kw)
  if self.code=='PARAMETER_ERROR': raise ValueError('Unsupported SDK')
  if self.code=='UNEXPECTED_SUCCESS': return {'Plaintext':b'synthetic-do-not-disclose'}
  raise ClientError(self.code)
 def close(self): calls.append('closed')
client=Client()
def create_client(service,**kw):
 assert service=='kms' and kw['endpoint_url']=='https://kms.us-east-1.amazonaws.com'
 return client
boto=types.ModuleType('boto3');boto.client=create_client
config=types.ModuleType('botocore.config');config.Config=Config
errors=types.ModuleType('botocore.exceptions');errors.ClientError=ClientError
sys.modules.update({'boto3':boto,'botocore':types.ModuleType('botocore'),'botocore.config':config,'botocore.exceptions':errors})
scope={};exec(compile(source,'fixed-probe','exec'),scope)
handler=scope['handler'];event={'version':'1','action':'probe'}
for bad in [None,[],{},dict(event,KeyId='caller-key'),dict(event,action='sign')]:
 assert handler(bad,None)['ok'] is False
assert calls==[]
for code in ['AccessDeniedException','DryRunOperationException','InvalidCiphertextException','PARAMETER_ERROR','UNEXPECTED_SUCCESS']:
 client.code=code;calls.clear();result=handler(event,None)
 assert len(calls)==2 and calls[-1]=='closed'
 assert result['ok'] is (code=='AccessDeniedException')
 assert result.get('runtimeDenialAttributionVerified',False) is False
 assert 'Plaintext' not in str(result) and 'synthetic-do-not-disclose' not in str(result)
print('FIXED_PROBE_EXECUTION_PASSED')
`;
 assert.match(execFileSync(process.platform==='win32'?'python':'python3',['-c',harness],{input:probeCode,encoding:'utf8'}),/FIXED_PROBE_EXECUTION_PASSED/);
});
