export interface MasterElection {
  assetId: string;
  electionId: string;
  state: 'ACTIVE_MASTER' | 'MIGRATING' | 'DEPOSIT_PAUSED' | 'QUARANTINED';
}

export interface EntryQuote {
  electionId: string;
  masterAssetId: string;
  minimumMasterUnits: string;
}

export interface FinalizedMasterReceipt {
  assetId: string;
  vaultId: string;
  units: string;
  settlementRef: string;
}

const positiveUnits = /^[1-9][0-9]{0,77}$/;

/**
 * Accepts an authenticated quote and independently verified, finalized vault receipt.
 * The settlement writer must recheck the election atomically with posting and use
 * settlementRef as the unique economic identity. This check performs no mint or swap.
 */
export function validateMasterEntry(
  election: MasterElection,
  quote: EntryQuote,
  receipt: FinalizedMasterReceipt,
  expectedVaultId: string,
): FinalizedMasterReceipt {
  if (election.state !== 'ACTIVE_MASTER') throw new Error('Master deposits are unavailable');
  if (!election.electionId || quote.electionId !== election.electionId ||
      !election.assetId || quote.masterAssetId !== election.assetId)
    throw new Error('Quote is for a different master election');
  if (receipt.assetId !== election.assetId || !expectedVaultId || receipt.vaultId !== expectedVaultId)
    throw new Error('Receipt does not credit the canonical master reserve');
  if (!receipt.settlementRef.trim()) throw new Error('Missing settlement reference');
  if (typeof receipt.units !== 'string' || typeof quote.minimumMasterUnits !== 'string' ||
      !positiveUnits.test(receipt.units) || !positiveUnits.test(quote.minimumMasterUnits))
    throw new Error('Invalid master units');
  if (BigInt(receipt.units) < BigInt(quote.minimumMasterUnits))
    throw new Error('Master proceeds are below the quoted minimum');
  return { ...receipt };
}
