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

import { VESU_V1_POOLS, VESU_V2_POOLS, getV1PoolNameFromId, getV2PoolNameFromAddress, getV1PoolDisplay, getV2PoolDisplay } from "./pools";
import { VesuMarketSection } from "./VesuMarketSection";
import { VesuPositionsSection } from "./VesuPositionsSection";
import { calculateNetYieldMetrics } from "~~/utils/netYield";
import { useGlobalState } from "~~/services/store/store";
import { formatCurrency } from "~~/utils/formatNumber";

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
  const { viewingAddress, status, isViewingOtherAddress } = useAccount();
  const userAddress = viewingAddress;
  const [selectedV1PoolId, setSelectedV1PoolId] = useState<bigint>(VESU_V1_POOLS["Genesis"]);
  const [selectedV2PoolAddress, setSelectedV2PoolAddress] = useState<string>(VESU_V2_POOLS["Prime"]);
  const normalizedPoolAddress = normalizeStarknetAddress(selectedV2PoolAddress);

  const v1Data = useVesuLendingPositions(userAddress, selectedV1PoolId);
  const v2Data = useVesuV2LendingPositions(userAddress, normalizedPoolAddress);

  const {
    assetsWithRates: assetsWithRatesV1,
    suppliablePositions: suppliablePositionsV1,
    borrowablePositions: borrowablePositionsV1,
    rows: rowsV1,
    isUpdating: _isUpdatingV1,
    hasLoadedOnce: _hasLoadedOnceV1,
    isLoadingAssets: isLoadingAssetsV1,
    refetchPositions: refetchPositionsV1,
    assetsError: assetsErrorV1,
  } = v1Data;

  const {
    assetsWithRates: assetsWithRatesV2,
    suppliablePositions: suppliablePositionsV2,
    borrowablePositions: borrowablePositionsV2,
    rows: rowsV2,
    isUpdating: _isUpdatingV2,
    hasLoadedOnce: _hasLoadedOnceV2,
    isLoadingAssets: isLoadingAssetsV2,
    refetchPositions: refetchPositionsV2,
    assetsError: assetsErrorV2,
  } = v2Data;

  const [borrowSelection, setBorrowSelection] = useState<BorrowSelectionState>(null);
  const [depositSelection, setDepositSelection] = useState<DepositSelectionState>(null);
  const [isMarketsOpen, setIsMarketsOpen] = useState(() => ({
    v1: false,
    v2: false,
  }));

  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  const computeMetrics = (rows: VesuPositionRow[]) => {
    if (rows.length === 0) {
      return { netBalanceUsd: 0, netYield30d: 0, netApyPercent: null as number | null };
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

  const hasPositionsV1 = rowsV1.length > 0;
  const hasPositionsV2 = rowsV2.length > 0;

  // Fetch positions for all V1 pools (for the positions list below)
  const v1All = {
    Genesis: useVesuLendingPositions(userAddress, VESU_V1_POOLS.Genesis),
    CarmineRunes: useVesuLendingPositions(userAddress, VESU_V1_POOLS.CarmineRunes),
    Re7StarknetEcosystem: useVesuLendingPositions(userAddress, VESU_V1_POOLS.Re7StarknetEcosystem),
    Re7xSTRK: useVesuLendingPositions(userAddress, VESU_V1_POOLS.Re7xSTRK),
  } as const;

  // Fetch positions for all V2 pools (for the positions list below)
  const v2All = {
    Prime: useVesuV2LendingPositions(userAddress, normalizeStarknetAddress(VESU_V2_POOLS.Prime)),
    Re7xBTC: useVesuV2LendingPositions(userAddress, normalizeStarknetAddress(VESU_V2_POOLS.Re7xBTC)),
    Re7USDCCore: useVesuV2LendingPositions(userAddress, normalizeStarknetAddress(VESU_V2_POOLS.Re7USDCCore)),
    Re7USDCPrime: useVesuV2LendingPositions(userAddress, normalizeStarknetAddress(VESU_V2_POOLS.Re7USDCPrime)),
    Re7USDCStableCore: useVesuV2LendingPositions(userAddress, normalizeStarknetAddress(VESU_V2_POOLS.Re7USDCStableCore)),
  } as const;

  const { netBalanceUsd: netBalanceUsdV1, netYield30d: netYield30dV1, netApyPercent: netApyPercentV1 } = useMemo(() => {
    const allRows = [
      ...v1All.Genesis.rows,
      ...v1All.CarmineRunes.rows,
      ...v1All.Re7StarknetEcosystem.rows,
      ...v1All.Re7xSTRK.rows,
    ];
    return computeMetrics(allRows);
  }, [
    v1All.Genesis.rows,
    v1All.CarmineRunes.rows,
    v1All.Re7StarknetEcosystem.rows,
    v1All.Re7xSTRK.rows,
  ]);
  const { netBalanceUsd: netBalanceUsdV2, netYield30d: netYield30dV2, netApyPercent: netApyPercentV2 } = useMemo(() => {
    const allRows = [
      ...v2All.Prime.rows,
      ...v2All.Re7xBTC.rows,
      ...v2All.Re7USDCCore.rows,
      ...v2All.Re7USDCPrime.rows,
      ...v2All.Re7USDCStableCore.rows,
    ];
    return computeMetrics(allRows);
  }, [
    v2All.Prime.rows,
    v2All.Re7xBTC.rows,
    v2All.Re7USDCCore.rows,
    v2All.Re7USDCPrime.rows,
    v2All.Re7USDCStableCore.rows,
  ]);

  useEffect(() => {
    if (!userAddress) {
      setIsMarketsOpen({ v1: false, v2: false });
    }
  }, [userAddress]);

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

  useEffect(() => {
    const allRows = [
      ...v1All.Genesis.rows,
      ...v1All.CarmineRunes.rows,
      ...v1All.Re7StarknetEcosystem.rows,
      ...v1All.Re7xSTRK.rows,
      ...v2All.Prime.rows,
      ...v2All.Re7xBTC.rows,
      ...v2All.Re7USDCCore.rows,
      ...v2All.Re7USDCPrime.rows,
      ...v2All.Re7USDCStableCore.rows,
    ];

    const anyDataLoaded = allRows.some(row => row.supply.balance !== 0 || (row.borrow && row.borrow.balance !== 0));
    if (!anyDataLoaded && status !== "connected") {
      return;
    }

    let totalSupplied = 0;
    let totalBorrowed = 0;

    for (const row of allRows) {
      totalSupplied += row.supply.balance;
      if (row.borrow) {
        totalBorrowed += Math.abs(row.borrow.balance);
      }
    }

    setProtocolTotals("Vesu", totalSupplied, totalBorrowed);
  }, [
    setProtocolTotals,
    status,
    v1All.CarmineRunes.rows,
    v1All.Genesis.rows,
    v1All.Re7StarknetEcosystem.rows,
    v1All.Re7xSTRK.rows,
    v2All.Prime.rows,
    v2All.Re7USDCCore.rows,
    v2All.Re7USDCPrime.rows,
    v2All.Re7USDCStableCore.rows,
    v2All.Re7xBTC.rows,
  ]);

  const handleToggleMarkets = (version: VesuVersionKey) => {
    setIsMarketsOpen(previous => ({ ...previous, [version]: !previous[version] }));
  };

  const openDepositModal = (
    version: VesuVersionKey,
    tokens: AssetWithRates[],
    options?: { vesuContext?: VesuContext; position?: PositionManager },
  ) => {
    if (tokens.length === 0 || isViewingOtherAddress) return;
    const zeroCounterpart = normalizeStarknetAddress(0n);
    const inferredContext =
      options?.vesuContext ??
      (version === "v1"
        ? createVesuContextV1(selectedV1PoolId, zeroCounterpart)
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
          onDeposit={() => {
            if (isViewingOtherAddress) return;
            const allow = new Set(suppliablePositionsV1.map(p => p.tokenAddress.toLowerCase()));
            const filtered = assetsWithRatesV1.filter(a =>
              allow.has(`0x${a.address.toString(16).padStart(64, "0")}`.toLowerCase()),
            );
            openDepositModal("v1", filtered);
          }}
          canDeposit={!isViewingOtherAddress && assetsWithRatesV1.length > 0}
          formatCurrency={formatCurrency}
          protocolName="Vesu"
          title="Vesu V1"
          headerExtra={
            <div className="flex items-center gap-2">
              <img src="/logos/vesu.svg" alt="Vesu" className="w-4 h-4" />
              <select
                className="select select-sm select-bordered"
                value={selectedV1PoolId.toString()}
                onChange={e => setSelectedV1PoolId(BigInt(e.target.value))}
              >
                {Object.entries(VESU_V1_POOLS).map(([rawName, id]) => {
                  const disp = getV1PoolDisplay(rawName as any);
                  return (
                    <option key={rawName} value={id.toString()}>
                      {disp.name}
                    </option>
                  );
                })}
              </select>
            </div>
          }
        />
        {!userAddress && (
          <div className="rounded-xl border border-base-300 bg-base-100 p-6 text-center text-base-content/80">
            <h3 className="text-lg font-semibold text-base-content">Connect a wallet to view your Vesu V1 positions</h3>
            <p className="mt-2 text-sm text-base-content/70">
              Connect a Starknet wallet to load your deposits and borrows.
            </p>
          </div>
        )}
        {/* V1 Positions across all pools */}
        {(
          [
            ["Genesis", v1All.Genesis] as const,
            ["CarmineRunes", v1All.CarmineRunes] as const,
            ["Re7StarknetEcosystem", v1All.Re7StarknetEcosystem] as const,
            ["Re7xSTRK", v1All.Re7xSTRK] as const,
          ]
        ).map(([rawName, data]) => {
          const disp = getV1PoolDisplay(rawName as any);
          const name = disp.name;
          const shouldRender = data.rows.length > 0 || rawName === "Genesis";
          if (!shouldRender) return null;
          const metrics = computeMetrics(data.rows);
          return (
            <div key={`v1-${name}`} className="space-y-4">
              <VesuPositionsSection
                title={`${name} Positions`}
                rows={data.rows}
                assetsWithRates={data.assetsWithRates}
                userAddress={userAddress}
                accountStatus={status}
                hasLoadedOnce={data.hasLoadedOnce}
                isUpdating={data.isUpdating}
                onBorrowRequest={({ tokens, collateralAddress, vesuContext, position }) =>
                  setBorrowSelection({ version: "v1", tokens, collateralAddress, vesuContext, position })
                }
                onDepositRequest={() => {
                  const allow = new Set(data.suppliablePositions.map(p => p.tokenAddress.toLowerCase()));
                  const filtered = data.assetsWithRates.filter(a =>
                    allow.has(`0x${a.address.toString(16).padStart(64, "0")}`.toLowerCase()),
                  );
                  if (!isViewingOtherAddress) {
                    openDepositModal("v1", filtered);
                  }
                }}
                protocolName="Vesu"
                netBalanceUsd={metrics.netBalanceUsd}
                netYield30d={metrics.netYield30d}
                netApyPercent={metrics.netApyPercent}
                formatCurrency={formatCurrency}
              />
            </div>
          );
        })}
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
          onDeposit={() => {
            if (isViewingOtherAddress) return;
            const allow = new Set(suppliablePositionsV2.map(p => p.tokenAddress.toLowerCase()));
            const filtered = assetsWithRatesV2.filter(a =>
              allow.has(`0x${a.address.toString(16).padStart(64, "0")}`.toLowerCase()),
            );
            openDepositModal("v2", filtered);
          }}
          canDeposit={!isViewingOtherAddress && assetsWithRatesV2.length > 0}
          formatCurrency={formatCurrency}
          protocolName="vesu_v2"
          title="Vesu V2"
          headerExtra={
            <div className="flex items-center gap-2">
              <img src="/logos/vesu.svg" alt="Vesu" className="w-4 h-4" />
              <select
                className="select select-sm select-bordered"
                value={selectedV2PoolAddress}
                onChange={e => setSelectedV2PoolAddress(e.target.value)}
              >
                {Object.entries(VESU_V2_POOLS).map(([rawName, addr]) => {
                  const disp = getV2PoolDisplay(rawName as any);
                  return (
                    <option key={rawName} value={addr}>
                      {disp.name}
                    </option>
                  );
                })}
              </select>
            </div>
          }
        />
        {!userAddress && (
          <div className="rounded-xl border border-base-300 bg-base-100 p-6 text-center text-base-content/80">
            <h3 className="text-lg font-semibold text-base-content">Connect a wallet to view your Vesu V2 positions</h3>
            <p className="mt-2 text-sm text-base-content/70">
              Connect a Starknet wallet to load your deposits and borrows.
            </p>
          </div>
        )}
        {/* V2 Positions across all pools */}
        {(
          [
            ["Prime", v2All.Prime] as const,
            ["Re7xBTC", v2All.Re7xBTC] as const,
            ["Re7USDCCore", v2All.Re7USDCCore] as const,
            ["Re7USDCPrime", v2All.Re7USDCPrime] as const,
            ["Re7USDCStableCore", v2All.Re7USDCStableCore] as const,
          ]
        ).map(([rawName, data]) => {
          const disp = getV2PoolDisplay(rawName as any);
          const name = disp.name;
          const shouldRender = data.rows.length > 0 || rawName === "Prime";
          if (!shouldRender) return null;
          const metrics = computeMetrics(data.rows);
          return (
            <div key={`v2-${name}`} className="space-y-4">
              <VesuPositionsSection
                title={`${name} Positions`}
                rows={data.rows}
                assetsWithRates={data.assetsWithRates}
                userAddress={userAddress}
                accountStatus={status}
                hasLoadedOnce={data.hasLoadedOnce}
                isUpdating={data.isUpdating}
                onBorrowRequest={({ tokens, collateralAddress, vesuContext, position }) =>
                  setBorrowSelection({ version: "v2", tokens, collateralAddress, vesuContext, position })
                }
                onDepositRequest={() => {
                  const allow = new Set(data.suppliablePositions.map(p => p.tokenAddress.toLowerCase()));
                  const filtered = data.assetsWithRates.filter(a =>
                    allow.has(`0x${a.address.toString(16).padStart(64, "0")}`.toLowerCase()),
                  );
                  if (!isViewingOtherAddress) {
                    openDepositModal("v2", filtered);
                  }
                }}
                protocolName="vesu_v2"
                netBalanceUsd={metrics.netBalanceUsd}
                netYield30d={metrics.netYield30d}
                netApyPercent={metrics.netApyPercent}
                formatCurrency={formatCurrency}
              />
            </div>
          );
        })}
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
