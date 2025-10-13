import { FC, useEffect, useMemo, useState } from "react";

import { TokenSelectModalStark } from "~~/components/modals/stark/TokenSelectModalStark";
import { useAccount } from "~~/hooks/useAccount";
import {
  createVesuContextV1,
  createVesuContextV2,
  normalizeStarknetAddress,
  type VesuContext,
} from "~~/utils/vesu";
import { useVesuLendingPositions } from "~~/hooks/useVesuLendingPositions";
import type { VesuPositionRow } from "~~/hooks/useVesuLendingPositions";
import { useVesuV2LendingPositions } from "~~/hooks/useVesuV2LendingPositions";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import type { PositionManager } from "~~/utils/position";

import { POOL_IDS } from "./VesuMarkets";
import { VesuMarketSection } from "./VesuMarketSection";
import { VesuPositionsSection } from "./VesuPositionsSection";
import { calculateNetYieldMetrics } from "~~/utils/netYield";

type VesuVersionKey = "v1" | "v2";

type BorrowSelectionState = {
  version: VesuVersionKey;
  tokens: AssetWithRates[];
  collateralAddress: string;
  vesuContext: VesuContext;
  position: PositionManager;
} | null;

type DepositSelectionState = {
  version: VesuVersionKey;
  tokens: AssetWithRates[];
  vesuContext?: VesuContext;
  position?: PositionManager;
} | null;

