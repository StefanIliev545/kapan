import type { FC, MouseEvent } from "react";
import { useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";

import { BorrowPosition } from "~~/components/BorrowPosition";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { PositionManager } from "~~/utils/position";
import type { AssetWithRates } from "~~/hooks/useVesuAssets";
import type { VesuPositionRow } from "~~/hooks/useVesuLendingPositions";
import { ClosePositionModalStark } from "~~/components/modals/stark/ClosePositionModalStark";
import { TokenSelectModalStark, type TokenWithRates } from "~~/components/modals/stark/TokenSelectModalStark";
import SwitchTokenSelectModalStark from "~~/components/modals/stark/SwitchTokenSelectModalStark";
import { SwitchDebtModalStark } from "~~/components/modals/stark/SwitchDebtModalStark";
import { SwitchCollateralModalStark } from "~~/components/modals/stark/SwitchCollateralModalStark";
import { feltToString } from "~~/utils/protocols";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { isVesuContextV1, type VesuProtocolKey } from "~~/utils/vesu";

interface BorrowSelectionRequest {
  tokens: AssetWithRates[];
  collateralAddress: string;
  vesuContext: VesuPositionRow["borrowContext"];
  position: PositionManager;
}

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
}) => {
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeParams, setCloseParams] = useState<
    | {
        collateral: { name: string; address: string; decimals: number; icon: string };
        debt: { name: string; address: string; decimals: number; icon: string };
        collateralBalance: bigint;
        debtBalance: bigint;
        poolKey: string;
        protocolKey: VesuProtocolKey;
      }
    | null
  >(null);

  const openCloseForRow = (row: VesuPositionRow) => {
    if (!row.borrow || !row.borrowContext) return;
    setCloseParams({
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
    setIsCloseModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsCloseModalOpen(false);
    setCloseParams(null);
  };

  // Swap state (debt or collateral)
  const [isSwapSelectOpen, setIsSwapSelectOpen] = useState(false);
  const [swapType, setSwapType] = useState<"debt" | "collateral" | null>(null);
  const [swapRow, setSwapRow] = useState<VesuPositionRow | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<TokenWithRates | null>(null);
  const [isSwitchDebtOpen, setIsSwitchDebtOpen] = useState(false);
  const [isSwitchCollateralOpen, setIsSwitchCollateralOpen] = useState(false);
  const [useNewSelector, setUseNewSelector] = useState(true);

  const selectedSymbolStr = useMemo(() => {
    if (!selectedTarget) return "";
    const sym: any = (selectedTarget as any).symbol;
    return typeof sym === "bigint" ? feltToString(sym) : String(sym ?? "");
  }, [selectedTarget]);

  const openSwapSelector = (type: "debt" | "collateral", row: VesuPositionRow) => {
    if (!row.borrowContext) return;
    setSwapType(type);
    setSwapRow(row);
    setSelectedTarget(null);
    setIsSwapSelectOpen(true);
  };

  const closeSwapSelector = () => {
    setIsSwapSelectOpen(false);
  };

  const swapCandidateTokens = useMemo(() => {
    if (!swapRow) return [] as AssetWithRates[];
    const currentCollateralHex = swapRow.supply.tokenAddress;
    const currentDebtHex = swapRow.borrow?.tokenAddress;
    return assetsWithRates.filter(asset => {
      const addrHex = `0x${asset.address.toString(16).padStart(64, "0")}`;
      if (swapType === "debt") {
        // Exclude current debt and collateral
        if (addrHex === currentDebtHex) return false;
        if (addrHex === currentCollateralHex) return false;
        return true;
      }
      // collateral: exclude current collateral and debt
      if (addrHex === currentCollateralHex) return false;
      if (addrHex === currentDebtHex) return false;
      return true;
    });
  }, [assetsWithRates, swapRow, swapType]);

  const handleSelectSwapTarget = (token: TokenWithRates) => {
    setSelectedTarget(token);
    setIsSwapSelectOpen(false);
    if (!swapRow || !swapType) return;
    if (swapType === "debt") {
      setIsSwitchDebtOpen(true);
    } else {
      setIsSwitchCollateralOpen(true);
    }
  };

  // Shared expand state per row.key
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggleRowExpanded = (key: string) =>
    setExpandedRows(prev => ({ ...prev, [key]: !prev[key] }));
  const renderPositions = () => {
    if (accountStatus === "connecting" || (userAddress && !hasLoadedOnce)) {
      return (
        <div className="flex justify-center py-6">
          <span className="loading loading-spinner loading-md" />
        </div>
      );
    }

    if (!userAddress) {
      return (
        <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
          Connect your Starknet wallet to view your Vesu positions
        </div>
      );
    }

    if (rows.length === 0) {
      return (
        <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
          No positions found
        </div>
      );
    }

    return rows.map(row => {
      const positionManager = PositionManager.fromPositions([row.supply], row.borrow ? [row.borrow] : []);
      const containerColumns = "grid-cols-1 md:grid-cols-2 md:divide-x";

      const availableBorrowTokens = assetsWithRates.filter(
        asset => `0x${asset.address.toString(16).padStart(64, "0")}` !== row.supply.tokenAddress,
      );
      const canInitiateBorrow = !row.hasDebt && Boolean(row.borrowContext) && availableBorrowTokens.length > 0;
      const borrowPoolContext = row.borrowContext;
      const supportsPoolDependentActions = Boolean(borrowPoolContext);
      const borrowButtonDisabled = row.supply.actionsDisabled;

      const handleBorrowFromSupply = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canInitiateBorrow || !row.borrowContext) return;
        onBorrowRequest({
          tokens: availableBorrowTokens,
          collateralAddress: row.supply.tokenAddress,
          vesuContext: row.borrowContext,
          position: positionManager,
        });
      };

      return (
        <div key={row.key} className="overflow-hidden rounded-md border border-base-300">
          <div className={`grid divide-y divide-base-300 md:divide-y-0 ${containerColumns}`}>
            <SupplyPosition
              {...row.supply}
              protocolName={protocolName}
              networkType="starknet"
              position={positionManager}
              disableMove
              subtitle={row.isVtoken ? "vToken" : undefined}
              containerClassName="rounded-none"
              availableActions={{ deposit: true, withdraw: true, move: false, swap: supportsPoolDependentActions }}
              onSwap={supportsPoolDependentActions ? () => openSwapSelector("collateral", row) : undefined}
              controlledExpanded={!!expandedRows[row.key]}
              onToggleExpanded={() => toggleRowExpanded(row.key)}
            />
            {row.borrow ? (
              <BorrowPosition
                {...row.borrow}
                protocolName={protocolName}
                networkType="starknet"
                position={positionManager}
                containerClassName="rounded-none"
                availableActions={
                  row.hasDebt
                    ? {
                        borrow: true,
                        repay: true,
                        move: supportsPoolDependentActions,
                        close: supportsPoolDependentActions,
                        swap: supportsPoolDependentActions,
                      }
                    : { borrow: true, repay: false, move: false, swap: false, close: false }
                }
                showNoDebtLabel={!row.hasDebt}
                onClosePosition={row.hasDebt && supportsPoolDependentActions ? () => openCloseForRow(row) : undefined}
                onSwap={row.hasDebt && supportsPoolDependentActions ? () => openSwapSelector("debt", row) : undefined}
                controlledExpanded={!!expandedRows[row.key]}
                onToggleExpanded={() => toggleRowExpanded(row.key)}
              />
            ) : (
              <div className="flex h-full items-center justify-between gap-3 border border-dashed border-base-300 bg-base-200/60 p-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-base-content/70">No debt</span>
                  <span className="text-xs text-base-content/50">You are not borrowing against this collateral yet.</span>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={handleBorrowFromSupply}
                  disabled={!canInitiateBorrow || borrowButtonDisabled}
                  title={
                    borrowButtonDisabled
                      ? row.supply.actionsDisabledReason
                      : canInitiateBorrow
                        ? "Borrow against this collateral"
                        : "No borrowable assets available"
                  }
                >
                  Borrow
                </button>
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body space-y-4 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="card-title text-lg">Your Vesu Positions</h2>
          {isUpdating && userAddress && (
            <div className="flex items-center text-xs text-base-content/60">
              <span className="loading loading-spinner loading-xs mr-1" /> Updating
            </div>
          )}
        </div>

        <div className="space-y-4">
          {renderPositions()}

          <div className="overflow-hidden rounded-md border border-dashed border-base-300">
            <div className="grid grid-cols-1 divide-y divide-base-300 md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="flex h-full flex-col justify-center bg-base-200/60 p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-base-content/70">Add collateral</span>
                    <span className="text-xs text-base-content/50">Supply assets to start or grow your borrowing power.</span>
                  </div>
                  <button className="btn btn-sm btn-outline" onClick={onDepositRequest} disabled={assetsWithRates.length === 0}>
                    <FiPlus className="h-4 w-4" />
                    <span>Deposit</span>
                  </button>
                </div>
              </div>
              <div className="hidden md:block" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      {closeParams && (
        <ClosePositionModalStark
          isOpen={isCloseModalOpen}
          onClose={handleCloseModal}
          collateral={closeParams.collateral}
          debt={closeParams.debt}
          collateralBalance={closeParams.collateralBalance}
          debtBalance={closeParams.debtBalance}
          poolKey={closeParams.poolKey}
          protocolKey={closeParams.protocolKey}
        />
      )}

      {/* Token selector for swap target */}
      {swapRow && swapType && useNewSelector ? (
        <SwitchTokenSelectModalStark
          isOpen={isSwapSelectOpen}
          onClose={closeSwapSelector}
          kind={swapType}
          currentToken={{
            address: swapType === "debt" ? swapRow.borrow!.tokenAddress : swapRow.supply.tokenAddress,
            symbol: swapType === "debt" ? swapRow.borrow!.name : swapRow.supply.name,
            name: swapType === "debt" ? swapRow.borrow!.name : swapRow.supply.name,
            icon: swapType === "debt" ? swapRow.borrow!.icon : swapRow.supply.icon,
            decimals: swapType === "debt" ? (swapRow.borrow!.tokenDecimals || 18) : (swapRow.supply.tokenDecimals || 18),
          }}
          options={swapCandidateTokens.map(asset => {
            const symbol = feltToString(asset.symbol);
            return {
              address: `0x${asset.address.toString(16).padStart(64, "0")}`,
              symbol,
              name: symbol,
              icon: tokenNameToLogo(symbol.toLowerCase()),
              decimals: asset.decimals || 18,
            };
          })}
          onSelect={opt => {
            const match = swapCandidateTokens.find(a => `0x${a.address.toString(16).padStart(64, "0")}` === opt.address);
            if (!match) return;
            handleSelectSwapTarget({
              address: match.address,
              symbol: feltToString(match.symbol),
              decimals: match.decimals || 18,
              borrowAPR: match.borrowAPR,
              supplyAPY: match.supplyAPY,
            } as unknown as TokenWithRates);
          }}
        />
      ) : (
        swapRow && swapType && swapRow.borrowContext && isVesuContextV1(swapRow.borrowContext) && (
          <TokenSelectModalStark
            isOpen={isSwapSelectOpen}
            onClose={closeSwapSelector}
            tokens={swapCandidateTokens.map(asset => ({
              ...asset,
              borrowAPR: asset.borrowAPR,
              supplyAPY: asset.supplyAPY,
            })) as TokenWithRates[]}
            protocolName={protocolName}
            collateralAsset={swapRow.supply.tokenAddress}
            vesuContext={swapType === "debt" ? swapRow.borrowContext : swapRow.borrowContext}
            position={PositionManager.fromPositions([swapRow.supply], swapRow.borrow ? [swapRow.borrow] : [])}
            action={swapType === "debt" ? "borrow" : "deposit"}
            onSelectToken={handleSelectSwapTarget}
            suppressActionModals
          />
        )
      )}

      {/* Switch debt modal */}
      {swapType === "debt" && swapRow && selectedTarget && swapRow.borrowContext && (
        <SwitchDebtModalStark
          isOpen={isSwitchDebtOpen}
          onClose={() => setIsSwitchDebtOpen(false)}
          poolKey={swapRow.poolKey}
          protocolKey={swapRow.protocolKey}
          collateral={{
            name: swapRow.supply.name,
            address: swapRow.supply.tokenAddress,
            decimals: swapRow.supply.tokenDecimals || 18,
            icon: swapRow.supply.icon,
          }}
          currentDebt={{
            name: swapRow.borrow!.name,
            address: swapRow.borrow!.tokenAddress,
            decimals: swapRow.borrow!.tokenDecimals || 18,
            icon: swapRow.borrow!.icon,
          }}
          targetDebt={{
            name: selectedSymbolStr,
            address: `0x${selectedTarget.address.toString(16).padStart(64, "0")}`,
            decimals: selectedTarget.decimals,
            icon: tokenNameToLogo(selectedSymbolStr.toLowerCase()),
          }}
          debtBalance={swapRow.borrow!.tokenBalance}
          collateralBalance={swapRow.supply.tokenBalance}
        />
      )}

      {/* Switch collateral modal */}
      {swapType === "collateral" && swapRow && selectedTarget && swapRow.borrowContext && (
        <SwitchCollateralModalStark
          isOpen={isSwitchCollateralOpen}
          onClose={() => setIsSwitchCollateralOpen(false)}
          poolKey={swapRow.poolKey}
          protocolKey={swapRow.protocolKey}
          currentCollateral={{
            name: swapRow.supply.name,
            address: swapRow.supply.tokenAddress,
            decimals: swapRow.supply.tokenDecimals || 18,
            icon: swapRow.supply.icon,
          }}
          targetCollateral={{
            name: selectedSymbolStr,
            address: `0x${selectedTarget.address.toString(16).padStart(64, "0")}`,
            decimals: selectedTarget.decimals,
            icon: tokenNameToLogo(selectedSymbolStr.toLowerCase()),
          }}
          debtToken={{
            name: swapRow.borrow?.name || "",
            address: swapRow.borrow?.tokenAddress || "0x0",
            decimals: swapRow.borrow?.tokenDecimals || 18,
            icon: swapRow.borrow?.icon || "",
          }}
          collateralBalance={swapRow.supply.tokenBalance}
          debtBalance={swapRow.borrow?.tokenBalance || 0n}
        />
      )}
    </div>
  );
};

export default VesuPositionsSection;
