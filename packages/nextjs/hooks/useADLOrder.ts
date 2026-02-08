import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, type Hex, encodeFunctionData } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import {
  buildAndRegisterAppData,
  generateOrderSalt,
  normalizeProtocolForAppCode,
  getPreferredFlashLoanLender,
} from "~~/utils/cow";
import {
  encodeTriggerParams,
  buildADLFlashLoanPreInstructions,
  buildADLFlashLoanPostInstructions,
  encodeInstructions,
  validateADLParams,
  TriggerParamsInput,
  ADLValidationResult,
} from "~~/components/modals/adlAutomationHelpers";
import {
  createRouterInstruction,
  encodeToOutput,
} from "~~/utils/v2/instructionHelpers";
import { notification } from "~~/utils/scaffold-stark/notification";
import { dispatchOrderCreated } from "~~/utils/orderNotes";

// ============ Types ============

export interface FlashLoanConfig {
  /** Per-chunk flash loan amount in collateral token */
  amount: bigint;
  /** Per-chunk buy amount (debt to receive from swap) */
  perChunkBuyAmount: bigint;
  /** User's collateral balance (for auth calculation) */
  userCollateralBalance: bigint;
}

export interface UseADLOrderInput {
  protocolName: string;
  chainId: number;
  triggerParams: TriggerParamsInput;
  maxIterations: number;
  userAddress: Address;
  /**
   * Flash loan config - REQUIRED for ADL orders.
   * Without flash loan, the order manager has no collateral to swap,
   * and CoW API will reject the order.
   */
  flashLoanConfig: FlashLoanConfig;
}

export interface UseADLOrderReturn {
  createOrder: () => Promise<{ orderHash: string; salt: string } | null>;
  isLoading: boolean;
  error: string | null;
  validation: ADLValidationResult;
}

// ============ Helper Functions ============

function assertWalletConnected(walletClient: unknown): asserts walletClient is NonNullable<typeof walletClient> {
  if (!walletClient) throw new Error("Wallet not connected");
}

function assertPublicClient(publicClient: unknown): asserts publicClient is NonNullable<typeof publicClient> {
  if (!publicClient) throw new Error("Public client not available");
}

function assertContractDeployed(address: Address | undefined, name: string): asserts address is Address {
  if (!address) throw new Error(`${name} not deployed on this chain`);
}

function assertAddressMatch(connected: Address | undefined, expected: Address): void {
  if (connected?.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Connected wallet does not match order user");
  }
}

interface InstructionBuildParams {
  protocolName: string;
  triggerParams: TriggerParamsInput;
  userAddress: string;
  orderManagerAddress: string;
  hooksTrampolineAddress: string;
}

interface InstructionBuildResult {
  preInstructions: ReturnType<typeof buildADLFlashLoanPreInstructions>;
  postInstructions: ReturnType<typeof buildADLFlashLoanPostInstructions>["instructions"];
  flashLoanRepaymentUtxoIndex: number;
}

/**
 * Build instructions for ADL order using flash loan pattern.
 *
 * Flash loans are REQUIRED because:
 * 1. Order manager has no collateral balance
 * 2. CoW API rejects orders where seller has no balance
 * 3. Withdrawing collateral first would fail for high-LTV positions
 *
 * Flow:
 * - Pre-hook: Pull flash-loaned collateral from HooksTrampoline → Push to OrderManager
 * - Post-hook: Repay debt → Withdraw collateral (for flash loan repayment)
 *
 * UTXO Layout (from contract):
 * Pre-hook:  [0] = sellAmount (from trigger)
 * Post-hook: [0] = actualSellAmount, [1] = actualBuyAmount
 */
function buildOrderInstructions(params: InstructionBuildParams): InstructionBuildResult {
  const { protocolName, triggerParams, userAddress, orderManagerAddress, hooksTrampolineAddress } = params;

  // Pre-instructions: Pull flash-loaned collateral and push to OrderManager
  const preInstructions = buildADLFlashLoanPreInstructions(
    triggerParams.collateralToken,
    hooksTrampolineAddress,
    orderManagerAddress,
  );

  // Post-instructions: Repay debt, withdraw collateral, push to manager for flash loan repayment
  const postResult = buildADLFlashLoanPostInstructions(
    protocolName,
    triggerParams.collateralToken,
    triggerParams.debtToken,
    userAddress,
    triggerParams.protocolContext,
    orderManagerAddress, // For PushToken to send withdrawn collateral to manager
  );

  return {
    preInstructions,
    postInstructions: postResult.instructions,
    flashLoanRepaymentUtxoIndex: postResult.flashLoanRepaymentUtxoIndex,
  };
}

