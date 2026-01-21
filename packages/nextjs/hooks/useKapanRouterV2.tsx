import { useCallback, useState, useEffect } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useWalletClient,
  useChainId,
  useSendCalls,
  useWaitForCallsStatus,
  useCapabilities
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import {
  parseUnits,
  decodeAbiParameters,
  encodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  type Address,
  type Hex
} from "viem";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth";
import { qk } from "~~/lib/queryKeys";
import {
  ProtocolInstruction,
  createRouterInstruction,
  createProtocolInstruction,
  encodePullToken,
  encodeToOutput,
  encodeApprove,
  encodePushToken,
  encodeLendingInstruction,
  encodeFlashLoan,
  encodeSplit,
  encodeAdd,
  LendingOp,
  normalizeProtocolName,
} from "~~/utils/v2/instructionHelpers";
import { FlashLoanProvider, FlashLoanVersion, versionToProviderEnum } from "~~/utils/flashLoan";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { simulateTransaction, formatErrorForDisplay, decodeRevertReason } from "~~/utils/errorDecoder";
import { logger } from "~~/utils/logger";

// --- ABI FIXES ---
// Local definition of deauthorizeInstructions/authorizeInstructions signatures 
// to ensure stability even if artifacts are slightly stale.
const DEAUTH_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "protocolName", type: "string" },
          { name: "data", type: "bytes" },
        ],
        name: "instructions",
        type: "tuple[]",
      },
      { name: "caller", type: "address" },
    ],
    name: "deauthorizeInstructions",
    outputs: [
      { name: "targets", type: "address[]" },
      { name: "data", type: "bytes[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Interface for authorization calls returned by authorizeInstructions
 */
interface AuthorizationCall {
  target: Address;
  data: `0x${string}`;
}

const APPROVE_SELECTOR = "0x095ea7b3";

// Helper to detect if an authorization call is just approving "0" (which we can skip for gas efficiency)
const isZeroAmountApproval = (data: `0x${string}` | undefined): boolean => {
  if (!data || data === "0x" || data.length < 10) {
    return false;
  }

  try {
    const decoded = decodeFunctionData({ abi: ERC20ABI, data: data as Hex });
    if (decoded.functionName === "approve") {
      const amount = decoded.args?.[1] as bigint | undefined;
      return amount === 0n;
    }
    return false;
  } catch {
    try {
      // Fallback manual decode
      const selector = data.slice(0, 10).toLowerCase();
      if (selector !== APPROVE_SELECTOR) {
        return false;
      }
      const [, amount] = decodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }],
        data.slice(10) as `0x${string}`
      );
      return (amount as bigint) === 0n;
    } catch {
      return false;
    }
  }
};

// --- Error Handling Helpers ---

/**
 * Check if an error represents a user rejection
 */
const isUserRejection = (error: any): boolean => {
  const errorMessage = error?.message || "";
  const lowerMessage = errorMessage.toLowerCase();

  const rejectionPhrases = [
    "user rejected",
    "user denied",
    "user cancelled",
    "rejected",
    "denied",
    "cancelled",
  ];

  const rejectionCodes = [4001, "ACTION_REJECTED", "USER_REJECTED"];

  return (
    rejectionPhrases.some(phrase => lowerMessage.includes(phrase)) ||
    rejectionCodes.includes(error?.code)
  );
};

/**
 * Extract hex data from various error formats
 */
const extractHexData = (data: unknown): string => {
  if (!data) return "";
  if (typeof data === "string" && data.startsWith("0x")) return data;

  if (typeof data === "object" && data !== null) {
    if ("data" in data && typeof (data as any).data === "string") {
      return (data as any).data;
    }
    const str = String(data);
    const match = str.match(/(0x[a-fA-F0-9]{8,})/);
    return match ? match[1] : "";
  }

  return "";
};

/**
 * Extract revert data from an error object
 */
const extractRevertData = (error: any): string => {
  const errorMessage = error?.message || "";

  // Try various sources for revert data
  let revertData = extractHexData(error?.cause?.data) ||
                   extractHexData(error?.data) ||
                   "";

  // Try to extract from error message if not found
  if (!revertData && errorMessage) {
    const match = errorMessage.match(/return data: (0x[a-fA-F0-9]+)/i) ||
                  errorMessage.match(/data: (0x[a-fA-F0-9]+)/i) ||
                  errorMessage.match(/(0x[a-fA-F0-9]{8,})/);
    if (match) {
      revertData = match[1];
    }
  }

  return revertData;
};

/**
 * Format an error into a user-friendly message
 */
const formatExecutionError = (error: any): string => {
  if (isUserRejection(error)) {
    return "User rejected the request";
  }

  const revertData = extractRevertData(error);

  if (revertData && revertData.length >= 10) {
    const decoded = decodeRevertReason(revertData);
    const formatted = formatErrorForDisplay(decoded);
    return formatted.suggestion
      ? `${formatted.title}: ${formatted.description} ${formatted.suggestion}`
      : `${formatted.title}: ${formatted.description}`;
  }

  return error.shortMessage || error.message || "Failed to execute instructions";
};

/**
 * Check if an authorization call should be skipped
 */
const shouldSkipAuthCall = (authCall: AuthorizationCall): boolean => {
  if (!authCall.target || !authCall.data || authCall.data.length === 0) return true;
  if (isZeroAmountApproval(authCall.data)) return true;
  return false;
};

/**
 * Check if deauthorization should be performed on this chain
 * Disabled for Linea (59144) and Plasma (9745) due to batching issues
 */
const shouldRevokeOnChain = (chainId: number, revokePermissions?: boolean): boolean => {
  if (!revokePermissions) return false;
  const disabledChains = [59144, 9745]; // Linea, Plasma
  return !disabledChains.includes(chainId);
};

/**
 * Filter authorization calls to remove invalid/zero-amount approvals and deduplicate
 */