export const VesuProtocolView: FC = () => {
  const { address: userAddress, status } = useAccount();
  const poolId = POOL_IDS["Genesis"];
  const poolAddress = "0x451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5"; // V2 pool address
  const normalizedPoolAddress = normalizeStarknetAddress(poolAddress);

  const v1Data = useVesuLendingPositions(userAddress, poolId);
  const v2Data = useVesuV2LendingPositions(userAddress, normalizedPoolAddress);

  const {
    assetsWithRates: assetsWithRatesV1,
    suppliablePositions: suppliablePositionsV1,
    borrowablePositions: borrowablePositionsV1,
    rows: rowsV1,
    isUpdating: isUpdatingV1,
    hasLoadedOnce: hasLoadedOnceV1,
    isLoadingAssets: isLoadingAssetsV1,
    refetchPositions: refetchPositionsV1,
    assetsError: assetsErrorV1,
  } = v1Data;

  const {
    assetsWithRates: assetsWithRatesV2,
    suppliablePositions: suppliablePositionsV2,
    borrowablePositions: borrowablePositionsV2,
    rows: rowsV2,
    isUpdating: isUpdatingV2,
    hasLoadedOnce: hasLoadedOnceV2,
    isLoadingAssets: isLoadingAssetsV2,
    refetchPositions: refetchPositionsV2,
    assetsError: assetsErrorV2,
  } = v2Data;

  const [borrowSelection, setBorrowSelection] = useState<BorrowSelectionState>(null);
  const [depositSelection, setDepositSelection] = useState<DepositSelectionState>(null);
  const [isMarketsOpen, setIsMarketsOpen] = useState(() => ({
    v1: !userAddress,
    v2: !userAddress,
  }));
  const [marketsManuallyToggled, setMarketsManuallyToggled] = useState(() => ({ v1: false, v2: false }));

  const computeMetrics = (rows: VesuPositionRow[]) => {
    if (rows.length === 0) {
      return { netBalanceUsd: 0, netYield30d: 0, netApyPercent: 0 };
    }

    let totalSupply = 0;
    let totalDebt = 0;

    rows.forEach(row => {
      totalSupply += row.supply.balance;
      if (row.borrow) {
        totalDebt += Math.abs(row.borrow.balance);
      }
    });

    const netBalanceUsd = totalSupply - totalDebt;
    const supplyPositions = rows.map(row => row.supply);
    const borrowPositions = rows.flatMap(row => (row.borrow ? [row.borrow] : []));

    const { netYield30d, netApyPercent } = calculateNetYieldMetrics(supplyPositions, borrowPositions, {
      netBalanceOverride: netBalanceUsd,
    });

    return { netBalanceUsd, netYield30d, netApyPercent };
  };

  const { netBalanceUsd: netBalanceUsdV1, netYield30d: netYield30dV1, netApyPercent: netApyPercentV1 } = useMemo(
    () => computeMetrics(rowsV1),
    [rowsV1],
  );
  const { netBalanceUsd: netBalanceUsdV2, netYield30d: netYield30dV2, netApyPercent: netApyPercentV2 } = useMemo(
    () => computeMetrics(rowsV2),
    [rowsV2],
  );

  const hasPositionsV1 = rowsV1.length > 0;
  const hasPositionsV2 = rowsV2.length > 0;

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
      setIsMarketsOpen({ v1: true, v2: true });
      setMarketsManuallyToggled({ v1: false, v2: false });
      return;
    }

    setMarketsManuallyToggled({ v1: false, v2: false });
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress || marketsManuallyToggled.v1) return;
    const desired = !hasPositionsV1;
    setIsMarketsOpen(prev => (prev.v1 === desired ? prev : { ...prev, v1: desired }));
  }, [userAddress, hasPositionsV1, marketsManuallyToggled.v1]);

  useEffect(() => {
    if (!userAddress || marketsManuallyToggled.v2) return;
    const desired = !hasPositionsV2;
    setIsMarketsOpen(prev => (prev.v2 === desired ? prev : { ...prev, v2: desired }));
  }, [userAddress, hasPositionsV2, marketsManuallyToggled.v2]);

  useEffect(() => {
    const handler = () => {
      refetchPositionsV1();
      refetchPositionsV2();
    };
    window.addEventListener("txCompleted", handler);
    return () => {
      window.removeEventListener("txCompleted", handler);
    };
  }, [refetchPositionsV1, refetchPositionsV2]);

  const handleToggleMarkets = (version: VesuVersionKey) => {
    setIsMarketsOpen(previous => ({ ...previous, [version]: !previous[version] }));
    setMarketsManuallyToggled(previous => ({ ...previous, [version]: true }));
  };

  const openDepositModal = (
    version: VesuVersionKey,
    tokens: AssetWithRates[],
    options?: { vesuContext?: VesuContext; position?: PositionManager },
  ) => {
    if (tokens.length === 0) return;
    const zeroCounterpart = normalizeStarknetAddress(0n);
    const inferredContext =
      options?.vesuContext ??
      (version === "v1"
        ? createVesuContextV1(poolId, zeroCounterpart)
        : createVesuContextV2(normalizedPoolAddress, zeroCounterpart));
    setDepositSelection({ version, tokens, vesuContext: inferredContext, position: options?.position });
  };


  return (
    <div className="flex w-full flex-col space-y-6 p-4">
      <div className="space-y-6">
        <VesuMarketSection
          isOpen={isMarketsOpen.v1}
          onToggle={() => handleToggleMarkets("v1")}
          isLoadingAssets={isLoadingAssetsV1}
          assetsError={assetsErrorV1}
          suppliablePositions={suppliablePositionsV1}
          borrowablePositions={borrowablePositionsV1}
          userAddress={userAddress}
          hasPositions={hasPositionsV1}
          netBalanceUsd={netBalanceUsdV1}
          netYield30d={netYield30dV1}
          netApyPercent={netApyPercentV1}
          onDeposit={() => openDepositModal("v1", assetsWithRatesV1)}
          canDeposit={assetsWithRatesV1.length > 0}
          formatCurrency={formatCurrency}
          protocolName="Vesu"
          title="Vesu V1"
          description="Manage Genesis pool positions"
        />

        <VesuPositionsSection
          title="Genesis Positions"
          rows={rowsV1}
          assetsWithRates={assetsWithRatesV1}
          userAddress={userAddress}
          accountStatus={status}
          hasLoadedOnce={hasLoadedOnceV1}
          isUpdating={isUpdatingV1}
          onBorrowRequest={({ tokens, collateralAddress, vesuContext, position }) =>
            setBorrowSelection({ version: "v1", tokens, collateralAddress, vesuContext, position })
          }
          onDepositRequest={() => openDepositModal("v1", assetsWithRatesV1)}
          protocolName="Vesu"
        />
      </div>

      <div className="space-y-6">
        <VesuMarketSection
          isOpen={isMarketsOpen.v2}
          onToggle={() => handleToggleMarkets("v2")}
          isLoadingAssets={isLoadingAssetsV2}
          assetsError={assetsErrorV2}
          suppliablePositions={suppliablePositionsV2}
          borrowablePositions={borrowablePositionsV2}
          userAddress={userAddress}
          hasPositions={hasPositionsV2}
          netBalanceUsd={netBalanceUsdV2}
          netYield30d={netYield30dV2}
          netApyPercent={netApyPercentV2}
          onDeposit={() => openDepositModal("v2", assetsWithRatesV2)}
          canDeposit={assetsWithRatesV2.length > 0}
          formatCurrency={formatCurrency}
          protocolName="vesu_v2"
          title="Vesu V2"
          description="Manage Prime pool positions"
        />

        <VesuPositionsSection
          title="Prime Positions"
          rows={rowsV2}
          assetsWithRates={assetsWithRatesV2}
          userAddress={userAddress}
          accountStatus={status}
          hasLoadedOnce={hasLoadedOnceV2}
          isUpdating={isUpdatingV2}
          onBorrowRequest={({ tokens, collateralAddress, vesuContext, position }) =>
            setBorrowSelection({ version: "v2", tokens, collateralAddress, vesuContext, position })
          }
          onDepositRequest={() => openDepositModal("v2", assetsWithRatesV2)}
          protocolName="vesu_v2"
        />
      </div>

      {borrowSelection && (
        <TokenSelectModalStark
          isOpen={borrowSelection !== null}
          onClose={() => setBorrowSelection(null)}
          tokens={borrowSelection.tokens}
          protocolName={borrowSelection.version === "v1" ? "Vesu" : "vesu_v2"}
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
          protocolName={depositSelection.version === "v1" ? "Vesu" : "vesu_v2"}
          vesuContext={depositSelection.vesuContext}
          position={depositSelection.position}
          action="deposit"
        />
      )}
    </div>
  );
};

export default VesuProtocolView;
