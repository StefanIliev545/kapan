import Image from "next/image";
import React, { type FC } from "react";
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
    <div className="card bg-gradient-to-r from-base-100 to-base-100/95 shadow-lg hover:shadow-xl transition-all duration-300 rounded-xl border border-base-200/50">
      <div className="card-body px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          {/* Protocol name + icon */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 relative rounded-xl bg-gradient-to-br from-base-200 to-base-300/50 p-2 flex items-center justify-center shadow-sm ring-1 ring-base-300/30">
              <Image src={iconSrc} alt={`${title} icon`} width={24} height={24} className="object-contain drop-shadow-sm" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Protocol</span>
              <span className="text-base font-bold tracking-tight">{title}</span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-10 bg-gradient-to-b from-transparent via-base-300 to-transparent" />

          {/* Stats - spread evenly across available space */}
          {userAddress && (
            <div className="flex-1 flex flex-wrap items-center justify-around gap-y-3">
              {/* Net Balance */}
              <div className="group flex flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Balance</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${netBalanceUsd >= 0 ? "text-success" : "text-error"}`}>
                  {formatCurrency(netBalanceUsd)}
                </span>
              </div>

              {/* 30D Yield */}
              <div className="group flex flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">30D Yield</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${netYield30d >= 0 ? "text-success" : "text-error"}`}>
                  {formatCurrency(netYield30d)}
                </span>
              </div>

              {/* Net APY */}
              <div className="group flex flex-col gap-1 items-center px-3 py-1 rounded-lg transition-colors hover:bg-base-200/30">
                <span className="text-[10px] uppercase tracking-widest text-base-content/35 font-semibold">Net APY</span>
                <span className={`text-sm font-mono font-bold tabular-nums tracking-tight ${netApyPercent == null ? "text-base-content/40" : netApyPercent >= 0 ? "text-success" : "text-error"}`}>
                  {netApyPercent == null ? "—" : formatSignedPercentage(netApyPercent)}
                </span>
              </div>
            </div>
          )}

          {/* Right side - status message + actions */}
          <div className="flex items-center gap-3 ml-auto">
            {!userAddress ? (
              <span className="text-[11px] text-primary/80 font-medium">Connect Starknet wallet</span>
            ) : hasPositions ? (
              <span className="hidden md:inline text-[10px] text-base-content/40">Managing positions</span>
            ) : null}
            <div className="flex items-center gap-2 pl-2 border-l border-base-300/50">
              <button className="btn btn-sm btn-ghost gap-1.5" type="button" onClick={onToggle}>
                <span className="text-[10px] uppercase tracking-widest font-semibold">Markets</span>
                {isOpen ? <FiChevronUp className="h-3.5 w-3.5" /> : <FiChevronDown className="h-3.5 w-3.5" />}
              </button>
              {headerExtra}
            </div>
          </div>
        </div>

        {isOpen && <div className="space-y-4 border-t border-base-200/50 pt-4 mt-3">{renderMarketContent()}</div>}
      </div>
    </div>
  );
};

export default VesuMarketSection;
