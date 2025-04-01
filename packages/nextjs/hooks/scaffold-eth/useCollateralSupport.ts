import { useEffect, useState } from "react";
import { useScaffoldReadContract } from "./useScaffoldReadContract";

interface CollateralSupportResult {
  isLoading: boolean;
  supportedCollaterals: Record<string, boolean>; // Address -> supported mapping
}

/**
 * Hook to check which collaterals are supported in a target protocol
 * @param protocolName The target protocol name
 * @param marketAddress The market token address
 * @param collateralAddresses List of collateral addresses to check
 * @returns Object containing loading state and map of collateral addresses to support status
 */
export const useCollateralSupport = (
  protocolName: string,
  marketAddress: string,
  collateralAddresses: string[],
  enabled: boolean,
): CollateralSupportResult => {
  const [supportedCollaterals, setSupportedCollaterals] = useState<Record<string, boolean>>({});

  // Get all supported collaterals for the target protocol
  const { data: supportedCollateralsList, isLoading } = useScaffoldReadContract({
    contractName: "RouterGateway",
    functionName: "getSupportedCollaterals",
    args: [protocolName.toLowerCase(), marketAddress],
    query: {
      enabled,
    },
  });

  // Process the collateral support data
  useEffect(() => {
    // Skip if no data or no addresses to check
    if (!supportedCollateralsList || collateralAddresses.length === 0) {
      return;
    }

    // Create a set of lowercase supported addresses for efficient lookups
    const supportedSet = new Set(supportedCollateralsList.map((addr: string) => addr.toLowerCase()));
    // Create a new results object to avoid mutation
    const results: Record<string, boolean> = {};

    // Check if each address is in the supported list
    for (const address of collateralAddresses) {
      const addressLower = address.toLowerCase();
      results[address] = supportedSet.has(addressLower);
    }

    // Only update state if the results differ from current state
    const hasChanges =
      Object.keys(results).some(addr => results[addr] !== supportedCollaterals[addr]) ||
      Object.keys(results).length !== Object.keys(supportedCollaterals).length;

    if (hasChanges) {
      setSupportedCollaterals(results);
    }
  }, [supportedCollateralsList, collateralAddresses, supportedCollaterals]);

  return { isLoading, supportedCollaterals };
};
