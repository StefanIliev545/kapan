import { useMemo } from "react";
import { Address } from "viem";
import { useReadContract } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";

/**
 * Reserve configuration data for LTV calculations
 * This matches the struct returned by getReserveConfigs in our gateway contracts
 */
export interface ReserveConfig {
  token: Address;
  price: bigint;           // Price in base currency (8 decimals for Aave, varies for others)
  ltv: bigint;             // Loan-to-value in basis points (0-10000)
  liquidationThreshold: bigint; // Liquidation threshold in basis points
  decimals: number;
}

/**
 * Predicted position metrics after an action
 */
export interface PredictedPosition {
  totalCollateralUsd: number;
  totalDebtUsd: number;
  currentLtv: number;           // Current LTV as percentage (0-100)
  maxLtv: number;               // Maximum LTV as percentage (0-100)
  liquidationThreshold: number; // Liquidation threshold as percentage (0-100)
  healthFactor: number;         // Health factor (>1 = safe)
  maxLeverage: number;          // Maximum safe leverage
  availableBorrowUsd: number;   // Additional borrow capacity in USD
}

/**
 * Calculate predicted position metrics from collateral and debt amounts
 */
export function calculatePredictedPosition(
  collaterals: { token: Address; amount: bigint; config: ReserveConfig }[],
  debts: { token: Address; amount: bigint; config: ReserveConfig }[],
  safetyBuffer: number = 0.90
): PredictedPosition {
  let totalCollateralUsd = 0;
  let totalDebtUsd = 0;
  let weightedLtv = 0;
  let weightedLiqThreshold = 0;

  // Calculate collateral values and weighted LTV
  for (const c of collaterals) {
    if (c.amount === 0n) continue;
    const valueUsd = Number(c.amount * c.config.price) / (10 ** c.config.decimals * 1e8); // Assuming 8 decimal price
    totalCollateralUsd += valueUsd;
    weightedLtv += valueUsd * Number(c.config.ltv);
    weightedLiqThreshold += valueUsd * Number(c.config.liquidationThreshold);
  }

  // Calculate debt values
  for (const d of debts) {
    if (d.amount === 0n) continue;
    const valueUsd = Number(d.amount * d.config.price) / (10 ** d.config.decimals * 1e8);
    totalDebtUsd += valueUsd;
  }

  // Calculate weighted averages
  const maxLtvBps = totalCollateralUsd > 0 ? weightedLtv / totalCollateralUsd : 0;
  const liqThresholdBps = totalCollateralUsd > 0 ? weightedLiqThreshold / totalCollateralUsd : 0;

  // Convert to percentages
  const maxLtv = maxLtvBps / 100; // 0-100%
  const liquidationThreshold = liqThresholdBps / 100;
  const currentLtv = totalCollateralUsd > 0 ? (totalDebtUsd / totalCollateralUsd) * 100 : 0;

  // Health factor
  const healthFactor = totalDebtUsd > 0 
    ? (totalCollateralUsd * (liquidationThreshold / 100)) / totalDebtUsd 
    : Infinity;

  // Max leverage: 1 / (1 - LTV) with safety buffer
  const effectiveLtv = (maxLtv / 100) * safetyBuffer;
  const maxLeverage = effectiveLtv >= 0.95 ? 2 : Math.min(1 / (1 - effectiveLtv), 10);

  // Available borrow capacity
  const maxBorrowUsd = totalCollateralUsd * (maxLtv / 100);
  const availableBorrowUsd = Math.max(0, maxBorrowUsd - totalDebtUsd);

  return {
    totalCollateralUsd,
    totalDebtUsd,
    currentLtv,
    maxLtv,
    liquidationThreshold,
    healthFactor,
    maxLeverage: Math.round(maxLeverage * 100) / 100,
    availableBorrowUsd,
  };
}

/**
 * Hook to fetch reserve configs for Aave tokens
 */
export function useAaveReserveConfigs(
  tokens: Address[],
  chainId?: number,
  enabled: boolean = true
) {
  const { data: gatewayInfo } = useDeployedContractInfo({
    contractName: "AaveGatewayView",
    chainId: chainId,
  } as any);

  const { data, isLoading, error } = useReadContract({
    address: gatewayInfo?.address,
    abi: gatewayInfo?.abi,
    functionName: "getReserveConfigs",
    args: [tokens],
    query: {
      enabled: enabled && !!gatewayInfo?.address && tokens.length > 0,
    },
  });

  const configs = useMemo((): ReserveConfig[] => {
    if (!data || !Array.isArray(data)) return [];
    return (data as any[]).map((c: any) => ({
      token: c.token as Address,
      price: BigInt(c.price || 0),
      ltv: BigInt(c.ltv || 0),
      liquidationThreshold: BigInt(c.liquidationThreshold || 0),
      decimals: Number(c.decimals || 18),
    }));
  }, [data]);

  return { configs, isLoading, error };
}

/**
 * Hook to fetch reserve configs for Compound tokens
 */
