import { normalizeAddress, useWalletTokenBalances } from "./useWalletTokenBalances";

export type Network = "evm" | "stark";

export const useTokenBalance = (tokenAddress: string, network: Network = "evm", chainId?: number) => {
  const normalizedNetwork = network === "stark" ? "starknet" : network;
  const { balances } = useWalletTokenBalances({
    tokens: [{ address: tokenAddress }],
    network: normalizedNetwork,
    chainId,
  });

  const tokenKey = normalizeAddress(tokenAddress);
  const entry = balances[tokenKey];

  return {
    balance: entry?.balance ?? 0n,
    decimals: entry?.decimals,
  };
};
