# Resource-dependent IAM simulation discrepancy

**Subsequent live resolution:** the approved isolated dry run verified the copied runtime guard using the actual AWS authorization trace; all temporary resources were removed. See [the final live report](JOURNAL_RUNTIME_DENIAL_REPORT_2026-11-18.md). The native simulator inconsistency below remains reproducible; its internal cause is not confirmed. Earlier unverified/pending statements below describe that diagnostic checkpoint.

The repeated read-only reproducer is `python3 infrastructure/aws/diagnose-journal-policy.py` in the existing authorized AWS session. The November 18 native run returned exit status 2: 24 cases, three mismatches, liveRuntimeEnforcementVerified=false. The downloaded full input/response evidence SHA-256 is `335e59b4b8ec2db0a6a7f3b0ed2dcabd7716630967dbcde89a5cc645bfc2165d`; the private local copy matches AWS and is owner/SYSTEM-only. The remote transfer file was removed after verification.

## Minimized result

The policy allows kms:Decrypt on Resource=* and adds an explicit denial conditioned on a supplied lambda:SourceFunctionArn. No deployed role is altered by these simulations.

| Condition and matching function identity | ResourceArns omitted | Exact startup-key ResourceArns supplied |
| --- | --- | --- |
| Null=false | explicitDeny | allowed (unexpected) |
| StringEquals | explicitDeny | allowed (unexpected) |
| ArnEquals | explicitDeny | allowed (unexpected) |

Missing-source-function cases allow under this intentionally minimized diagnostic policy; they are controls, not the full deployed startup policy. Equivalent aws:SourceArn controls deny correctly with matching context in both resource modes. Earlier probes also reproduced the mismatch with an exact resource in the policy, string/stringList context variants, spelling/case variants and a second target service. Changing the condition operator alone does not resolve it.

The initial hypotheses were malformed context/operator input, target-service-specific handling and a deployed policy logic error. Differential tests narrow the observed failure to the simulator's explicitly resource-scoped handling of this context key. The internal AWS implementation cause is not confirmed. Do not relabel this as an unsupported key in general, remove the live denial, broaden Resource to satisfy a test, or treat wildcard-only simulation as verification of the deployed exact-resource permission.

The reproduced simulation problem is isolated; live runtime enforcement remains unverified. AWS expressly recommends checking live behavior because simulator results can differ. A three-resource, dry-run-only live probe is prepared and AWS template validation passed. Its unexecuted CREATE change set is `arn:aws:cloudformation:us-east-1:720232346199:changeSet/orio-fixed-dryrun-proposal-20261118/36b84ecc-a386-4a61-b853-ca87dd39412d`. Native preview verified exactly three Add entries: ProbeFunction, ProbeLogs and ProbeRole. The original journal remains at reserved concurrency zero. No probe resources or new permissions have been deployed.

See [the exact proposed live test](JOURNAL_RUNTIME_DENIAL_PROPOSAL.md). Generic AccessDenied is insufficient: attribute the actual denial to the copied runtime guard before closing that qualification finding. All signing keys remain untouched, and no signing or financial operation occurred during diagnosis.

Sources checked November 18: [AWS simulation API](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html), [context-entry API](https://docs.aws.amazon.com/IAM/latest/APIReference/API_ContextEntry.html), [Lambda source-function identity](https://docs.aws.amazon.com/lambda/latest/dg/permissions-source-function-arn.html). The exact resource-dependent behavior above is observed test evidence, not a documented AWS guarantee.
