"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { CustomConnectButton } from "~~/components/scaffold-stark/CustomConnectButton";
import { GasTokenSelector } from "~~/components/GasTokenSelector";

const NETWORK_STORAGE_KEY = "kapan-network-filter-selection";

export type WalletButtonVariant = "auto" | "evm" | "starknet";

export interface WalletButtonProps {
  /**
   * Which wallet type to show:
   * - "auto": Automatically switch based on selected network (reads from URL/localStorage)
   * - "evm": Always show EVM (RainbowKit) wallet
   * - "starknet": Always show Starknet wallet
   */
  variant?: WalletButtonVariant;
  /**
   * Whether to show the gas token selector (Starknet only)
   */
  showGasSelector?: boolean;
  /**
   * Custom class name for the container
   */
  className?: string;
}

/**
 * Unified wallet connection button that handles both EVM and Starknet wallets.
 *
 * Can operate in three modes:
 * - "auto" (default): Automatically switches between EVM and Starknet based on selected network
 * - "evm": Always shows the EVM wallet connection
 * - "starknet": Always shows the Starknet wallet connection
 */
export const WalletButton = ({
  variant = "auto",
  showGasSelector = true,
  className = "",
}: WalletButtonProps) => {
  const searchParams = useSearchParams();
  const [selectedNetwork, setSelectedNetwork] = useState("base");

  // Function to get current network from URL or cache
  const getCurrentNetwork = useCallback(() => {
    if (typeof window === "undefined") return "base";

    // Check URL first
    const url = new URL(window.location.href);
    const urlNetwork = url.searchParams.get("network");
    if (urlNetwork) return urlNetwork;

    // Fall back to localStorage cache
    try {
      const cached = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (cached) return cached;
    } catch {
      // Ignore localStorage errors
    }

    return "base";
  }, []);

  // Initialize and sync with URL/cache
  useEffect(() => {
    if (variant === "auto") {
      setSelectedNetwork(getCurrentNetwork());
    }
  }, [searchParams, getCurrentNetwork, variant]);

  // Listen for popstate (browser back/forward)
  useEffect(() => {
    if (variant !== "auto") return;

    const handlePopState = () => {
      setSelectedNetwork(getCurrentNetwork());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [getCurrentNetwork, variant]);

  // Poll for URL changes (since NetworkFilter uses shallow updates that don't trigger React)
  useEffect(() => {
    if (variant !== "auto") return;

    let lastNetwork = selectedNetwork;

    const checkNetwork = () => {
      const current = getCurrentNetwork();
      if (current !== lastNetwork) {
        lastNetwork = current;
        setSelectedNetwork(current);
      }
    };

    const interval = setInterval(checkNetwork, 200);
    return () => clearInterval(interval);
  }, [selectedNetwork, getCurrentNetwork, variant]);

  // Determine which wallet to show
  const showStarknet = useMemo(() => {
    if (variant === "starknet") return true;
    if (variant === "evm") return false;
    return selectedNetwork === "starknet";
  }, [variant, selectedNetwork]);

  if (variant !== "auto") {
    // Simple mode - no animation needed
    return (
      <div className={`flex items-center ${className}`}>
        {showStarknet ? (
          <div className="flex items-center bg-base-200/80 hover:bg-base-200 transition-colors duration-200 rounded-lg border border-base-content/10">
            <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
              <CustomConnectButton />
            </div>
            {showGasSelector && (
              <>
                <div className="h-7 w-[1px] bg-base-content/10"></div>
                <div className="px-3 py-1.5">
                  <GasTokenSelector />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center bg-base-200/80 hover:bg-base-200 transition-colors duration-200 rounded-lg border border-base-content/10">
            <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
              <RainbowKitCustomConnectButton />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Auto mode - animate between wallet types
  return (
    <div className={`flex items-center ${className}`}>
      <AnimatePresence mode="wait">
        {showStarknet ? (
          <motion.div
            key="starknet"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
          >
            {/* Starknet glow effect - subtle */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-orange-400/30 rounded-lg blur-sm opacity-60" />
              <div className="relative flex items-center bg-base-200/80 hover:bg-base-200 transition-colors duration-200 rounded-lg border border-base-content/10">
                <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
                  <CustomConnectButton />
                </div>
                {showGasSelector && (
                  <>
                    <div className="h-7 w-[1px] bg-base-content/10"></div>
                    <div className="px-3 py-1.5">
                      <GasTokenSelector />
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="evm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="flex items-center bg-base-200/80 hover:bg-base-200 transition-colors duration-200 rounded-lg border border-base-content/10"
          >
            <div className="relative flex-1 px-3 py-1.5 cursor-pointer">
              <RainbowKitCustomConnectButton />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletButton;