export function useCompoundReserveConfigs(
  market: Address | undefined,
  chainId?: number,
  enabled: boolean = true
) {
  const { data: gatewayInfo } = useDeployedContractInfo({
    contractName: "CompoundGatewayView",
    chainId: chainId,
  } as any);

  const { data, isLoading, error } = useReadContract({
    address: gatewayInfo?.address,
    abi: gatewayInfo?.abi,
    functionName: "getReserveConfigs",
    args: market ? [market] : undefined,
    query: {
      enabled: enabled && !!gatewayInfo?.address && !!market,
    },
  });

  const configs = useMemo((): ReserveConfig[] => {
    if (!data || !Array.isArray(data)) return [];
    return (data as any[]).map((c: any) => ({
      token: c.token as Address,
      price: BigInt(c.price || 0),
      ltv: BigInt(c.ltv || 0),
      liquidationThreshold: BigInt(c.liquidationThreshold || 0),
      decimals: Number(c.decimals || 18),
    }));
  }, [data]);

  return { configs, isLoading, error };
}

/**
 * Hook to fetch reserve configs for Venus tokens
 */
export function useVenusReserveConfigs(
  chainId?: number,
  enabled: boolean = true
) {
  const { data: gatewayInfo } = useDeployedContractInfo({
    contractName: "VenusGatewayView",
    chainId: chainId,
  } as any);

  const { data, isLoading, error } = useReadContract({
    address: gatewayInfo?.address,
    abi: gatewayInfo?.abi,
    functionName: "getReserveConfigs",
    args: [],
    query: {
      enabled: enabled && !!gatewayInfo?.address,
    },
  });

  const configs = useMemo((): ReserveConfig[] => {
    if (!data || !Array.isArray(data)) return [];
    return (data as any[]).map((c: any) => ({
      token: c.token as Address,
      price: BigInt(c.price || 0),
      ltv: BigInt(c.ltv || 0),
      liquidationThreshold: BigInt(c.liquidationThreshold || 0),
      decimals: Number(c.decimals || 18),
    }));
  }, [data]);

  return { configs, isLoading, error };
}

/**
 * Universal hook that fetches reserve configs based on protocol
 */
export function useReserveConfigs(
  protocol: string,
  tokens: Address[],
  market?: Address,
  chainId?: number,
  enabled: boolean = true
) {
  const protocolLower = protocol.toLowerCase();

  // Determine which protocol hook to use
  const isAave = protocolLower.includes("aave");
  const isCompound = protocolLower.includes("compound");
  const isVenus = protocolLower.includes("venus");

  const aaveResult = useAaveReserveConfigs(tokens, chainId, enabled && isAave);
  const compoundResult = useCompoundReserveConfigs(market, chainId, enabled && isCompound);
  const venusResult = useVenusReserveConfigs(chainId, enabled && isVenus);

  if (isAave) return aaveResult;
  if (isCompound) return compoundResult;
  if (isVenus) return venusResult;

  // Default: return empty
  return { configs: [] as ReserveConfig[], isLoading: false, error: undefined };
}

/**
 * Hook for predictive LTV in multiply/leverage modals
 * Returns the max leverage based on the specific collateral's LTV
 */
export function usePredictiveMaxLeverage(
  protocol: string,
  collateralToken: Address | undefined,
  debtToken: Address | undefined,
  market?: Address,
  chainId?: number,
  safetyBuffer: number = 0.90
) {
  const tokens = useMemo(() => {
    const result: Address[] = [];
    if (collateralToken) result.push(collateralToken);
    if (debtToken && debtToken !== collateralToken) result.push(debtToken);
    return result;
  }, [collateralToken, debtToken]);

  const { configs, isLoading, error } = useReserveConfigs(
    protocol,
    tokens,
    market,
    chainId,
    tokens.length > 0
  );

  const result = useMemo(() => {
    // Find collateral config
    const collateralConfig = configs.find(
      c => c.token.toLowerCase() === collateralToken?.toLowerCase()
    );

    if (!collateralConfig) {
      return {
        maxLtv: 0,
        liquidationThreshold: 0,
        maxLeverage: 2, // Safe default
        collateralConfig: undefined,
        debtConfig: undefined,
      };
    }

    // Calculate max leverage from collateral's LTV
    const maxLtvPercent = Number(collateralConfig.ltv) / 100; // bps to %
    const liqThresholdPercent = Number(collateralConfig.liquidationThreshold) / 100;
    const effectiveLtv = (maxLtvPercent / 100) * safetyBuffer;
    
    let maxLeverage: number;
    if (effectiveLtv >= 0.95) {
      maxLeverage = 2; // Cap at 2x for very high LTV
    } else if (effectiveLtv <= 0) {
      maxLeverage = 1; // No leverage if LTV is 0
    } else {
      maxLeverage = Math.min(1 / (1 - effectiveLtv), 10);
    }

    const debtConfig = configs.find(
      c => c.token.toLowerCase() === debtToken?.toLowerCase()
    );

    return {
      maxLtv: maxLtvPercent,
      liquidationThreshold: liqThresholdPercent,
      maxLeverage: Math.round(maxLeverage * 100) / 100,
      collateralConfig,
      debtConfig,
    };
  }, [configs, collateralToken, debtToken, safetyBuffer]);

  return {
    ...result,
    isLoading,
    error,
    configs,
  };
}
