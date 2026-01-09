/**
 * SwapRouter Configuration
 *
 * Centralized configuration for swap router availability and adapter info.
 */

import { Address } from "viem";
import { SwapRouterConfig, SwapRouterType, SwapAdapterInfo } from "./types";
import {
  is1inchSupported,
  isPendleSupported,
  isCowProtocolSupported,
  getDefaultSwapRouter,
  getOneInchAdapterInfo,
  getPendleAdapterInfo,
  isPendleToken,
} from "../chainFeatures";

/**
 * Get full swap router configuration for a chain
 */
export function getSwapRouterConfig(chainId: number): SwapRouterConfig {
  const oneInchAvailable = is1inchSupported(chainId);
  const pendleAvailable = isPendleSupported(chainId);
  const cowAvailable = isCowProtocolSupported(chainId);

  const oneInchInfo = getOneInchAdapterInfo(chainId);
  const pendleInfo = getPendleAdapterInfo(chainId);

  const defaultRouter = getDefaultSwapRouter(chainId) || "1inch";

  return {
    oneInchAvailable,
    pendleAvailable,
    cowAvailable,
    oneInchAdapter: oneInchInfo ? {
      address: oneInchInfo.address as Address,
      type: "1inch",
      available: oneInchAvailable,
    } : undefined,
    pendleAdapter: pendleInfo ? {
      address: pendleInfo.address as Address,
      type: "pendle",
      available: pendleAvailable,
    } : undefined,
    defaultRouter: defaultRouter as SwapRouterType,
  };
}

/**
 * Determine the best swap router for a given token pair
 *
 * @param chainId - Chain ID
 * @param sellSymbol - Symbol of the token being sold
 * @param buySymbol - Symbol of the token being bought
 * @param preferredRouter - User's preferred router (if any)
 * @returns The recommended swap router
 */
export function getBestSwapRouterForPair(
  chainId: number,
  sellSymbol: string,
  buySymbol: string,
  preferredRouter?: SwapRouterType
): SwapRouterType {
  const config = getSwapRouterConfig(chainId);

  // If a PT token is involved, prefer Pendle
  const isPTInvolved = isPendleToken(sellSymbol) || isPendleToken(buySymbol);
  if (isPTInvolved && config.pendleAvailable) {
    return "pendle";
  }

  // If user has a preference and it's available, use it
  if (preferredRouter) {
    if (preferredRouter === "1inch" && config.oneInchAvailable) return "1inch";
    if (preferredRouter === "pendle" && config.pendleAvailable) return "pendle";
    if (preferredRouter === "cow" && config.cowAvailable) return "cow";
  }

  // Fall back to default for this chain
  return config.defaultRouter;
}

/**
 * Get the adapter address for a swap router
 */
export function getSwapAdapterAddress(
  chainId: number,
  router: SwapRouterType
): Address | undefined {
  const config = getSwapRouterConfig(chainId);

  switch (router) {
    case "1inch":
      return config.oneInchAdapter?.address;
    case "pendle":
      return config.pendleAdapter?.address;
    case "cow":
      // CoW doesn't use a swap adapter in the same way
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Check if a swap router is available on a chain
 */
export function isSwapRouterAvailable(
  chainId: number,
  router: SwapRouterType
): boolean {
  const config = getSwapRouterConfig(chainId);

  switch (router) {
    case "1inch":
      return config.oneInchAvailable;
    case "pendle":
      return config.pendleAvailable;
    case "cow":
      return config.cowAvailable;
    default:
      return false;
  }
}

/**
 * Get all available swap routers for a chain
 */
export function getAvailableSwapRouters(chainId: number): SwapRouterType[] {
  const config = getSwapRouterConfig(chainId);
  const available: SwapRouterType[] = [];

  if (config.oneInchAvailable) available.push("1inch");
  if (config.pendleAvailable) available.push("pendle");
  if (config.cowAvailable) available.push("cow");

  return available;
}
