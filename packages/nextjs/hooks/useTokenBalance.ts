import { useReadContract as useStarkReadContract } from "@starknet-react/core";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";

import { useAccount as useEvmAccount, useReadContract as useEvmReadContract } from "wagmi";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { universalErc20Abi } from "~~/utils/Constants";

export type Network = "evm" | "stark";

export const useTokenBalance = (tokenAddress: string, network: Network = "evm", chainId?: number) => {
  // Always call both families of hooks; gate with enabled flags to satisfy rules-of-hooks
  const { address: starkAddress } = useStarkAccount();
  const { data: starkBalance } = useStarkReadContract({
    address: tokenAddress as `0x${string}`,
    abi: universalErc20Abi,
    functionName: "balance_of",
    args: [starkAddress as `0x${string}`],
    enabled: network === "stark" && !!starkAddress && !!tokenAddress,
  });
  const { data: starkDecimals } = useStarkReadContract({
    address: tokenAddress as `0x${string}`,
    abi: universalErc20Abi,
    functionName: "decimals",
    args: [],
    enabled: network === "stark" && !!tokenAddress,
  });

  const { address: evmAddress } = useEvmAccount();
  const { data: evmBalance } = useEvmReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: "balanceOf",
    args: [evmAddress ?? "0x"],
    chainId,
    query: { enabled: network === "evm" && !!evmAddress && !!tokenAddress },
  });
  const { data: evmDecimals } = useEvmReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: "decimals",
    chainId,
    query: { enabled: network === "evm" && !!tokenAddress },
  });

  if (network === "stark") {
    return {
      balance: (starkBalance as bigint) ?? 0n,
      decimals: starkDecimals ? Number(starkDecimals) : undefined,
    };
  }
  return {
    balance: (evmBalance as bigint) ?? 0n,
    decimals: evmDecimals ? Number(evmDecimals) : undefined,
  };
};
