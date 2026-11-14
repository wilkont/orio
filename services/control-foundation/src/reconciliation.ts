export interface ReconciliationSnapshot {
  chainId: string;
  finalizedBlockHash: string;
  electionId: string;
  masterAssetId: string;
  vaultId: string;
  supplyUnits: string;
  reserveUnits: string;
}

const unsigned = /^(0|[1-9][0-9]{0,77})$/;
const hash = /^0x[0-9a-f]{64}$/;

function validate(snapshot: ReconciliationSnapshot): void {
  if (!/^[1-9][0-9]*$/.test(snapshot.chainId) || !hash.test(snapshot.finalizedBlockHash) ||
      !snapshot.electionId.trim() || !snapshot.masterAssetId.trim() || !snapshot.vaultId.trim())
    throw new Error('Invalid reconciliation identity');
  if (typeof snapshot.supplyUnits !== 'string' || !unsigned.test(snapshot.supplyUnits) ||
      typeof snapshot.reserveUnits !== 'string' || !unsigned.test(snapshot.reserveUnits))
    throw new Error('Invalid reconciliation quantities');
}

/**
 * Inputs must represent the same independently verified finalized block.
 * Differences require containment. The function never repairs either ledger.
 * Solvency additionally requires independent valuation of reserves and liabilities.
 */
export function reconcileMaster(
  control: ReconciliationSnapshot,
  chain: ReconciliationSnapshot,
): { ok: boolean; differences: Array<keyof ReconciliationSnapshot> } {
  validate(control);
  validate(chain);
  const fields: Array<keyof ReconciliationSnapshot> = [
    'chainId', 'finalizedBlockHash', 'electionId', 'masterAssetId',
    'vaultId', 'supplyUnits', 'reserveUnits',
  ];
  const differences = fields.filter(field => control[field] !== chain[field]);
  return { ok: differences.length === 0, differences };
}
