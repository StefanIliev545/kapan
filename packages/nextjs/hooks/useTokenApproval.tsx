import { useCallback, useState, useMemo } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { type Address, type Hex, encodeFunctionData } from "viem";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { logger } from "~~/utils/logger";

/**
 * Token approval status
 */
export interface ApprovalStatus {
  /** Current allowance amount */
  allowance: bigint;
  /** Whether the current allowance is sufficient for the requested amount */
  isApproved: boolean;
  /** Whether the allowance check is loading */
  isLoading: boolean;
  /** Any error that occurred during the check */
  error: Error | null;
}

/**
 * Approval request parameters
 */
export interface ApprovalRequest {
  /** Token address to approve */
  tokenAddress: Address;
  /** Spender address (who gets the approval) */
  spenderAddress: Address;
  /** Amount to approve (use MaxUint256 for infinite) */
  amount: bigint;
}

/**
 * Token approval execution options
 */
export interface ApprovalOptions {
  /** Show toast notifications (default: true) */
  showNotifications?: boolean;
  /** Wait for confirmations (default: 1) */
  confirmations?: number;
  /** Callback when approval succeeds */
  onSuccess?: (txHash: string) => void;
  /** Callback when approval fails */
  onError?: (error: Error) => void;
}

/**
 * Result returned by the useTokenApproval hook
 */
export interface UseTokenApprovalResult {
  /** Check current allowance for a token/spender pair */
  checkAllowance: (tokenAddress: Address, spenderAddress: Address) => Promise<bigint>;

  /** Check if amount is already approved */
  isApproved: (tokenAddress: Address, spenderAddress: Address, amount: bigint) => Promise<boolean>;

  /** Execute an approval transaction */
  approve: (request: ApprovalRequest, options?: ApprovalOptions) => Promise<string | undefined>;

  /** Execute multiple approval transactions sequentially */
  approveMultiple: (requests: ApprovalRequest[], options?: ApprovalOptions) => Promise<string[]>;

  /** Revoke approval (set to 0) */
  revoke: (tokenAddress: Address, spenderAddress: Address, options?: ApprovalOptions) => Promise<string | undefined>;

  /** Whether an approval is currently in progress */
  isApproving: boolean;

  /** Current approval transaction hash (if any) */
  pendingTxHash: string | undefined;
}

const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Hook for managing ERC20 token approvals
 *
 * This hook provides utilities for:
 * - Checking current allowances
 * - Executing approval transactions with notifications
 * - Revoking approvals
 * - Batch approving multiple tokens
 *
 * @example
 * ```tsx
 * const { checkAllowance, approve, isApproving } = useTokenApproval();
 *
 * // Check if approval is needed
 * const currentAllowance = await checkAllowance(tokenAddress, spenderAddress);
 * if (currentAllowance < amountNeeded) {
 *   await approve({
 *     tokenAddress,
 *     spenderAddress,
 *     amount: amountNeeded,
 *   });
 * }
 * ```
 */
