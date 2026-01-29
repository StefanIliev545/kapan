/**
 * EVM Network Adapter Implementation
 *
 * Provides a unified interface for EVM blockchain operations using wagmi/viem.
 * This adapter wraps the existing scaffold-eth hooks and wagmi functionality.
 */

import { useCallback, useMemo } from "react";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useSwitchChain,
} from "wagmi";
import { Abi, formatUnits, Hash } from "viem";
import { getPublicClient } from "@wagmi/core";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth";
import { ERC20ABI } from "~~/contracts/externalContracts";
import type {
  NetworkAdapter,
  NetworkAccount,
  ReadContractParams,
  WriteContractParams,
  MultiCallItem,
  TransactionOptions,
  TransactionResult,
  TransactionReceipt,
  TokenBalance,
} from "../types";

/**
 * Creates an EVM network adapter instance.
 * This is the core implementation that wraps wagmi/viem functionality.
 */
export function useEvmAdapter(chainId?: number): NetworkAdapter | null {
  const wagmiAccount = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });
  const { switchChainAsync } = useSwitchChain();

  // Map wagmi account to unified account interface
  const account: NetworkAccount = useMemo(
    () => ({
      address: wagmiAccount.address,
      isConnected: wagmiAccount.isConnected,
      status: wagmiAccount.status,
      chainId: wagmiAccount.chain?.id,
    }),
    [
      wagmiAccount.address,
      wagmiAccount.isConnected,
      wagmiAccount.status,
      wagmiAccount.chain?.id,
    ]
  );

  // Read contract implementation
  const readContract = useCallback(
    async <T = unknown>(params: ReadContractParams): Promise<T> => {
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const result = await publicClient.readContract({
        address: params.address as `0x${string}`,
        abi: params.abi as Abi,
        functionName: params.functionName,
        args: params.args as readonly unknown[],
      });

      return result as T;
    },
    [publicClient]
  );

  // Write contract implementation
  const writeContract = useCallback(
    async (
      params: WriteContractParams,
      options?: TransactionOptions
    ): Promise<TransactionResult> => {
      if (!walletClient) {
        throw new Error("Wallet client not available. Please connect your wallet.");
      }

      const hash = await walletClient.writeContract({
        address: params.address as `0x${string}`,
        abi: params.abi as Abi,
        functionName: params.functionName,
        args: params.args as readonly unknown[],
        value: params.value,
      });

      return createTransactionResult(
        hash,
        wagmiAccount.chain?.id,
        options
      );
    },
    [walletClient, wagmiAccount.chain?.id]
  );

  // Multi-call implementation
  // EVM doesn't have native multicall like Starknet, so we execute sequentially
  // For batched operations, the KapanRouter should be used instead
  const multiCall = useCallback(
    async (
      calls: MultiCallItem[],
      options?: TransactionOptions
    ): Promise<TransactionResult> => {
      if (!walletClient) {
        throw new Error("Wallet client not available. Please connect your wallet.");
      }

      if (calls.length === 0) {
        throw new Error("No calls provided");
      }

      // For a single call, just execute it directly
      if (calls.length === 1) {
        const call = calls[0];
        return writeContract(
          {
            address: call.address,
            abi: call.abi,
            functionName: call.functionName,
            args: call.args,
            value: call.value,
          },
          options
        );
      }

      // For multiple calls on EVM, we execute them sequentially
      // Note: For production batching, use KapanRouter or a multicall contract
      let lastHash: Hash | undefined;

      for (const call of calls) {
        const hash = await walletClient.writeContract({
          address: call.address as `0x${string}`,
          abi: call.abi as Abi,
          functionName: call.functionName,
          args: call.args as readonly unknown[],
          value: call.value,
        });
        lastHash = hash;
      }

      if (!lastHash) {
        throw new Error("No transaction hash returned");
      }

      return createTransactionResult(
        lastHash,
        wagmiAccount.chain?.id,
        options
      );
    },
    [walletClient, writeContract, wagmiAccount.chain?.id]
  );

  // Get native balance (ETH)
  const getNativeBalance = useCallback(
    async (address?: string): Promise<TokenBalance> => {
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const targetAddress = address ?? wagmiAccount.address;
      if (!targetAddress) {
        throw new Error("No address provided");
      }

      const balance = await publicClient.getBalance({
        address: targetAddress as `0x${string}`,
      });

      return {
        raw: balance,
        formatted: formatUnits(balance, 18),
        decimals: 18,
      };
    },
    [publicClient, wagmiAccount.address]
  );

  // Get ERC20 token balance
  const getTokenBalance = useCallback(
    async (tokenAddress: string, ownerAddress?: string): Promise<TokenBalance> => {
      if (!publicClient) {
        throw new Error("Public client not available");
      }

      const targetAddress = ownerAddress ?? wagmiAccount.address;
      if (!targetAddress) {
        throw new Error("No address provided");
      }

      // Fetch balance and decimals in parallel
      const [balance, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20ABI as Abi,
          functionName: "balanceOf",
          args: [targetAddress as `0x${string}`],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20ABI as Abi,
          functionName: "decimals",
        }) as Promise<number>,
      ]);

      return {
        raw: balance,
        formatted: formatUnits(balance, decimals),
        decimals,
      };
    },
    [publicClient, wagmiAccount.address]
  );

  // Switch chain
  const switchChain = useCallback(
    async (targetChainId: number): Promise<void> => {
      if (!switchChainAsync) {
        throw new Error("Chain switching not available");
      }
      await switchChainAsync({ chainId: targetChainId });
    },
    [switchChainAsync]
  );

  // Get explorer URL
  const getExplorerTxUrl = useCallback(
    (txHash: string): string => {
      const currentChainId = wagmiAccount.chain?.id;
      if (!currentChainId) return "";
      return getBlockExplorerTxLink(currentChainId, txHash);
    },
    [wagmiAccount.chain?.id]
  );

  // Return null if no public client (not connected to a valid chain)
  if (!publicClient) {
    return null;
  }

  return {
    networkType: "evm",
    account,
    readContract,
    writeContract,
    multiCall,
    getNativeBalance,
    getTokenBalance,
    switchChain,
    getExplorerTxUrl,
  };
}

/**
 * Helper to create a transaction result with wait functionality
 */
function createTransactionResult(
  hash: Hash,
  chainId: number | undefined,
  options?: TransactionOptions
): TransactionResult {
  return {
    hash,
    wait: async (): Promise<TransactionReceipt> => {
      // Get public client - chainId is optional, getPublicClient uses default if not provided
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const publicClient = getPublicClient(wagmiConfig, chainId !== undefined ? { chainId } as any : undefined);

      if (!publicClient) {
        throw new Error("Public client not available for confirmation");
      }

      // Determine confirmations based on chain type
      const opStackChainIds = new Set([10, 420, 8453, 84531, 84532, 11155420, 130]);
      const effectiveConfirmations =
        options?.blockConfirmations ??
        (chainId && opStackChainIds.has(chainId) ? 2 : 1);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: effectiveConfirmations,
      });

      const result: TransactionReceipt = {
        hash,
        blockNumber: receipt.blockNumber,
        success: receipt.status === "success",
      };

      if (options?.onBlockConfirmation) {
        options.onBlockConfirmation(result);
      }

      return result;
    },
  };
}

export default useEvmAdapter;
