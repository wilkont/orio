import { monetaryPolicyId } from './monetary-engine.ts';
/** Founder-approved economics. Economic approval is separate from execution readiness. */
export function publicMonetaryPolicy() {
  return {
    version: monetaryPolicyId, financialExecutionEnabled: false,
    releaseReview: { policy: 'owner-accountable-v2', externalReviewRequired: false },
    conversion: { feeBasisPoints: '100', ordinaryCompanyShareBasisPoints: '2000',
      ordinaryHolderShareBasisPoints: '8000', fullRedemptionCompanyShareBasisPoints: '10000',
      zeroHolderCompanyShareBasisPoints: '10000',
      purchaseAppreciationBeforeMint: true, redeemedTokensExcluded: true,
      appreciationMintsTokens: false },
    transfer: { protocolFeeBasisPoints: '0', networkFeePaidBy: 'USER' },
    gas: { paidBy: 'USER', appliesTo: ['PURCHASE', 'REDEMPTION', 'TRANSFER', 'OTHER_ONCHAIN'],
      intermediary: 'COMPANY_GAS_TREASURY', userMustHoldEth: false,
      separateFromConversionFee: true, generatesAppreciation: false,
      drawsCustomerMonetaryBacking: false, requiresMaximumAuthorization: true,
      unusedCharge: 'REFUND_OR_CREDIT', liveCollectionEnabled: false },
    precision: { orioDecimals: 18, initialMasterUsdcDecimals: 6, internalUsdDecimals: 36 },
    economics: { status: 'FOUNDER_APPROVED', genesisPriceUsd: '1.00', genesisAppreciationEscrow: false,
      residualSupplyEscrow: false, holderShareForAnyPositiveRemainingSupply: true,
      concentrationThresholdChangesAllocation: false, mintRounding: 'FLOOR', payoutRounding: 'FLOOR',
      conversionFeeRounding: 'CEILING_SETTLEMENT_UNIT', companyAllocationRounding: 'FLOOR',
      holderAllocation: 'COLLECTED_FEE_REMAINDER', roundingResiduals: 'SEGREGATED_NOT_COMPANY_REVENUE',
      zeroSupplyReopening: 'RETAIN_LAST_VALID_PRICE_AFTER_RECONCILIATION' },
  };
}