interface FlashLoanAppDataConfig {
  lender: string;
  token: Address;
  amount: bigint;
  useBalanceTransfer?: boolean;
}

function buildFlashLoanAppDataConfig(
  chainId: number,
  collateralToken: Address,
  flashLoanConfig: FlashLoanConfig,
  flashLoanRepaymentUtxoIndex: number,
): FlashLoanAppDataConfig {
  const lenderInfo = getPreferredFlashLoanLender(chainId);
  if (!lenderInfo) {
    throw new Error(`No flash loan lender available on chain ${chainId}`);
  }

  console.log("[ADL] Flash loan config:", {
    lender: lenderInfo.address,
    provider: lenderInfo.provider,
    token: collateralToken,
    amount: flashLoanConfig.amount.toString(),
    repaymentUtxoIndex: flashLoanRepaymentUtxoIndex,
  });

  return {
    lender: lenderInfo.address,
    token: collateralToken,
    amount: flashLoanConfig.amount,
    useBalanceTransfer: true, // ADL uses balance-based transfer for dynamic amounts
  };
}

// ============ KapanConditionalOrderManager ABI ============

const CONDITIONAL_ORDER_MANAGER_ABI = [
  {
    name: "createOrder",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "trigger", type: "address" },
          { name: "triggerStaticData", type: "bytes" },
          { name: "preInstructions", type: "bytes" },
          { name: "sellToken", type: "address" },
          { name: "buyToken", type: "address" },
          { name: "postInstructions", type: "bytes" },
          { name: "appDataHash", type: "bytes32" },
          { name: "maxIterations", type: "uint256" },
          { name: "sellTokenRefundAddress", type: "address" },
          { name: "isKindBuy", type: "bool" },
        ],
      },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "orderHash", type: "bytes32" }],
  },
] as const;

