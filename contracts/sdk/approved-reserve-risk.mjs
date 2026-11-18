import policy from '../../services/control-foundation/config/approved-reserve-risk-policy.json' with {type:'json'};

if(policy.id!=='orio-reserve-risk-2026-11-17-v1'||policy.status!=='FOUNDER_APPROVED_FOR_IMPLEMENTATION'||
 policy.financialExecutionEnabled!==false||policy.liveSourcesAdmitted!==false||policy.valuationSelection!=='LOWER_ACCEPTABLE_PRICE')
 throw Error('Approved reserve risk policy is unavailable');
/** Approved risk ceilings only. Identity/source configuration stays explicit,
 * and this object creates no financial release, source admission or custody. */
export const approvedReserveRiskLimits=Object.freeze({riskPolicyId:policy.id,
 issuanceMinimumUsd36:policy.issuanceMinimumUsd36,issuanceMaximumUsd36:policy.issuanceMaximumUsd36,
 maximumPriceDeviationPpm:policy.maximumPriceDeviationPpm,maximumAgeSeconds:policy.maximumAgeSeconds,
 maximumCheckpointAgeSeconds:policy.maximumCheckpointAgeSeconds,maximumValiditySeconds:policy.maximumValiditySeconds});
