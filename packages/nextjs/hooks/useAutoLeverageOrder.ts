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
  encodeAutoLeverageTriggerParams,
  buildAutoLeveragePostInstructions,
  encodeInstructions,
  validateAutoLeverageParams,
  TriggerParamsInput,
  ADLValidationResult,
  ProtocolInstruction,
} from "~~/components/modals/adlAutomationHelpers";
import {
  createRouterInstruction,
  encodeToOutput,
} from "~~/utils/v2/instructionHelpers";
import { notification } from "~~/utils/scaffold-stark/notification";
import { dispatchOrderCreated } from "~~/utils/orderNotes";

// ============ Types ============

export interface AutoLeverageFlashLoanConfig {
  /** Per-chunk flash loan amount in collateral token */
  amount: bigint;
  /** Per-chunk sell amount (debt to borrow and sell) */
  perChunkSellAmount: bigint;
}

export interface UseAutoLeverageOrderInput {
  protocolName: string;
  chainId: number;
  triggerParams: TriggerParamsInput;
  maxIterations: number;
  userAddress: Address;
  /**
   * Flash loan config - REQUIRED for auto-leverage orders.
   * We flash loan collateral, deposit it, borrow debt, then swap debt->collateral
   * to repay the flash loan.
   */
  flashLoanConfig: AutoLeverageFlashLoanConfig;
}

