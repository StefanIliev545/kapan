"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface SelectedGasToken {
  address: string;
  symbol: string;
  name: string;
  icon: string;
  balance: string;
  decimals?: number;
  mode?: "default" | "sponsored" | "collateral" | "borrow";
  protocol?: string;
  amount?: string;
  useMax?: boolean;
  vesuContext?: {
    poolId: string;
    counterpartToken: string;
  };
}

interface SelectedGasTokenContextType {
  selectedToken: SelectedGasToken;
  updateSelectedToken: (token: SelectedGasToken) => void;
  updateTokenMetadata: (metadata: {
    mode?: SelectedGasToken["mode"];
    protocol?: SelectedGasToken["protocol"];
    amount?: SelectedGasToken["amount"];
    useMax?: SelectedGasToken["useMax"];
    vesuContext?: SelectedGasToken["vesuContext"] | null;
  }) => void;
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

  const updateTokenMetadata: SelectedGasTokenContextType["updateTokenMetadata"] = metadata => {
    setSelectedToken(prev => {
      const nextMode = metadata.mode ?? prev.mode ?? "default";
      const isCustomMode = nextMode === "collateral" || nextMode === "borrow";

      const hasProtocol = Object.prototype.hasOwnProperty.call(metadata, "protocol");
      const hasAmount = Object.prototype.hasOwnProperty.call(metadata, "amount");
      const hasUseMax = Object.prototype.hasOwnProperty.call(metadata, "useMax");
      const hasVesu = Object.prototype.hasOwnProperty.call(metadata, "vesuContext");

      const nextToken: SelectedGasToken = {
        ...prev,
        mode: nextMode,
      };

      if (isCustomMode) {
        nextToken.protocol = hasProtocol ? metadata.protocol ?? undefined : prev.protocol;
        nextToken.amount = hasAmount ? (metadata.amount ?? undefined) : prev.amount;
        nextToken.useMax = hasUseMax ? metadata.useMax : prev.useMax;

        if (hasVesu) {
          const ctx = metadata.vesuContext;
          if (ctx && ctx.poolId && ctx.counterpartToken) {
            nextToken.vesuContext = {
              poolId: ctx.poolId,
              counterpartToken: ctx.counterpartToken,
            };
          } else {
            nextToken.vesuContext = undefined;
          }
        } else {
          nextToken.vesuContext = prev.vesuContext;
        }
      } else {
        nextToken.protocol = undefined;
        nextToken.amount = undefined;
        nextToken.useMax = undefined;
        nextToken.vesuContext = undefined;
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextToken));
      } catch (error) {
        console.warn("Failed to save selected gas token metadata to localStorage:", error);
      }

      return nextToken;
    });
  };

  return (
    <SelectedGasTokenContext.Provider value={{ selectedToken, updateSelectedToken, updateTokenMetadata }}>
      {children}
    </SelectedGasTokenContext.Provider>
  );
};

export const useSelectedGasToken = () => {
  const context = useContext(SelectedGasTokenContext);
  if (context === undefined) {
    throw new Error('useSelectedGasToken must be used within a SelectedGasTokenProvider');
  }
  return context;
};
