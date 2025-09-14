import { tokenNameToLogo } from "~~/contracts/externalContracts";
/**
 * Get the logo URL for a specific protocol
 * Used in move modals to display protocol logos
 */
export const getProtocolLogo = (protocolName: string): string => {
  const protocolLogos: Record<string, string> = {
    "Aave V3": "/logos/aave.svg",
    "Compound V3": "/logos/compound.svg", 
    "Venus": "/logos/venus.svg",
  };
  
  return protocolLogos[protocolName] || tokenNameToLogo(protocolName);
};

/**
 * Normalize protocol names for comparison purposes.
 * Removes spaces, hyphens and underscores and lowercases the result.
 */
export const normalizeProtocolName = (name: string): string =>
  name.toLowerCase().replace(/[\s-_]/g, "");