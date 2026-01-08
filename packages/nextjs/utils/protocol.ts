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
    // Aave variants
    "Aave V3": "/logos/aave.svg",
    "Aave": "/logos/aave.svg",
    "aave": "/logos/aave.svg",
    "aave-v3": "/logos/aave.svg",
    // Compound variants
    "Compound V3": "/logos/compound.svg",
    "Compound": "/logos/compound.svg",
    "compound": "/logos/compound.svg",
    "compound-v3": "/logos/compound.svg",
    // Venus variants
    "Venus": "/logos/venus.svg",
    "venus": "/logos/venus.svg",
    // ZeroLend variants
    "ZeroLend": "/logos/zerolend.svg",
    "zerolend": "/logos/zerolend.svg",
    // Morpho variants
    "Morpho Blue": "/logos/morpho.svg",
    "Morpho": "/logos/morpho.svg",
    "morpho-blue": "/logos/morpho.svg",
    "morpho": "/logos/morpho.svg",
    // Spark variants
    "Spark": "/logos/spark.svg",
    "spark": "/logos/spark.svg",
    // Vesu variants
    "Vesu": "/logos/vesu.svg",
    "VesuV2": "/logos/vesu.svg",
    "vesu_v2": "/logos/vesu.svg",
    "vesu": "/logos/vesu.svg",
    // Nostra variants
    "Nostra": "/logos/nostra.svg",
    "nostra": "/logos/nostra.svg",
  };
  
  return protocolLogos[protocolName] || tokenNameToLogo(protocolName);
};

/**
 * Normalize protocol names for comparison purposes.
 * Removes spaces, hyphens and underscores and lowercases the result.
 */
export const normalizeProtocolName = (name: string): string =>
  name.toLowerCase().replace(/[\s-_]/g, "");
