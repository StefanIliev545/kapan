import { FC, useMemo, useCallback, useState } from "react";
import { ProtocolView } from "../../ProtocolView";
import { AaveLike } from "./AaveLike";
import { EModeToggle } from "./EModeToggle";
import { useRiskParams } from "~~/hooks/useRiskParams";
import { useAaveEMode } from "~~/hooks/useAaveEMode";
import { useAccount } from "wagmi";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";
import { Address } from "viem";

export const AaveProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({ chainId, enabledFeatures }) => {
  const { address } = useAccount();
  const { data: gateway } = useScaffoldContract({ contractName: "AaveGatewayView", chainId: chainId as any });
  const [refreshKey, setRefreshKey] = useState(0);

  const gatewayAddress = gateway?.address as Address | undefined;

  const { ltvBps, lltvBps } = useRiskParams({
    gateway: gatewayAddress,
    gatewayAbi: gateway?.abi,
    marketOrToken: gatewayAddress,
    user: address as Address | undefined,
    chainId,
  });

  const { userEMode, userEModeId } = useAaveEMode(chainId);

  const lltvValue = useMemo(() => (lltvBps > 0n ? lltvBps : ltvBps), [lltvBps, ltvBps]);

  const handleEModeChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // E-Mode header element - compact display for the protocol header
  const eModeHeaderElement = useMemo(() => {
    if (!address) return null;
    return (
      <div className="flex items-center gap-2">
        <EModeToggle chainId={chainId} onEModeChanged={handleEModeChanged} />
        {userEModeId > 0 && userEMode && (
          <span className="hidden sm:inline text-xs text-primary whitespace-nowrap">
            {userEMode.label} (LTV {(userEMode.ltv / 100).toFixed(0)}%)
          </span>
        )}
      </div>
    );
  }, [address, chainId, handleEModeChanged, userEModeId, userEMode]);

  return (
    <AaveLike chainId={chainId} contractName="AaveGatewayView" key={refreshKey}>
      {({ suppliedPositions, borrowedPositions, forceShowAll, hasLoadedOnce }) => (
        <ProtocolView
          protocolName="Aave V3"
          protocolIcon="/logos/aave.svg"
          enabledFeatures={enabledFeatures}
          ltvBps={ltvBps}
          lltvBps={lltvValue}
          suppliedPositions={suppliedPositions}
          borrowedPositions={borrowedPositions}
          forceShowAll={forceShowAll}
          networkType="evm"
          chainId={chainId}
          autoExpandOnPositions
          hasLoadedOnce={hasLoadedOnce}
          headerElement={eModeHeaderElement}
        />
      )}
    </AaveLike>
  );
};

export default AaveProtocolView;
