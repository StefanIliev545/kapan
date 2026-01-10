import Image from "next/image";
import React, { type FC } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

// Static objects for disabled actions - extracted to avoid creating new objects on each render
const DISABLED_SUPPLY_ACTIONS = { deposit: false, withdraw: false, move: false } as const;
const DISABLED_BORROW_ACTIONS = { borrow: false, repay: false, move: false } as const;

import type { ProtocolPosition } from "~~/components/ProtocolView";
import { BorrowPosition } from "~~/components/BorrowPosition";
import { SupplyPosition } from "~~/components/SupplyPosition";
import { LoadingSpinner } from "~~/components/common/Loading";
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
  headerExtra?: React.ReactElement;
  title?: string;
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
  iconSrc = "/logos/vesu.svg",
}) => {
  const formatSignedPercentage = (value: number) => {
    const formatted = formatPercentage(Math.abs(value));
    return `${value >= 0 ? "" : "-"}${formatted}%`;
  };

  const renderMarketContent = () => {
    if (assetsError) {
      return (
        <div className="bg-error/10 text-error rounded-md p-4 text-sm">
          Error loading markets. Please try again later.
          {headerExtra && <div className="ml-auto flex items-center">{headerExtra}</div>}
        </div>
      );
    }

    if (isLoadingAssets) {
      return (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      );
    }

    if (suppliablePositions.length === 0 && borrowablePositions.length === 0) {
      return (
        <div className="bg-base-200/60 text-base-content/70 rounded-md p-4 text-center text-sm">
          No markets available
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {suppliablePositions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-base-content/60 text-sm font-semibold uppercase tracking-wide">
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
                availableActions={DISABLED_SUPPLY_ACTIONS}
                showInfoDropdown={false}
              />
            ))}
          </div>
        )}

        {borrowablePositions.length > 0 && (
          <div className="space-y-3">
            <div className="text-base-content/60 text-sm font-semibold uppercase tracking-wide">
              Borrowable assets
            </div>
            {borrowablePositions.map(position => (
              <BorrowPosition
                key={position.tokenAddress}
                {...position}
                protocolName={protocolName}
                networkType="starknet"
                hideBalanceColumn
                availableActions={DISABLED_BORROW_ACTIONS}
                showInfoDropdown={false}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card from-base-100 to-base-100/95 border-base-200/50 rounded-xl border bg-gradient-to-r shadow-lg transition-all duration-300 hover:shadow-xl">
      <div className="card-body px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* Protocol name + icon */}
          <div className="flex items-center gap-3">
            <div className="token-icon-wrapper-lg">
              <Image src={iconSrc} alt={`${title} icon`} width={24} height={24} className="object-contain drop-shadow-sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="label-text-xs-semibold">Protocol</span>
              <span className="text-base font-bold tracking-tight">{title}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="via-base-300 hidden h-10 w-px bg-gradient-to-b from-transparent to-transparent sm:block" />

          {/* Stats - spread evenly across available space */}
          {userAddress && (
            <div className="flex flex-1 flex-wrap items-center justify-around gap-y-3">
              {/* Net Balance */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Balance</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${netBalanceUsd >= 0 ? "text-success" : "text-error"}`}>
                  {formatCurrency(netBalanceUsd)}
                </span>
              </div>

              {/* 30D Yield */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">30D Yield</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${netYield30d >= 0 ? "text-success" : "text-error"}`}>
                  {formatCurrency(netYield30d)}
                </span>
              </div>

              {/* Net APY */}
              <div className="hover:bg-base-200/30 group flex flex-col items-center gap-1 rounded-lg px-3 py-1 transition-colors">
                <span className="label-text-xs-semibold">Net APY</span>
                <span className={`font-mono text-sm font-bold tabular-nums tracking-tight ${netApyPercent == null ? "text-base-content/40" : netApyPercent >= 0 ? "text-success" : "text-error"}`}>
                  {netApyPercent == null ? "—" : formatSignedPercentage(netApyPercent)}
                </span>
              </div>
            </div>
          )}

          {/* Right side - status message + actions */}
          <div className="ml-auto flex items-center gap-3">
            {!userAddress ? (
              <span className="text-primary/80 text-[11px] font-medium">Connect Starknet wallet</span>
            ) : hasPositions ? (
              <span className="text-base-content/40 hidden text-[10px] md:inline">Managing positions</span>
            ) : null}
            <div className="border-base-300/50 flex items-center gap-2 border-l pl-2">
              <button className="btn btn-sm btn-ghost gap-1.5" type="button" onClick={onToggle}>
                <span className="text-[10px] font-semibold uppercase tracking-widest">Markets</span>
                {isOpen ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
              </button>
              {headerExtra}
            </div>
          </div>
        </div>

        {isOpen && <div className="border-base-200/50 mt-3 space-y-4 border-t pt-4">{renderMarketContent()}</div>}
      </div>
    </div>
  );
};

export default VesuMarketSection;
