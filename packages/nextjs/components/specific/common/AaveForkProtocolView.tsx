import { FC, useCallback, useState } from "react";
import { Cog6ToothIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { ProtocolView, ProtocolPosition } from "../../ProtocolView";
import { AaveLike } from "../aave/AaveLike";
import { EModeToggle } from "../aave/EModeToggle";
import { LTVAutomationModal } from "../../modals/LTVAutomationModal";
import { SwapAsset } from "../../modals/SwapModalShell";
import { useGatewayWithRiskParams, ViewGatewayContractName } from "~~/hooks/useGatewayContract";
import { useAaveLikeEMode, AaveLikeViewContractName, AaveLikeWriteContractName } from "~~/hooks/useAaveEMode";
import { useAccount } from "wagmi";
import { useModal } from "~~/hooks/useModal";
import { useADLContracts } from "~~/hooks/useADLOrder";
import { useActiveADL, formatLtvPercent } from "~~/hooks/useConditionalOrders";

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
 * Convert ProtocolPosition to SwapAsset format for ADL modal
 */
function positionToSwapAsset(pos: ProtocolPosition): SwapAsset {
  return {
    symbol: pos.name,
    address: pos.tokenAddress as `0x${string}`,
    decimals: pos.tokenDecimals || 18,
    rawBalance: pos.tokenBalance || 0n,
    balance: Number(pos.tokenBalance || 0n) / 10 ** (pos.tokenDecimals || 18),
    icon: pos.icon,
    price: pos.tokenPrice,
    usdValue: pos.tokenPrice
      ? (Number(pos.tokenBalance || 0n) / 10 ** (pos.tokenDecimals || 18)) * (Number(pos.tokenPrice) / 1e8)
      : undefined,
  };
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
  const adlModal = useModal();

  // Check if ADL is supported on this chain
  const { isSupported: isADLSupported } = useADLContracts(chainId || 1);

  // Check if there's an active ADL order for this protocol
  const { hasActiveADL, activeADL, triggerLtvBps, targetLtvBps } = useActiveADL({
    protocolName,
    chainId: chainId || 1,
  });

  // Use the shared gateway hook to get contract info and risk parameters
  const { ltvBps, effectiveLltvBps } = useGatewayWithRiskParams(viewContractName as ViewGatewayContractName, chainId);

  const { userEMode, userEModeId } = useAaveLikeEMode(chainId, viewContractName, writeContractName);

  const handleEModeChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <AaveLike chainId={chainId} contractName={viewContractName} key={refreshKey}>
      {({ suppliedPositions, borrowedPositions, forceShowAll, hasLoadedOnce }) => {
        // Convert positions to SwapAsset format for ADL modal
        const collateralAssets: SwapAsset[] = suppliedPositions
          .filter(p => p.tokenBalance && p.tokenBalance > 0n)
          .map(positionToSwapAsset);

        const debtPositions = borrowedPositions.filter(p => p.tokenBalance && p.tokenBalance > 0n);
        const hasDebt = debtPositions.length > 0;
        const hasCollateral = collateralAssets.length > 0;
        const selectedDebt = debtPositions[0]; // Use first debt position

        // Calculate total USD values for flash loan config (8 decimals like Chainlink)
        const totalCollateralUsd = collateralAssets.reduce((sum, c) => {
          return sum + BigInt(Math.round((c.usdValue || 0) * 1e8));
        }, 0n);

        const totalDebtUsd = debtPositions.reduce((sum, d) => {
          const balance = Number(d.tokenBalance || 0n) / 10 ** (d.tokenDecimals || 18);
          const price = d.tokenPrice ? Number(d.tokenPrice) / 1e8 : 0;
          return sum + BigInt(Math.round(balance * price * 1e8));
        }, 0n);

        // Build header element with E-Mode and ADL cog
        const headerElement = address ? (
          <div className="flex items-center gap-2">
            <EModeToggle
              chainId={chainId}
              onEModeChanged={handleEModeChanged}
              viewContractName={viewContractName}
              writeContractName={writeContractName}
            />
            {userEModeId > 0 && userEMode && (
              <span className="text-primary hidden whitespace-nowrap text-xs sm:inline">
                {userEMode.label} (LTV {(userEMode.ltv / 100).toFixed(0)}%)
              </span>
            )}
            {/* ADL Settings Cog - only show if ADL is supported and user has debt */}
            {isADLSupported && hasDebt && hasCollateral && (
              <button
                onClick={adlModal.open}
                className={`relative rounded-lg p-1.5 transition-colors ${
                  hasActiveADL
                    ? "text-success hover:text-success/80 hover:bg-success/10"
                    : "text-base-content/50 hover:text-base-content hover:bg-base-200"
                }`}
                title={
                  hasActiveADL && triggerLtvBps && targetLtvBps
                    ? `ADL Active: Triggers at ${formatLtvPercent(triggerLtvBps)} → ${formatLtvPercent(targetLtvBps)}`
                    : "Auto-Deleverage Protection"
                }
              >
                {hasActiveADL ? (
                  <ShieldCheckIcon className="size-4" />
                ) : (
                  <Cog6ToothIcon className="size-4" />
                )}
                {hasActiveADL && (
                  <span className="bg-success absolute -right-0.5 -top-0.5 size-2 rounded-full" />
                )}
              </button>
            )}
          </div>
        ) : null;

        return (
          <>
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
              headerElement={headerElement}
              adlCollateralToken={activeADL?.triggerParams?.collateralToken}
              adlDebtToken={activeADL?.triggerParams?.debtToken}
            />

            {/* ADL Automation Modal */}
            {selectedDebt && (
              <LTVAutomationModal
                isOpen={adlModal.isOpen}
                onClose={adlModal.close}
                protocolName={protocolName}
                chainId={chainId || 1}
                currentLtvBps={Number(ltvBps)}
                liquidationLtvBps={Number(effectiveLltvBps)}
                collateralTokens={collateralAssets}
                debtToken={{
                  address: selectedDebt.tokenAddress,
                  symbol: selectedDebt.name,
                  decimals: selectedDebt.tokenDecimals || 18,
                  balance: selectedDebt.tokenBalance,
                }}
                totalCollateralUsd={totalCollateralUsd}
                totalDebtUsd={totalDebtUsd}
              />
            )}
          </>
        );
      }}
    </AaveLike>
  );
};

export default AaveForkProtocolView;
