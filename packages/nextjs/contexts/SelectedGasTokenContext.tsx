"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface SelectedGasToken {
  address: string;
  symbol: string;
  name: string;
  icon: string;
  balance: string;
  decimals?: number;
  mode?: "default" | "collateral" | "borrow";
  protocol?: string;
  amount?: string;
  useMax?: boolean;
  vesuContext?: {
    poolId: string;
    counterpartToken: string;
  };
  lastEstimate?: {
    suggestedMaxFee?: string;
    estimatedFee?: string;
    tokenAddress: string;
    updatedAt: number;
    mode?: "default" | "collateral" | "borrow";
  };
}

interface SelectedGasTokenContextType {
  selectedToken: SelectedGasToken;
  updateSelectedToken: (token: SelectedGasToken) => void;
}

const STORAGE_KEY = "selected-gas-token";
const DEFAULT_TOKEN: SelectedGasToken = {
  address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  symbol: "STRK",
  name: "STRK",
  icon: "/logos/strk.svg",
  balance: "0.000",
  decimals: 18,
  mode: "default",
  lastEstimate: undefined,
};

const SelectedGasTokenContext = createContext<SelectedGasTokenContextType | undefined>(undefined);

export const SelectedGasTokenProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedToken, setSelectedToken] = useState<SelectedGasToken>(DEFAULT_TOKEN);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SelectedGasToken;
        setSelectedToken({
          ...DEFAULT_TOKEN,
          ...parsed,
          mode: parsed.mode ?? "default",
          lastEstimate: parsed.lastEstimate,
        });
      }
    } catch (error) {
      console.warn("Failed to load selected gas token from localStorage:", error);
    }
  }, []);

  // Save to localStorage when token changes
  const updateSelectedToken = (token: SelectedGasToken) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
    } catch (error) {
      console.warn("Failed to save selected gas token to localStorage:", error);
    }
    setSelectedToken(token);
  };

  return (
    <SelectedGasTokenContext.Provider value={{ selectedToken, updateSelectedToken }}>
      {children}
    </SelectedGasTokenContext.Provider>
  );
};

export const useSelectedGasToken = () => {
  const context = useContext(SelectedGasTokenContext);
  if (context === undefined) {
    throw new Error("useSelectedGasToken must be used within a SelectedGasTokenProvider");
  }
  return context;
};
