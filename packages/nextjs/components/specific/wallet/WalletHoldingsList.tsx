import { Fragment, type ReactNode, useState } from "react";
import {
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { TokenIcon } from "~~/components/common/TokenDisplay";
import { TokenSymbolDisplay } from "~~/components/common/TokenSymbolDisplay";
import type { UnresolvedHolding, WalletToken } from "~~/hooks/useWalletTokens";

export type WalletHolding = WalletToken | UnresolvedHolding;

export function holdingLabel(holding: WalletHolding): string {
  const symbol = "symbol" in holding ? holding.symbol.trim() : "";
  if (symbol && !symbol.startsWith("0x")) {
    return symbol;
  }
  return `${holding.address.slice(0, 6)}…${holding.address.slice(-4)}`;
}

export function hasWalletValue(token: WalletToken): boolean {
  return token.valuationAvailable !== false && Number.isFinite(token.usdValue);
}

function formatAmount(value: number): string {
  if (value > 0 && value < 0.0001) {
    return "<0.0001";
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: value >= 1000 ? 2 : 4,
  });
}

export function formatWalletValue(value: number): string {
  if (value > 0 && value < 0.01) {
    return "<$0.01";
  }
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

const missingAmountDescription: Record<UnresolvedHolding["reason"], string> = {
  decimals: "Token precision is unavailable, so its amount cannot be displayed yet.",
  balance: "The current balance could not be refreshed. The indexed amount may be out of date.",
  amount: "The token amount could not be read.",
};

interface WalletHoldingsListProps {
  holdings: WalletHolding[];
  canSwap: boolean;
  canBridge: boolean;
  hidden?: boolean;
  onSwap: (token: WalletToken) => void;
  onBridge: (token: WalletToken) => void;
  onVisibilityChange: (address: string, hide: boolean) => void;
  onShow?: (address: string) => void;
}

export function WalletHoldingsList({
  holdings,
  canSwap,
  canBridge,
  hidden = false,
  onSwap,
  onBridge,
  onVisibilityChange,
  onShow,
}: WalletHoldingsListProps) {
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null);

  return (
    <table className="w-full table-fixed text-sm">
      <caption className="sr-only">{hidden ? "Hidden wallet tokens" : "Wallet holdings"}</caption>
      <thead className="text-xs font-normal text-base-content/50">
        <tr>
          <th className="px-4 py-2 text-left font-normal sm:px-5">Token</th>
          <th className="hidden w-[22%] px-3 py-2 text-right font-normal sm:table-cell">Amount</th>
          <th className="w-24 px-3 py-2 text-right font-normal sm:w-[18%]">Value</th>
          <th className="w-10 py-2 pr-3 sm:w-28 sm:pr-5">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-base-content/5">
        {holdings.map(holding => {
          const token = "symbol" in holding ? holding : undefined;
          const label = holdingLabel(holding);
          const isUnverified = !token || token.source === "indexed";
          const hasTokenIcon = token?.icon && !token.icon.endsWith("/x-logo.svg");
          const amount = token ? formatAmount(token.balanceFormatted) : "—";
          const value = token && hasWalletValue(token) ? formatWalletValue(token.usdValue) : "—";
          const isOpen = expandedAddress === holding.address;

          return (
            <Fragment key={holding.address}>
              <tr className="group hover:bg-base-content/[0.025]">
                <td className="px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    {token && !isUnverified && hasTokenIcon ? (
                      <TokenIcon icon={token.icon} symbol={token.symbol} customSize={28} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-base-content/10 text-xs text-base-content/60"
                      >
                        {label.startsWith("0x") ? "?" : label.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate" title={token?.symbol || holding.address}>
                          <TokenSymbolDisplay symbol={label} size="sm" variant="inline" />
                        </span>
                        {isUnverified && (
                          <InformationCircleIcon
                            className="size-3.5 shrink-0 text-base-content/40"
                            role="img"
                            aria-hidden={false}
                            aria-label="Unverified token"
                            title="Not in Kapan's protocol token lists. Check the contract before transacting."
                          />
                        )}
                      </div>
                      <span className="block text-xs tabular-nums text-base-content/50 sm:hidden">{amount}</span>
                      {token?.externalYield && token.externalYield.apy > 0 && (
                        <span className="block text-xs text-success/80">{token.externalYield.apy.toFixed(1)}% APY</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="hidden px-3 py-3 text-right tabular-nums text-base-content/65 sm:table-cell">
                  {amount}
                </td>
                <td
                  className="px-3 py-3 text-right tabular-nums"
                  title={value === "—" ? "Price or balance unavailable" : undefined}
                >
                  {value}
                </td>
                <td className="py-3 pr-3 sm:pr-5">
                  <div className="flex items-center justify-end">
                    {token && !hidden && canSwap && (
                      <button
                        type="button"
                        onClick={() => onSwap(token)}
                        title="Swap"
                        aria-label={`Swap ${label}`}
                        className="btn btn-ghost btn-xs hidden size-7 p-1 text-base-content/50 hover:text-base-content sm:inline-flex"
                      >
                        <ArrowsRightLeftIcon className="size-4" />
                      </button>
                    )}
                    {token && !hidden && canBridge && (
                      <button
                        type="button"
                        onClick={() => onBridge(token)}
                        title="Bridge"
                        aria-label={`Bridge ${label}`}
                        className="btn btn-ghost btn-xs hidden size-7 p-1 text-base-content/50 hover:text-base-content sm:inline-flex"
                      >
                        <ArrowsUpDownIcon className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedAddress(isOpen ? null : holding.address)}
                      aria-label={`Details for ${label}`}
                      aria-expanded={isOpen}
                      title="Token details"
                      className="btn btn-ghost btn-xs size-7 p-1 text-base-content/50 hover:text-base-content"
                    >
                      <EllipsisHorizontalIcon className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={3} className="bg-base-content/[0.025] px-4 py-3 text-xs sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1 text-base-content/60">
                        <p className="break-all font-mono text-xs">{holding.address}</p>
                        {isUnverified && <p>Unverified token · not in Kapan&apos;s protocol lists.</p>}
                        {"reason" in holding && (
                          <>
                            <p>{missingAmountDescription[holding.reason]}</p>
                            <p className="break-all">Indexed raw balance: {holding.rawBalance ?? "Unavailable"}</p>
                          </>
                        )}
                        {token && !hasWalletValue(token) && (
                          <p>No current price. This token is excluded from the known value.</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {token && !hidden && canSwap && (
                          <button
                            type="button"
                            onClick={() => onSwap(token)}
                            className="btn btn-ghost btn-xs sm:hidden"
                            aria-label={`Swap ${label}`}
                          >
                            <ArrowsRightLeftIcon className="size-3.5" /> Swap
                          </button>
                        )}
                        {token && !hidden && canBridge && (
                          <button
                            type="button"
                            onClick={() => onBridge(token)}
                            className="btn btn-ghost btn-xs sm:hidden"
                            aria-label={`Bridge ${label}`}
                          >
                            <ArrowsUpDownIcon className="size-3.5" /> Bridge
                          </button>
                        )}
                        {token && onShow && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => onShow(holding.address)}
                          >
                            Show in wallet
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs shrink-0"
                          aria-label={`${hidden ? "Restore" : "Hide"} ${label}`}
                          onClick={() => onVisibilityChange(holding.address, !hidden)}
                        >
                          {hidden ? "Restore token" : "Hide token"}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="hidden bg-base-content/[0.025] sm:table-cell" />
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export function WalletTokenGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="group/tokens border-t border-base-content/10">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs text-base-content/60 hover:text-base-content sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon className="size-3.5 -rotate-90 transition-transform group-open/tokens:rotate-0" />
        {label}
      </summary>
      {children}
    </details>
  );
}
