import { useScaffoldReadContract } from "./useScaffoldReadContract";
import { CollateralToken } from "~~/components/specific/collateral/CollateralSelector";
import { Uint256 } from "starknet";
import { feltToString } from "~~/utils/protocols";

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
}: {
  protocolName: "Vesu" | "Nostra";
  userAddress: string;
  isOpen: boolean;
}): { collaterals: CollateralToken[]; isLoading: boolean } {
  const contractName = protocolName === "Vesu" ? "VesuGateway" : "NostraGateway";
  const { data, isLoading } = useScaffoldReadContract({
    contractName,
    functionName: "get_supported_assets_info",
    args: [userAddress],
    enabled: isOpen && !!userAddress,
  });

  // data: Array<(ContractAddress, felt252, u8, u256)>
  const collaterals: CollateralToken[] = Array.isArray(data)
    ? data.map((item: SupportedAssetInfoResp) => {
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
        console.log("addressString", addressString);
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

  return { collaterals, isLoading };
}
