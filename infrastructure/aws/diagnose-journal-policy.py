"""Read-only IAM simulator differential. Never changes a role or invokes KMS.

Run in the existing authorized AWS session. Exit 2 means a contradictory result
was reproduced, not qualification success. Output contains policy metadata only.
"""
import json
import os
import subprocess
import sys

FUNCTION = 'arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-valuation-journal'
KEY = 'arn:aws:kms:us-east-1:720232346199:key/722d2b07-23f1-4fd1-bb4f-baa53d96caff'

def run():
    results = []
    for condition_key in ['lambda:SourceFunctionArn', 'aws:SourceArn']:
        for scoped in [False, True]:
            for operator in ['Null', 'StringEquals', 'ArnEquals']:
                for present in [False, True]:
                    policy = {'Version': '2012-10-17', 'Statement': [
                        {'Effect': 'Allow', 'Action': 'kms:Decrypt', 'Resource': '*'},
                        {'Effect': 'Deny', 'Action': 'kms:Decrypt', 'Resource': '*',
                         'Condition': {operator: {condition_key: 'false' if operator == 'Null' else FUNCTION}}}]}
                    request = {'PolicyInputList': [json.dumps(policy)], 'ActionNames': ['kms:Decrypt'], 'MaxItems': 1000}
                    if scoped:
                        request['ResourceArns'] = [KEY]
                    if present:
                        request['ContextEntries'] = [{'ContextKeyName': condition_key, 'ContextKeyValues': [FUNCTION], 'ContextKeyType': 'string'}]
                    command = ['aws', 'iam', 'simulate-custom-policy', '--cli-input-json', json.dumps(request), '--output', 'json', '--no-cli-pager']
                    response = subprocess.run(command, capture_output=True, text=True, timeout=30,
                                              env={**os.environ, 'AWS_MAX_ATTEMPTS': '1'})
                    if response.returncode:
                        raise RuntimeError('IAM simulation unavailable; no qualification result')
                    data = json.loads(response.stdout)
                    if data.get('IsTruncated') or len(data.get('EvaluationResults', [])) != 1:
                        raise RuntimeError('Unexpected or incomplete simulation result')
                    actual = data['EvaluationResults'][0]['EvalDecision']
                    results.append({'contextKey': condition_key, 'explicitResource': scoped, 'operator': operator,
                                    'contextPresent': present, 'expected': 'explicitDeny' if present else 'allowed',
                                    'actual': actual, 'request': request, 'response': data})
    mismatches = [r for r in results if r['actual'] != r['expected']]
    report = {'version': '1', 'kind': 'IAM_SIMULATOR_DIFFERENTIAL', 'cases': results,
              'mismatches': len(mismatches), 'qualified': not mismatches,
              'liveRuntimeEnforcementVerified': False, 'financialExecutionEnabled': False}
    print(json.dumps(report, indent=2))
    return 2 if mismatches else 0

if __name__ == '__main__':
    sys.exit(run())
