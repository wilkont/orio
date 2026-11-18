import {createHash} from 'node:crypto';
export const lambdaStartupKey='arn:aws:kms:us-east-1:720232346199:key/722d2b07-23f1-4fd1-bb4f-baa53d96caff';
/** Preparation only: no AWS calls. This changes the journal role's startup
 * encryption boundary and requires separate approval before deployment.
 * All signing keys and direct KMS calls remain explicitly denied. */
export function journalStartupCorrection(source){
 const normalized=source.replaceAll('\r\n','\n');
 if(createHash('sha256').update(normalized).digest('hex')!=='f917f4ac277f1c1d9adb449c94c98ec94008d537dcbb1f4cde204ef11cdf8b95')throw Error('Unreviewed journal baseline');
 const template=JSON.parse(normalized);
 const statements=template.Resources.JournalRole.Properties.Policies[0].PolicyDocument.Statement;
 const last=statements.at(-1);
 if(last.Action[0]!=='kms:*')throw Error('Unexpected journal policy');
 last.Action=last.Action.filter(action=>action!=='kms:*');
 statements.push(
  {Sid:'DenyEveryOtherKey',Effect:'Deny',Action:'kms:*',NotResource:lambdaStartupKey},
  {Sid:'DenyOtherStartupKeyOperations',Effect:'Deny',NotAction:'kms:Decrypt',Resource:lambdaStartupKey},
  {Sid:'DenyDirectOrOtherServiceDecryption',Effect:'Deny',Action:'kms:Decrypt',Resource:lambdaStartupKey,
   Condition:{StringNotEquals:{'kms:ViaService':'lambda.us-east-1.amazonaws.com'}}},
  {Sid:'DenyOtherAccountDecryption',Effect:'Deny',Action:'kms:Decrypt',Resource:lambdaStartupKey,
   Condition:{StringNotEquals:{'kms:CallerAccount':'720232346199'}}},
  {Sid:'AllowLambdaManagedStartupDecryption',Effect:'Allow',Action:'kms:Decrypt',Resource:lambdaStartupKey,
   Condition:{StringEquals:{'kms:ViaService':'lambda.us-east-1.amazonaws.com','kms:CallerAccount':'720232346199'}}}
 );
 return template;
}

export const journalStartupFunctionArn='arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-valuation-journal';
/** The actual failed-request authorization trace supplies FunctionArn encryption
 * context but no kms:ViaService. Bind ciphertext to this function and deny
 * runtime-code credentials; the unchanged role trust admits Lambda only.
 * This does not turn caller-supplied encryption context into authentication.
 * No deployment or AWS call is performed here. */
export function journalObservedStartupCorrection(source){
 const template=journalStartupCorrection(source);
 const statements=template.Resources.JournalRole.Properties.Policies[0].PolicyDocument.Statement;
 const route=statements.find(s=>s.Sid==='DenyDirectOrOtherServiceDecryption');
 route.Sid='DenyOtherFunctionCiphertext';
 route.Condition={StringNotEquals:{'kms:EncryptionContext:aws:lambda:FunctionArn':journalStartupFunctionArn}};
 const allow=statements.find(s=>s.Sid==='AllowLambdaManagedStartupDecryption');
 allow.Condition={StringEquals:{'kms:EncryptionContext:aws:lambda:FunctionArn':journalStartupFunctionArn,'kms:CallerAccount':'720232346199'},
  Null:{'lambda:SourceFunctionArn':'true'}};
 statements.push({Sid:'DenyRuntimeCodeDecryption',Effect:'Deny',Action:'kms:Decrypt',Resource:lambdaStartupKey,
  Condition:{Null:{'lambda:SourceFunctionArn':'false'}}});
 return template;
}
