"use client";

import { createContext, useContext, useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Map network IDs to EVM chain IDs (matching NetworkFilter)
const NETWORK_TO_CHAIN_ID: Record<string, number> = {
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
  linea: 59144,
};

// Default chain ID (Arbitrum)
const DEFAULT_CHAIN_ID = 42161;

type NetworkContextType = {
  selectedChainId: number | null; // null for Starknet
  selectedNetworkId: string | null; // "starknet" or EVM network ID
  networkType: "evm" | "stark"; // Derived from selectedNetworkId
  setSelectedChainId: (chainId: number | null) => void;
  setSelectedNetworkId: (networkId: string | null) => void;
};

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  // Initialize from URL or localStorage, fallback to default
  // Note: We don't use useAccount() here because NetworkProvider wraps WagmiProvider
  const [selectedChainId, setSelectedChainIdState] = useState<number | null>(() => {
    if (typeof window === "undefined") {
      // Default to Arbitrum on server
      return DEFAULT_CHAIN_ID;
    }

    // Check URL first
    const urlParams = new URLSearchParams(window.location.search);
    const urlNetwork = urlParams.get("network");
    if (urlNetwork && urlNetwork !== "starknet" && NETWORK_TO_CHAIN_ID[urlNetwork]) {
      return NETWORK_TO_CHAIN_ID[urlNetwork];
    }

    // Check localStorage
    try {
      const cached = localStorage.getItem("kapan-network-filter-selection");
      if (cached && cached !== "starknet" && NETWORK_TO_CHAIN_ID[cached]) {
        return NETWORK_TO_CHAIN_ID[cached];
      }
    } catch {}

    // Default to Arbitrum
    return DEFAULT_CHAIN_ID;
  });

  const [selectedNetworkId, setSelectedNetworkIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return "starknet";

    // Check URL first
    const urlParams = new URLSearchParams(window.location.search);
    const urlNetwork = urlParams.get("network");
    if (urlNetwork) {
      return urlNetwork;
    }

    // Check localStorage
    try {
      const cached = localStorage.getItem("kapan-network-filter-selection");
      if (cached) {
        return cached;
      }
    } catch {}

    // Default to "starknet"
    return "starknet";
  });

  const setSelectedChainId = useCallback((chainId: number | null) => {
    setSelectedChainIdState(chainId);
    if (chainId === null) {
      setSelectedNetworkIdState("starknet");
    } else {
      const networkId = Object.entries(NETWORK_TO_CHAIN_ID).find(
        ([, id]) => id === chainId
      )?.[0];
      if (networkId) {
        setSelectedNetworkIdState(networkId);
      }
    }
    // Invalidate position queries when network changes
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        (String(query.queryKey[0]).includes("positions") ||
          String(query.queryKey[0]).includes("stark-read") ||
          String(query.queryKey[0]).includes("starknet")),
    });
  }, [queryClient]);

  const setSelectedNetworkId = useCallback((networkId: string | null) => {
    setSelectedNetworkIdState(networkId);
    if (networkId === "starknet" || networkId === null) {
      setSelectedChainIdState(null);
    } else if (NETWORK_TO_CHAIN_ID[networkId]) {
      setSelectedChainIdState(NETWORK_TO_CHAIN_ID[networkId]);
    }
    // Invalidate position queries when network changes
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        (String(query.queryKey[0]).includes("positions") ||
          String(query.queryKey[0]).includes("stark-read") ||
          String(query.queryKey[0]).includes("starknet")),
    });
  }, [queryClient]);

  // Compute networkType from selectedNetworkId
  const networkType = useMemo((): "evm" | "stark" => {
    return selectedNetworkId === "starknet" || selectedNetworkId === null ? "stark" : "evm";
  }, [selectedNetworkId]);

  const value = useMemo(
    () => ({
      selectedChainId,
      selectedNetworkId,
      networkType,
      setSelectedChainId,
      setSelectedNetworkId,
    }),
    [selectedChainId, selectedNetworkId, networkType, setSelectedChainId, setSelectedNetworkId]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetworkContext() {
  const ctx = useContext(NetworkContext);
  if (!ctx) {
    throw new Error("useNetworkContext must be used within NetworkProvider");
  }
  return ctx;
}

