import { formatEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";

export const useGasEstimate = (network: "evm" | "stark", txRequest?: any, fallbackUnits = 200000n) => {
  const publicClient = usePublicClient();
  const { address } = useAccount();

  const enabled = network === "evm" && Boolean(publicClient);

  const stableStringify = (value: unknown) =>
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

  const queryKey = [
    "gas-estimate-usd",
    network,
    address ?? null,
    fallbackUnits.toString(),
    // txRequest can be large and may contain bigint; stringify safely for a stable key
    txRequest ? stableStringify(txRequest) : null,
  ] as const;

  const { data } = useQuery({
    queryKey,
    enabled,
    // avoid spamming node/Coingecko; cache for a short period
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    initialData: 0,
    queryFn: async () => {
      if (!enabled || !publicClient) return 0;
      try {
        const gasUnits =
          txRequest && address
            ? await publicClient.estimateContractGas({ ...(txRequest as any), account: address })
            : fallbackUnits;

        const [gasPrice, ethUsd] = await Promise.all([
          publicClient.getGasPrice(),
          fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
          )
            .then(r => r.json())
            .then(d => d.ethereum.usd as number),
        ]);

        const costEth = Number(formatEther(gasPrice * gasUnits));
        return costEth * ethUsd;
      } catch (e) {
        console.error(e);
        return 0;
      }
    },
  });

  return data ?? 0;
};
