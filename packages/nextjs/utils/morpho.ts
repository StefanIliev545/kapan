/**
 * Morpho utility functions
 */

/**
 * Chain ID to Morpho URL chain name mapping
 */
const MORPHO_CHAIN_NAMES: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  10: "optimism",
  137: "polygon",
};

/**
 * Generates a URL to view a market on Morpho's official website
 * 
 * @param chainId - The chain ID (e.g., 8453 for Base)
 * @param marketId - The unique market identifier (0x...)
 * @param collateralSymbol - The collateral token symbol (e.g., "AERO")
 * @param loanSymbol - The loan token symbol (e.g., "USDC")
 * @returns The full URL to the market page, or null if chain is not supported
 * 
 * @example
 * getMorphoMarketUrl(8453, "0xdaa04f...", "AERO", "USDC")
 * // => "https://app.morpho.org/base/market/0xdaa04f.../aero-usdc"
 */
export function getMorphoMarketUrl(
  chainId: number,
  marketId: string,
  collateralSymbol: string,
  loanSymbol: string
): string | null {
  const chainName = MORPHO_CHAIN_NAMES[chainId];
  if (!chainName) return null;

  // Build the slug: lowercase symbols joined by hyphen
  const slug = `${collateralSymbol.toLowerCase()}-${loanSymbol.toLowerCase()}`;

  return `https://app.morpho.org/${chainName}/market/${marketId}/${slug}`;
}

/**
 * Check if a chain is supported by Morpho
 */
export function isMorphoSupportedChain(chainId: number): boolean {
  return chainId in MORPHO_CHAIN_NAMES;
}
