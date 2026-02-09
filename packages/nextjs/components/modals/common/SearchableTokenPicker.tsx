"use client";

import { FC, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

// Generic token icon as data URI (simple gray circle with "?" mark)
const FALLBACK_TOKEN_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='15' fill='%23374151' stroke='%234B5563' stroke-width='1'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='%239CA3AF' font-family='system-ui' font-size='14' font-weight='500'%3E?%3C/text%3E%3C/svg%3E";

export interface TokenOption {
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
  icon: string;
  balance?: number;
  /** Optional subtitle (e.g., APY + expiry for PT tokens) */
  subtitle?: string;
}

interface SearchableTokenPickerProps {
  /** Currently selected token */
  selected: TokenOption | null;
  /** Available tokens to choose from */
  options: TokenOption[];
  /** Callback when a token is selected */
  onSelect: (token: TokenOption) => void;
  /** Placeholder when no token selected */
  placeholder?: string;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Loading state for options */
  isLoading?: boolean;
}

/**
 * A searchable token picker that opens a modal with search functionality.
 * Handles large token lists efficiently by limiting displayed results.
 */
export const SearchableTokenPicker: FC<SearchableTokenPickerProps> = ({
  selected,
  options,
  onSelect,
  placeholder = "Select token",
  disabled = false,
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Small delay to ensure modal is rendered
      const timeoutId = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  // Filter and limit tokens based on search
  const filteredTokens = useMemo(() => {
    const searchLower = search.toLowerCase().trim();

    let filtered = options;
    if (searchLower) {
      filtered = options.filter(t =>
        t.symbol.toLowerCase().includes(searchLower) ||
        t.name?.toLowerCase().includes(searchLower) ||
        t.address.toLowerCase() === searchLower
      );
    }

    // Limit to first 100 results to keep UI responsive
    return filtered.slice(0, 100);
  }, [options, search]);

  const handleSelect = useCallback((token: TokenOption) => {
    onSelect(token);
    setIsOpen(false);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  }, []);

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className="hover:bg-base-200/50 flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selected ? (
          <>
            <div className="relative size-5 flex-shrink-0">
              <Image
                src={selected.icon}
                alt={selected.symbol}
                fill
                className="rounded-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = FALLBACK_TOKEN_ICON;
                }}
              />
            </div>
            <span className="text-sm font-medium">{selected.symbol}</span>
          </>
        ) : (
          <span className="text-base-content/50 text-sm">{placeholder}</span>
        )}
        <svg className="text-base-content/40 size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Modal - rendered via portal to escape parent modal constraints */}
      {isOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onKeyDown={handleKeyDown}>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="bg-base-100 border-base-300/50 relative z-10 flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border shadow-xl">
          {/* Header with search */}
          <div className="border-base-300/50 flex-shrink-0 border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">Select Token</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-lg p-1 transition-colors"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <div className="relative">
              <MagnifyingGlassIcon className="text-base-content/40 absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or paste address"
                className="bg-base-200/50 border-base-300/50 placeholder:text-base-content/40 focus:border-primary/50 w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* Token list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="loading loading-spinner loading-sm"></span>
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="text-base-content/50 py-8 text-center text-sm">
                {search ? "No tokens found" : "No tokens available"}
              </div>
            ) : (
              <div className="divide-base-200/50 divide-y">
                {filteredTokens.map((token) => (
                  <button
                    key={token.address}
                    onClick={() => handleSelect(token)}
                    className="hover:bg-base-200/50 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
                  >
                    <div className="relative size-8 flex-shrink-0">
                      <Image
                        src={token.icon}
                        alt={token.symbol}
                        fill
                        className="rounded-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = FALLBACK_TOKEN_ICON;
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{token.symbol}</div>
                      {(token.name || token.subtitle) && (
                        <div className="text-base-content/50 truncate text-xs">
                          {token.subtitle || token.name}
                        </div>
                      )}
                    </div>
                    {token.balance !== undefined && token.balance > 0 && (
                      <div className="text-base-content/50 text-right text-xs">
                        {token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </div>
                    )}
                  </button>
                ))}
                {options.length > 100 && filteredTokens.length === 100 && (
                  <div className="text-base-content/40 py-2 text-center text-xs">
                    Showing first 100 results. Search to find more.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default SearchableTokenPicker;
