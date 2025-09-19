import type { FC, MouseEvent } from "react";
import { FiPlus } from "react-icons/fi";

import { BorrowPosition } from "~~/components/BorrowPosition";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { PositionManager } from "~~/utils/position";
import type { AssetWithRates, VesuPositionRow } from "~~/hooks/useVesuLendingPositions";

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
}) => {
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
              protocolName="Vesu"
              networkType="starknet"
              position={positionManager}
              disableMove
              subtitle={row.isVtoken ? "vToken" : undefined}
              containerClassName="rounded-none"
            />
            {row.borrow ? (
              <BorrowPosition
                {...row.borrow}
                protocolName="Vesu"
                networkType="starknet"
                position={positionManager}
                containerClassName="rounded-none"
                availableActions={row.hasDebt ? undefined : { borrow: true, repay: false, move: false }}
                showNoDebtLabel={!row.hasDebt}
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
              <div className="flex h-full flex-col justify-between gap-3 bg-base-200/60 p-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-base-content/70">Add collateral</span>
                  <span className="text-xs text-base-content/50">Supply assets to start or grow your borrowing power.</span>
                </div>
                <div className="flex justify-end">
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
    </div>
  );
};

export default VesuPositionsSection;
