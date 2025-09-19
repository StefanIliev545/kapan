import { createContext, useContext, useMemo } from "react";

import type { ReactNode } from "react";

import { useVesuTokensData, type UseVesuTokensDataResult } from "~~/hooks/useVesuTokens";

interface VesuTokensContextValue extends UseVesuTokensDataResult {
  poolId: bigint;
}

const VesuTokensContext = createContext<VesuTokensContextValue | null>(null);

interface VesuTokensProviderProps {
  poolId: bigint;
  children: ReactNode;
}

export const VesuTokensProvider = ({ poolId, children }: VesuTokensProviderProps) => {
  const {
    assetsWithRates,
    suppliablePositions,
    borrowablePositions,
    assetMap,
    isLoadingAssets,
    assetsError,
  } = useVesuTokensData(poolId);

  const value = useMemo<VesuTokensContextValue>(
    () => ({
      assetsWithRates,
      suppliablePositions,
      borrowablePositions,
      assetMap,
      isLoadingAssets,
      assetsError,
      poolId,
    }),
    [
      assetsWithRates,
      suppliablePositions,
      borrowablePositions,
      assetMap,
      isLoadingAssets,
      assetsError,
      poolId,
    ],
  );

  return <VesuTokensContext.Provider value={value}>{children}</VesuTokensContext.Provider>;
};

export const useVesuTokens = (expectedPoolId?: bigint) => {
  const context = useContext(VesuTokensContext);

  if (!context) {
    throw new Error("useVesuTokens must be used within a VesuTokensProvider");
  }

  if (expectedPoolId !== undefined && context.poolId !== expectedPoolId) {
    throw new Error("useVesuTokens was called with a poolId that does not match the provider");
  }

  return context;
};
