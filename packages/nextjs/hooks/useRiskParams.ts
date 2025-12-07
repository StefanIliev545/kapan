import { Abi } from "abitype";
import { Address } from "viem";
import { useReadContracts } from "wagmi";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function useRiskParams(options: {
  gateway?: Address;
  gatewayAbi?: Abi;
  marketOrToken?: Address;
  user?: Address;
}) {
  const { gateway, gatewayAbi, marketOrToken = ZERO_ADDRESS, user } = options;
  const enabled = Boolean(gateway && gatewayAbi && user && user !== ZERO_ADDRESS);

  const { data, isLoading, error } = useReadContracts({
    allowFailure: true,
    query: {
      enabled,
    },
    contracts:
      enabled && gateway && gatewayAbi && marketOrToken && user
        ? [
            {
              address: gateway,
              abi: gatewayAbi,
              functionName: "getLtv",
              args: [marketOrToken, user],
            },
            {
              address: gateway,
              abi: gatewayAbi,
              functionName: "getMaxLtv",
              args: [marketOrToken, user],
            },
          ]
        : [],
  });

  const ltvBps = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const lltvBps = (data?.[1]?.result as bigint | undefined) ?? 0n;

  return { ltvBps, lltvBps, isLoading, error };
}