export const useTokenApproval = (): UseTokenApprovalResult => {
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [isApproving, setIsApproving] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<string | undefined>();

  /**
   * Check current allowance for a token/spender pair
   */
  const checkAllowance = useCallback(async (
    tokenAddress: Address,
    spenderAddress: Address
  ): Promise<bigint> => {
    if (!publicClient || !userAddress) {
      return 0n;
    }

    try {
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20ABI,
        functionName: "allowance",
        args: [userAddress, spenderAddress],
      });
      return allowance as bigint;
    } catch (error) {
      logger.warn("[useTokenApproval] Failed to check allowance:", error);
      return 0n;
    }
  }, [publicClient, userAddress]);

  /**
   * Check if amount is already approved
   */
  const isApproved = useCallback(async (
    tokenAddress: Address,
    spenderAddress: Address,
    amount: bigint
  ): Promise<boolean> => {
    const allowance = await checkAllowance(tokenAddress, spenderAddress);
    return allowance >= amount;
  }, [checkAllowance]);

  /**
   * Get token symbol for display
   */
  const getTokenSymbol = useCallback(async (tokenAddress: Address): Promise<string> => {
    if (!publicClient) {
      return tokenAddress.slice(0, 6) + "...";
    }

    try {
      const symbol = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20ABI,
        functionName: "symbol",
      });
      return symbol as string;
    } catch {
      return tokenAddress.slice(0, 6) + "...";
    }
  }, [publicClient]);

  /**
   * Execute an approval transaction
   */
  const approve = useCallback(async (
    request: ApprovalRequest,
    options: ApprovalOptions = {}
  ): Promise<string | undefined> => {
    const {
      showNotifications = true,
      confirmations = 1,
      onSuccess,
      onError,
    } = options;

    if (!publicClient || !walletClient || !userAddress) {
      const error = new Error("Wallet not connected");
      onError?.(error);
      throw error;
    }

    // Check if already approved
    const currentAllowance = await checkAllowance(request.tokenAddress, request.spenderAddress);
    if (currentAllowance >= request.amount) {
      logger.info("[useTokenApproval] Already approved, skipping approval tx");
      return undefined;
    }

    setIsApproving(true);
    setPendingTxHash(undefined);
    let notificationId: string | number | null = null;

    try {
      const tokenSymbol = await getTokenSymbol(request.tokenAddress);

      if (showNotifications) {
        notificationId = notification.loading(
          <TransactionToast step="pending" message={`Approving ${tokenSymbol}...`} />
        );
      }

      // Encode the approval call
      const approveData = encodeFunctionData({
        abi: ERC20ABI,
        functionName: "approve",
        args: [request.spenderAddress, request.amount],
      });

      // Get current nonce to avoid conflicts
      const currentNonce = await publicClient.getTransactionCount({
        address: userAddress,
      });

      // Send the transaction
      const txHash = await walletClient.sendTransaction({
        account: userAddress,
        to: request.tokenAddress,
        data: approveData as Hex,
        nonce: currentNonce,
      });

      setPendingTxHash(txHash);

      if (showNotifications && notificationId) {
        notification.remove(notificationId);
        notificationId = notification.loading(
          <TransactionToast step="sent" txHash={txHash} message={`Approving ${tokenSymbol}...`} />
        );
      }

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations,
        pollingInterval: 1000,
      });

      if (showNotifications && notificationId) {
        notification.remove(notificationId);
        notification.success(
          <TransactionToast step="confirmed" txHash={txHash} message={`${tokenSymbol} approved`} />
        );
      }

      onSuccess?.(txHash);
      return txHash;
    } catch (error: any) {
      if (showNotifications && notificationId) {
        notification.remove(notificationId);
      }

      const errorMessage = error?.message || "Approval failed";
      const isRejection = errorMessage.toLowerCase().includes("rejected") ||
        errorMessage.toLowerCase().includes("denied") ||
        errorMessage.toLowerCase().includes("cancelled");

      if (showNotifications && !isRejection) {
        notification.error(
          <TransactionToast step="failed" message={`Approval failed: ${errorMessage}`} />
        );
      }

      onError?.(error);
      throw error;
    } finally {
      setIsApproving(false);
      setPendingTxHash(undefined);
    }
  }, [publicClient, walletClient, userAddress, checkAllowance, getTokenSymbol]);

  /**
   * Execute multiple approval transactions sequentially
   */
  const approveMultiple = useCallback(async (
    requests: ApprovalRequest[],
    options: ApprovalOptions = {}
  ): Promise<string[]> => {
    const txHashes: string[] = [];

    for (const request of requests) {
      const txHash = await approve(request, options);
      if (txHash) {
        txHashes.push(txHash);
      }
    }

    return txHashes;
  }, [approve]);

  /**
   * Revoke approval (set to 0)
   */
  const revoke = useCallback(async (
    tokenAddress: Address,
    spenderAddress: Address,
    options: ApprovalOptions = {}
  ): Promise<string | undefined> => {
    return approve(
      {
        tokenAddress,
        spenderAddress,
        amount: 0n,
      },
      {
        ...options,
        showNotifications: options.showNotifications ?? true,
      }
    );
  }, [approve]);

  return {
    checkAllowance,
    isApproved,
    approve,
    approveMultiple,
    revoke,
    isApproving,
    pendingTxHash,
  };
};

/**
 * Hook to check approval status for a specific token/spender/amount combination
 *
 * @example
 * ```tsx
 * const { isApproved, isLoading, refresh } = useApprovalStatus({
 *   tokenAddress,
 *   spenderAddress,
 *   amount: parseUnits("100", 18),
 * });
 * ```
 */
export const useApprovalStatus = (params: {
  tokenAddress?: Address;
  spenderAddress?: Address;
  amount?: bigint;
  enabled?: boolean;
}): {
  allowance: bigint;
  isApproved: boolean;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} => {
  const { tokenAddress, spenderAddress, amount = 0n, enabled = true } = params;
  const { address: userAddress } = useAccount();
  const publicClient = usePublicClient();

  const [allowance, setAllowance] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!publicClient || !userAddress || !tokenAddress || !spenderAddress || !enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20ABI,
        functionName: "allowance",
        args: [userAddress, spenderAddress],
      });
      setAllowance(result as bigint);
    } catch (err) {
      setError(err as Error);
      setAllowance(0n);
    } finally {
      setIsLoading(false);
    }
  }, [publicClient, userAddress, tokenAddress, spenderAddress, enabled]);

  // Initial check
  useMemo(() => {
    refresh();
  }, [refresh]);

  const isApproved = allowance >= amount;

  return {
    allowance,
    isApproved,
    isLoading,
    error,
    refresh,
  };
};

/**
 * Utility to build approval calldata for use with batch transactions
 */
export const buildApprovalCalldata = (
  tokenAddress: Address,
  spenderAddress: Address,
  amount: bigint
): { to: Address; data: Hex } => {
  const data = encodeFunctionData({
    abi: ERC20ABI,
    functionName: "approve",
    args: [spenderAddress, amount],
  });

  return {
    to: tokenAddress,
    data: data as Hex,
  };
};

/**
 * Utility to check if a call is an ERC20 approval
 */
export const isApprovalCall = (data: Hex): boolean => {
  // ERC20 approve selector: 0x095ea7b3
  const APPROVE_SELECTOR = "0x095ea7b3";
  return data.toLowerCase().startsWith(APPROVE_SELECTOR);
};

/**
 * Utility to check if an approval is for zero amount (revoke)
 */
export const isZeroApproval = (data: Hex): boolean => {
  if (!isApprovalCall(data)) {
    return false;
  }

  try {
    // The data after selector is: spender (32 bytes) + amount (32 bytes)
    // Amount is the last 32 bytes (64 hex chars)
    const amountHex = data.slice(-64);
    const amount = BigInt("0x" + amountHex);
    return amount === 0n;
  } catch {
    return false;
  }
};

export default useTokenApproval;