const filterValidAuthCalls = (authCalls: AuthorizationCall[]): AuthorizationCall[] => {
  const seen = new Set<string>();
  return authCalls.filter(call => {
    if (shouldSkipAuthCall(call)) return false;
    // Deduplicate by (target, data) pair
    const key = `${call.target.toLowerCase()}:${call.data.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Filter deauthorization calls to remove invalid ones and deduplicate
 */
const filterValidDeauthCalls = (deauthCalls: AuthorizationCall[]): AuthorizationCall[] => {
  const seen = new Set<string>();
  return deauthCalls.filter(({ target, data }) => {
    if (!target || !data || data.length === 0) return false;
    // Deduplicate by (target, data) pair
    const key = `${target.toLowerCase()}:${data.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

interface UseKapanRouterV2Options {
  /** Override chainId (for hardhat/local dev). If not provided, uses wallet's chainId */
  chainId?: number;
}

/**
 * Hook for building and executing instructions on KapanRouter v2
 */
export const useKapanRouterV2 = (options?: UseKapanRouterV2Options) => {
  const { address: userAddress } = useAccount();
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter" });
  const walletChainId = useChainId();
  // Use provided chainId or fall back to wallet's chainId
  const chainId = options?.chainId ?? walletChainId;
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });
  const queryClient = useQueryClient();

  const CONFIRMATIONS_BY_CHAIN: Record<number, number> = {
    8453: 1,   // Base mainnet
    84531: 1,  // Base Sepolia
    84532: 1,  // Base Sepolia
    10: 1,     // Optimism
    420: 1,    // Optimism Goerli
    11155420: 1, // Optimism Sepolia
    42161: 1,  // Arbitrum One
    421614: 1, // Arbitrum Sepolia
    59144: 1,  // Linea
    59141: 1,  // Linea Sepolia
    31337: 1,  // Hardhat
    130: 1,    // Unichain
  };

  const effectiveConfirmations = CONFIRMATIONS_BY_CHAIN[chainId] ?? 1;

  const { writeContract, writeContractAsync, data: hash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    confirmations: effectiveConfirmations,
    pollingInterval: 1000,
  });

  const [isApproving, setIsApproving] = useState(false);
  const [batchId, setBatchId] = useState<string | undefined>(undefined);
  // When true, the hook won't show notifications - caller handles them
  const [suppressBatchNotifications, setSuppressBatchNotifications] = useState(false);

  // EIP-5792 capability detection (Atomic Batching)
  const { data: capabilities } = useCapabilities({ account: userAddress });
  const chainIdHex = `0x${chainId.toString(16)}`;
  const atomicStatus = (capabilities as Record<string, { atomic?: { status?: string } }> | undefined)?.[chainIdHex]?.atomic?.status as
    | "supported" | "ready" | "unsupported" | undefined;
  const canDoAtomicBatch = atomicStatus === "supported" || atomicStatus === "ready";

  // Batch execution hooks
  const { sendCallsAsync } = useSendCalls();
  const { data: batchStatus, isSuccess: isBatchConfirmed, isError: isBatchError } = useWaitForCallsStatus({
    id: batchId,
    query: { enabled: !!batchId },
  });

  const [batchNotificationId, setBatchNotificationId] = useState<string | number | null>(null);

  // Show loading notification when batch is submitted (unless suppressed)
  useEffect(() => {
    if (!batchId || suppressBatchNotifications) return;
    
    // Show "waiting for confirmation" notification
    const id = notification.loading(
      <TransactionToast
        step="sent"
        message="Transaction submitted — waiting for confirmation..."
      />
    );
    setBatchNotificationId(id);
    
    return () => {
      // Cleanup on unmount or when batchId changes
      if (id) notification.remove(id);
    };
  }, [batchId, suppressBatchNotifications]);

  // Batch Status Effects - update notification when status changes (unless suppressed)
  useEffect(() => {
    if (!batchId || !batchStatus || suppressBatchNotifications) return;

    // Remove the loading notification
    if (batchNotificationId) {
      notification.remove(batchNotificationId);
      setBatchNotificationId(null);
    }

    if (isBatchConfirmed) {
      notification.success(
        <TransactionToast
          step="confirmed"
          message="Transaction confirmed!"
        />
      );
    } else if (isBatchError) {
      notification.error(
        <TransactionToast
          step="failed"
          message="Transaction failed"
        />
      );
    }
  }, [batchId, batchStatus, isBatchConfirmed, isBatchError, batchNotificationId, suppressBatchNotifications]);

  // Refetch Data on Success
  useEffect(() => {
    const complete = isConfirmed || isBatchConfirmed;
    if (!complete) return;

    const doRefetch = () => {
      Promise.all([
        queryClient.refetchQueries({ queryKey: ['readContract'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['readContracts'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['balance'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['token'], type: 'active' }),
        // Morpho-specific queries - use hierarchical keys for chain-specific invalidation
        queryClient.refetchQueries({ queryKey: qk.morpho.all(chainId), type: 'active' }),
        // Euler-specific queries
        queryClient.refetchQueries({ queryKey: qk.euler.all(chainId), type: 'active' }),
      ]).catch(e => logger.warn("Post-tx refetch err:", e));

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("txCompleted"));
      }
    };

    // OP Stack chains with fast block times need a delay for RPC to index new state
    const opStackFastChains = new Set([10, 8453, 130]); // Optimism, Base, Unichain
    const delay = opStackFastChains.has(chainId) ? 2000 : 0;

    if (delay > 0) {
      const timer = setTimeout(doRefetch, delay);
      return () => clearTimeout(timer);
    } else {
      doRefetch();
    }
  }, [isConfirmed, isBatchConfirmed, queryClient, chainId]);

  const encodeCompoundMarket = useCallback((marketAddress: Address): `0x${string}` => {
    return encodeAbiParameters([{ type: "address" }], [marketAddress]) as `0x${string}`;
  }, []);

  // --- Flow Builders ---

  const buildDepositFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    context = "0x"
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = parseUnits(amount, decimals);
    const isCompound = normalizedProtocol === "compound";
    const isMorpho = normalizedProtocol === "morpho-blue";
    const isEuler = normalizedProtocol === "euler";
    // Morpho, Compound, and Euler use DepositCollateral for collateral deposits
    // Other protocols use Deposit
    const lendingOp = (isCompound || isMorpho || isEuler) ? LendingOp.DepositCollateral : LendingOp.Deposit;

    return [
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(lendingOp, tokenAddress, userAddress, 0n, context, 0)
      ),
    ];
  }, [userAddress]);

  const buildBorrowFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    context = "0x"
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = parseUnits(amount, decimals);

    return [
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, tokenAddress, userAddress, amountBigInt, context, 999)
      ),
      createRouterInstruction(encodePushToken(0, userAddress)),
    ];
  }, [userAddress]);

  const buildRepayFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);

    if (isMax || amount.toLowerCase() === "max") {
      logger.warn("buildRepayFlow: isMax=true is deprecated for sync calls. Use buildRepayFlowAsync instead.");
      return [];
    }

    const amountBigInt = parseUnits(amount, decimals);

    return [
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, tokenAddress, userAddress, 0n, "0x", 0)
      ),
      createRouterInstruction(encodePushToken(2, userAddress)),
    ];
  }, [userAddress]);

  /**
   * Build a repay flow with async wallet balance check for max repayments
   * This safely handles "max" repayments by reading the user's wallet balance instead of using MaxUint256
   * @param protocolName - Protocol to repay to
   * @param tokenAddress - Token address to repay
   * @param amount - Amount to repay (as string) or "max" for full wallet balance
   * @param decimals - Token decimals (default: 18)
   * @param isMax - Whether to repay maximum (uses wallet balance, not MaxUint256)
   * @param maxPullAmount - Optional cap for the amount pulled from the wallet when repaying max
   * @param context - Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address)
   */
  const buildRepayFlowAsync = useCallback(async (
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false,
    maxPullAmount?: bigint,
    context = "0x"
  ): Promise<ProtocolInstruction[]> => {
    if (!userAddress || !publicClient) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);

    let pullAmount: bigint;

    if (isMax || amount.toLowerCase() === "max") {
      // 1. Fetch actual balance for "max" to prevent parsing error (Safety Fix from Staging)
      const balance = await publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20ABI,
        functionName: "balanceOf",
        args: [userAddress],
      }) as bigint;

      // 2. Respect optional cap (Feature from Main)
      if (maxPullAmount !== undefined && maxPullAmount < balance) {
        pullAmount = maxPullAmount;
      } else {
        pullAmount = balance;
      }
    } else {
      pullAmount = parseUnits(amount, decimals);
    }

    return [
      createRouterInstruction(encodePullToken(pullAmount, tokenAddress, userAddress)),
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.GetBorrowBalance, tokenAddress, userAddress, 0n, context, 999)
      ),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, tokenAddress, userAddress, 0n, context, isMax ? 2 : 0)
      ),
      // Note: Repay will produce a refund output (index 3)
      createRouterInstruction(encodePushToken(3, userAddress)),
    ];
  }, [userAddress, publicClient]);

  const buildWithdrawFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false,
    context = "0x"
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = isMax || amount.toLowerCase() === "max"
      ? (2n ** 256n - 1n)
      : parseUnits(amount, decimals);

    return [
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.GetSupplyBalance, tokenAddress, userAddress, 0n, context, 0)
      ),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.WithdrawCollateral, tokenAddress, userAddress, amountBigInt, context, isMax ? 0 : 999)
      ),
      createRouterInstruction(encodePushToken(1, userAddress)),
    ];
  }, [userAddress]);

  const buildCollateralSwapFlow = useCallback((
    protocolName: string,
    tokenInAddress: string,
    tokenOutAddress: string,
    amountIn: string,
    minAmountOut: string,
    swapData: string,
    decimalsIn: number,
    context = "0x",
    isMax = false,
    flashLoanProvider: FlashLoanProvider = FlashLoanProvider.BalancerV2,
    isExactOut = false,
    swapProtocol: "oneinch" | "pendle" = "oneinch"
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountInBigInt = parseUnits(amountIn, decimalsIn);
    const minAmountOutBigInt = BigInt(minAmountOut);
    const isCompound = normalizedProtocol === "compound";
    const depositOp = isCompound ? LendingOp.DepositCollateral : LendingOp.Deposit;
    const withdrawOp = LendingOp.WithdrawCollateral;

    // Encode Swap Context: (tokenOut, minAmountOut, swapData)
    // For SwapExactOut, minAmountOut is interpreted as exactAmountOut
    const swapContext = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [tokenOutAddress as Address, minAmountOutBigInt, swapData as Hex]
    );

    const swapOp = isExactOut ? LendingOp.SwapExactOut : LendingOp.Swap;

    // Aave V3 flash loans have a fee (~5-9 bps). When isMax=true, we need to use Split
    // to reduce the flash loan principal so that (principal + fee) fits within our supply balance.
    // Balancer V2/V3 have no fees, so we can flash the full amount.
    // Aave-compatible providers have fees, need special handling for max withdrawals
    const needsFeeSplit = isMax && (flashLoanProvider === FlashLoanProvider.Aave || flashLoanProvider === FlashLoanProvider.ZeroLend);
    
    // Aave flash loan fee buffer: 9 bps (0.09%) - slightly higher than typical 5 bps for safety
    const AAVE_FEE_BUFFER_BPS = 9;

    if (needsFeeSplit) {
      // AAVE WITH FEE HANDLING using Split
      // 
      // The key insight: Split reduces the flash loan principal so that when Aave adds
      // its fee, the repayment amount ≈ original supply balance (what we can withdraw).
      //
      // CRITICAL: The router RECEIVES Output[2] (principal) tokens from the flash loan,
      // but Output[3] contains the REPAYMENT amount (principal + fee). We must use
      // Output[2] for approve/swap since that's the actual tokens we have!
      //
      // NOTE: Output[1] (fee buffer) is a VIRTUAL UTXO - it represents the portion of
      // collateral that stays in Aave. Do NOT try to PushToken it.
      //
      // Output tracking:
      // 0. GetSupplyBalance -> Output[0] = full supply (e.g., 100)
      // 1. Split(0, 9bps) -> Output[1] = fee buffer (~0.09), Output[2] = principal (~99.91)
      // 2. FlashLoan(Aave, 2) -> Output[3] = repayment amount (~100), router has ~99.91 tokens
      // 3. Approve(2) -> Output[4] (dummy) - approve PRINCIPAL, not repayment
      // 4. Swap(2) -> Output[5] (tokenOut), Output[6] (refund) - swap PRINCIPAL
      // 5. Approve(5) -> Output[7] (dummy)
      // 6. Deposit(5) -> no output
      // 7. Withdraw(3) -> Output[8] - withdraw REPAYMENT amount to cover flash loan
      // 8. PushToken(6) -> return swap refund to user

      return [
        // 0. Get exact supply balance -> Output[0]
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.GetSupplyBalance, tokenInAddress, userAddress, 0n, context, 999)
        ),

        // 1. Split to separate fee buffer from flash loan principal
        // Split(0, 9 bps) -> Output[1] = fee (~0.09%), Output[2] = principal (~99.91%)
        createRouterInstruction(encodeSplit(0, AAVE_FEE_BUFFER_BPS)),

        // 2. Flash Loan using Aave with the REDUCED amount (Output[2])
        // Creates Output[3] = repayment amount (principal + fee ≈ original supply)
        createRouterInstruction(encodeFlashLoan(flashLoanProvider, 2)),

        // 3. Approve swap protocol for TokenIn using Output[2] (the actual principal we received)
        createRouterInstruction(encodeApprove(2, swapProtocol)),

        // 4. Swap TokenIn using Output[2] (principal) -> Output[5] (TokenOut) + Output[6] (Refund)
        createProtocolInstruction(
          swapProtocol,
          encodeLendingInstruction(swapOp, tokenInAddress, userAddress, 0n, swapContext as string, 2)
        ),

        // 5. Approve TokenOut (Output[5]) for LendingProtocol -> Output[7] (dummy)
        createRouterInstruction(encodeApprove(5, normalizedProtocol)),

        // 6. Deposit TokenOut (Output[5]) into LendingProtocol
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(depositOp, tokenOutAddress, userAddress, 0n, context, 5)
        ),

        // 7. Withdraw TokenIn to repay flash loan
        // Reference Output[3] (repayment amount) ≈ original supply
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(withdrawOp, tokenInAddress, userAddress, 0n, context, 3)
        ),

        // NOTE: Do NOT push Output[1] (fee buffer) - it's virtual, stays in Aave

        // 8. Push swap refund (Output[6]) to user if any
        createRouterInstruction(encodePushToken(6, userAddress)),
      ];
    }

    // STANDARD FLOW (Balancer V2/V3 or non-max Aave)
    // No fee handling needed for Balancer (0 fee) or non-max amounts
    
    const startInstruction = isMax
      ? createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.GetSupplyBalance, tokenInAddress, userAddress, 0n, context, 999)
        )
      : createRouterInstruction(encodeToOutput(amountInBigInt, tokenInAddress));

    // Output index tracking:
    // 0. startInstruction -> Output[0] (amount/token for flash loan)
    // 1. FlashLoan -> Output[1] (flash loan proceeds)
    // 2. Approve -> Output[2] (DUMMY - approve always creates empty output)
    // 3. Swap -> Output[3] (tokenOut), Output[4] (refund/tokenIn)
    // 4. Approve -> Output[5] (DUMMY)
    // 5. Deposit -> no output (or depends on protocol)
    // 6. Withdraw -> Output[6] (withdrawn tokenIn for flash repayment)

    return [
      // 0. Create UTXO for Flash Loan Amount/Token -> Output[0]
      startInstruction,

      // 1. Flash Loan (uses Output[0]) -> Output[1] (Borrowed Funds)
      createRouterInstruction(encodeFlashLoan(flashLoanProvider, 0)),

      // 2. Approve TokenIn (Output[1]) for swap protocol -> Output[2] (dummy)
      createRouterInstruction(encodeApprove(1, swapProtocol)),

      // 3. Swap TokenIn (Output[1]) -> Output[3] (TokenOut) + Output[4] (Refund)
      createProtocolInstruction(
        swapProtocol,
        encodeLendingInstruction(swapOp, tokenInAddress, userAddress, 0n, swapContext as string, 1)
      ),

      // 4. Approve TokenOut (Output[3]) for LendingProtocol -> Output[5] (dummy)
      createRouterInstruction(encodeApprove(3, normalizedProtocol)),

      // 5. Deposit TokenOut (Output[3]) into LendingProtocol
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(depositOp, tokenOutAddress, userAddress, 0n, context, 3)
      ),

      // 6. Withdraw TokenIn from LendingProtocol -> Output[6]
      // We withdraw the exact amount we flash loaned (plus fee if any).
      // We reference Output[1] (flash loan amount) for the withdrawal amount.
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(withdrawOp, tokenInAddress, userAddress, 0n, context, 1)
      ),

      // Flash loan repayment happens automatically - Router must have funds from Withdraw
    ];
  }, [userAddress]);

  type BuildMultiplyFlowParams = {
    protocolName: string;
    collateralToken: Address;
    debtToken: Address;
    initialCollateral: string;
    flashLoanAmount: string;
    minCollateralOut: string;
    swapData: string;
    collateralDecimals?: number;
    debtDecimals?: number;
    flashLoanProvider?: FlashLoanProvider;
    market?: Address;
    morphoContext?: string;  // Pre-encoded Morpho market context (from encodeMorphoContext)
    includeRefundPush?: boolean;
    swapRouter?: "oneinch" | "pendle";
    // Zap mode: deposit debt token and swap everything (deposit + flash loan) to collateral
    zapMode?: boolean;
    depositAmount?: string; // Amount of debt token to deposit (used in zap mode)
  };

  /**
   * Build a leveraged "multiply" flow using a flash loan to loop collateral:
   * 1) Pull + deposit initial collateral
   * 2) Flash loan the debt asset
   * 3) Swap debt -> collateral
   * 4) Deposit acquired collateral
   * 5) Borrow debt to repay the flash loan
   */
  const buildMultiplyFlow = useCallback((params: BuildMultiplyFlowParams): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const {
      protocolName,
      collateralToken,
      debtToken,
      initialCollateral,
      flashLoanAmount,
      minCollateralOut,
      swapData,
      collateralDecimals = 18,
      debtDecimals = 18,
      flashLoanProvider = FlashLoanProvider.BalancerV2,
      market,
      morphoContext,
      includeRefundPush = true,
      swapRouter = "oneinch",
      zapMode = false,
      depositAmount,
    } = params;

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const isCompound = normalizedProtocol === "compound";
    const isMorpho = normalizedProtocol === "morpho-blue";
    // Use pre-encoded Morpho context if provided, otherwise Compound market encoding, otherwise empty
    const context = isMorpho && morphoContext ? morphoContext : (isCompound && market ? encodeCompoundMarket(market) : "0x");
    // Morpho and Compound use DepositCollateral, others use Deposit
    const depositOp = (isCompound || isMorpho) ? LendingOp.DepositCollateral : LendingOp.Deposit;

    const initialCollateralAmount = parseUnits(initialCollateral, collateralDecimals);
    const flashAmount = parseUnits(flashLoanAmount, debtDecimals);
    const minCollateralOutBigInt = parseUnits(minCollateralOut, collateralDecimals);
    const depositAmountRaw = depositAmount ? parseUnits(depositAmount, debtDecimals) : 0n;

    const swapContext = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [collateralToken as Address, minCollateralOutBigInt, swapData as Hex]
    );

    logger.debug("[buildMultiplyFlow] zapMode:", zapMode, "depositAmountRaw:", depositAmountRaw.toString(), "flashAmount:", flashAmount.toString());

    // ZAP MODE: deposit debt token, combine with flash loan, swap everything to collateral
    if (zapMode && depositAmountRaw > 0n) {
      logger.debug("[buildMultiplyFlow] Using ZAP MODE flow");
      // Output tracking for zap mode:
      // 0. Pull deposit (debt token) -> Output[0]
      // 1. ToOutput flash-loan amount -> Output[1]
      // 2. FlashLoan -> Output[2] (repayment amount)
      // 3. Add deposit + flash loan amounts -> Output[3] (total to swap)
      // 4. Approve for swap -> Output[4] (dummy)
      // 5. Swap all debt -> collateral -> Output[5] (collateral), Output[6] (refund)
      // 6. Approve collateral for lending -> Output[7] (dummy)
      // 7. Deposit collateral
      // 8. Borrow debt for flash repayment (Output[2])
      // 9. Optional: Push swap refund

      return [
        // 0. Pull deposit (debt token) from user
        createRouterInstruction(encodePullToken(depositAmountRaw, debtToken, userAddress)),

        // 1. Flash loan debt token
        createRouterInstruction(encodeToOutput(flashAmount, debtToken)),
        createRouterInstruction(encodeFlashLoan(flashLoanProvider, 1)),

        // 2. Combine deposit (Output[0]) + flash loan (Output[1]) for swap
        // Use Add instruction to sum outputs: Output[3] = Output[0] + Output[1]
        createRouterInstruction(encodeAdd(0, 1)),

        // 3. Swap combined debt -> collateral
        createRouterInstruction(encodeApprove(3, swapRouter)),
        createProtocolInstruction(
          swapRouter,
          encodeLendingInstruction(LendingOp.Swap, debtToken, userAddress, 0n, swapContext as string, 3)
        ),

        // 4. Deposit all acquired collateral (Output[5])
        createRouterInstruction(encodeApprove(5, normalizedProtocol)),
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(depositOp, collateralToken, userAddress, 0n, context, 5)
        ),

        // 5. Borrow debt to cover flash-loan repayment (Output[2])
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Borrow, debtToken, userAddress, 0n, context, 2)
        ),

        // 6. Return any swap refund to the user (debt token)
        ...(includeRefundPush ? [createRouterInstruction(encodePushToken(6, userAddress))] : []),
      ];
    }

    // STANDARD MODE: deposit collateral directly, then leverage with flash loan

    // Output tracking:
    // 0. Pull initial collateral -> Output[0]
    // 1. Approve lending gateway for initial collateral -> Output[1] (dummy)
    // 2. ToOutput flash-loan debt amount -> Output[2] (actual tokens we'll receive)
    // 3. FlashLoan (debt) -> Output[3] (repayment amount = borrowed + fee for Aave)
    //    IMPORTANT: Router RECEIVES Output[2] tokens, but Output[3] tracks repayment!
    // 4. Approve debt for DEX -> Output[4] (dummy)
    // 5. Swap debt -> collateral -> Output[5] (collateral), Output[6] (refund)
    // 6. Approve collateral for lending -> Output[7] (dummy)
    // 7. Borrow debt equal to flash repayment (Output[3]) - stays in router to repay
    // 8. Optional: Push swap refund back to user

    return [
      // 0. Pull and deposit initial collateral
      createRouterInstruction(encodePullToken(initialCollateralAmount, collateralToken, userAddress)),
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(depositOp, collateralToken, userAddress, 0n, context, 0)
      ),

      // 1. Flash loan debt token
      createRouterInstruction(encodeToOutput(flashAmount, debtToken)),
      createRouterInstruction(encodeFlashLoan(flashLoanProvider, 2)),

      // 2. Swap debt -> collateral via selected router (1inch or Pendle)
      // CRITICAL: Use Output[2] (actual tokens received), NOT Output[3] (repayment amount)!
      // For Aave, Output[3] includes fee we don't have yet.
      createRouterInstruction(encodeApprove(2, swapRouter)),
      createProtocolInstruction(
        swapRouter,
        encodeLendingInstruction(LendingOp.Swap, debtToken, userAddress, 0n, swapContext as string, 2)
      ),

      // 3. Deposit the acquired collateral
      createRouterInstruction(encodeApprove(5, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(depositOp, collateralToken, userAddress, 0n, context, 5)
      ),

      // 4. Borrow debt to cover flash-loan repayment
      // Use Output[3] (repayment amount including fee) so we borrow enough to repay
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, debtToken, userAddress, 0n, context, 3)
      ),

      // 5. Return any swap refund to the user (debt token)
      ...(includeRefundPush ? [createRouterInstruction(encodePushToken(6, userAddress))] : []),
    ];
  }, [userAddress, encodeCompoundMarket]);

  /**
   * Build a "close with collateral" flow using flash loan:
   * Flash loan debt -> repay debt -> withdraw collateral -> swap collateral to debt -> repay flash loan.
   * This allows closing positions even when collateral is fully locked by debt.
   * 
   * @param exactDebtOut - The exact amount of debt to repay (flash loan amount), ignored if isMax=true
   * @param maxCollateralIn - Max collateral to sell (with slippage buffer)
   * @param swapData - 1inch swap data for collateral -> debt swap
   * @param isMax - If true, uses GetBorrowBalance to get exact debt amount on-chain (prevents dust)
   */
  const buildCloseWithCollateralFlow = useCallback((
    protocolName: string,
    collateralToken: string,
    debtToken: string,
    maxCollateralIn: bigint,
    exactDebtOut: bigint,
    swapData: string,
    flashLoanProvider: FlashLoanProvider = FlashLoanProvider.BalancerV2,
    context = "0x",
    isMax = false,
    swapRouter: "oneinch" | "pendle" = "oneinch",
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);

    // Swap context: (tokenOut, minAmountOut, swapData)
    // We swap collateral -> debt, need at least exactDebtOut to repay flash loan
    // Note: For isMax, exactDebtOut is still used for minAmountOut in swap context
    // The actual flash loan amount comes from GetBorrowBalance
    const swapContext = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [debtToken as Address, exactDebtOut, swapData as Hex]
    );

    // For isMax: use GetBorrowBalance to get exact debt amount on-chain
    // This prevents dust from rounding/timing differences
    const debtAmountInstruction = isMax
      ? createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.GetBorrowBalance, debtToken, userAddress, 0n, context, 999)
        )
      : createRouterInstruction(encodeToOutput(exactDebtOut, debtToken));

    // Output tracking:
    // 0. GetBorrowBalance/ToOutput -> Output[0] = debtAmount (what we owe)
    // 1. FlashLoan(0) -> Output[1] = repaymentAmount (debt + fee for Aave)
    //    IMPORTANT: Router RECEIVES debtAmount tokens, but Output[1] tracks repaymentAmount!
    // 2. Approve(1) -> Output[2] (dummy) - approve repaymentAmount (more than needed, OK)
    // 3. Repay(0) -> Output[3] (refund) - repay using Output[0] (actual debt), NOT Output[1]!
    // 4. ToOutput -> Output[4] = maxCollateralIn
    // 5. Withdraw(4) -> Output[5] (withdrawn collateral)
    // 6. Approve(5) -> Output[6] (dummy)
    // 7. SwapExactOut(5) -> Output[7] (debt), Output[8] (collateral refund)
    //    Swap must output >= repaymentAmount to cover flash loan!
    // 8. PushToken(8) -> return excess collateral to user
    
    return [
      // 0. Get debt amount: either GetBorrowBalance (isMax) or ToOutput (fixed amount)
      // -> Output[0] is the debt amount we want to repay
      debtAmountInstruction,
      
      // 1. Flash loan debt token using Output[0]
      // -> Output[1] = repaymentAmount (for Aave: debt + 0.05% fee)
      // NOTE: Router receives Output[0] worth of tokens, but Output[1] tracks repayment!
      createRouterInstruction(encodeFlashLoan(flashLoanProvider, 0)),
      
      // 2. Approve protocol for debt token (Output[1] - approving more than needed is OK)
      createRouterInstruction(encodeApprove(1, normalizedProtocol)),
      
      // 3. Repay debt using Output[0] (the actual debt amount we owe)
      // NOT Output[1] which is the repayment amount (more than we have for Aave!)
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, context, 0)
      ),
      
      // 4. ToOutput: declare how much collateral to withdraw
      createRouterInstruction(encodeToOutput(maxCollateralIn, collateralToken)),
      
      // 5. Withdraw collateral (now unlocked) using Output[4]
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.WithdrawCollateral, collateralToken, userAddress, 0n, context, 4)
      ),
      
      // 6. Approve swap router on withdrawn collateral (Output[5])
      createRouterInstruction(encodeApprove(5, swapRouter)),
      
      // 7. SwapExactOut collateral -> debt token
      // Output[7] = debt token, Output[8] = collateral refund
      // The swap minAmountOut (in swapContext) should cover flash loan repayment!
      createProtocolInstruction(
        swapRouter,
        encodeLendingInstruction(LendingOp.SwapExactOut, collateralToken, userAddress, 0n, swapContext as string, 5)
      ),
      
      // 8. Push collateral refund (Output[8]) to user
      createRouterInstruction(encodePushToken(8, userAddress)),
      
      // NOTE: Output[7] (debt token) stays in router to repay flash loan
      // Any excess debt token from swap (beyond flash loan repayment) is dust in router
    ];
  }, [userAddress]);

  /**
   * Build a "swap debt A -> debt B" flow using a flash loan:
   * Flash debtB -> swap exact-out to debtA for repayment -> repay debtA -> borrow debtB to repay flash.
   * Caller provides maxAmountIn (debtB to swap) and swapData sized via one forward quote + small buffer.
   * 
   * @param currentDebtFrom - amount to repay in debtFrom, ignored if isMax=true
   * @param isMax - If true, uses GetBorrowBalance to get exact debt amount on-chain (prevents dust)
   */
  const buildDebtSwapFlow = useCallback((
    protocolName: string,
    debtFromToken: string,            // e.g., USDC (current debt to repay)
    debtToToken: string,              // e.g., USDT (new debt to take on)
    currentDebtFrom: bigint,          // amount to repay in debtFrom (ignored if isMax)
    maxDebtToInForSwap: bigint,       // max input for USDT->USDC swap (flash loan amount)
    swapData: string,                 // swap calldata (1inch or Pendle)
    flashLoanProvider: FlashLoanProvider = FlashLoanProvider.BalancerV2,
    context = "0x",
    isMax = false,
    swapRouter: "oneinch" | "pendle" = "oneinch",
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);

    // For isMax, we still need currentDebtFrom for the swap's minAmountOut
    // The actual repay amount will come from GetBorrowBalance
    const swapExactOutContext = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [debtFromToken as Address, currentDebtFrom, swapData as Hex]
    );

    if (isMax) {
      // When isMax, we need to:
      // 1. Get exact borrow balance first (output[0])
      // 2. Flash loan the new debt token (output[1])
      // 3. Swap new debt -> old debt (outputs[3,4])
      // 4. Repay using GetBorrowBalance output for exact amount
      // 5. Borrow new debt to repay flash loan
      return [
        // 0. GetBorrowBalance for debtFrom -> output[0] is exact debt amount
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.GetBorrowBalance, debtFromToken, userAddress, 0n, context, 999)
        ),
        // 1. ToOutput: declare how much debtTo we will flash (max input for swap)
        createRouterInstruction(encodeToOutput(maxDebtToInForSwap, debtToToken)),
        // 2. Flash loan debtTo using input[1] (appends output[2])
        createRouterInstruction(encodeFlashLoan(flashLoanProvider, 1)),
        // 3. Approve swap router for debtTo (using input[1] for amount)
        createRouterInstruction(encodeApprove(1, swapRouter)),
        // 4. SwapExactOut debtTo->debtFrom (output[4]: debtFrom, output[5]: debtTo refund)
        // Uses input[1] for swap input amount
        createProtocolInstruction(
          swapRouter,
          encodeLendingInstruction(LendingOp.SwapExactOut, debtToToken, userAddress, 0n, swapExactOutContext as string, 1)
        ),
        // 5. Approve protocol on debtFrom (output[4])
        createRouterInstruction(encodeApprove(4, normalizedProtocol)),
        // 6. Repay debtFrom using output[4], but reference GetBorrowBalance output[0] for exact amount
        // This ensures we repay EXACTLY what we owe, no dust
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Repay, debtFromToken, userAddress, 0n, context, 0)
        ),
        // 7. Push debtFrom repay refund (output[7], usually swap output - exact debt)
        createRouterInstruction(encodePushToken(7, userAddress)),
        // 8. Push debtTo swap refund (output[5]) to user
        createRouterInstruction(encodePushToken(5, userAddress)),
        // 9. Borrow debtTo equal to flash repayment amount by referencing flash UTXO[2]
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Borrow, debtToToken, userAddress, 0n, context, 2)
        ),
      ];
    }

    // Non-max flow: use fixed currentDebtFrom amount
    return [
      // 0. ToOutput: declare how much debtTo we will flash (max input for swap)
      createRouterInstruction(encodeToOutput(maxDebtToInForSwap, debtToToken)),
      // 1. Flash loan debtTo using input[0] (appends output[1])
      createRouterInstruction(encodeFlashLoan(flashLoanProvider, 0)),
      // 2. Approve swap router for debtTo (approve read from input[0], consistent with tests/authorization)
      createRouterInstruction(encodeApprove(0, swapRouter)),
      // 3. SwapExactOut debtTo->debtFrom for exact currentDebtFrom (output[3]: debtFrom, output[4]: debtTo refund)
      createProtocolInstruction(
        swapRouter,
        encodeLendingInstruction(LendingOp.SwapExactOut, debtToToken, userAddress, 0n, swapExactOutContext as string, 0)
      ),
      // 4. Approve Aave on debtFrom (USDC) at output[3]
      createRouterInstruction(encodeApprove(3, normalizedProtocol)),
      // 5. Repay debtFrom using output[3]
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, debtFromToken, userAddress, 0n, context, 3)
      ),
      // 6. Push USDC repay refund (output[6], usually 0)
      createRouterInstruction(encodePushToken(6, userAddress)),
      // 7. Push debtTo swap refund (output[4]) to user (optional, keeps router dust 0)
      createRouterInstruction(encodePushToken(4, userAddress)),
      // 8. Borrow debtTo equal to flash repayment amount by referencing flash UTXO[1]
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, debtToToken, userAddress, 0n, context, 1)
      ),
    ];
  }, [userAddress]);

  // --- Authorization Helpers ---

  const getAuthorizations = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<AuthorizationCall[]> => {
    if (!routerContract || !userAddress || !publicClient) {
      logger.warn("[getAuthorizations] Missing context", { routerContract: !!routerContract, userAddress, publicClient: !!publicClient });
      return [];
    }

    try {
      const protocolInstructions = instructions.map(inst => ({
        protocolName: normalizeProtocolName(inst.protocolName),
        data: inst.data as `0x${string}`,
      }));

      logger.info("[getAuthorizations] Calling authorizeInstructions with", protocolInstructions.length, "instructions");
      logger.debug("[getAuthorizations] Instructions:", protocolInstructions.map(p => p.protocolName));

      // We send the FULL set of instructions to authorizeInstructions.
      // The Router calculates the simulated state (UTXOs) internally.
      // Use blockTag: 'pending' to avoid RPC caching issues that can cause stale allowance reads
      const result = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "authorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
        blockTag: 'pending',
      });
      const [targets, data] = result as unknown as [Address[], `0x${string}`[]];

      logger.info("[getAuthorizations] Raw result:", { 
        targetsCount: targets.length, 
        targets: targets.map((t, i) => ({ index: i, target: t, hasData: data[i]?.length > 2 }))
      });

      const authCalls: AuthorizationCall[] = [];
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const dataItem = data[i];
        const isValid = target && target !== "0x0000000000000000000000000000000000000000" && dataItem && dataItem.length > 0;
        logger.debug(`[getAuthorizations] Index ${i}: target=${target}, dataLen=${dataItem?.length}, isValid=${isValid}`);
        if (isValid) {
          authCalls.push({
            target: target,
            data: dataItem,
          });
        }
      }
      
      logger.info("[getAuthorizations] Filtered auth calls:", authCalls.length);
      return authCalls;
    } catch (error) {
      console.error("Error calling authorizeInstructions:", error);
      logger.error("[getAuthorizations] Error:", error);
      return [];
    }
  }, [routerContract, userAddress, publicClient]);

  const getDeauthorizations = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<AuthorizationCall[]> => {
    if (!routerContract || !userAddress || !publicClient) {
      return [];
    }

    try {
      const protocolInstructions = instructions.map(inst => ({
        protocolName: normalizeProtocolName(inst.protocolName),
        data: inst.data as `0x${string}`,
      }));

      // Use blockTag: 'pending' to avoid RPC caching issues
      const result = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: DEAUTH_ABI,
        functionName: "deauthorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
        blockTag: 'pending',
      });
      const [targets, data] = result as unknown as [Address[], `0x${string}`[]];

      const authCalls: AuthorizationCall[] = [];
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const dataItem = data[i];
        if (target && target !== "0x0000000000000000000000000000000000000000" && dataItem && dataItem.length > 0) {
          authCalls.push({ target, data: dataItem });
        }
      }
      return authCalls;
    } catch (error) {
      console.error("Error calling deauthorizeInstructions:", error);
      return [];
    }
  }, [routerContract, userAddress, publicClient]);

  // --- Execution Helpers ---

  const isBasicLendingFlow = useCallback((instructions: ProtocolInstruction[]): boolean => {
    if (instructions.length === 0 || instructions.length > 4) return false;

    const BASIC_LENDING_OPS = new Set<number>([
      LendingOp.Deposit,
      LendingOp.DepositCollateral,
      LendingOp.WithdrawCollateral,
      LendingOp.Borrow,
      LendingOp.Repay,
      LendingOp.GetBorrowBalance,
      LendingOp.GetSupplyBalance,
    ]);

    return instructions.every(inst => {
      if (inst.protocolName === "router") return true;

      try {
        const [decoded] = decodeAbiParameters(
          [
            {
              type: "tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)",
            },
          ],
          inst.data as Hex
        ) as [{ op: bigint }];

        const op = Number(decoded.op);
        return BASIC_LENDING_OPS.has(op);
      } catch {
        return false;
      }
    });
  }, []);

  /**
   * Check if a simulation error is definitely not related to missing approvals
   * These are errors that would still occur even after approvals are executed
   */
  const isDefinitelyNotApprovalRelated = useCallback((errorText: string): boolean => {
    // Include patterns from Aave, Compound, Euler, etc.
    const nonApprovalPatterns = /health.?factor|liquidation|borrow.?cap|supply.?cap|frozen|paused|insufficient.?collateral|siloed|isolation.?mode|debt.?ceiling|e_accountliquidity|e_badcollateral|e_borrowcapexceeded|e_supplycapexceeded|e_insufficientcash|e_pricefeednoset|e_badprice|e_pricefeedstale|oracle|liquidity/i;
    return nonApprovalPatterns.test(errorText);
  }, []);

  /**
   * Format a simulation error with title, description, and optional suggestion
   */
  const formatSimulationError = useCallback((formatted: ReturnType<typeof formatErrorForDisplay>): string => {
    return formatted.suggestion
      ? `${formatted.title}: ${formatted.description} ${formatted.suggestion}`
      : `${formatted.title}: ${formatted.description}`;
  }, []);

  /**
   * Check if an auth error is expected/benign (e.g., "already enabled" states in Euler)
   * These errors will succeed in the actual batch because they're no-ops when state already exists
   */
  const isExpectedAuthError = useCallback((errorText: string): boolean => {
    // Euler EVC: controller/collateral already enabled, or trying to re-enable
    const expectedPatterns = /controllerviolation|already.*enabled|collateraldisabled|controllerdisabled|notauthorized/i;
    return expectedPatterns.test(errorText);
  }, []);

  /**
   * Simulate authorization calls - log errors but don't throw for expected state errors
   * When using batched transactions, many auth calls are "enable if not enabled" which
   * may fail in isolated simulation but succeed in the actual batch
   */
  const simulateAuthCalls = useCallback(async (
    authCalls: AuthorizationCall[],
    client: NonNullable<typeof publicClient>,
    user: Address
  ): Promise<void> => {
    for (const { target, data } of authCalls) {
      if (!target || !data) continue;

      const authResult = await simulateTransaction(client, target as `0x${string}`, data, user as `0x${string}`);
      if (!authResult.success && authResult.error) {
        const formatted = formatErrorForDisplay(authResult.error);
        const errorText = `${formatted.description || ""} ${formatted.title || ""}`.toLowerCase();

        // Log the error but only throw if it's NOT an expected state-related error
        logger.info("[simulateAuthCalls] Auth call failed:", {
          target,
          error: formatted,
          isExpected: isExpectedAuthError(errorText),
        });

        if (!isExpectedAuthError(errorText)) {
          throw new Error(formatSimulationError(formatted));
        }
        // Otherwise continue - the actual batched tx will handle it
      }
    }
  }, [formatSimulationError, isExpectedAuthError]);

  /**
   * Handle router simulation result, considering whether auth calls will be bundled
   */
  const handleRouterSimulationResult = useCallback((
    simResult: { success: boolean; error?: any },
    authCallsExist: boolean
  ): void => {
    if (simResult.success || !simResult.error) return;

    const formatted = formatErrorForDisplay(simResult.error);
    const errorText = `${formatted.description || ""} ${formatted.title || ""}`.toLowerCase();

    logger.info("[handleRouterSimulationResult] Error detected:", {
      title: formatted.title,
      description: formatted.description,
      suggestion: formatted.suggestion,
      authCallsExist,
      isDefinitelyNotApprovalRelated: isDefinitelyNotApprovalRelated(errorText),
    });

    // When auth calls exist, only fail on errors that are definitely not approval-related
    if (authCallsExist && !isDefinitelyNotApprovalRelated(errorText)) {
      logger.info("Skipping simulation error because authorization calls will be bundled:", formatted);
      return;
    }

    throw new Error(formatSimulationError(formatted));
  }, [isDefinitelyNotApprovalRelated, formatSimulationError]);

  const simulateInstructions = useCallback(
    async (instructions: ProtocolInstruction[], options?: { skipWhenAuthCallsExist?: boolean }) => {
      if (!routerContract || !userAddress || !publicClient) {
        throw new Error("Router contract or user address not available");
      }

      // Skip simulation for simple lending flows to avoid false negatives on basic actions
      if (isBasicLendingFlow(instructions)) {
        logger.info("[simulateInstructions] Skipping - basic lending flow");
        return;
      }

      // Get authorization calls first - we need to know if batching will include approvals
      const authCalls = await getAuthorizations(instructions);
      logger.info("[simulateInstructions] Auth calls count:", authCalls.length);

      // Skip simulation when auth calls exist and caller requests it (for batched flows)
      if (options?.skipWhenAuthCallsExist && authCalls.length > 0) {
        logger.info("Skipping simulation for batched flow with authorization calls");
        return;
      }

      // Simulate authorization calls to surface readable errors
      logger.info("[simulateInstructions] Simulating auth calls...");
      await simulateAuthCalls(authCalls, publicClient, userAddress as Address);
      logger.info("[simulateInstructions] Auth calls simulation passed");

      // Simulate the router call
      const protocolInstructions = instructions.map(inst => ({
        protocolName: inst.protocolName,
        data: inst.data as `0x${string}`,
      }));

      logger.info("[simulateInstructions] Simulating router call with", protocolInstructions.length, "instructions");

      const calldata = encodeFunctionData({
        abi: routerContract.abi,
        functionName: "processProtocolInstructions",
        args: [protocolInstructions],
      });

      const simResult = await simulateTransaction(
        publicClient,
        routerContract.address as `0x${string}`,
        calldata,
        userAddress as `0x${string}`
      );

      logger.info("[simulateInstructions] Router simulation result:", {
        success: simResult.success,
        hasError: !!simResult.error,
        error: simResult.error,
        rawError: (simResult as any).rawError,
      });

      handleRouterSimulationResult(simResult, authCalls.length > 0);
    },
    [routerContract, userAddress, publicClient, getAuthorizations, isBasicLendingFlow, simulateAuthCalls, handleRouterSimulationResult]
  );

  const executeInstructions = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<string | undefined> => {
    if (!routerContract || !userAddress) {
      throw new Error("Router contract or user address not available");
    }

    let notificationId: string | number | null = null;
    let transactionHash: string | undefined = undefined;
    let blockExplorerTxURL = "";

    try {
      notificationId = notification.loading(
        <TransactionToast step="pending" message="Waiting for approval..." />
      );

      const pendingTimeout = setTimeout(() => {
        if (notificationId) {
          notification.remove(notificationId);
        }
      }, 10000);

      try {
        const protocolInstructions = instructions.map(inst => ({
          protocolName: inst.protocolName,
          data: inst.data as `0x${string}`,
        }));

        transactionHash = await writeContractAsync({
          address: routerContract.address as `0x${string}`,
          abi: routerContract.abi,
          functionName: "processProtocolInstructions",
          args: [protocolInstructions],
        });

        clearTimeout(pendingTimeout);
      } catch (error) {
        clearTimeout(pendingTimeout);
        throw error;
      }

      const chainId = await publicClient?.getChainId();
      blockExplorerTxURL = chainId ? getBlockExplorerTxLink(chainId, transactionHash as `0x${string}`) : "";

      if (notificationId) notification.remove(notificationId);
      notificationId = notification.loading(
        <TransactionToast
          step="sent"
          txHash={transactionHash}
          message="Waiting for transaction to complete."
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      if (publicClient && transactionHash) {
        await publicClient.waitForTransactionReceipt({
          hash: transactionHash as `0x${string}`,
          confirmations: effectiveConfirmations,
          pollingInterval: 1000,
        });
      }

      if (notificationId) notification.remove(notificationId);
      notification.success(
        <TransactionToast
          step="confirmed"
          txHash={transactionHash}
          message="Transaction completed successfully!"
          blockExplorerLink={blockExplorerTxURL}
        />
      );

      return transactionHash;
    } catch (error: any) {
      if (notificationId) notification.remove(notificationId);
      console.error("Error executing instructions:", error);

      const message = formatExecutionError(error);

      notification.error(
        <TransactionToast
          step="failed"
          txHash={transactionHash}
          message={message}
          blockExplorerLink={blockExplorerTxURL}
        />
      );
      throw new Error(message);
    }
  }, [routerContract, userAddress, writeContractAsync, publicClient, effectiveConfirmations]);

  /**
   * Execute a single approval transaction with notifications
   */
  const executeSingleApproval = useCallback(async (
    authCall: AuthorizationCall
  ): Promise<void> => {
    if (!publicClient || !walletClient || !userAddress) return;

    const tokenAddress = authCall.target;
    let tokenSymbol = tokenAddress.substring(0, 6) + "...";
    try {
      tokenSymbol = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20ABI,
        functionName: "symbol",
        args: [],
      }) as string;
    } catch { /* Use truncated address as fallback */ }

    let approvalNotificationId: string | number | null = null;

    try {
      approvalNotificationId = notification.loading(
        <TransactionToast step="pending" message={`Approving ${tokenSymbol}...`} />
      );

      const currentNonce = await publicClient.getTransactionCount({
        address: userAddress as Address,
      });

      const approvalHash = await walletClient.sendTransaction({
        account: userAddress as Address,
        to: authCall.target,
        data: authCall.data,
        nonce: currentNonce,
      });

      notification.remove(approvalNotificationId);
      approvalNotificationId = notification.loading(
        <TransactionToast step="sent" txHash={approvalHash} message={`Approving ${tokenSymbol}...`} />
      );

      await publicClient.waitForTransactionReceipt({
        hash: approvalHash as `0x${string}`,
        confirmations: effectiveConfirmations,
        pollingInterval: 1000,
      });
      await new Promise(resolve => setTimeout(resolve, 100));

      notification.remove(approvalNotificationId);
      notification.success(
        <TransactionToast step="confirmed" txHash={approvalHash} message={`${tokenSymbol} approved`} />
      );
    } catch (error) {
      if (approvalNotificationId) notification.remove(approvalNotificationId);
      throw error;
    }
  }, [publicClient, walletClient, userAddress, effectiveConfirmations]);

  /**
   * Execute a single deauthorization transaction with notifications
   */
  const executeSingleDeauth = useCallback(async (
    call: AuthorizationCall
  ): Promise<void> => {
    if (!publicClient || !walletClient || !userAddress) return;
    if (!call.target || !call.data) return;

    let deauthNotifId: string | number | null = null;

    try {
      deauthNotifId = notification.loading(
        <TransactionToast step="pending" message="Revoking permissions..." />
      );

      const currentNonce = await publicClient.getTransactionCount({
        address: userAddress as Address,
      });

      const hash = await walletClient.sendTransaction({
        account: userAddress as Address,
        to: call.target,
        data: call.data,
        nonce: currentNonce,
      });

      notification.remove(deauthNotifId);
      deauthNotifId = notification.loading(
        <TransactionToast step="sent" txHash={hash} message="Revoking permissions..." />
      );

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: effectiveConfirmations,
        pollingInterval: 1000,
      });

      notification.remove(deauthNotifId);
      notification.success(
        <TransactionToast step="confirmed" txHash={hash} message="Permissions revoked" />
      );
    } catch (e) {
      if (deauthNotifId) notification.remove(deauthNotifId);
      logger.warn("Deauth step failed", e);
    }
  }, [publicClient, walletClient, userAddress, effectiveConfirmations]);

  /**
   * Execute all approvals sequentially
   */
  const executeApprovalsSequentially = useCallback(async (
    authCalls: AuthorizationCall[]
  ): Promise<void> => {
    const validCalls = filterValidAuthCalls(authCalls);

    for (const authCall of validCalls) {
      setIsApproving(true);
      await executeSingleApproval(authCall);
      setIsApproving(false);
    }
  }, [executeSingleApproval]);

  /**
   * Execute all deauthorizations sequentially
   */
  const executeDeauthsSequentially = useCallback(async (
    deauthCalls: AuthorizationCall[]
  ): Promise<void> => {
    const validCalls = filterValidDeauthCalls(deauthCalls);

    for (const call of validCalls) {
      await executeSingleDeauth(call);
    }
  }, [executeSingleDeauth]);

  /**
   * Build atomic batch calls for router execution with optional deauthorizations
   */
  const buildAtomicBatchCalls = useCallback((
    instructions: ProtocolInstruction[],
    deauthCalls: AuthorizationCall[]
  ): { to: Address; data: Hex; value: bigint }[] => {
    if (!routerContract) return [];

    const mainCall = {
      to: routerContract.address as Address,
      data: encodeFunctionData({
        abi: routerContract.abi,
        functionName: "processProtocolInstructions",
        args: [instructions.map(inst => ({
          protocolName: inst.protocolName,
          data: inst.data as `0x${string}`,
        }))],
      }),
      value: 0n,
    };

    const deauthCallsFormatted = deauthCalls.map(call => ({
      to: call.target,
      data: call.data,
      value: 0n,
    }));

    return [mainCall, ...deauthCallsFormatted];
  }, [routerContract]);

  const executeFlowWithApprovals = useCallback(async (
    instructions: ProtocolInstruction[],
    options?: { revokePermissions?: boolean }
  ): Promise<string | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Context not available");
    }

    try {
      // 1. Calculate and execute authorizations
      const authCalls = await getAuthorizations(instructions);

      if (authCalls.length === 0) {
        return await executeInstructions(instructions);
      }

      await executeApprovalsSequentially(authCalls);

      // 2. Execute main logic (Atomic Batch if supported, else standard Tx)
      if (canDoAtomicBatch && sendCallsAsync) {
        const deauthCalls = options?.revokePermissions
          ? await getDeauthorizations(instructions)
          : [];
        const calls = buildAtomicBatchCalls(instructions, deauthCalls);
        const { id } = await sendCallsAsync({ calls, capabilities });
        setBatchId(id);
        return id;
      }

      const txHash = await executeInstructions(instructions);

      // 3. Post-execution deauthorization (sequential, non-blocking)
      if (shouldRevokeOnChain(chainId, options?.revokePermissions)) {
        try {
          const deauthCalls = await getDeauthorizations(instructions);
          await executeDeauthsSequentially(deauthCalls);
        } catch (e) {
          logger.warn("Deauthorization check failed", e);
        }
      }

      return txHash;
    } catch (error: any) {
      setIsApproving(false);
      console.error("Error in executeFlowWithApprovals:", error);
      throw error;
    }
  }, [
    routerContract,
    userAddress,
    publicClient,
    walletClient,
    getAuthorizations,
    executeInstructions,
    executeApprovalsSequentially,
    canDoAtomicBatch,
    sendCallsAsync,
    capabilities,
    buildAtomicBatchCalls,
    getDeauthorizations,
    executeDeauthsSequentially,
    chainId,
  ]);

  /**
   * Build router calldata for processing instructions
   */
  const buildRouterCalldata = useCallback((
    instructions: ProtocolInstruction[]
  ): Hex => {
    if (!routerContract) throw new Error("Router contract not available");

    const protocolInstructions = instructions.map(inst => ({
      protocolName: inst.protocolName,
      data: inst.data as `0x${string}`,
    }));

    return encodeFunctionData({
      abi: routerContract.abi,
      functionName: "processProtocolInstructions",
      args: [protocolInstructions],
    });
  }, [routerContract]);

  /**
   * Build all calls for a flow (for batching with other calls)
   * Returns array of { to, data } ready for sendCallsAsync
   */
  const buildFlowCalls = useCallback(async (
    instructions: ProtocolInstruction[],
    options?: { revokePermissions?: boolean }
  ): Promise<{ to: Address; data: Hex }[]> => {
    if (!routerContract || !userAddress) {
      throw new Error("Missing context");
    }

    const routerCalldata = buildRouterCalldata(instructions);

    const authCalls = await getAuthorizations(instructions);
    const filteredAuthCalls = filterValidAuthCalls(authCalls);

    const deauthCalls = shouldRevokeOnChain(chainId, options?.revokePermissions)
      ? await getDeauthorizations(instructions)
      : [];
    const filteredDeauthCalls = filterValidDeauthCalls(deauthCalls);

    return [
      ...filteredAuthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
      { to: routerContract.address as Address, data: routerCalldata as Hex },
      ...filteredDeauthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
    ];
  }, [routerContract, userAddress, buildRouterCalldata, getAuthorizations, getDeauthorizations, chainId]);

  const executeFlowBatchedIfPossible = useCallback(async (
    instructions: ProtocolInstruction[],
    preferBatching = false,
    options?: { revokePermissions?: boolean }
  ): Promise<{ kind: "batch", id: string } | { kind: "tx", hash: string } | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Missing context");
    }

    const routerCalldata = buildRouterCalldata(instructions);

    const authCalls = await getAuthorizations(instructions);
    const filteredAuthCalls = filterValidAuthCalls(authCalls);

    const deauthCalls = shouldRevokeOnChain(chainId, options?.revokePermissions)
      ? await getDeauthorizations(instructions)
      : [];
    const filteredDeauthCalls = filterValidDeauthCalls(deauthCalls);

    const calls = [
      ...filteredAuthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
      { to: routerContract.address as Address, data: routerCalldata as Hex },
      ...filteredDeauthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
    ];

    logger.info("[executeFlowBatchedIfPossible] Call order:", {
      authCallsCount: filteredAuthCalls.length,
      authCalls: filteredAuthCalls.map(c => ({ to: c.target, dataPrefix: c.data?.slice(0, 10) })),
      mainCall: { to: routerContract.address, dataPrefix: routerCalldata.slice(0, 10) },
      deauthCallsCount: filteredDeauthCalls.length,
      totalCalls: calls.length,
      callOrder: calls.map((c, i) => ({ index: i, to: c.to, dataPrefix: c.data?.slice(0, 10) })),
    });

    // Single comprehensive debug log for batched execution
    const selectorNames: Record<string, string> = {
      "0xb3fdb079": "setAccountOperator",
      "0xd1e8f606": "enableCollateral",
      "0x2edb71be": "enableController",
    };
    console.log("[executeFlowBatchedIfPossible] === COMPLETE DEBUG INFO ===", JSON.stringify({
      user: userAddress,
      router: routerContract.address,
      authCalls: filteredAuthCalls.map((c, i) => ({
        idx: i, to: c.target, selector: c.data?.slice(0, 10),
        method: selectorNames[c.data?.slice(0, 10) || ""] || "unknown",
        data: c.data,
      })),
      mainCall: { to: routerContract.address, data: routerCalldata },
      deauthCalls: filteredDeauthCalls.map((c, i) => ({
        idx: i, to: c.target, selector: c.data?.slice(0, 10), data: c.data,
      })),
      allCalls: calls.map((c, i) => ({ idx: i, to: c.to, data: c.data })),
      totalCalls: calls.length,
    }, null, 2));

    if (preferBatching) {
      const { id } = await sendCallsAsync({
        calls,
        experimental_fallback: true,
      });

      setBatchId(id);
      const sentNotificationId = notification.loading(
        <TransactionToast step="sent" message="Batch transaction sent — waiting for confirmation..." />
      );
      setBatchNotificationId(sentNotificationId);

      return { kind: "batch", id };
    }

    const hash = await executeFlowWithApprovals(instructions, options);
    return hash ? { kind: "tx", hash } : undefined;
  }, [routerContract, userAddress, publicClient, walletClient, buildRouterCalldata, getAuthorizations, sendCallsAsync, executeFlowWithApprovals, getDeauthorizations, chainId]);

  // --- Move Flow Builder ---

  type FlashConfig = { version: FlashLoanVersion; premiumBps?: number; bufferBps?: number; };
  type BuildUnlockDebtParams = {
    fromProtocol: string; debtToken: Address; expectedDebt: string; debtDecimals?: number; fromContext?: `0x${string}`; flash: FlashConfig;
  };
  type BuildMoveCollateralParams = {
    fromProtocol: string; toProtocol: string; collateralToken: Address; withdraw: { max: true } | { amount: string }; collateralDecimals?: number; fromContext?: `0x${string}`; toContext?: `0x${string}`;
  };
  type BuildBorrowParams =
    | { mode: "exact"; toProtocol: string; token: Address; amount: string; decimals?: number; approveToRouter?: boolean; toContext?: `0x${string}`; }
    | { mode: "coverFlash"; toProtocol: string; token: Address; decimals?: number; extraBps?: number; approveToRouter?: boolean; toContext?: `0x${string}`; };

  type MoveFlowBuilder = {
    buildUnlockDebt: (p: BuildUnlockDebtParams) => void;
    buildMoveCollateral: (p: BuildMoveCollateralParams) => void;
    buildBorrow: (p: BuildBorrowParams) => void;
    setCompoundMarket: (debtToken: Address) => void;
    build: () => ProtocolInstruction[];
    getFlashObligations: () => Record<Address, { flashLoanUtxoIndex: number }>;
  };

  const createMoveBuilder = useCallback((): MoveFlowBuilder => {
    if (!userAddress) {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const noOp = () => {};
      return { buildUnlockDebt: noOp, buildMoveCollateral: noOp, buildBorrow: noOp, setCompoundMarket: noOp, build: () => [], getFlashObligations: () => ({}), };
    }

    const instructions: ProtocolInstruction[] = [];
    const flashLoanOutputs = new Map<Address, number>();
    let compoundMarket: Address | null = null;
    let utxoCount = 0;

    // Helper to add instructions and track UTXO indices
    const add = (inst: ProtocolInstruction, createsUtxo = false) => {
      instructions.push(inst);
      if (createsUtxo) utxoCount++;
      return instructions.length - 1;
    };
    const addRouter = (data: `0x${string}`, createsUtxo = false) => add(createRouterInstruction(data), createsUtxo);
    const addProto = (protocol: string, data: `0x${string}`, createsUtxo = false) => add(createProtocolInstruction(protocol, data), createsUtxo);

    const getContext = (protocol: string, defaultContext: `0x${string}` = "0x"): `0x${string}` => {
      if (protocol === "compound" && compoundMarket) return encodeCompoundMarket(compoundMarket);
      return defaultContext;
    };

    return {
      buildUnlockDebt: ({ fromProtocol, debtToken, expectedDebt, debtDecimals = 18, fromContext = "0x", flash: { version } }) => {
        const from = normalizeProtocolName(fromProtocol);
        const expected = parseUnits(expectedDebt, debtDecimals);
        if (expected === 0n) throw new Error(`Invalid debt amount`);

        const fromCtx = from === "compound" ? getContext(from, encodeCompoundMarket(debtToken)) : getContext(from, fromContext as `0x${string}`);

        // 1. Get Borrow Balance (creates UTXO)
        const utxoIndexForGetBorrow = utxoCount;
        addProto(from, encodeLendingInstruction(LendingOp.GetBorrowBalance, debtToken, userAddress, 0n, fromCtx, 999) as `0x${string}`, true);

        // 2. Flash Loan (creates UTXO)
        // Use centralized version-to-enum mapping
        const provider = versionToProviderEnum(version);
        const flashData = encodeFlashLoan(provider, utxoIndexForGetBorrow);
        const flashLoanUtxoIndex = utxoCount;
        addRouter(flashData as `0x${string}`, true);
        flashLoanOutputs.set((debtToken as Address).toLowerCase() as Address, flashLoanUtxoIndex);

        // 3. Approve Gateway (Router Instruction)
        // CRITICAL: createsUtxo=true because fixed Router logic appends an empty output for Approves to maintain index sync.
        addRouter(encodeApprove(flashLoanUtxoIndex, from) as `0x${string}`, true);

        // 4. Repay Debt (using Flash Loan proceeds)
        // Repay creates a refund UTXO (usually 0)
        addProto(from, encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, fromCtx, utxoIndexForGetBorrow) as `0x${string}`, true);
      },

      buildMoveCollateral: ({ fromProtocol, toProtocol, collateralToken, withdraw, collateralDecimals = 18, fromContext = "0x", toContext = "0x" }) => {
        const from = normalizeProtocolName(fromProtocol);
        const to = normalizeProtocolName(toProtocol);
        const fromCtx = from === "compound" ? getContext(from, encodeCompoundMarket(collateralToken)) : getContext(from, fromContext as `0x${string}`);
        const toCtx = to === "compound" && compoundMarket ? getContext(to, encodeCompoundMarket(compoundMarket)) : getContext(to, toContext as `0x${string}`);

        let utxoIndexForGetSupply: number | undefined;
        if ("max" in withdraw && withdraw.max) {
          utxoIndexForGetSupply = utxoCount;
          addProto(from, encodeLendingInstruction(LendingOp.GetSupplyBalance, collateralToken, userAddress, 0n, fromCtx, 999) as `0x${string}`, true);
        }

        const withdrawAmt = "amount" in withdraw ? parseUnits(withdraw.amount, collateralDecimals) : 0n;
        const utxoIndexForWithdraw = utxoCount;
        addProto(from, encodeLendingInstruction(LendingOp.WithdrawCollateral, collateralToken, userAddress, withdrawAmt, fromCtx, "max" in withdraw && withdraw.max && utxoIndexForGetSupply !== undefined ? utxoIndexForGetSupply : 999) as `0x${string}`, true);

        // Approve (creates UTXO for sync)
        addRouter(encodeApprove(utxoIndexForWithdraw, to) as `0x${string}`, true);
        
        // Deposit collateral to destination protocol
        // For Morpho Blue and Euler V2, use DepositCollateral (supplies collateral for borrowing)
        // For other protocols, use Deposit (which handles collateral deposits)
        const depositOp = (to === "morpho-blue" || to === "euler") ? LendingOp.DepositCollateral : LendingOp.Deposit;
        addProto(to, encodeLendingInstruction(depositOp, collateralToken, userAddress, 0n, toCtx, utxoIndexForWithdraw) as `0x${string}`, false);
      },

      buildBorrow: (p) => {
        const { toProtocol, token, toContext = "0x", approveToRouter = true } = p as any;
        const to = normalizeProtocolName(toProtocol);
        let borrowAmt = 0n;
        if (p.mode === "exact") borrowAmt = parseUnits(p.amount, p.decimals ?? 18);

        const toCtx = to === "compound" && compoundMarket ? getContext(to, encodeCompoundMarket(compoundMarket)) : getContext(to, toContext as `0x${string}`);
        const utxoIndexForBorrow = utxoCount;
        const borrowInputIndex = p.mode === "coverFlash" ? (flashLoanOutputs.get((token as Address).toLowerCase() as Address) ?? 999) : 999;

        // Borrow (creates UTXO)
        addProto(to, encodeLendingInstruction(LendingOp.Borrow, token, userAddress, borrowAmt, toCtx, borrowInputIndex) as `0x${string}`, true);

        if (approveToRouter && p.mode !== "coverFlash") {
          // Approve (creates UTXO)
          addRouter(encodeApprove(utxoIndexForBorrow, "router") as `0x${string}`, true);
        }
      },

      setCompoundMarket: (debtToken) => { compoundMarket = debtToken; },
      build: () => instructions,
      getFlashObligations: () => {
        const obj: Record<Address, { flashLoanUtxoIndex: number }> = {};
        for (const [token, utxoIndex] of flashLoanOutputs.entries()) obj[token] = { flashLoanUtxoIndex: utxoIndex };
        return obj;
      },
    };
  }, [userAddress, encodeCompoundMarket]);

  const isAnyConfirmed = isConfirmed || isBatchConfirmed;

  return {
    buildDepositFlow,
    buildBorrowFlow,
    buildRepayFlow,
    buildRepayFlowAsync,
    buildWithdrawFlow,
    buildCollateralSwapFlow,
    buildMultiplyFlow,
    buildCloseWithCollateralFlow,
    buildDebtSwapFlow,
    createMoveBuilder,
    simulateInstructions,
    executeInstructions,
    executeFlowWithApprovals,
    executeFlowBatchedIfPossible,
    buildFlowCalls,
    getAuthorizations,
    getDeauthorizations,
    sendCallsAsync,
    setBatchId,
    setSuppressBatchNotifications,
    routerContract,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    isApproving,
    writeContract,
    batchId,
    batchStatus,
    isBatchConfirmed,
    canDoAtomicBatch,
    isAnyConfirmed,
  };
};