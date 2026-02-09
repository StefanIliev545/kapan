import type { FC, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";

import { BorrowPosition } from "~~/components/BorrowPosition";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
import { PositionManager } from "~~/utils/position";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import type { VesuPositionRow } from "~~/hooks/useVesuLendingPositions";
import { ClosePositionModalStark } from "~~/components/modals/stark/ClosePositionModalStark";
import { TokenSelectModalStark, type TokenWithRates } from "~~/components/modals/stark/TokenSelectModalStark";
import SwitchTokenSelectModalStark from "~~/components/modals/stark/SwitchTokenSelectModalStark";
import { SwitchDebtModalStark } from "~~/components/modals/stark/SwitchDebtModalStark";
import { SwitchCollateralModalStark } from "~~/components/modals/stark/SwitchCollateralModalStark";
import { feltToString } from "~~/utils/protocols";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { isVesuContextV1, type VesuProtocolKey } from "~~/utils/vesu";
import formatPercentage from "~~/utils/formatPercentage";
import { useModal, useModalWithData } from "~~/hooks/useModal";

interface BorrowSelectionRequest {
  tokens: AssetWithRates[];
  collateralAddress: string;
  vesuContext: VesuPositionRow["borrowContext"];
  position: PositionManager;
}

// Memoized constants for availableActions
const AVAILABLE_ACTIONS_WITH_SWAP = { deposit: true, withdraw: true, move: false, swap: true } as const;
const AVAILABLE_ACTIONS_NO_SWAP = { deposit: true, withdraw: true, move: false, swap: false } as const;
const BORROW_ACTIONS_WITH_DEBT = { borrow: true, repay: true, move: true, close: true, swap: true } as const;
const BORROW_ACTIONS_NO_DEBT = { borrow: true, repay: false, move: false, swap: false, close: false } as const;

/** Resolve a token's display symbol, falling back to address-based lookup */
function resolveTokenSymbol(token: TokenWithRates): string {
  const sym = (token as { symbol?: string | bigint }).symbol;
  const raw = typeof sym === "bigint" ? feltToString(sym) : String(sym ?? "");
  if (raw && raw.trim().length > 0) return raw;
  const addr = `0x${token.address.toString(16).padStart(64, "0")}`;
  return getTokenNameFallback(addr) ?? raw;
}

/** Convert a Starknet asset address to hex string with 0x prefix, padded to 64 chars */
function assetToHex(address: bigint): string {
  return `0x${address.toString(16).padStart(64, "0")}`;
}

/** Check if a swap candidate should be included (not the current collateral or debt) */
function isValidSwapCandidate(
  assetHex: string,
  currentCollateralHex: string,
  currentDebtHex: string | undefined,
): boolean {
  if (assetHex === currentCollateralHex) return false;
  if (assetHex === currentDebtHex) return false;
  return true;
}

/** Derive borrow button tooltip text based on current state */
function getBorrowButtonTitle(
  actionsDisabled: boolean | undefined,
  actionsDisabledReason: string | undefined,
  canInitiateBorrow: boolean,
): string {
  if (actionsDisabled) return actionsDisabledReason ?? "Actions disabled";
  if (canInitiateBorrow) return "Borrow against this collateral";
  return "No borrowable assets available";
}

interface VesuPositionRowItemProps {
  row: VesuPositionRow;
  protocolName: string;
  assetsWithRates: AssetWithRates[];
  expandedRows: Record<string, boolean>;
  toggleRowExpanded: (key: string) => void;
  openSwapSelector: (type: "debt" | "collateral", row: VesuPositionRow) => void;
  openCloseForRow: (row: VesuPositionRow) => void;
  onBorrowRequest: (request: BorrowSelectionRequest) => void;
}

const VesuPositionRowItem: FC<VesuPositionRowItemProps> = ({
  row,
  protocolName,
  assetsWithRates,
  expandedRows,
  toggleRowExpanded,
  openSwapSelector,
  openCloseForRow,
  onBorrowRequest,
}) => {
  const positionManager = useMemo(
    () => PositionManager.fromPositions([row.supply], row.borrow ? [row.borrow] : []),
    [row.supply, row.borrow],
  );

  const ltvDisplayValue = row.ltvPercent != null ? `${formatPercentage(row.ltvPercent, 1)}%` : "--";

  const availableBorrowTokens = useMemo(
    () => assetsWithRates.filter(
      asset => assetToHex(asset.address) !== row.supply.tokenAddress,
    ),
    [assetsWithRates, row.supply.tokenAddress],
  );

  const canInitiateBorrow = !row.hasDebt && Boolean(row.borrowContext) && availableBorrowTokens.length > 0;
  const supportsPoolDependentActions = Boolean(row.borrowContext);
  const borrowButtonDisabled = row.supply.actionsDisabled;

  const handleBorrowFromSupply = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canInitiateBorrow || !row.borrowContext) {
      return;
    }
    onBorrowRequest({
      tokens: availableBorrowTokens,
      collateralAddress: row.supply.tokenAddress,
      vesuContext: row.borrowContext,
      position: positionManager,
    });
  }, [canInitiateBorrow, row.borrowContext, row.supply.tokenAddress, availableBorrowTokens, positionManager, onBorrowRequest]);

  const handleToggleExpanded = useCallback(() => {
    toggleRowExpanded(row.key);
  }, [toggleRowExpanded, row.key]);

  const handleSwapCollateral = useCallback(() => {
    openSwapSelector("collateral", row);
  }, [openSwapSelector, row]);

  const handleSwapDebt = useCallback(() => {
    openSwapSelector("debt", row);
  }, [openSwapSelector, row]);

  const handleClosePosition = useCallback(() => {
    openCloseForRow(row);
  }, [openCloseForRow, row]);

  const extraStats = useMemo(() => [{ label: "LTV", value: ltvDisplayValue }], [ltvDisplayValue]);

  const containerColumns = "grid-cols-1 md:grid-cols-2 md:divide-x";

  const borrowTitle = getBorrowButtonTitle(borrowButtonDisabled, row.supply.actionsDisabledReason, canInitiateBorrow);

  return (
    <div
      key={row.key}
      className="border-base-300 relative overflow-hidden rounded-md border"
    >
      <div className={`divide-base-300 grid divide-y md:divide-y-0 ${containerColumns}`}>
        <SupplyPosition
          {...row.supply}
          protocolName={protocolName}
          networkType="starknet"
          position={positionManager}
          disableMove
          subtitle={row.isVtoken ? "vToken" : undefined}
          containerClassName="rounded-none"
          availableActions={supportsPoolDependentActions ? AVAILABLE_ACTIONS_WITH_SWAP : AVAILABLE_ACTIONS_NO_SWAP}
          onSwap={supportsPoolDependentActions ? handleSwapCollateral : undefined}
          controlledExpanded={!!expandedRows[row.key]}
          onToggleExpanded={handleToggleExpanded}
          extraStats={extraStats}
          showExpandIndicator={false}
        />
        {row.borrow ? (
          <BorrowPosition
            {...row.borrow}
            protocolName={protocolName}
            networkType="starknet"
            position={positionManager}
            containerClassName="rounded-none"
            availableActions={row.hasDebt ? BORROW_ACTIONS_WITH_DEBT : BORROW_ACTIONS_NO_DEBT}
            showNoDebtLabel={!row.hasDebt}
            onClosePosition={row.hasDebt && supportsPoolDependentActions ? handleClosePosition : undefined}
            onSwap={row.hasDebt && supportsPoolDependentActions ? handleSwapDebt : undefined}
            controlledExpanded={!!expandedRows[row.key]}
            onToggleExpanded={handleToggleExpanded}
          />
        ) : (
          <div className="border-base-300 bg-base-200/60 flex h-full items-center justify-between gap-3 border border-dashed p-3">
            <div className="flex flex-col gap-1">
              <span className="text-base-content/70 text-sm font-semibold">No debt</span>
              <span className="text-base-content/50 text-xs">You are not borrowing against this collateral yet.</span>
            </div>
            <button
              className="btn btn-sm btn-outline"
              onClick={handleBorrowFromSupply}
              disabled={!canInitiateBorrow || borrowButtonDisabled}
              title={borrowTitle}
            >
              Borrow
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface VesuPositionsSectionProps {
  rows: VesuPositionRow[];
  assetsWithRates: AssetWithRates[];
  userAddress?: string;
  accountStatus?: string;
  hasLoadedOnce: boolean;
  isUpdating: boolean;
  onBorrowRequest: (request: BorrowSelectionRequest) => void;
  onDepositRequest: () => void;
  protocolName?: string;
  title?: string;
  netBalanceUsd: number;
  netYield30d: number;
  netApyPercent: number | null;
  formatCurrency: (value: number) => string;
}

export const VesuPositionsSection: FC<VesuPositionsSectionProps> = ({
  rows,
  assetsWithRates,
  userAddress,
  accountStatus,
  hasLoadedOnce,
  isUpdating,
  onBorrowRequest,
  onDepositRequest,
  protocolName = "Vesu",
  title = "Your Vesu Positions",
  netBalanceUsd,
  netYield30d,
  netApyPercent,
  formatCurrency,
}) => {
  // Close position modal state - uses useModalWithData for combined open/data state
  type CloseParams = {
    collateral: { name: string; address: string; decimals: number; icon: string };
    debt: { name: string; address: string; decimals: number; icon: string };
    collateralBalance: bigint;
    debtBalance: bigint;
    poolKey: string;
    protocolKey: VesuProtocolKey;
  };
  const closeModal = useModalWithData<CloseParams>();

  const openCloseForRow = useCallback((row: VesuPositionRow) => {
    if (!row.borrow || !row.borrowContext) {
      return;
    }
    closeModal.openWithData({
      collateral: {
        name: row.supply.name,
        address: row.supply.tokenAddress,
        decimals: row.supply.tokenDecimals ?? 18,
        icon: row.supply.icon,
      },
      debt: {
        name: row.borrow.name,
        address: row.borrow.tokenAddress,
        decimals: row.borrow.tokenDecimals ?? 18,
        icon: row.borrow.icon,
      },
      collateralBalance: row.supply.tokenBalance,
      debtBalance: row.borrow.tokenBalance,
      poolKey: row.poolKey,
      protocolKey: row.protocolKey,
    });
  }, [closeModal]);

  // Swap state (debt or collateral) - using consolidated modal hooks
  const swapSelectModal = useModal();
  const switchDebtModal = useModal();
  const switchCollateralModal = useModal();
  const [swapType, setSwapType] = useState<"debt" | "collateral" | null>(null);
  const [swapRow, setSwapRow] = useState<VesuPositionRow | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<TokenWithRates | null>(null);
  const useNewSelector = true;

  const formatSignedPercentage = (value: number) => {
    const formatted = formatPercentage(Math.abs(value));
    return `${value >= 0 ? "" : "-"}${formatted}%`;
  };

  const selectedSymbolStr = useMemo(() => {
    if (!selectedTarget) return "";
    return resolveTokenSymbol(selectedTarget);
  }, [selectedTarget]);

  const openSwapSelector = useCallback((type: "debt" | "collateral", row: VesuPositionRow) => {
    if (!row.borrowContext) {
      return;
    }
    setSwapType(type);
    setSwapRow(row);
    setSelectedTarget(null);
    swapSelectModal.open();
  }, [swapSelectModal]);

  const swapCandidateTokens = useMemo(() => {
    if (!swapRow) return [] as AssetWithRates[];
    const currentCollateralHex = swapRow.supply.tokenAddress;
    const currentDebtHex = swapRow.borrow?.tokenAddress;
    return assetsWithRates.filter(asset =>
      isValidSwapCandidate(assetToHex(asset.address), currentCollateralHex, currentDebtHex),
    );
  }, [assetsWithRates, swapRow]);

  const handleSelectSwapTarget = useCallback((token: TokenWithRates) => {
    setSelectedTarget(token);
    swapSelectModal.close();
    if (!swapRow || !swapType) {
      return;
    }
    if (swapType === "debt") {
      switchDebtModal.open();
    } else {
      switchCollateralModal.open();
    }
  }, [swapSelectModal, swapRow, swapType, switchDebtModal, switchCollateralModal]);

  // Shared expand state per row.key
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const defaultExpandedKey = useMemo(() => {
    if (rows.length === 0) {
      return null;
    }

    const isV1Protocol = protocolName?.toLowerCase() === "vesu";
    if (isV1Protocol) {
      const firstNonVtoken = rows.find(row => !row.isVtoken);
      return (firstNonVtoken ?? rows[0])?.key ?? null;
    }

    return rows[0]?.key ?? null;
  }, [rows, protocolName]);

  useEffect(() => {
    if (rows.length === 0) {
      if (Object.keys(expandedRows).length === 0) {
        return;
      }
      setExpandedRows({});
      return;
    }

    if (hasUserInteracted) {
      if (defaultExpandedKey && !(defaultExpandedKey in expandedRows)) {
        setHasUserInteracted(false);
      }
      return;
    }

    const hasExpandedVisibleRow = rows.some(row => expandedRows[row.key]);
    if (hasExpandedVisibleRow) {
      return;
    }

    if (!defaultExpandedKey) {
      return;
    }

    setExpandedRows(prev => {
      if (prev[defaultExpandedKey]) {
        return prev;
      }
      return { ...prev, [defaultExpandedKey]: true };
    });
  }, [rows, expandedRows, defaultExpandedKey, hasUserInteracted]);

  const toggleRowExpanded = useCallback((key: string) => {
    setHasUserInteracted(true);
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Memoized props for SwitchTokenSelectModalStark
  const switchTokenCurrentToken = useMemo(() => {
    if (!swapRow || !swapType) {
      return null;
    }
    // For debt swaps, borrow must exist
    if (swapType === "debt" && !swapRow.borrow) {
      return null;
    }
    const borrowData = swapRow.borrow;
    return {
      address: swapType === "debt" && borrowData ? borrowData.tokenAddress : swapRow.supply.tokenAddress,
      symbol: swapType === "debt" && borrowData ? borrowData.name : swapRow.supply.name,
      name: swapType === "debt" && borrowData ? borrowData.name : swapRow.supply.name,
      icon: swapType === "debt" && borrowData ? borrowData.icon : swapRow.supply.icon,
      decimals: swapType === "debt" && borrowData ? (borrowData.tokenDecimals || 18) : (swapRow.supply.tokenDecimals || 18),
    };
  }, [swapRow, swapType]);

  const switchTokenOptions = useMemo(() => {
    return swapCandidateTokens.map(asset => {
      const symbol = feltToString(asset.symbol);
      return {
        address: `0x${asset.address.toString(16).padStart(64, "0")}`,
        symbol,
        name: symbol,
        icon: tokenNameToLogo(symbol.toLowerCase()),
        decimals: asset.decimals || 18,
      };
    });
  }, [swapCandidateTokens]);

  const handleSwitchTokenSelect = useCallback((opt: { address: string }) => {
    const match = swapCandidateTokens.find(a => assetToHex(a.address) === opt.address);
    if (!match) {
      return;
    }
    handleSelectSwapTarget({
      address: match.address,
      symbol: feltToString(match.symbol),
      decimals: match.decimals || 18,
      borrowAPR: match.borrowAPR,
      supplyAPY: match.supplyAPY,
    } as unknown as TokenWithRates);
  }, [swapCandidateTokens, handleSelectSwapTarget]);

  // Memoized props for TokenSelectModalStark
  const tokenSelectTokens = useMemo(() => {
    return swapCandidateTokens.map(asset => ({
      ...asset,
      borrowAPR: asset.borrowAPR,
      supplyAPY: asset.supplyAPY,
    })) as TokenWithRates[];
  }, [swapCandidateTokens]);

  const tokenSelectPosition = useMemo(() => {
    if (!swapRow) {
      return null;
    }
    return PositionManager.fromPositions([swapRow.supply], swapRow.borrow ? [swapRow.borrow] : []);
  }, [swapRow]);

  // Memoized props for SwitchDebtModalStark
  const switchDebtCollateral = useMemo(() => {
    if (!swapRow) {
      return null;
    }
    return {
      name: swapRow.supply.name,
      address: swapRow.supply.tokenAddress,
      decimals: swapRow.supply.tokenDecimals || 18,
      icon: swapRow.supply.icon,
    };
  }, [swapRow]);

  const switchDebtCurrentDebt = useMemo(() => {
    if (!swapRow?.borrow) {
      return null;
    }
    return {
      name: swapRow.borrow.name,
      address: swapRow.borrow.tokenAddress,
      decimals: swapRow.borrow.tokenDecimals || 18,
      icon: swapRow.borrow.icon,
    };
  }, [swapRow]);

  const switchDebtTargetDebt = useMemo(() => {
    if (!selectedTarget) {
      return null;
    }
    return {
      name: selectedSymbolStr,
      address: `0x${selectedTarget.address.toString(16).padStart(64, "0")}`,
      decimals: selectedTarget.decimals,
      icon: tokenNameToLogo(selectedSymbolStr.toLowerCase()),
    };
  }, [selectedTarget, selectedSymbolStr]);

  // Memoized props for SwitchCollateralModalStark
  const switchCollateralCurrentCollateral = useMemo(() => {
    if (!swapRow) {
      return null;
    }
    return {
      name: swapRow.supply.name,
      address: swapRow.supply.tokenAddress,
      decimals: swapRow.supply.tokenDecimals || 18,
      icon: swapRow.supply.icon,
    };
  }, [swapRow]);

  const switchCollateralTargetCollateral = useMemo(() => {
    if (!selectedTarget) {
      return null;
    }
    return {
      name: selectedSymbolStr,
      address: `0x${selectedTarget.address.toString(16).padStart(64, "0")}`,
      decimals: selectedTarget.decimals,
      icon: tokenNameToLogo(selectedSymbolStr.toLowerCase()),
    };
  }, [selectedTarget, selectedSymbolStr]);

  const switchCollateralDebtToken = useMemo(() => {
    if (!swapRow) {
      return null;
    }
    return {
      name: swapRow.borrow?.name || "",
      address: swapRow.borrow?.tokenAddress || "0x0",
      decimals: swapRow.borrow?.tokenDecimals || 18,
      icon: swapRow.borrow?.icon || "",
    };
  }, [swapRow]);
  const renderPositions = () => {
    if (accountStatus === "connecting" || (userAddress && !hasLoadedOnce)) {
      return (
        <div className="flex justify-center py-6">
          <LoadingSpinner size="md" />
        </div>
      );
    }

    if (!userAddress) {
      return (
        <div className="bg-base-200/60 text-base-content/70 rounded-md p-4 text-center text-sm">
          Connect your Starknet wallet to view your Vesu positions
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="bg-base-200/60 text-base-content/70 rounded-md p-4 text-center text-sm">
          No positions found
        </div>
      );
    }

    return rows.map(row => (
      <VesuPositionRowItem
        key={row.key}
        row={row}
        protocolName={protocolName}
        assetsWithRates={assetsWithRates}
        expandedRows={expandedRows}
        toggleRowExpanded={toggleRowExpanded}
        openSwapSelector={openSwapSelector}
        openCloseForRow={openCloseForRow}
        onBorrowRequest={onBorrowRequest}
      />
    ));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="card-title text-lg">{title}</h2>
            {userAddress && (
              <div className="text-base-content/70 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="flex items-center gap-1">
                  <span>Balance:</span>
                  <span className={`font-semibold ${netBalanceUsd >= 0 ? "text-success" : "text-error"}`}>
                    {formatCurrency(netBalanceUsd)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span>30D Net Yield:</span>
                  <span className={`font-semibold ${netYield30d >= 0 ? "text-success" : "text-error"}`}>
                    {formatCurrency(netYield30d)}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span>Net APY:</span>
                  <span
                    className={`font-semibold ${netApyPercent == null
                      ? "text-base-content"
                      : netApyPercent >= 0
                        ? "text-success"
                        : "text-error"
                      }`}
                  >
                    {netApyPercent == null ? "--" : formatSignedPercentage(netApyPercent)}
                  </span>
                </span>
              </div>
            )}
          </div>
          {isUpdating && userAddress && (
            <div className="text-base-content/60 flex items-center text-xs">
              <LoadingSpinner size="xs" label="Updating" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          {renderPositions()}

          <div className="border-base-300 overflow-hidden rounded-2xl border border-dashed">
            <div className="divide-base-300 grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="bg-base-200/60 flex h-full flex-col justify-center p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-base-content/70 text-sm font-semibold">Add collateral</span>
                    <span className="text-base-content/50 text-xs">Supply assets to start or grow your borrowing power.</span>
                  </div>
                  <button className="btn btn-sm btn-outline" onClick={onDepositRequest} disabled={assetsWithRates.length === 0}>
                    <PlusIcon className="size-4" />
                    <span>Deposit</span>
                  </button>
                </div>
              </div>
              <div className="hidden md:block" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      {closeModal.data && (
        <ClosePositionModalStark
          isOpen={closeModal.isOpen}
          onClose={closeModal.close}
          collateral={closeModal.data.collateral}
          debt={closeModal.data.debt}
          collateralBalance={closeModal.data.collateralBalance}
          debtBalance={closeModal.data.debtBalance}
          poolKey={closeModal.data.poolKey}
          protocolKey={closeModal.data.protocolKey}
        />
      )}

      {/* Token selector for swap target */}
      {swapRow && swapType && useNewSelector && switchTokenCurrentToken ? (
        <SwitchTokenSelectModalStark
          isOpen={swapSelectModal.isOpen}
          onClose={swapSelectModal.close}
          kind={swapType}
          currentToken={switchTokenCurrentToken}
          options={switchTokenOptions}
          onSelect={handleSwitchTokenSelect}
        />
      ) : (
        swapRow && swapType && swapRow.borrowContext && isVesuContextV1(swapRow.borrowContext) && tokenSelectPosition && (
          <TokenSelectModalStark
            isOpen={swapSelectModal.isOpen}
            onClose={swapSelectModal.close}
            tokens={tokenSelectTokens}
            protocolName={protocolName}
            collateralAsset={swapRow.supply.tokenAddress}
            vesuContext={swapRow.borrowContext}
            position={tokenSelectPosition}
            action={swapType === "debt" ? "borrow" : "deposit"}
            onSelectToken={handleSelectSwapTarget}
            suppressActionModals
          />
        )
      )}

      {/* Switch debt modal */}
      {swapType === "debt" && swapRow && swapRow.borrow && selectedTarget && swapRow.borrowContext && switchDebtCollateral && switchDebtCurrentDebt && switchDebtTargetDebt && (
        <SwitchDebtModalStark
          isOpen={switchDebtModal.isOpen}
          onClose={switchDebtModal.close}
          poolKey={swapRow.poolKey}
          protocolKey={swapRow.protocolKey}
          collateral={switchDebtCollateral}
          currentDebt={switchDebtCurrentDebt}
          targetDebt={switchDebtTargetDebt}
          debtBalance={swapRow.borrow.tokenBalance}
          collateralBalance={swapRow.supply.tokenBalance}
        />
      )}

      {/* Switch collateral modal */}
      {swapType === "collateral" && swapRow && selectedTarget && swapRow.borrowContext && switchCollateralCurrentCollateral && switchCollateralTargetCollateral && switchCollateralDebtToken && (
        <SwitchCollateralModalStark
          isOpen={switchCollateralModal.isOpen}
          onClose={switchCollateralModal.close}
          poolKey={swapRow.poolKey}
          protocolKey={swapRow.protocolKey}
          currentCollateral={switchCollateralCurrentCollateral}
          targetCollateral={switchCollateralTargetCollateral}
          debtToken={switchCollateralDebtToken}
          collateralBalance={swapRow.supply.tokenBalance}
          debtBalance={swapRow.borrow?.tokenBalance || 0n}
        />
      )}
    </div>
  );
};

export default VesuPositionsSection;
