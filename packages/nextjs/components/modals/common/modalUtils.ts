import { Address, encodeAbiParameters } from "viem";

/**
 * Common token info structure used across modal components.
 */
export type ModalTokenInfo = {
  name: string;
  icon: string;
  address: string;
  currentRate: number;
  usdPrice: number;
  decimals: number;
};

/**
 * Creates a token info object for use in modal components.
 * This eliminates the duplicate token prop construction across modals.
 *
 * @param params - Token parameters
 * @returns ModalTokenInfo object
 */
export function buildModalTokenInfo({
  name,
  icon,
  tokenAddress,
  currentRate,
  usdPrice,
  tokenDecimals,
}: {
  name: string;
  icon: string;
  tokenAddress: string;
  currentRate: number;
  usdPrice: number;
  tokenDecimals?: number;
}): ModalTokenInfo {
  return {
    name,
    icon,
    address: tokenAddress,
    currentRate,
    usdPrice,
    decimals: tokenDecimals || 18,
  };
}

/**
 * Encodes context for Compound protocol operations.
 * Compound requires the market address to be ABI-encoded in the context.
 *
 * @param protocolName - Name of the protocol
 * @param tokenAddress - The token/market address
 * @param existingContext - Existing context to use if not Compound
 * @returns Encoded context or existing context
 */
export function encodeCompoundContext(
  protocolName: string,
  tokenAddress: Address,
  existingContext?: string,
): `0x${string}` | undefined {
  if (protocolName.toLowerCase().includes("compound")) {
    return encodeAbiParameters([{ type: "address" }], [tokenAddress]) as `0x${string}`;
  }
  return existingContext as `0x${string}` | undefined;
}

/**
 * Checks if a protocol is a Compound-like protocol.
 */
export function isCompoundProtocol(protocolName: string): boolean {
  return protocolName.toLowerCase().includes("compound");
}
