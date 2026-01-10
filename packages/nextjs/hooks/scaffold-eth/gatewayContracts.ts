/**
 * Shared gateway contract mapping used by collateral-related hooks.
 * Maps protocol names to their gateway view contract names.
 */

export type GatewayContractName =
  | "AaveGatewayView"
  | "CompoundGatewayView"
  | "VenusGatewayView"
  | "ZeroLendGatewayView"
  | "SparkGatewayView";

/**
 * Maps protocol names (lowercase, no version suffix) to gateway contract names.
 */
export const PROTOCOL_TO_GATEWAY_MAP: Record<string, GatewayContractName> = {
  aave: "AaveGatewayView",
  compound: "CompoundGatewayView",
  venus: "VenusGatewayView",
  zerolend: "ZeroLendGatewayView",
  spark: "SparkGatewayView",
};

/**
 * Normalizes a protocol name by removing version suffix and spaces.
 * @param protocolName - The protocol name (e.g., "Aave V3", "compound")
 * @returns Normalized name (e.g., "aave", "compound")
 */
export function normalizeProtocolName(protocolName: string): string {
  return protocolName
    .toLowerCase()
    .replace(/\s+v\d+$/i, "") // Remove version suffix like "v3"
    .replace(/\s+/g, ""); // Remove all spaces
}

/**
 * Gets the gateway contract name for a given protocol.
 * @param protocolName - The protocol name (e.g., "Aave V3", "compound")
 * @param fallback - Fallback contract name if protocol not found (default: "AaveGatewayView")
 * @returns Gateway contract name
 */
export function getGatewayContractName(
  protocolName: string,
  fallback: GatewayContractName = "AaveGatewayView"
): GatewayContractName {
  const normalized = normalizeProtocolName(protocolName);
  return PROTOCOL_TO_GATEWAY_MAP[normalized] || fallback;
}
