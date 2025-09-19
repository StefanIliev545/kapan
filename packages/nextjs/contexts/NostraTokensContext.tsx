import { createContext, useContext, useMemo } from "react";

import type { ReactNode } from "react";

import { useNostraTokensData, type UseNostraTokensDataResult } from "~~/hooks/useNostraTokens";

const NostraTokensContext = createContext<UseNostraTokensDataResult | null>(null);

interface NostraTokensProviderProps {
  children: ReactNode;
}

export const NostraTokensProvider = ({ children }: NostraTokensProviderProps) => {
  const {
    assets,
    tokenAddresses,
    rateMap,
    priceMap,
    decimalsMap,
    tokens,
    isLoading,
    assetInfoError,
    interestRatesError,
    tokenPricesError,
    tokenDecimalsError,
  } = useNostraTokensData();

  const value = useMemo<UseNostraTokensDataResult>(
    () => ({
      assets,
      tokenAddresses,
      rateMap,
      priceMap,
      decimalsMap,
      tokens,
      isLoading,
      assetInfoError,
      interestRatesError,
      tokenPricesError,
      tokenDecimalsError,
    }),
    [
      assets,
      tokenAddresses,
      rateMap,
      priceMap,
      decimalsMap,
      tokens,
      isLoading,
      assetInfoError,
      interestRatesError,
      tokenPricesError,
      tokenDecimalsError,
    ],
  );

  return <NostraTokensContext.Provider value={value}>{children}</NostraTokensContext.Provider>;
};

export const useNostraTokens = () => {
  const context = useContext(NostraTokensContext);

  if (!context) {
    throw new Error("useNostraTokens must be used within a NostraTokensProvider");
  }

  return context;
};
