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