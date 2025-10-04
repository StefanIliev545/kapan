export const getDisplayRate = (protocolName: string, rate: number) => {
  const name = (protocolName || "").toLowerCase();
  // Vesu rates are decimals (e.g., 0.022); Nostra already percent (e.g., 2.2)
  if (name === "vesu") return rate * 100;
  return rate;
};

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
    "Vesu": "/logos/vesu.svg",
    "VesuV2": "/logos/vesu.svg",
    "Nostra": "/logos/nostra.svg",
  };
  
  return protocolLogos[protocolName] || tokenNameToLogo(protocolName);
};

/**
 * Normalize protocol names for comparison purposes.
 * Removes spaces, hyphens and underscores and lowercases the result.
 */
export const normalizeProtocolName = (name: string): string =>
  name.toLowerCase().replace(/[\s-_]/g, "");