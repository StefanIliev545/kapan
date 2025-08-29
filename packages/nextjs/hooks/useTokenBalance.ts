import { useAccount as useEvmAccount, useReadContract as useEvmReadContract } from "wagmi";
import { useAccount as useStarkAccount, useReadContract as useStarkReadContract } from "@starknet-react/core";
import { formatUnits } from "viem";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { universalErc20Abi } from "~~/utils/Constants";

export type Network = "evm" | "stark";

export const useTokenBalance = (tokenAddress: string, network: Network = "evm") => {
  if (!tokenAddress) {
    return { balance: 0, decimals: undefined };
  }

  if (network === "stark") {
    const { address } = useStarkAccount();
    const { data: balance } = useStarkReadContract({
      address: tokenAddress as `0x${string}`,
      abi: universalErc20Abi,
      functionName: "balance_of",
      args: [address as `0x${string}`],
      enabled: !!address,
    });
    const { data: decimals } = useStarkReadContract({
      address: tokenAddress as `0x${string}`,
      abi: universalErc20Abi,
      functionName: "decimals",
      args: [],
      enabled: true,
    });
    const balanceNum = balance && decimals ? Number(formatUnits(balance as bigint, Number(decimals))) : 0;
    return { balance: balanceNum, decimals: decimals ? Number(decimals) : undefined };
  }

  const { address } = useEvmAccount();
  const { data: balance } = useEvmReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [address ?? "0x"],
    query: { enabled: !!address },
  });
  const { data: decimals } = useEvmReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
    query: { enabled: true },
  });
  const balanceNum = balance && decimals ? Number(formatUnits(balance as bigint, decimals as number)) : 0;
  return { balance: balanceNum, decimals: decimals ? Number(decimals) : undefined };
};

