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
  const [selectedV1PoolId, setSelectedV1PoolId] = useState<bigint>(VESU_V1_POOLS["Genesis"]);
  const [selectedV2PoolAddress, setSelectedV2PoolAddress] = useState<string>(VESU_V2_POOLS["Default"]);
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
    v1: !userAddress,
    v2: !userAddress,
  }));
  const [marketsManuallyToggled, setMarketsManuallyToggled] = useState(() => ({ v1: false, v2: false }));

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
    Default: useVesuV2LendingPositions(userAddress, normalizeStarknetAddress(VESU_V2_POOLS.Default)),
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
      ...v2All.Default.rows,
      ...v2All.Re7xBTC.rows,
      ...v2All.Re7USDCCore.rows,
      ...v2All.Re7USDCPrime.rows,
      ...v2All.Re7USDCStableCore.rows,
    ];
    return computeMetrics(allRows);
  }, [
    v2All.Default.rows,
    v2All.Re7xBTC.rows,
    v2All.Re7USDCCore.rows,
    v2All.Re7USDCPrime.rows,
    v2All.Re7USDCStableCore.rows,
  ]);

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
            const allow = new Set(suppliablePositionsV1.map(p => p.tokenAddress.toLowerCase()));
            const filtered = assetsWithRatesV1.filter(a =>
              allow.has(`0x${a.address.toString(16).padStart(64, "0")}`.toLowerCase()),
            );
            openDepositModal("v1", filtered);
          }}
          canDeposit={assetsWithRatesV1.length > 0}
          formatCurrency={formatCurrency}
          protocolName="Vesu"
          title="Vesu V1"
          description={`Manage ${getV1PoolNameFromId(selectedV1PoolId)} pool positions`}
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
          if (data.rows.length === 0) return null;
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
                  openDepositModal("v1", filtered);
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
            const allow = new Set(suppliablePositionsV2.map(p => p.tokenAddress.toLowerCase()));
            const filtered = assetsWithRatesV2.filter(a =>
              allow.has(`0x${a.address.toString(16).padStart(64, "0")}`.toLowerCase()),
            );
            openDepositModal("v2", filtered);
          }}
          canDeposit={assetsWithRatesV2.length > 0}
          formatCurrency={formatCurrency}
          protocolName="vesu_v2"
          title="Vesu V2"
          description={`Manage ${getV2PoolNameFromAddress(selectedV2PoolAddress)} pool positions`}
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
        {/* V2 Positions across all pools */}
        {(
          [
            ["Default", v2All.Default] as const,
            ["Re7xBTC", v2All.Re7xBTC] as const,
            ["Re7USDCCore", v2All.Re7USDCCore] as const,
            ["Re7USDCPrime", v2All.Re7USDCPrime] as const,
            ["Re7USDCStableCore", v2All.Re7USDCStableCore] as const,
          ]
        ).map(([rawName, data]) => {
          const disp = getV2PoolDisplay(rawName as any);
          const name = disp.name;
          if (data.rows.length === 0) return null;
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
                  openDepositModal("v2", filtered);
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
