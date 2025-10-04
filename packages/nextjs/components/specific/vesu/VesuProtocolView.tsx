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
import { useVesuV2LendingPositions } from "~~/hooks/useVesuV2LendingPositions";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import type { PositionManager } from "~~/utils/position";

import { POOL_IDS } from "./VesuMarkets";
import { VesuMarketSection } from "./VesuMarketSection";
import { VesuPositionsSection } from "./VesuPositionsSection";
import { VesuVersionToggle } from "./VesuVersionToggle";
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
  const poolAddress = "0x451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5"; // V2 pool address
  const normalizedPoolAddress = normalizeStarknetAddress(poolAddress);

  const [selectedVersion, setSelectedVersion] = useState<"v1" | "v2">("v1");

  // V1 data
  const v1Data = useVesuLendingPositions(userAddress, poolId);
  
  // V2 data
  const v2Data = useVesuV2LendingPositions(userAddress, normalizedPoolAddress);

  // Use data based on selected version
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
  } = selectedVersion === "v1" ? v1Data : v2Data;

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
    const zeroCounterpart = normalizeStarknetAddress(0n);
    const inferredContext =
      options?.vesuContext ??
      (selectedVersion === "v1"
        ? createVesuContextV1(poolId, zeroCounterpart)
        : createVesuContextV2(normalizedPoolAddress, zeroCounterpart));
    setDepositSelection({ tokens, vesuContext: inferredContext, position: options?.position });
  };


  return (
    <div className="flex w-full flex-col space-y-6 p-4">
      {/* Version Toggle Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Vesu Protocol</h2>
        <VesuVersionToggle
          selectedVersion={selectedVersion}
          onVersionChange={setSelectedVersion}
        />
      </div>

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
        protocolName={selectedVersion === "v1" ? "Vesu" : "vesu_v2"}
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
        protocolName={selectedVersion === "v1" ? "Vesu" : "vesu_v2"}
      />

      {borrowSelection && (
        <TokenSelectModalStark
          isOpen={borrowSelection !== null}
          onClose={() => setBorrowSelection(null)}
          tokens={borrowSelection.tokens}
          protocolName={selectedVersion === "v1" ? "Vesu" : "vesu_v2"}
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
          protocolName={selectedVersion === "v1" ? "Vesu" : "vesu_v2"}
          vesuContext={depositSelection.vesuContext}
          position={depositSelection.position}
          action="deposit"
        />
      )}
    </div>
  );
};

export default VesuProtocolView;
