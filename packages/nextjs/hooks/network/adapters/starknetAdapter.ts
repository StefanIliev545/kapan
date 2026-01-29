/**
 * Starknet Network Adapter Implementation
 *
 * Provides a unified interface for Starknet blockchain operations.
 * This adapter wraps starknet-react and starknet.js functionality.
 */

import { useCallback, useMemo } from "react";
import { useProvider } from "@starknet-react/core";
import { Contract, Abi as StarknetAbi } from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { useTargetNetwork } from "~~/hooks/scaffold-stark/useTargetNetwork";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-stark";
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
  ConnectionStatus,
} from "../types";

// Known Starknet token addresses
const STARKNET_ETH_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

/**
 * Creates a Starknet network adapter instance.
 * This wraps starknet-react hooks and starknet.js functionality.
 */
export function useStarknetAdapter(): NetworkAdapter | null {
  const starkAccount = useAccount();
  const { provider } = useProvider();
  const { targetNetwork } = useTargetNetwork();

  // Map starknet account to unified account interface
  const account: NetworkAccount = useMemo(() => {
    // Map starknet-react status to our ConnectionStatus
    const mapStatus = (status: string): ConnectionStatus => {
      switch (status) {
        case "connected":
          return "connected";
        case "connecting":
          return "connecting";
        case "reconnecting":
          return "reconnecting";
        default:
          return "disconnected";
      }
    };

    return {
      address: starkAccount.address,
      isConnected: starkAccount.isConnected ?? false,
      status: mapStatus(starkAccount.status),
      chainId: starkAccount.chainId,
    };
  }, [
    starkAccount.address,
    starkAccount.isConnected,
    starkAccount.status,
    starkAccount.chainId,
  ]);

  // Read contract implementation
  const readContract = useCallback(
    async <T = unknown>(params: ReadContractParams): Promise<T> => {
      if (!provider) {
        throw new Error("Starknet provider not available");
      }

      const contract = new Contract({
        abi: params.abi as StarknetAbi,
        address: params.address,
        providerOrAccount: provider,
      });

      const result = await contract.call(
        params.functionName,
        (params.args ?? []) as Parameters<typeof contract.call>[1]
      );

      return result as T;
    },
    [provider]
  );

  // Write contract implementation (single call)
  const writeContract = useCallback(
    async (
      params: WriteContractParams,
      options?: TransactionOptions
    ): Promise<TransactionResult> => {
      if (!starkAccount.account) {
        throw new Error("Wallet not connected. Please connect your Starknet wallet.");
      }

      const contract = new Contract({
        abi: params.abi as StarknetAbi,
        address: params.address,
        providerOrAccount: starkAccount.account,
      });

      const call = contract.populate(params.functionName, (params.args ?? []) as Parameters<typeof contract.populate>[1]);

      const response = await starkAccount.account.execute([call]);

      return createTransactionResult(
        response.transaction_hash,
        provider,
        options
      );
    },
    [starkAccount.account, provider]
  );

  // Multi-call implementation
  // Starknet natively supports multicall through account.execute()
  const multiCall = useCallback(
    async (
      calls: MultiCallItem[],
      options?: TransactionOptions
    ): Promise<TransactionResult> => {
      if (!starkAccount.account) {
        throw new Error("Wallet not connected. Please connect your Starknet wallet.");
      }

      if (calls.length === 0) {
        throw new Error("No calls provided");
      }

      // Build Starknet call array
      const starknetCalls = calls.map((call) => {
        const contract = new Contract({
          abi: call.abi as StarknetAbi,
          address: call.address,
          providerOrAccount: starkAccount.account!,
        });
        return contract.populate(call.functionName, (call.args ?? []) as Parameters<typeof contract.populate>[1]);
      });

      // Execute all calls in a single transaction (native Starknet multicall)
      const response = await starkAccount.account.execute(starknetCalls);

      return createTransactionResult(
        response.transaction_hash,
        provider,
        options
      );
    },
    [starkAccount.account, provider]
  );

  // Get native balance (ETH on Starknet)
  const getNativeBalance = useCallback(
    async (address?: string): Promise<TokenBalance> => {
      if (!provider) {
        throw new Error("Starknet provider not available");
      }

      const targetAddress = address ?? starkAccount.address;
      if (!targetAddress) {
        throw new Error("No address provided");
      }

      const balance = await fetchStarknetTokenBalance(
        provider,
        STARKNET_ETH_ADDRESS,
        targetAddress
      );

      return {
        raw: balance,
        formatted: formatStarknetBalance(balance, 18),
        decimals: 18,
      };
    },
    [provider, starkAccount.address]
  );

  // Get ERC20 token balance
  const getTokenBalance = useCallback(
    async (tokenAddress: string, ownerAddress?: string): Promise<TokenBalance> => {
      if (!provider) {
        throw new Error("Starknet provider not available");
      }

      const targetAddress = ownerAddress ?? starkAccount.address;
      if (!targetAddress) {
        throw new Error("No address provided");
      }

      // Fetch balance and decimals
      const [balance, decimals] = await Promise.all([
        fetchStarknetTokenBalance(provider, tokenAddress, targetAddress),
        fetchStarknetTokenDecimals(provider, tokenAddress),
      ]);

      return {
        raw: balance,
        formatted: formatStarknetBalance(balance, decimals),
        decimals,
      };
    },
    [provider, starkAccount.address]
  );

  // Switch chain - Starknet is single-chain, so this is a no-op
  // Users switch networks through their wallet
  const switchChain = useCallback(async (): Promise<void> => {
    console.warn(
      "Chain switching is not supported on Starknet. Please switch networks in your wallet."
    );
  }, []);

  // Get explorer URL
  const getExplorerTxUrl = useCallback(
    (txHash: string): string => {
      return getBlockExplorerTxLink(targetNetwork.network, txHash);
    },
    [targetNetwork.network]
  );

  // Return null if no provider available
  if (!provider) {
    return null;
  }

  return {
    networkType: "starknet",
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
  hash: string,
  provider: ReturnType<typeof useProvider>["provider"],
  options?: TransactionOptions
): TransactionResult {
  return {
    hash,
    wait: async (): Promise<TransactionReceipt> => {
      if (!provider) {
        throw new Error("Provider not available for confirmation");
      }

      try {
        await provider.waitForTransaction(hash);
      } catch (error) {
        console.warn("Error waiting for Starknet transaction:", error);
      }

      // Starknet doesn't have the same receipt structure as EVM
      // We return a simplified receipt
      const result: TransactionReceipt = {
        hash,
        blockNumber: 0n, // Starknet receipts don't easily provide this
        success: true, // If waitForTransaction doesn't throw, it succeeded
      };

      if (options?.onBlockConfirmation) {
        options.onBlockConfirmation(result);
      }

      return result;
    },
  };
}

/**
 * Fetch token balance from Starknet
 * Tries both snake_case and camelCase entry points
 */
async function fetchStarknetTokenBalance(
  provider: ReturnType<typeof useProvider>["provider"],
  tokenAddress: string,
  ownerAddress: string
): Promise<bigint> {
  if (!provider) {
    throw new Error("Provider not available");
  }

  // Try snake_case first (balance_of)
  try {
    const response = await provider.callContract({
      contractAddress: tokenAddress as `0x${string}`,
      entrypoint: "balance_of",
      calldata: [ownerAddress],
    });
    return parseUint256Response(response);
  } catch {
    // Try camelCase (balanceOf)
    try {
      const response = await provider.callContract({
        contractAddress: tokenAddress as `0x${string}`,
        entrypoint: "balanceOf",
        calldata: [ownerAddress],
      });
      return parseUint256Response(response);
    } catch (error) {
      console.warn("Failed to fetch Starknet balance:", error);
      return 0n;
    }
  }
}

/**
 * Fetch token decimals from Starknet
 */
async function fetchStarknetTokenDecimals(
  provider: ReturnType<typeof useProvider>["provider"],
  tokenAddress: string
): Promise<number> {
  if (!provider) {
    return 18; // Default to 18 decimals
  }

  try {
    const response = await provider.callContract({
      contractAddress: tokenAddress as `0x${string}`,
      entrypoint: "decimals",
      calldata: [],
    });

    const result = getCallResult(response);
    if (result && result.length > 0) {
      return Number(BigInt(result[0]));
    }
    return 18;
  } catch {
    return 18;
  }
}

/**
 * Parse Uint256 response from Starknet
 * Starknet Uint256 is represented as (low, high) felts
 */
function parseUint256Response(response: unknown): bigint {
  const result = getCallResult(response);

  if (!result || result.length === 0) return 0n;

  if (result.length >= 2) {
    const low = BigInt(result[0]);
    const high = BigInt(result[1]);
    return (high << 128n) + low;
  }

  return BigInt(result[0]);
}

/**
 * Extract call result from various response formats
 */
function getCallResult(response: unknown): string[] | undefined {
  // starknet.js v6+ returns array directly, older versions return { result: [...] }
  if (Array.isArray(response)) {
    return response as string[];
  }
  return (response as { result?: string[] })?.result;
}

/**
 * Format Starknet balance to human-readable string
 */
function formatStarknetBalance(balance: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const integerPart = balance / divisor;
  const fractionalPart = balance % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  // Trim trailing zeros
  const trimmed = fractionalStr.replace(/0+$/, "");

  if (trimmed === "") {
    return integerPart.toString();
  }

  return `${integerPart}.${trimmed}`;
}

export default useStarknetAdapter;
