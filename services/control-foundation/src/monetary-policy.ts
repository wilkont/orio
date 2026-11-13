/** Founder-confirmed requirements, distinct from proposed economics and execution readiness. */
export function publicMonetaryPolicy() {
  return {
    version: '2026-11-13', financialExecutionEnabled: false,
    releaseReview: { policy: 'owner-accountable-v2', externalReviewRequired: false },
    conversion: { feeBasisPoints: '100', ordinaryCompanyShareBasisPoints: '2000',
      ordinaryHolderShareBasisPoints: '8000', fullRedemptionCompanyShareBasisPoints: '10000',
      purchaseAppreciationBeforeMint: true, redeemedTokensExcluded: true,
      appreciationMintsTokens: false },
    transfer: { protocolFeeBasisPoints: '0', networkFeePaidBy: 'USER' },
    gas: { paidBy: 'USER', appliesTo: ['PURCHASE', 'REDEMPTION', 'TRANSFER', 'OTHER_ONCHAIN'],
      intermediary: 'COMPANY_GAS_TREASURY', userMustHoldEth: false,
      separateFromConversionFee: true, generatesAppreciation: false,
      drawsCustomerMonetaryBacking: false, requiresMaximumAuthorization: true,
      unusedCharge: 'REFUND_OR_CREDIT', liveCollectionEnabled: false },
    precision: { orioDecimals: 18, initialMasterUsdcDecimals: 6 },
    proposals: { genesisPriceUsd: '1.00', genesisEscrow: 'AWAITING_APPROVAL',
      roundingAndDust: 'AWAITING_APPROVAL', residualSupply: 'AWAITING_APPROVAL',
      zeroSupplyReopening: 'AWAITING_APPROVAL' },
  };
}
