import { useScaffoldReadContract } from "./useScaffoldReadContract";
import { CollateralToken } from "~~/components/specific/collateral/CollateralSelector";
import { Uint256 } from "starknet";
import { feltToString } from "~~/utils/protocols";
import { useEffect, useRef, useState } from "react";

interface SupportedAssetInfoResp {
    0: string | bigint;
    1: string | bigint;
    2: number | bigint;
    3: bigint | { low: bigint | number; high: bigint | number };
}

/**
 * useCollateral fetches all supported collateral tokens (address, symbol, decimals, balance) for a protocol in a single call.
 * Returns an array of CollateralToken objects.
 */
export function useCollateral({
  protocolName,
  userAddress,
  isOpen,
  vesuV1PoolId,
  vesuV2PoolAddress,
}: {
  protocolName: "Vesu" | "VesuV2" | "Nostra";
  userAddress: string;
  isOpen: boolean;
  vesuV1PoolId?: bigint;
  vesuV2PoolAddress?: string;
}): { collaterals: CollateralToken[]; isLoading: boolean } {
  const contractName = protocolName === "Vesu" ? "VesuGateway" : protocolName === "VesuV2" ? "VesuGatewayV2" : "NostraGateway";
  const { data, isLoading } = useScaffoldReadContract({
    contractName,
    functionName: "get_supported_assets_info",
    args: (
      protocolName === "Vesu"
        ? [userAddress, vesuV1PoolId ?? 0n]
        : protocolName === "VesuV2"
          ? [userAddress, vesuV2PoolAddress ?? 0n]
          : [userAddress]
    ) as any,
    enabled: isOpen && !!userAddress,
    watch: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  } as any); //hack cause function definitions differ for nostra and vesu. TODO: fix this

  // Track first successful load to suppress loading state on subsequent refetches
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  useEffect(() => {
    if (!hasLoadedOnce && Array.isArray(data)) {
      setHasLoadedOnce(true);
    }
  }, [data, hasLoadedOnce]);

  // Keep previous successful data to avoid UI clearing during refetch
  const previousDataRef = useRef<any[]>([]);
  useEffect(() => {
    if (Array.isArray(data) && data.length > 0) {
      previousDataRef.current = data as any[];
    }
  }, [data]);

  const sourceData = Array.isArray(data) ? data : previousDataRef.current;

  // data: Array<(ContractAddress, felt252, u8, u256)>
  const collaterals: CollateralToken[] = Array.isArray(sourceData)
    ? sourceData.map((item: SupportedAssetInfoResp) => {
        const { 0: address, 1: symbol, 2: decimals, 3: rawBalance } = item;
        // Handle Uint256 for rawBalance
        let rawBalanceBigInt = 0n;
        if (rawBalance && typeof rawBalance === "object" && "low" in rawBalance && "high" in rawBalance) {
          rawBalanceBigInt = BigInt(rawBalance.low) + (BigInt(rawBalance.high) << 128n);
        } else if (typeof rawBalance === "bigint" || typeof rawBalance === "number") {
          rawBalanceBigInt = BigInt(rawBalance);
        }
        const decimalsNum = decimals ? Number(decimals) : 18;
        const addressString = `0x${BigInt(address).toString(16).padStart(64, "0")}`;
        return {
          address: addressString,
          symbol: feltToString(typeof symbol === "bigint" ? symbol : BigInt(symbol)),
          decimals: decimalsNum,
          supported: true,
          balance: rawBalanceBigInt && decimalsNum ? Number(rawBalanceBigInt) / 10 ** decimalsNum : 0,
          rawBalance: rawBalanceBigInt,
        };
      })
    : [];

  return { collaterals, isLoading: isLoading && !hasLoadedOnce };
}
