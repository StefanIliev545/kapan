"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { CustomConnectButton } from "~~/components/scaffold-stark/CustomConnectButton";
import { GasTokenSelector } from "~~/components/GasTokenSelector";

const NETWORK_STORAGE_KEY = "kapan-network-filter-selection";

// Shared animation config for wallet transitions
const walletAnimationProps = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.9 },
  transition: { duration: 0.2 },
} as const;

// Base container styling for wallet buttons
const containerClasses =
  "bg-base-200/80 hover:bg-base-200 border-base-content/10 flex items-center rounded-lg border transition-colors duration-200";

// Shared wrapper for wallet button content
const WalletButtonContent = ({ children }: { children: ReactNode }) => (
  <div className="relative flex-1 cursor-pointer px-3 py-1.5">{children}</div>
);

// Gas selector with divider (Starknet only)
const GasSelectorSection = () => (
  <>
    <div className="bg-base-content/10 h-7 w-[1px]" />
    <div className="px-3 py-1.5">
      <GasTokenSelector />
    </div>
  </>
);

// Starknet wallet content with optional gas selector and glow effect
const StarknetWalletContent = ({
  showGasSelector,
  withGlow = false,
}: {
  showGasSelector: boolean;
  withGlow?: boolean;
}) => {
  const content = (
    <div className={`${containerClasses}${withGlow ? " relative" : ""}`}>
      <WalletButtonContent>
        <CustomConnectButton />
      </WalletButtonContent>
      {showGasSelector && <GasSelectorSection />}
    </div>
  );

  if (!withGlow) {
    return content;
  }

  return (
    <div className="relative">
      <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-orange-400/30 opacity-60 blur-sm" />
      {content}
    </div>
  );
};

// EVM wallet content
const EvmWalletContent = () => (
  <div className={containerClasses}>
    <WalletButtonContent>
      <RainbowKitCustomConnectButton />
    </WalletButtonContent>
  </div>
);

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
    if (typeof globalThis.window === "undefined") {
      return "base";
    }

    // Check URL first
    const url = new URL(globalThis.location.href);
    const urlNetwork = url.searchParams.get("network");
    if (urlNetwork) {
      return urlNetwork;
    }

    // Fall back to localStorage cache
    try {
      const cached = localStorage.getItem(NETWORK_STORAGE_KEY);
      if (cached) {
        return cached;
      }
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
    if (variant !== "auto") {
      return;
    }

    const handlePopState = () => {
      setSelectedNetwork(getCurrentNetwork());
    };

    globalThis.addEventListener("popstate", handlePopState);
    return () => globalThis.removeEventListener("popstate", handlePopState);
  }, [getCurrentNetwork, variant]);

  // Poll for URL changes (since NetworkFilter uses shallow updates that don't trigger React)
  useEffect(() => {
    if (variant !== "auto") {
      return;
    }

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
    if (variant === "starknet") {
      return true;
    }
    if (variant === "evm") {
      return false;
    }
    return selectedNetwork === "starknet";
  }, [variant, selectedNetwork]);

  if (variant !== "auto") {
    // Simple mode - no animation needed
    return (
      <div className={`flex items-center ${className}`}>
        {showStarknet ? (
          <StarknetWalletContent showGasSelector={showGasSelector} />
        ) : (
          <EvmWalletContent />
        )}
      </div>
    );
  }

  // Auto mode - animate between wallet types
  return (
    <div className={`flex items-center ${className}`}>
      <AnimatePresence mode="wait">
        {showStarknet ? (
          <motion.div key="starknet" {...walletAnimationProps} className="flex items-center gap-2">
            <StarknetWalletContent showGasSelector={showGasSelector} withGlow />
          </motion.div>
        ) : (
          <motion.div key="evm" {...walletAnimationProps}>
            <EvmWalletContent />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WalletButton;
