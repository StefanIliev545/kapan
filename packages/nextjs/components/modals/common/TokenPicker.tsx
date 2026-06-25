"use client";

import { FC, useMemo, useState } from "react";
import Image from "next/image";
import { formatUnits } from "viem";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDownIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import type { SwapAsset } from "../SwapModalShell";

interface TokenPickerProps {
  /** Currently selected asset (the one shown on the trigger). */
  asset: SwapAsset | null;
  /** All choosable assets — typically the modal's `fromAssets` or `toAssets` minus the other side. */
  assets: SwapAsset[];
  /** Called when the user picks a token from the list. */
  onSelect: (asset: SwapAsset) => void;
  /** When true, render as static (no chevron, no popover) — used for read-only `From` slots. */
  disabled?: boolean;
  /** Auto-shows a search box once the list is at least this long. Default 6. */
  searchAfter?: number;
  /** Aligns the popover content to the trigger's start edge by default; flip to `"end"` for
   *  right-anchored triggers (typically the `To` slot). */
  align?: "start" | "end" | "center";
}

/**
 * Token picker with a Radix Popover dropdown. Renders to a portal so the list never gets
 * clipped by the modal's `overflow-hidden` parents — a recurring failure mode with native
 * `<select>` and naively-positioned divs inside dialog modals.
 */
export const TokenPicker: FC<TokenPickerProps> = ({
  asset,
  assets,
  onSelect,
  disabled = false,
  searchAfter = 6,
  align = "start",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return assets;
    const q = query.trim().toLowerCase();
    return assets.filter(
      a =>
        a.symbol.toLowerCase().includes(q) ||
        a.address.toLowerCase().includes(q) ||
        (a.vaultLabel?.toLowerCase().includes(q) ?? false),
    );
  }, [assets, query]);

  // Identity that distinguishes multiple vaults sharing the same underlying token (Euler).
  const keyOf = (a: SwapAsset) => a.eulerCollateralVault ?? a.address;

  const showSearch = assets.length >= searchAfter;

  // Static render for read-only slots (e.g. close-position's debt side is fixed by the position).
  if (disabled || assets.length <= 1) {
    return (
      <div className="flex items-center gap-1.5">
        {asset && (
          <div className="relative size-5 flex-shrink-0">
            <Image src={asset.icon} alt={asset.symbol} fill sizes="20px" className="rounded-full object-contain" />
          </div>
        )}
        <span className="text-sm font-medium">{asset?.symbol ?? "-"}</span>
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="hover:bg-base-200 flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors focus:outline-none"
        >
          {asset && (
            <div className="relative size-5 flex-shrink-0">
              <Image src={asset.icon} alt={asset.symbol} fill sizes="20px" className="rounded-full object-contain" />
            </div>
          )}
          <span className="text-sm font-medium">{asset?.symbol ?? "Select"}</span>
          <ChevronDownIcon className="text-base-content/50 size-3.5" />
        </button>
      </Popover.Trigger>

      {/* Portal escapes the modal's overflow-hidden container — list can grow past modal edges
          without clipping. z-[80] is above the daisyUI dialog backdrop (z-50) and our own dialog. */}
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className="bg-base-100 border-base-300 z-[80] w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border shadow-lg"
        >
          {showSearch && (
            <div className="border-base-300/50 flex items-center gap-1.5 border-b px-2 py-1.5">
              <MagnifyingGlassIcon className="text-base-content/40 size-4" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by symbol or address"
                className="placeholder:text-base-content/30 w-full bg-transparent text-xs focus:outline-none"
              />
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="text-base-content/50 px-3 py-4 text-center text-xs">No tokens match</li>
            ) : (
              filtered.map(t => {
                const isSelected = asset != null && keyOf(asset) === keyOf(t);
                const balance = Number.parseFloat(formatUnits(t.rawBalance, t.decimals));
                const usd =
                  t.price && balance > 0
                    ? balance * Number(formatUnits(t.price, 8))
                    : null;
                return (
                  <li key={keyOf(t)}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(t);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`hover:bg-base-200 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                        isSelected ? "bg-base-200/60" : ""
                      }`}
                    >
                      <div className="relative size-6 flex-shrink-0">
                        <Image src={t.icon} alt={t.symbol} fill sizes="24px" className="rounded-full object-contain" />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{t.symbol}</span>
                        {t.vaultLabel ? (
                          <span className="text-base-content/50 truncate text-[10px]">{t.vaultLabel}</span>
                        ) : (
                          balance > 0 && (
                            <span className="text-base-content/50 truncate text-[10px]">
                              {balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              {usd !== null ? ` · $${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ""}
                            </span>
                          )
                        )}
                      </div>
                      {isSelected && <span className="text-success ml-auto text-xs">✓</span>}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