// Helper: execute authorization transactions sequentially
async function executeAuthCalls(
  authCalls: Array<{ target: string; data: string }>,
  walletClient: any, publicClient: any, account: Address,
): Promise<void> {
  if (authCalls.length === 0) return;
  notification.info(`Requesting ${authCalls.length} authorization(s)...`);
  for (const authCall of authCalls) {
    const hash = await walletClient.sendTransaction({
      to: authCall.target as Address, data: authCall.data as Hex,
      chain: walletClient.chain, account,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }
}

// Helper: extract order hash from receipt logs
function extractOrderHashFromLogs(
  logs: Array<{ address: string; topics: string[] }>,
  managerAddr: string, fallback: string,
): string {
  for (const log of logs) {
    if (log.address.toLowerCase() === managerAddr.toLowerCase() && log.topics.length >= 2 && log.topics[1]) {
      return log.topics[1];
    }
  }
  return fallback;
}

// Helper: ensure router delegation for order manager
async function ensureRouterDelegation(
  publicClient: any, walletClient: any,
  routerContract: { address: string; abi: any },
  userAddress: Address, orderManagerAddress: Address,
  connectedAddress: Address, orderType: string,
): Promise<void> {
  const isDelegated = await publicClient.readContract({
    address: routerContract.address as Address, abi: routerContract.abi,
    functionName: "userDelegates", args: [userAddress, orderManagerAddress],
  }) as boolean;
  if (!isDelegated) {
    notification.info(`Setting up router delegation for ${orderType} orders...`);
    const delegateHash = await walletClient.sendTransaction({
      to: routerContract.address as Address,
      data: encodeFunctionData({ abi: routerContract.abi, functionName: "setDelegate", args: [orderManagerAddress, true] }),
      chain: walletClient.chain, account: connectedAddress,
    });
    await publicClient.waitForTransactionReceipt({ hash: delegateHash });
    notification.success("Router delegation enabled");
  }
}

// ============ Hook ============

export function useADLOrder(input: UseADLOrderInput): UseADLOrderReturn {
  const { protocolName, chainId, triggerParams, maxIterations, userAddress, flashLoanConfig } = input;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { address: connectedAddress } = useAccount();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });

  // Get authorization helper and router contract from router hook
  const { getAuthorizations, routerContract } = useKapanRouterV2();

  // Get deployed contract addresses
  const { data: conditionalOrderManagerInfo } = useDeployedContractInfo({
    contractName: "KapanConditionalOrderManager",
    chainId,
  } as any);

  const { data: ltvTriggerInfo } = useDeployedContractInfo({
    contractName: "LtvTrigger",
    chainId,
  } as any);

  const { data: cowAdapterInfo } = useDeployedContractInfo({
    contractName: "KapanCowAdapter",
    chainId,
  } as any);

  // Validate parameters
  const validation = validateADLParams({
    currentLtvBps: 0, // Will be validated with actual value in modal
    liquidationLtvBps: 10000, // Will be validated with actual value in modal
    triggerLtvBps: triggerParams.triggerLtvBps,
    targetLtvBps: triggerParams.targetLtvBps,
    maxSlippageBps: triggerParams.maxSlippageBps,
    numChunks: triggerParams.numChunks,
    maxIterations,
    collateralToken: triggerParams.collateralToken,
  });

  const createOrder = useCallback(async (): Promise<{ orderHash: string; salt: string } | null> => {
    setError(null);
    setIsLoading(true);

    try {
      // Validate all required context
      assertWalletConnected(walletClient);
      assertPublicClient(publicClient);

      const orderManagerAddress = conditionalOrderManagerInfo?.address as Address | undefined;
      const triggerAddress = ltvTriggerInfo?.address as Address | undefined;
      const cowAdapterAddress = cowAdapterInfo?.address as Address | undefined;

      assertContractDeployed(orderManagerAddress, "KapanConditionalOrderManager");
      assertContractDeployed(triggerAddress, "LtvTrigger");
      assertContractDeployed(cowAdapterAddress, "KapanCowAdapter");
      assertAddressMatch(connectedAddress, userAddress);

      // After assertions, TypeScript knows these are defined
      const validOrderManager = orderManagerAddress;
      const validTrigger = triggerAddress;
      const validCowAdapter = cowAdapterAddress;

      // Read HooksTrampoline address from the contract
      const hooksTrampolineAddress = await publicClient.readContract({
        address: validOrderManager,
        abi: [{ name: "hooksTrampoline", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }],
        functionName: "hooksTrampoline",
      }) as Address;

      if (!hooksTrampolineAddress || hooksTrampolineAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error("HooksTrampoline not configured on KapanConditionalOrderManager");
      }

      // Check and set router delegation for the OrderManager
      if (!routerContract?.address) {
        throw new Error("KapanRouter not deployed on this chain");
      }
      await ensureRouterDelegation(
        publicClient, walletClient, routerContract, userAddress,
        validOrderManager, connectedAddress as Address, "ADL"
      );

      // Generate unique salt
      const salt = generateOrderSalt() as `0x${string}`;

      // Encode trigger static data
      const triggerStaticData = encodeTriggerParams(triggerParams) as `0x${string}`;

      // Build instructions for flash loan ADL
      const { preInstructions, postInstructions, flashLoanRepaymentUtxoIndex } = buildOrderInstructions({
        protocolName,
        triggerParams,
        userAddress,
        orderManagerAddress: validOrderManager,
        hooksTrampolineAddress,
      });

      const encodedPreInstructions = encodeInstructions(preInstructions) as `0x${string}`;
      const encodedPostInstructions = encodeInstructions(postInstructions) as `0x${string}`;

      // Get authorization calls for the instructions
      // This returns the approvals/delegations needed for the router to execute on user's behalf
      //
      // IMPORTANT: Prepend dummy ToOutput instructions to populate UTXOs for authorization.
      // At execution time, the OrderManager populates these UTXOs dynamically, but for
      // authorization we need explicit amounts so the gateway can calculate required approvals.
      // Post-instructions reference: UTXO[0] = actualSellAmount, UTXO[1] = actualBuyAmount
      //
      // Use FULL collateral balance + 20% buffer for authorization because:
      // 1. Order could trigger days/weeks later when aToken balance has accrued interest
      // 2. Multiple iterations might need progressively larger withdrawals
      // 3. The trigger calculates actual amounts dynamically based on LTV at execution time
      // 4. 20% buffer accounts for ~1 year of interest at typical DeFi rates
      const AUTH_BUFFER_BPS = 2000n; // 20% buffer
      const collateralWithBuffer = flashLoanConfig.userCollateralBalance * (10000n + AUTH_BUFFER_BPS) / 10000n;
      const buyAmountWithBuffer = flashLoanConfig.perChunkBuyAmount * (10000n + AUTH_BUFFER_BPS) / 10000n;

      const dummyUtxoInstructions = [
        // UTXO[0] = sell amount - use full collateral balance + buffer for interest accrual
        createRouterInstruction(encodeToOutput(collateralWithBuffer, triggerParams.collateralToken)),
        // UTXO[1] = buy amount (debt received from swap to repay) + buffer
        createRouterInstruction(encodeToOutput(buyAmountWithBuffer, triggerParams.debtToken)),
      ];
      const allInstructions = [...dummyUtxoInstructions, ...preInstructions, ...postInstructions];
      const authCalls = await getAuthorizations(allInstructions);

      // Build flash loan config for appData (required for ADL)
      const flashLoanAppDataConfig = buildFlashLoanAppDataConfig(
        chainId,
        triggerParams.collateralToken as Address,
        flashLoanConfig,
        flashLoanRepaymentUtxoIndex,
      );

      // Build and register appData with CoW Protocol
      const protocol = normalizeProtocolForAppCode(protocolName);
      const appDataResult = await buildAndRegisterAppData(
        chainId,
        validOrderManager,
        userAddress,
        salt,
        {
          operationType: "adl",
          protocol,
          preHookGasLimit: "500000", // Pre-hook: pull flash loan + push to OrderManager
          postHookGasLimit: "1500000", // Post-hook: repay debt + withdraw collateral
          flashLoan: flashLoanAppDataConfig,
        },
      );

      if (!appDataResult.registered) {
        console.warn("AppData registration failed:", appDataResult.error);
        // Continue anyway - solver may still be able to execute
      }

      const appDataHash = appDataResult.appDataHash as `0x${string}`;

      // Build order params
      const orderParams = {
        user: userAddress,
        trigger: validTrigger,
        triggerStaticData,
        preInstructions: encodedPreInstructions,
        sellToken: triggerParams.collateralToken as Address,
        buyToken: triggerParams.debtToken as Address,
        postInstructions: encodedPostInstructions,
        appDataHash,
        maxIterations: BigInt(maxIterations),
        sellTokenRefundAddress: validCowAdapter, // For flash loan repayment
        isKindBuy: false, // ADL is a SELL order (exact collateral to sell, min debt to receive)
      };

      // Encode the createOrder call
      const callData = encodeFunctionData({
        abi: CONDITIONAL_ORDER_MANAGER_ABI,
        functionName: "createOrder",
        args: [orderParams, salt],
      });

      // Show pending notification
      const notificationId = notification.loading("Creating ADL protection order...");

      try {
        await executeAuthCalls(authCalls, walletClient, publicClient, connectedAddress as Address);

        // Send createOrder transaction
        const hash = await walletClient.sendTransaction({
          to: validOrderManager,
          data: callData,
          chain: walletClient.chain,
          account: connectedAddress as Address,
        });

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (receipt.status === "reverted") {
          throw new Error("Transaction reverted");
        }

        // Extract orderHash from logs
        const orderHash = extractOrderHashFromLogs(receipt.logs, validOrderManager, salt);

        notification.remove(notificationId);
        notification.success("ADL protection order created successfully!");

        // Dispatch event so PendingOrdersDrawer refetches
        dispatchOrderCreated();

        // Invalidate ALL conditional order queries so all components refresh
        await queryClient.invalidateQueries({ queryKey: ["conditionalOrders"] });

        return { orderHash, salt };
      } catch (txError) {
        notification.remove(notificationId);
        throw txError;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      notification.error(`Failed to create ADL order: ${errorMessage}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [
    walletClient,
    publicClient,
    conditionalOrderManagerInfo,
    ltvTriggerInfo,
    cowAdapterInfo,
    connectedAddress,
    userAddress,
    chainId,
    protocolName,
    triggerParams,
    maxIterations,
    flashLoanConfig,
    getAuthorizations,
    routerContract,
    queryClient,
  ]);

  return {
    createOrder,
    isLoading,
    error,
    validation,
  };
}

// ============ Helper Hook for Contract Addresses ============

export function useADLContracts(chainId: number) {
  const { data: conditionalOrderManagerInfo, isLoading: isLoadingManager } = useDeployedContractInfo({
    contractName: "KapanConditionalOrderManager",
    chainId,
  } as any);

  const { data: ltvTriggerInfo, isLoading: isLoadingTrigger } = useDeployedContractInfo({
    contractName: "LtvTrigger",
    chainId,
  } as any);

  const { data: viewRouterInfo, isLoading: isLoadingViewRouter } = useDeployedContractInfo({
    contractName: "KapanViewRouter",
    chainId,
  } as any);

  return {
    conditionalOrderManagerAddress: conditionalOrderManagerInfo?.address as Address | undefined,
    ltvTriggerAddress: ltvTriggerInfo?.address as Address | undefined,
    viewRouterAddress: viewRouterInfo?.address as Address | undefined,
    isLoading: isLoadingManager || isLoadingTrigger || isLoadingViewRouter,
    isSupported:
      !!conditionalOrderManagerInfo?.address &&
      !!ltvTriggerInfo?.address &&
      !!viewRouterInfo?.address,
  };
}
