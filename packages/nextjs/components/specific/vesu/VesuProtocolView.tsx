import { FC, useEffect, useMemo, useState } from "react";

import { TokenSelectModalStark } from "~~/components/modals/stark/TokenSelectModalStark";
import { useAccount } from "~~/hooks/useAccount";
import type { VesuContext } from "~~/hooks/useLendingAction";
import { useVesuLendingPositions } from "~~/hooks/useVesuLendingPositions";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import type { PositionManager } from "~~/utils/position";

import { POOL_IDS } from "./VesuMarkets";
import { VesuMarketSection } from "./VesuMarketSection";
import { VesuPositionsSection } from "./VesuPositionsSection";
import { calculateNetYieldMetrics } from "~~/utils/netYield";

type BorrowSelectionState = {
  tokens: AssetWithRates[];
  collateralAddress: string;
  vesuContext: VesuContext;
  position: PositionManager;
} | null;

type DepositSelectionState = {
  tokens: AssetWithRates[];
  vesuContext?: VesuContext;
  position?: PositionManager;
} | null;

export const VesuProtocolView: FC = () => {
  const { address: userAddress, status } = useAccount();
  const poolId = POOL_IDS["Genesis"];

  const {
    assetsWithRates,
    suppliablePositions,
    borrowablePositions,
    rows,
    isUpdating,
    hasLoadedOnce,
    isLoadingAssets,
    refetchPositions,
    assetsError,
  } = useVesuLendingPositions(userAddress, poolId);

  const [borrowSelection, setBorrowSelection] = useState<BorrowSelectionState>(null);
  const [depositSelection, setDepositSelection] = useState<DepositSelectionState>(null);
  const [isMarketsOpen, setIsMarketsOpen] = useState(!userAddress);
  const [marketsManuallyToggled, setMarketsManuallyToggled] = useState(false);

  const hasPositions = rows.length > 0;

  const netBalanceUsd = useMemo(() => {
    if (rows.length === 0) {
      return 0;
    }

    let totalSupply = 0;
    let totalDebt = 0;

    rows.forEach(row => {
      totalSupply += row.supply.balance;
      if (row.borrow) {
        totalDebt += Math.abs(row.borrow.balance);
      }
    });

    return totalSupply - totalDebt;
  }, [rows]);

  const supplyPositions = useMemo(() => rows.map(row => row.supply), [rows]);
  const borrowPositions = useMemo(
    () => rows.flatMap(row => (row.borrow ? [row.borrow] : [])),
    [rows],
  );

  const { netYield30d, netApyPercent } = useMemo(
    () =>
      calculateNetYieldMetrics(supplyPositions, borrowPositions, {
        netBalanceOverride: netBalanceUsd,
      }),
    [supplyPositions, borrowPositions, netBalanceUsd],
  );

  const formatCurrency = (amount: number) => {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return formatter.format(amount);
  };

  useEffect(() => {
    if (!userAddress) {
      setIsMarketsOpen(true);
      setMarketsManuallyToggled(false);
      return;
    }

    setMarketsManuallyToggled(false);
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress || marketsManuallyToggled) return;
    setIsMarketsOpen(!hasPositions);
  }, [userAddress, hasPositions, marketsManuallyToggled]);

  useEffect(() => {
    const handler = () => refetchPositions();
    window.addEventListener("txCompleted", handler);
    return () => {
      window.removeEventListener("txCompleted", handler);
    };
  }, [refetchPositions]);

  const handleToggleMarkets = () => {
    setIsMarketsOpen(previous => !previous);
    setMarketsManuallyToggled(true);
  };

  const openDepositModal = (tokens: AssetWithRates[], options?: { vesuContext?: VesuContext; position?: PositionManager }) => {
    if (tokens.length === 0) return;
    setDepositSelection({ tokens, vesuContext: options?.vesuContext, position: options?.position });
  };

  return (
    <div className="flex w-full flex-col space-y-6 p-4">
      <VesuMarketSection
        isOpen={isMarketsOpen}
        onToggle={handleToggleMarkets}
        isLoadingAssets={isLoadingAssets}
        assetsError={assetsError}
        suppliablePositions={suppliablePositions}
        borrowablePositions={borrowablePositions}
        userAddress={userAddress}
        hasPositions={hasPositions}
        netBalanceUsd={netBalanceUsd}
        netYield30d={netYield30d}
        netApyPercent={netApyPercent}
        onDeposit={() => openDepositModal(assetsWithRates)}
        canDeposit={assetsWithRates.length > 0}
        formatCurrency={formatCurrency}
      />

      <VesuPositionsSection
        rows={rows}
        assetsWithRates={assetsWithRates}
        userAddress={userAddress}
        accountStatus={status}
        hasLoadedOnce={hasLoadedOnce}
        isUpdating={isUpdating}
        onBorrowRequest={({ tokens, collateralAddress, vesuContext, position }) =>
          setBorrowSelection({ tokens, collateralAddress, vesuContext, position })
        }
        onDepositRequest={() => openDepositModal(assetsWithRates)}
      />

      {borrowSelection && (
        <TokenSelectModalStark
          isOpen={borrowSelection !== null}
          onClose={() => setBorrowSelection(null)}
          tokens={borrowSelection.tokens}
          protocolName="Vesu"
          collateralAsset={borrowSelection.collateralAddress}
          vesuContext={borrowSelection.vesuContext}
          position={borrowSelection.position}
        />
      )}

      {depositSelection && (
        <TokenSelectModalStark
          isOpen={depositSelection !== null}
          onClose={() => setDepositSelection(null)}
          tokens={depositSelection.tokens}
          protocolName="Vesu"
          vesuContext={depositSelection.vesuContext}
          position={depositSelection.position}
          action="deposit"
        />
      )}
    </div>
  );
};

export default VesuProtocolView;
