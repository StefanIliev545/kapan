import { useCallback, useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient, useChainId, useSendCalls, useWaitForCallsStatus, useCapabilities } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, decodeAbiParameters, encodeAbiParameters, decodeFunctionData, encodeFunctionData, type Address, type Hex } from "viem";
import { notification } from "~~/utils/scaffold-stark/notification";
import { TransactionToast } from "~~/components/TransactionToast";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth";
import {
  ProtocolInstruction,
  createRouterInstruction,
  createProtocolInstruction,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeLendingInstruction,
  encodeFlashLoan,
  FlashLoanProvider,
  LendingOp,
  normalizeProtocolName,
} from "~~/utils/v2/instructionHelpers";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { ERC20ABI } from "~~/contracts/externalContracts";

// --- ABI FIXES ---
// Local definition of deauthorizeInstructions to avoid stale ABI errors if the frontend 
// hasn't updated with the latest contract deployment.
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

/**
 * Hook for building and executing instructions on KapanRouter v2
 */
export const useKapanRouterV2 = () => {
  const { address: userAddress } = useAccount();
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter" });
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const chainId = useChainId();

  const CONFIRMATIONS_BY_CHAIN: Record<number, number> = {
    8453: 2,   // Base mainnet
    84531: 2,  // Base Sepolia
    84532: 2,  // Base Sepolia (alternative)
    10: 2,     // Optimism mainnet
    420: 2,    // Optimism Goerli
    11155420: 2, // Optimism Sepolia
    42161: 0,  // Arbitrum One
    421614: 1, // Arbitrum Sepolia
    59144: 0,  // Linea mainnet
    59141: 1,  // Linea Sepolia
  };

  const effectiveConfirmations = CONFIRMATIONS_BY_CHAIN[chainId] ?? 1;

  const { writeContract, writeContractAsync, data: hash, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
    confirmations: effectiveConfirmations,
  });

  const [isApproving, setIsApproving] = useState(false);
  const [batchId, setBatchId] = useState<string | undefined>(undefined);

  // EIP-5792 capability detection
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

  useEffect(() => {
    if (!batchId || !batchStatus) return;

    if (batchNotificationId) {
      notification.remove(batchNotificationId);
      setBatchNotificationId(null);
    }

    if (isBatchConfirmed) {
      notification.success(
        <TransactionToast
          step="confirmed"
          message="Batch transaction completed successfully!"
        />
      );
    } else if (isBatchError) {
      notification.error(
        <TransactionToast
          step="failed"
          message="Batch transaction failed"
        />
      );
    }
  }, [batchId, batchStatus, isBatchConfirmed, isBatchError, batchNotificationId]);

  useEffect(() => {
    const complete = isConfirmed || isBatchConfirmed;
    if (!complete) return;

    Promise.all([
      queryClient.refetchQueries({ queryKey: ['readContract'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['readContracts'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['balance'], type: 'active' }),
      queryClient.refetchQueries({ queryKey: ['token'], type: 'active' }),
    ]).catch(e => console.warn("Post-tx refetch err:", e));

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("txCompleted"));
    }
  }, [isConfirmed, isBatchConfirmed, queryClient]);

  const encodeCompoundMarket = useCallback((marketAddress: Address): `0x${string}` => {
    return encodeAbiParameters([{ type: "address" }], [marketAddress]) as `0x${string}`;
  }, []);

  // --- Flow Builders ---

  const buildDepositFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    market?: Address
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];

    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = parseUnits(amount, decimals);
    const isCompound = normalizedProtocol === "compound";
    const lendingOp = isCompound ? LendingOp.DepositCollateral : LendingOp.Deposit;
    const context = isCompound && market ? encodeCompoundMarket(market) : "0x";

    return [
      createRouterInstruction(encodePullToken(amountBigInt, tokenAddress, userAddress)),
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(lendingOp, tokenAddress, userAddress, 0n, context, 0)
      ),
    ];
  }, [userAddress, encodeCompoundMarket]);

  const buildBorrowFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = parseUnits(amount, decimals);

    return [
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Borrow, tokenAddress, userAddress, amountBigInt, "0x", 999)
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
      console.warn("buildRepayFlow: isMax=true is deprecated. Use buildRepayFlowAsync instead.");
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

  const buildRepayFlowAsync = useCallback(async (
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false
  ): Promise<ProtocolInstruction[]> => {
    if (!userAddress || !publicClient) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);
    let pullAmount: bigint;
    if (isMax || amount.toLowerCase() === "max") {
      pullAmount = (parseUnits(amount, decimals) * 101n) / 100n;
    } else {
      pullAmount = parseUnits(amount, decimals);
    }

    return [
      createRouterInstruction(encodePullToken(pullAmount, tokenAddress, userAddress)),
      createRouterInstruction(encodeApprove(0, normalizedProtocol)),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.GetBorrowBalance, tokenAddress, userAddress, 0n, "0x", 999)
      ),
      createProtocolInstruction(
        normalizedProtocol,
        encodeLendingInstruction(LendingOp.Repay, tokenAddress, userAddress, 0n, "0x", isMax ? 2 : 0)
      ),
      createRouterInstruction(encodePushToken(3, userAddress)),
    ];
  }, [userAddress, publicClient]);

  const buildWithdrawFlow = useCallback((
    protocolName: string,
    tokenAddress: string,
    amount: string,
    decimals = 18,
    isMax = false,
    market?: Address
  ): ProtocolInstruction[] => {
    if (!userAddress) return [];
    const normalizedProtocol = normalizeProtocolName(protocolName);
    const amountBigInt = isMax || amount.toLowerCase() === "max"
      ? (2n ** 256n - 1n)
      : parseUnits(amount, decimals);
    const isCompound = normalizedProtocol === "compound";
    const context = isCompound && market ? encodeCompoundMarket(market) : "0x";

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
  }, [userAddress, encodeCompoundMarket]);

  // --- Authorization Helpers ---

  const getAuthorizations = useCallback(async (
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

      const result = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "authorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
      });
      const [targets, data] = result as unknown as [Address[], `0x${string}`[]];

      const authCalls: AuthorizationCall[] = [];
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const dataItem = data[i];
        const isValid = target && target !== "0x0000000000000000000000000000000000000000" && dataItem && dataItem.length > 0;
        if (isValid) {
          authCalls.push({
            target: target,
            data: dataItem,
          });
        }
      }
      return authCalls;
    } catch (error) {
      console.error("Error calling authorizeInstructions:", error);
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

      // FIX: Use local ABI constant to bypass stale contract type definition
      const result = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: DEAUTH_ABI,
        functionName: "deauthorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
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
      const errorMessage = error?.message || "";
      const lowerMessage = errorMessage.toLowerCase();
      const isRejection =
        lowerMessage.includes("user rejected") ||
        lowerMessage.includes("user denied") ||
        lowerMessage.includes("user cancelled") ||
        lowerMessage.includes("rejected") ||
        lowerMessage.includes("denied") ||
        lowerMessage.includes("cancelled") ||
        error?.code === 4001 ||
        error?.code === "ACTION_REJECTED" ||
        error?.code === "USER_REJECTED";

      const message = isRejection ? "User rejected the request" : (error.message || "Failed to execute instructions");
      notification.error(
        <TransactionToast
          step="failed"
          txHash={transactionHash}
          message={message}
          blockExplorerLink={blockExplorerTxURL}
        />
      );
      throw error;
    }
  }, [routerContract, userAddress, writeContractAsync, publicClient, effectiveConfirmations]);

  const executeFlowWithApprovals = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<string | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Context not available");
    }

    try {
      const authCalls = await getAuthorizations(instructions);

      if (authCalls.length === 0) {
        return await executeInstructions(instructions);
      }

      // Execute approvals sequentially
      for (let i = 0; i < authCalls.length; i++) {
        const authCall = authCalls[i];
        if (!authCall.target || !authCall.data || authCall.data.length === 0) continue;
        if (isZeroAmountApproval(authCall.data)) continue;

        setIsApproving(true);
        const tokenAddress = authCall.target;
        let tokenSymbol = tokenAddress.substring(0, 6) + "...";
        try {
          tokenSymbol = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20ABI,
            functionName: "symbol",
            args: [],
          }) as string;
        } catch { }

        let approvalNotificationId: string | number | null = null;
        let approvalHash: string | undefined = undefined;

        try {
          approvalNotificationId = notification.loading(
            <TransactionToast step="pending" message={`Approving ${tokenSymbol}...`} />
          );

          const currentNonce = await publicClient.getTransactionCount({
            address: userAddress as Address,
          });

          approvalHash = await walletClient.sendTransaction({
            account: userAddress as Address,
            to: authCall.target,
            data: authCall.data,
            nonce: currentNonce,
          });

          if (approvalNotificationId) notification.remove(approvalNotificationId);
          approvalNotificationId = notification.loading(
            <TransactionToast step="sent" txHash={approvalHash} message={`Approving ${tokenSymbol}...`} />
          );

          await publicClient.waitForTransactionReceipt({ hash: approvalHash as `0x${string}`, confirmations: effectiveConfirmations });
          await new Promise(resolve => setTimeout(resolve, 100));

          if (approvalNotificationId) notification.remove(approvalNotificationId);
          notification.success(<TransactionToast step="confirmed" txHash={approvalHash} message={`${tokenSymbol} approved`} />);
        } catch (error: any) {
          if (approvalNotificationId) notification.remove(approvalNotificationId);
          throw error;
        }
        setIsApproving(false);
      }

      // Atomic batch for Execution + Deauth if supported
      if (canDoAtomicBatch && sendCallsAsync) {
        const deauthCalls = [] as { target: Address, data: any }[]; //await getDeauthorizations(instructions);

        const calls = [
          {
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
          },
          ...deauthCalls.map(call => ({
            to: call.target,
            data: call.data,
            value: 0n,
          }))
        ];

        // FIX: Destructure return to get ID string
        const { id } = await sendCallsAsync({ calls, capabilities });
        setBatchId(id);
        return id;
      }

      return await executeInstructions(instructions);
    } catch (error: any) {
      setIsApproving(false);
      console.error("Error in executeFlowWithApprovals:", error);
      throw error;
    }
  }, [routerContract, userAddress, publicClient, walletClient, getAuthorizations, executeInstructions, effectiveConfirmations, canDoAtomicBatch, sendCallsAsync, capabilities, getDeauthorizations]);

  const executeFlowBatchedIfPossible = useCallback(async (
    instructions: ProtocolInstruction[],
    preferBatching = false
  ): Promise<{ kind: "batch", id: string } | { kind: "tx", hash: string } | undefined> => {
    if (!routerContract || !userAddress || !publicClient || !walletClient) {
      throw new Error("Missing context");
    }

    const protocolInstructions = instructions.map(inst => ({
      protocolName: inst.protocolName,
      data: inst.data as `0x${string}`,
    }));
    const routerCalldata = encodeFunctionData({
      abi: routerContract.abi,
      functionName: "processProtocolInstructions",
      args: [protocolInstructions],
    });

    const authCalls = await getAuthorizations(instructions);
    const filteredAuthCalls = authCalls.filter(({ target, data }) => {
      if (!target || !data || data.length === 0) return false;
      if (isZeroAmountApproval(data)) return false;
      return true;
    });

    const calls = [
      ...filteredAuthCalls.map(({ target, data }) => ({ to: target as Address, data: data as Hex })),
      { to: routerContract.address as Address, data: routerCalldata as Hex },
    ];

    if (preferBatching) {
      try {
        // FIX: Destructure return to get ID string
        const { id } = await sendCallsAsync({
          calls,
          experimental_fallback: true,
        });

        setBatchId(id);

        // Show tracking notification
        const sentNotificationId = notification.loading(
          <TransactionToast step="sent" message="Batch transaction sent — waiting for confirmation..." />
        );
        setBatchNotificationId(sentNotificationId);

        return { kind: "batch", id };
      } catch (err) {
        console.warn("Batch send failed, falling back:", err);
      }
    }

    const hash = await executeFlowWithApprovals(instructions);
    return hash ? { kind: "tx", hash } : undefined;
  }, [routerContract, userAddress, publicClient, walletClient, getAuthorizations, sendCallsAsync, executeFlowWithApprovals]);

  // --- Move Flow Builder ---
  // (Implementation same as previous, just ensuring context is passed correctly)

  type FlashConfig = { version: "v3" | "v2" | "aave"; premiumBps?: number; bufferBps?: number; };
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
      const noOp = () => { };
      return { buildUnlockDebt: noOp, buildMoveCollateral: noOp, buildBorrow: noOp, setCompoundMarket: noOp, build: () => [], getFlashObligations: () => ({}), };
    }

    const instructions: ProtocolInstruction[] = [];
    const flashLoanOutputs = new Map<Address, number>();
    let compoundMarket: Address | null = null;
    let utxoCount = 0;

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
        const utxoIndexForGetBorrow = utxoCount;
        addProto(from, encodeLendingInstruction(LendingOp.GetBorrowBalance, debtToken, userAddress, 0n, fromCtx, 999) as `0x${string}`, true);

        let provider: FlashLoanProvider = version === "aave" ? FlashLoanProvider.AaveV3 : (version === "v3" ? FlashLoanProvider.BalancerV3 : FlashLoanProvider.BalancerV2);
        const flashData = encodeFlashLoan(provider, utxoIndexForGetBorrow);
        const flashLoanUtxoIndex = utxoCount;
        addRouter(flashData as `0x${string}`, true);
        flashLoanOutputs.set((debtToken as Address).toLowerCase() as Address, flashLoanUtxoIndex);

        addRouter(encodeApprove(flashLoanUtxoIndex, from) as `0x${string}`, true);
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

        addRouter(encodeApprove(utxoIndexForWithdraw, to) as `0x${string}`, true);
        addProto(to, encodeLendingInstruction(LendingOp.Deposit, collateralToken, userAddress, 0n, toCtx, utxoIndexForWithdraw) as `0x${string}`, false);
      },

      buildBorrow: (p) => {
        const { toProtocol, token, toContext = "0x", approveToRouter = true } = p as any;
        const to = normalizeProtocolName(toProtocol);
        let borrowAmt = 0n;
        if (p.mode === "exact") borrowAmt = parseUnits(p.amount, p.decimals ?? 18);

        const toCtx = to === "compound" && compoundMarket ? getContext(to, encodeCompoundMarket(compoundMarket)) : getContext(to, toContext as `0x${string}`);
        const utxoIndexForBorrow = utxoCount;
        const borrowInputIndex = p.mode === "coverFlash" ? (flashLoanOutputs.get((token as Address).toLowerCase() as Address) ?? 999) : 999;

        addProto(to, encodeLendingInstruction(LendingOp.Borrow, token, userAddress, borrowAmt, toCtx, borrowInputIndex) as `0x${string}`, true);
        if (approveToRouter && p.mode !== "coverFlash") {
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
    buildDepositFlow, buildBorrowFlow, buildRepayFlow, buildRepayFlowAsync, buildWithdrawFlow, createMoveBuilder,
    executeInstructions, executeFlowWithApprovals, executeFlowBatchedIfPossible, getAuthorizations,
    hash, isPending, isConfirming, isConfirmed, isApproving, writeContract,
    batchId, batchStatus, isBatchConfirmed, canDoAtomicBatch, isAnyConfirmed,
  };
};