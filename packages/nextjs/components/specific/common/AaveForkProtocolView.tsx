import { FC, useCallback, useMemo, useState } from "react";
import { ProtocolView } from "../../ProtocolView";
import { AaveLike } from "../aave/AaveLike";
import { EModeToggle } from "../aave/EModeToggle";
import { useGatewayWithRiskParams, ViewGatewayContractName } from "~~/hooks/useGatewayContract";
import { useAaveLikeEMode, AaveLikeViewContractName, AaveLikeWriteContractName } from "~~/hooks/useAaveEMode";
import { useAccount } from "wagmi";

export interface AaveForkProtocolConfig {
  protocolName: string;
  protocolIcon: string;
  viewContractName: AaveLikeViewContractName;
  writeContractName: AaveLikeWriteContractName;
}

export interface AaveForkProtocolViewProps {
  chainId?: number;
  enabledFeatures?: { swap?: boolean; move?: boolean };
  config: AaveForkProtocolConfig;
}

/**
 * Shared component for Aave-fork protocol views (Spark, ZeroLend, Aave, etc.)
 * Contains common logic for E-Mode, risk parameters, and position display.
 *
 * This component uses the shared useGatewayWithRiskParams hook to reduce code duplication.
 */
export const AaveForkProtocolView: FC<AaveForkProtocolViewProps> = ({ chainId, enabledFeatures, config }) => {
  const { protocolName, protocolIcon, viewContractName, writeContractName } = config;

  const { address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);

  // Use the shared gateway hook to get contract info and risk parameters
  const { ltvBps, lltvBps, effectiveLltvBps } = useGatewayWithRiskParams(
    viewContractName as ViewGatewayContractName,
    chainId
  );

  const { userEMode, userEModeId } = useAaveLikeEMode(chainId, viewContractName, writeContractName);

  const handleEModeChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // E-Mode header element - compact display for the protocol header
  const eModeHeaderElement = useMemo(() => {
    if (!address) return null;
    return (
      <div className="flex items-center gap-2">
        <EModeToggle
          chainId={chainId}
          onEModeChanged={handleEModeChanged}
          viewContractName={viewContractName}
          writeContractName={writeContractName}
        />
        {userEModeId > 0 && userEMode && (
          <span className="hidden sm:inline text-xs text-primary whitespace-nowrap">
            {userEMode.label} (LTV {(userEMode.ltv / 100).toFixed(0)}%)
          </span>
        )}
      </div>
    );
  }, [address, chainId, handleEModeChanged, userEModeId, userEMode, viewContractName, writeContractName]);

  return (
    <AaveLike chainId={chainId} contractName={viewContractName} key={refreshKey}>
      {({ suppliedPositions, borrowedPositions, forceShowAll, hasLoadedOnce }) => (
        <ProtocolView
          protocolName={protocolName}
          protocolIcon={protocolIcon}
          enabledFeatures={enabledFeatures}
          ltvBps={ltvBps}
          lltvBps={effectiveLltvBps}
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

export default AaveForkProtocolView;
