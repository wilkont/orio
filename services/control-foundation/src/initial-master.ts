import selected from '../config/initial-master.json' with { type: 'json' };

/** Initial selection metadata for governance review. Runtime settlement uses the active election. */
export function initialMasterAsset(chainId: number) {
  if (chainId !== 8453 && chainId !== 84532) throw new Error('Unsupported initial master chain');
  const tokenAddress = selected.contracts[chainId];
  return {
    assetId: `eip155:${chainId}/erc20:${tokenAddress}`,
    issuer: selected.issuer,
    symbol: selected.symbol,
    chainId,
    tokenAddress,
    decimals: selected.decimals,
  };
}