export interface UseAutoLeverageOrderReturn {
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

interface FlashLoanAppDataConfig {
  lender: string;
  token: Address;
  amount: bigint;
  useBalanceTransfer?: boolean;
}

function buildFlashLoanAppDataConfig(
  chainId: number,
  debtToken: Address,
  flashLoanAmount: bigint,
): FlashLoanAppDataConfig {
  const lenderInfo = getPreferredFlashLoanLender(chainId);
  if (!lenderInfo) {
    throw new Error(`No flash loan lender available on chain ${chainId}`);
  }

  console.log("[AutoLeverage] Flash loan config (multiply flow):", {
    lender: lenderInfo.address,
    provider: lenderInfo.provider,
    token: debtToken, // Flash loan DEBT, swap to collateral, deposit, borrow to repay
    amount: flashLoanAmount.toString(),
  });

  return {
    lender: lenderInfo.address,
    token: debtToken,
    amount: flashLoanAmount,
    useBalanceTransfer: true,
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

// ============ Hook ============

export function useAutoLeverageOrder(input: UseAutoLeverageOrderInput): UseAutoLeverageOrderReturn {
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

  const { data: autoLeverageTriggerInfo } = useDeployedContractInfo({
    contractName: "AutoLeverageTrigger",
    chainId,
  } as any);

  const { data: cowAdapterInfo } = useDeployedContractInfo({
    contractName: "KapanCowAdapter",
    chainId,
  } as any);

  // Validate parameters
  const validation = validateAutoLeverageParams({
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
      const triggerAddress = autoLeverageTriggerInfo?.address as Address | undefined;
      const cowAdapterAddress = cowAdapterInfo?.address as Address | undefined;

      assertContractDeployed(orderManagerAddress, "KapanConditionalOrderManager");
      assertContractDeployed(triggerAddress, "AutoLeverageTrigger");
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

      const isDelegated = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "userDelegates",
        args: [userAddress, validOrderManager],
      }) as boolean;

      if (!isDelegated) {
        notification.info("Setting up router delegation for auto-leverage orders...");
        const delegateHash = await walletClient.sendTransaction({
          to: routerContract.address as Address,
          data: encodeFunctionData({
            abi: routerContract.abi,
            functionName: "setDelegate",
            args: [validOrderManager, true],
          }),
          chain: walletClient.chain,
          account: connectedAddress as Address,
        });
        await publicClient.waitForTransactionReceipt({ hash: delegateHash });
        notification.success("Router delegation enabled");
      }

      // Generate unique salt
      const salt = generateOrderSalt() as `0x${string}`;

      // Encode trigger static data
      const triggerStaticData = encodeAutoLeverageTriggerParams(triggerParams) as `0x${string}`;

      // Auto-leverage (multiply) flow:
      // 1. Flash loan DEBT token → Adapter → OrderManager (via fundOrderWithBalance)
      // 2. VaultRelayer pulls debt from OrderManager for swap
      // 3. Swap: debt → collateral
      // 4. Collateral received by OrderManager
      // 5. Post-hook: Deposit collateral, Borrow debt, Push debt to OrderManager
      // 6. OrderManager refunds excess debt to Adapter for flash loan repayment
      //
      // Pre-instructions: EMPTY (like ADL) - fundOrderWithBalance handles token routing
      const preInstructions: ProtocolInstruction[] = [];

      // Post-instructions: Deposit collateral (UTXO[1]), Borrow debt, Push to OrderManager
      const { instructions: postInstructions } = buildAutoLeveragePostInstructions(
        protocolName,
        triggerParams.collateralToken,
        triggerParams.debtToken,
        userAddress,
        triggerParams.protocolContext,
        validOrderManager,
      );

      const encodedPreInstructions = encodeInstructions(preInstructions) as `0x${string}`;
      const encodedPostInstructions = encodeInstructions(postInstructions) as `0x${string}`;

      // Get authorization calls for the instructions
      // IMPORTANT: Prepend dummy ToOutput instructions to populate UTXOs for authorization.
      // At execution time, the OrderManager populates these UTXOs dynamically, but for
      // authorization we need explicit amounts so the gateway can calculate required approvals.
      // Post-instructions reference: UTXO[0] = actualSellAmount (debt), UTXO[1] = actualBuyAmount (collateral)
      //
      // For auto-leverage, we use MAX_UINT256 for collateral approval because:
      // 1. The actual collateral amount depends on swap execution price
      // 2. Multiple iterations compound the collateral being deposited
      // 3. High leverage multipliers (e.g., 5x) require large deposits
      const MAX_UINT256 = 2n ** 256n - 1n;
      const dummyUtxoInstructions = [
        // UTXO[0] = sell amount (debt that was flash loaned and sold)
        createRouterInstruction(encodeToOutput(flashLoanConfig.amount, triggerParams.debtToken)),
        // UTXO[1] = buy amount (collateral) - use max approval for flexibility
        createRouterInstruction(encodeToOutput(MAX_UINT256, triggerParams.collateralToken)),
      ];
      const allInstructions = [...dummyUtxoInstructions, ...postInstructions];
      const authCalls = await getAuthorizations(allInstructions);

      // Build flash loan config for appData - flash loan DEBT token (not collateral!)
      const flashLoanAppDataConfig = buildFlashLoanAppDataConfig(
        chainId,
        triggerParams.debtToken as Address, // Flash loan debt, swap to collateral
        flashLoanConfig.amount,
      );

      // Build and register appData with CoW Protocol
      const protocol = normalizeProtocolForAppCode(protocolName);
      const appDataResult = await buildAndRegisterAppData(
        chainId,
        validOrderManager,
        userAddress,
        salt,
        {
          operationType: "leverage-up", // Auto-leverage operation
          protocol,
          preHookGasLimit: "800000", // Pre-hook: deposit collateral + borrow debt + push
          postHookGasLimit: "500000", // Post-hook: minimal - just refund handling
          flashLoan: flashLoanAppDataConfig,
        },
      );

      if (!appDataResult.registered) {
        console.warn("AppData registration failed:", appDataResult.error);
      }

      const appDataHash = appDataResult.appDataHash as `0x${string}`;

      // Build order params
      // NOTE: For auto-leverage:
      // - sellToken = debtToken (we borrow and sell debt)
      // - buyToken = collateralToken (we buy collateral to repay flash loan)
      const orderParams = {
        user: userAddress,
        trigger: validTrigger,
        triggerStaticData,
        preInstructions: encodedPreInstructions,
        sellToken: triggerParams.debtToken as Address, // Selling debt
        buyToken: triggerParams.collateralToken as Address, // Buying collateral
        postInstructions: encodedPostInstructions,
        appDataHash,
        maxIterations: BigInt(maxIterations),
        // buyTokenRefundAddress goes to adapter for flash loan repayment
        sellTokenRefundAddress: validCowAdapter,
        isKindBuy: false, // Auto-leverage is a SELL order (exact debt to sell, min collateral to receive)
      };

      // Encode the createOrder call
      const callData = encodeFunctionData({
        abi: CONDITIONAL_ORDER_MANAGER_ABI,
        functionName: "createOrder",
        args: [orderParams, salt],
      });

      // Show pending notification
      const notificationId = notification.loading("Creating auto-leverage order...");

      try {
        // Execute authorization transactions first
        if (authCalls.length > 0) {
          notification.info(`Requesting ${authCalls.length} authorization(s)...`);
          for (const authCall of authCalls) {
            const authHash = await walletClient.sendTransaction({
              to: authCall.target as Address,
              data: authCall.data as Hex,
              chain: walletClient.chain,
              account: connectedAddress as Address,
            });
            await publicClient.waitForTransactionReceipt({ hash: authHash });
          }
        }

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
        let orderHash = salt;

        for (const log of receipt.logs) {
          if (
            log.address.toLowerCase() === validOrderManager.toLowerCase() &&
            log.topics.length >= 2 &&
            log.topics[1]
          ) {
            orderHash = log.topics[1];
            break;
          }
        }

        notification.remove(notificationId);
        notification.success("Auto-leverage order created successfully!");

        // Dispatch event so PendingOrdersDrawer refetches
        dispatchOrderCreated();

        // Invalidate ALL conditional order queries
        await queryClient.invalidateQueries({ queryKey: ["conditionalOrders"] });

        return { orderHash, salt };
      } catch (txError) {
        notification.remove(notificationId);
        throw txError;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      notification.error(`Failed to create auto-leverage order: ${errorMessage}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [
    walletClient,
    publicClient,
    conditionalOrderManagerInfo,
    autoLeverageTriggerInfo,
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

export function useAutoLeverageContracts(chainId: number) {
  const { data: conditionalOrderManagerInfo, isLoading: isLoadingManager } = useDeployedContractInfo({
    contractName: "KapanConditionalOrderManager",
    chainId,
  } as any);

  const { data: autoLeverageTriggerInfo, isLoading: isLoadingTrigger } = useDeployedContractInfo({
    contractName: "AutoLeverageTrigger",
    chainId,
  } as any);

  const { data: viewRouterInfo, isLoading: isLoadingViewRouter } = useDeployedContractInfo({
    contractName: "KapanViewRouter",
    chainId,
  } as any);

  return {
    conditionalOrderManagerAddress: conditionalOrderManagerInfo?.address as Address | undefined,
    autoLeverageTriggerAddress: autoLeverageTriggerInfo?.address as Address | undefined,
    viewRouterAddress: viewRouterInfo?.address as Address | undefined,
    isLoading: isLoadingManager || isLoadingTrigger || isLoadingViewRouter,
    isSupported:
      !!conditionalOrderManagerInfo?.address &&
      !!autoLeverageTriggerInfo?.address &&
      !!viewRouterInfo?.address,
  };
}
