import Image from "next/image";
import type { FC } from "react";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";

import type { ProtocolPosition } from "~~/components/ProtocolView";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { SupplyPosition } from "~~/components/SupplyPosition";
import formatPercentage from "~~/utils/formatPercentage";

interface VesuMarketSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  isLoadingAssets: boolean;
  assetsError?: unknown;
  suppliablePositions: ProtocolPosition[];
  borrowablePositions: ProtocolPosition[];
  userAddress?: string;
  hasPositions: boolean;
  netBalanceUsd: number;
  netYield30d: number;
  netApyPercent: number | null;
  onDeposit: () => void;
  canDeposit: boolean;
  formatCurrency: (value: number) => string;
  protocolName?: string;
  headerExtra?: JSX.Element;
  title?: string;
  description?: string;
  iconSrc?: string;
}

export const VesuMarketSection: FC<VesuMarketSectionProps> = ({
  isOpen,
  onToggle,
  isLoadingAssets,
  assetsError,
  suppliablePositions,
  borrowablePositions,
  userAddress,
  hasPositions,
  netBalanceUsd,
  netYield30d,
  netApyPercent,
  onDeposit,
  canDeposit,
  formatCurrency,
  protocolName = "Vesu",
  headerExtra,
  title = "Vesu",
  description = "Manage your Starknet lending positions",
  iconSrc = "/logos/vesu.svg",
}) => {
  const formatSignedPercentage = (value: number) => {
    const formatted = formatPercentage(Math.abs(value));
    return `${value >= 0 ? "" : "-"}${formatted}%`;
  };

  const renderMarketContent = () => {
    if (assetsError) {
      return (
        <div className="rounded-md bg-error/10 p-4 text-sm text-error">
          Error loading markets. Please try again later.
          {headerExtra && <div className="ml-auto flex items-center">{headerExtra}</div>}
        </div>
      );
    }

    if (isLoadingAssets) {
      return (
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner loading-md" />
        </div>
      );
    }

    if (suppliablePositions.length === 0 && borrowablePositions.length === 0) {
      return (
        <div className="rounded-md bg-base-200/60 p-4 text-center text-sm text-base-content/70">
          No markets available
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {suppliablePositions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold uppercase tracking-wide text-base-content/60">
                Suppliable assets
              </div>
              <button
                className="btn btn-xs btn-outline"
                type="button"
                onClick={onDeposit}
                disabled={!canDeposit}
              >
                Deposit
              </button>
            </div>
            {suppliablePositions.map(position => (
              <SupplyPosition
                key={position.tokenAddress}
                {...position}
                protocolName={protocolName}
                networkType="starknet"
                hideBalanceColumn
                availableActions={{ deposit: false, withdraw: false, move: false }}
                showInfoDropdown={false}
              />
            ))}
          </div>
        )}

        {borrowablePositions.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-base-content/60">
              Borrowable assets
            </div>
            {borrowablePositions.map(position => (
              <BorrowPosition
                key={position.tokenAddress}
                {...position}
                protocolName={protocolName}
                networkType="starknet"
                hideBalanceColumn
                availableActions={{ borrow: false, repay: false, move: false }}
                showInfoDropdown={false}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body space-y-4 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-base-200 p-1">
              <Image src={iconSrc} alt={`${title} icon`} width={36} height={36} className="object-contain" />
            </div>
            <div className="flex flex-col">
              <div className="text-xl font-bold tracking-tight">{title}</div>
              <div className="text-xs text-base-content/70">{description}</div>
              {userAddress && (
                <div className="mt-1 flex flex-col gap-1 text-xs text-base-content/70">
                  <div className="flex items-center gap-1">
                    <span>Balance:</span>
                    <span className={`font-semibold ${netBalanceUsd >= 0 ? "text-success" : "text-error"}`}>
                      {formatCurrency(netBalanceUsd)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1">
                      <span>30D Net Yield:</span>
                      <span className={`font-semibold ${netYield30d >= 0 ? "text-success" : "text-error"}`}>
                        {formatCurrency(netYield30d)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span>Net APY:</span>
                      <span
                        className={`font-semibold ${
                          netApyPercent == null
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
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 md:items-end md:ml-auto">
            {!userAddress ? (
              <span className="text-right text-xs text-base-content/70">
                Connect your Starknet wallet to view personalized positions
              </span>
            ) : hasPositions ? (
              <span className="text-right text-xs text-base-content/70">
                Markets are hidden while you manage your positions
              </span>
            ) : (
              <span className="text-right text-xs text-base-content/70">
                No active positions yet – explore the markets below
              </span>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button className="btn btn-sm btn-ghost border border-base-300" type="button" onClick={onToggle}>
                <span className="mr-2">Markets</span>
                {isOpen ? <FiChevronUp className="h-4 w-4" /> : <FiChevronDown className="h-4 w-4" />}
              </button>
              {headerExtra && <div className="flex items-center justify-end">{headerExtra}</div>}
            </div>
          </div>
        </div>

        {isOpen && <div className="space-y-4 border-t border-base-200 pt-4">{renderMarketContent()}</div>}
      </div>
    </div>
  );
};

export default VesuMarketSection;
