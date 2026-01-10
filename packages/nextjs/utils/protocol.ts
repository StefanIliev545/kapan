export const getDisplayRate = (protocolName: string, rate: number) => {
  const name = (protocolName || "").toLowerCase();
  // Vesu rates are decimals (e.g., 0.022); Nostra already percent (e.g., 2.2)
  if (name === "vesu") return rate * 100;
  return rate;
};

import { tokenNameToLogo } from "~~/contracts/externalContracts";

// Protocol logo constants to avoid duplication
const AAVE_LOGO = "/logos/aave.svg";
const COMPOUND_LOGO = "/logos/compound.svg";
const MORPHO_LOGO = "/logos/morpho.svg";
const VESU_LOGO = "/logos/vesu.svg";

/**
 * Get the logo URL for a specific protocol
 * Used in move modals to display protocol logos
 */
export const getProtocolLogo = (protocolName: string): string => {
  const protocolLogos: Record<string, string> = {
    // Aave variants
    "Aave V3": AAVE_LOGO,
    "Aave": AAVE_LOGO,
    "aave": AAVE_LOGO,
    "aave-v3": AAVE_LOGO,
    // Compound variants
    "Compound V3": COMPOUND_LOGO,
    "Compound": COMPOUND_LOGO,
    "compound": COMPOUND_LOGO,
    "compound-v3": COMPOUND_LOGO,
    // Venus variants
    "Venus": "/logos/venus.svg",
    "venus": "/logos/venus.svg",
    // ZeroLend variants
    "ZeroLend": "/logos/zerolend.svg",
    "zerolend": "/logos/zerolend.svg",
    // Morpho variants
    "Morpho Blue": MORPHO_LOGO,
    "Morpho": MORPHO_LOGO,
    "morpho-blue": MORPHO_LOGO,
    "morpho": MORPHO_LOGO,
    // Spark variants
    "Spark": "/logos/spark.svg",
    "spark": "/logos/spark.svg",
    // Vesu variants
    "Vesu": VESU_LOGO,
    "VesuV2": VESU_LOGO,
    "vesu_v2": VESU_LOGO,
    "vesu": VESU_LOGO,
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
