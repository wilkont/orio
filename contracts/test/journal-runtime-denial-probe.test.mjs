import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
