"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { usePaymasterGasTokens } from "@starknet-react/core";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { GasTokenComponent } from "./GasTokenComponent";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";

// Default gas token (STRK)
const DEFAULT_GAS_TOKEN = {
  name: "STRK",
  symbol: "STRK",
  icon: "/logos/strk.svg",
  address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK mainnet address
  balance: "0.00"
};

const normalizeAddress = (address: string): string => {
  if (!address) return "";
  let normalized = address.toLowerCase();
  if (!normalized.startsWith("0x")) {
    normalized = `0x${normalized}`;
  }
  const stripped = normalized.slice(2).replace(/^0+/, "");
  return `0x${stripped || "0"}`;
};

const ALLOWED_GAS_TOKEN_ADDRESSES = new Set(
  [
    "0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b",
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    "0x0498edfaf50ca5855666a700c25dd629d577eb9afccdf3b5977aec79aee55ada",
    "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ].map(normalizeAddress),
);


interface TokenInfo {
  address: string;
  decimals: number;
}

export const GasTokenSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { selectedToken } = useSelectedGasToken();

  // Fetch available gas tokens from paymaster
  // Note: This may fail if no paymaster is configured, which is expected
  const { data: paymasterTokens, error, isLoading } = usePaymasterGasTokens({
    enabled: true, // Enable the query
  });

  useOutsideClick(dropdownRef, () => setIsOpen(false));

  // Normalize token list from paymaster to get addresses and decimals
  const availableTokens: TokenInfo[] = useMemo(() => {
    const paymaster = (paymasterTokens || [])
      .map((token: any) => ({
        address: token.token_address || "",
        decimals: Number(token.decimals ?? 18),
      }))
      .filter(
        (token) =>
          token.address && ALLOWED_GAS_TOKEN_ADDRESSES.has(normalizeAddress(token.address)),
      );

    // If no paymaster tokens, default to STRK
    return paymaster.length > 0
      ? paymaster
      : [{ address: DEFAULT_GAS_TOKEN.address, decimals: 18 }];
  }, [paymasterTokens]);

  const handleTokenSelect = () => {
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Gas Token Button */}
      <motion.button
        className="flex items-center gap-2 hover:bg-base-300/50 transition-colors duration-200 rounded p-1"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {/* Gas Icon */}
        <div className="w-4 h-4 text-base-content/70">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2v-3h1c.55 0 1 .45 1 1v3.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5z"/>
          </svg>
        </div>

        {/* Selected Token Icon (no text) */}
        <div className="w-4 h-4 relative">
          <Image
            src={selectedToken.icon}
            alt={selectedToken.name}
            fill
            className="object-contain"
            onError={(e) => {
              // Fallback to a default icon if the token icon fails to load
              const target = e.target as HTMLImageElement;
              target.src = '/logos/strk.svg';
            }}
          />
        </div>

        {/* Dropdown Arrow */}
        <ChevronDownIcon 
          className={`w-4 h-4 text-base-content/50 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 right-0 z-50 bg-base-100 border border-base-300/50 rounded-lg shadow-xl min-w-[360px] max-h-[400px] overflow-auto"
          >
            <div className="p-3">
              <div className="text-sm font-medium text-base-content/70 mb-3 px-2">
                Select Gas Token
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span className="ml-2 text-sm text-base-content/60">Loading tokens...</span>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="text-sm text-error px-2 py-4 text-center">
                  Failed to load gas tokens
                </div>
              )}

              {/* Token Grid */}
              <div className="grid grid-cols-3 gap-2">
                {availableTokens.map((tokenInfo, index) => (
                  <GasTokenComponent
                    key={`${tokenInfo.address}-${index}`}
                    address={tokenInfo.address}
                    decimals={tokenInfo.decimals}
                    isSelected={selectedToken.address === tokenInfo.address}
                    onSelect={handleTokenSelect}
                  />
                ))}
              </div>

              {/* Paymaster Info */}
              <div className="mt-3 pt-3 border-t border-base-300/30">
                <div className="text-xs text-base-content/50 text-center">
                  Gas fees paid with selected token
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
