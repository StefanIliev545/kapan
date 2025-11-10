import { useMemo } from "react";

import { useCollateral as useStarkCollateral } from "~~/hooks/scaffold-stark/useCollateral";

import { useAccount } from "~~/hooks/useAccount";

export const useStarknetCollateralSupport = (
  fromProtocol: string,
  selectedProtocol: string,
  selectedVersion: "v1" | "v2",
  collaterals: any[],
  isOpen: boolean
) => {
  const { address: starkUserAddress } = useAccount();

  // Determine target protocol name
  const targetProtocolName = useMemo(() => {
    if (selectedProtocol === "Vesu") {
      return selectedVersion === "v2" ? "VesuV2" : "Vesu";
    }
    return selectedProtocol;
  }, [selectedProtocol, selectedVersion]);

  // Fetch target collaterals for the destination protocol
  const { collaterals: targetCollaterals } = useStarkCollateral({
    protocolName: targetProtocolName as "Vesu" | "VesuV2" | "Nostra",
    userAddress: starkUserAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && Boolean(targetProtocolName),
  });

  // Build support map by checking if source collaterals exist in target protocol
  const supportedCollateralMap = useMemo(() => {
    if (!targetCollaterals || targetCollaterals.length === 0) return undefined;

    const targetAddresses = new Set(targetCollaterals.map(tc => tc.address.toLowerCase()));
    const supportMap: Record<string, boolean> = {};

    collaterals.forEach(c => {
      supportMap[c.address.toLowerCase()] = targetAddresses.has(c.address.toLowerCase());
    });

    return supportMap;
  }, [targetCollaterals, collaterals]);

  return {
    supportedCollateralMap,
    targetCollaterals,
    targetProtocolName,
  };
};

