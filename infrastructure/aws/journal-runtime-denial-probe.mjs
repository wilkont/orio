import {journalObservedStartupCorrection,lambdaStartupKey,journalStartupFunctionArn} from './journal-startup-correction.mjs';
export const probeFunctionName='orio-spc-3-journal-denial-probe';
export const probeCode=`import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

def handler(event, context):
    if event != {'version': '1', 'action': 'probe'}:
        return {'version': '1', 'ok': False, 'error': 'FIXED_PROBE_ONLY'}
    client = boto3.client('kms', region_name='us-east-1', endpoint_url='https://kms.us-east-1.amazonaws.com', config=Config(retries={'total_max_attempts': 1}, connect_timeout=3, read_timeout=5))
    try:
        client.decrypt(KeyId='${lambdaStartupKey}', DryRun=True, DryRunModifiers=['IGNORE_CIPHERTEXT'], EncryptionContext={'aws:lambda:FunctionArn': '${journalStartupFunctionArn}'})
        return {'version': '1', 'ok': False, 'error': 'UNEXPECTED_SUCCESS'}
    except ClientError as error:
        code = error.response.get('Error', {}).get('Code', 'UNKNOWN')
        return {'version': '1', 'ok': code == 'AccessDeniedException', 'code': code, 'requestId': error.response.get('ResponseMetadata', {}).get('RequestId'), 'dryRun': True, 'runtimeDenialAttributionVerified': False, 'financialExecutionEnabled': False}
    except Exception:
        return {'version': '1', 'ok': False, 'error': 'PROBE_INCONCLUSIVE'}
    finally:
        client.close()
`;
/** PREPARED ONLY. Isolated temporary role copies only the actual journal's KMS
 * boundary; it gets no database/secret/invocation/signing privileges. A real
 * denial must be attributed to DenyRuntimeCodeDecryption using AWS authorization
 * evidence; generic AccessDenied alone is not proof of that particular guard.
 * Creating this role/function requires specific access approval. No AWS calls.
 */
export function journalRuntimeDenialProbe(source){
 const policy=journalObservedStartupCorrection(source).Resources.JournalRole.Properties.Policies[0].PolicyDocument;
 const crypto=policy.Statement.filter(s=>s.Sid);
 return {AWSTemplateFormatVersion:'2010-09-09',Description:'PREPARED ONLY: temporary fixed KMS dry-run runtime denial probe; no signing, ciphertext or financial operation',
  Conditions:{Target:{'Fn::And':[{'Fn::Equals':[{'Ref':'AWS::AccountId'},'720232346199']},{'Fn::Equals':[{'Ref':'AWS::Region'},'us-east-1']}] }},
  Resources:{
   ProbeLogs:{Type:'AWS::Logs::LogGroup',Condition:'Target',Properties:{LogGroupName:'/aws/lambda/'+probeFunctionName,RetentionInDays:1}},
   ProbeRole:{Type:'AWS::IAM::Role',Condition:'Target',Properties:{RoleName:probeFunctionName,AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Service:'lambda.amazonaws.com'},Action:'sts:AssumeRole'}]},Policies:[{PolicyName:'FixedDryRunOnly',PolicyDocument:{Version:'2012-10-17',Statement:[...crypto,
    {Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:'arn:aws:logs:us-east-1:720232346199:log-group:/aws/lambda/'+probeFunctionName+':*'},
    {Effect:'Deny',Action:['rds-db:*','rds-data:*','secretsmanager:*','lambda:InvokeFunction','sts:AssumeRole'],Resource:'*'}]}}]}},
   ProbeFunction:{Type:'AWS::Lambda::Function',Condition:'Target',DependsOn:'ProbeLogs',Properties:{FunctionName:probeFunctionName,Runtime:'python3.13',Handler:'index.handler',Role:{'Fn::GetAtt':['ProbeRole','Arn']},Timeout:15,MemorySize:128,ReservedConcurrentExecutions:0,Code:{ZipFile:probeCode}}}
  }};
}
