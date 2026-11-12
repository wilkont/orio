export interface MigrationCheckpoint {
  orioSupplyUnits: string;
  ownershipCommitment: string;
  companyFeeUnits: string;
  holderAllocationUnits: string;
}

export interface ReserveValuation {
  assetId: string;
  units: string;
  usdValueUnits: string;
  evidenceDigest: string;
}

const unitsPattern = /^(0|[1-9][0-9]{0,77})$/;
const digestPattern = /^[0-9a-f]{64}$/;

function units(value: string): bigint {
  if (typeof value !== 'string' || !unitsPattern.test(value))
    throw new Error('Invalid migration quantity');
  return BigInt(value);
}

/**
 * Verifies independently valued, finalized migration evidence before governance
 * may activate a replacement. It does not transfer assets or authorize activation.
 */
export function assessReserveMigration(
  before: MigrationCheckpoint,
  after: MigrationCheckpoint,
  outgoing: ReserveValuation,
  incoming: ReserveValuation,
  liabilitiesUsdUnits: string,
) {
  for (const checkpoint of [before, after]) {
    units(checkpoint.orioSupplyUnits);
    units(checkpoint.companyFeeUnits);
    units(checkpoint.holderAllocationUnits);
    if (!digestPattern.test(checkpoint.ownershipCommitment))
      throw new Error('Invalid ownership commitment');
  }
  if (before.orioSupplyUnits !== after.orioSupplyUnits ||
      before.ownershipCommitment !== after.ownershipCommitment)
    throw new Error('Migration changed token supply or ownership');
  if (before.companyFeeUnits !== after.companyFeeUnits ||
      before.holderAllocationUnits !== after.holderAllocationUnits)
    throw new Error('Migration created a user fee or holder allocation');
  for (const reserve of [outgoing, incoming]) {
    if (!reserve.assetId.trim() || !digestPattern.test(reserve.evidenceDigest))
      throw new Error('Missing independently verified reserve evidence');
    units(reserve.units);
    units(reserve.usdValueUnits);
  }
  if (outgoing.assetId === incoming.assetId)
    throw new Error('Replacement asset must differ');
  const previousValue = units(outgoing.usdValueUnits);
  const receivedValue = units(incoming.usdValueUnits);
  const liabilities = units(liabilitiesUsdUnits);
  const loss = previousValue > receivedValue ? previousValue - receivedValue : 0n;
  const deficiency = liabilities > receivedValue ? liabilities - receivedValue : 0n;
  return {
    lossUsdUnits: loss.toString(),
    deficiencyUsdUnits: deficiency.toString(),
    requiresDeficiencyProcedure: deficiency > 0n,
  };
}
