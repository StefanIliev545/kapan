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
  createProtocolInstruction,
  encodeToOutput,
  encodeApprove,
  encodeSubtract,
  encodePushToken,
  encodeLendingInstruction,
  LendingOp,
} from "~~/utils/v2/instructionHelpers";
import { ALCHEMIX_GATEWAY_NAME } from "~~/utils/alchemix/protocolConstants";
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
  recipient?: string;
}

// ============ Alchemix-specific instruction builders ============
//
// Alchemix AL uses a different topology than Aave/Morpho because alAsset has effectively no
// flash-loan liquidity. The flash is on the COLLATERAL underlying (USDC), funded into the
// router, and the manager pre-hook deposits + borrows + pushes the freshly-minted alAsset to
// the manager so CoW can sell it. Mirrors `buildMultiplyFlow`'s alchemix branch in
// `useTransactionBuilder.ts`.

interface AlchemixALInstructionParams {
  collateralToken: Address;        // underlying (USDC / WETH / …)
  debtToken: Address;              // alAsset (alUSD / alETH / …)
  userAddress: Address;
  alchemixContext: Hex;            // (marketId, tokenId) abi-encoded
  flashAmountUsdc: bigint;          // amount the adapter flashes & funds into the router
  orderManagerAddress: Address;
  cowAdapterAddress: Address;
}

/**
 * Pre-instructions for alchemix AL. UTXO map after the manager auto-injects
 * `ToOutput(sellAmount, alUSD)` at index 0:
 *   [0] ToOutput(sellAmount, alUSD)        — manager-injected
 *   [1] ToOutput(flashAmount, USDC)        — declares the router's flash USDC balance
 *   [2] Approve(in=1, alchemix-v3)         — gateway can pull USDC from router
 *   [3] DepositCollateral(USDC, in=1)      — auto-wraps to MYT, credits position (no output)
 *   [4] Borrow(alUSD, in=0)                — mintFrom: produces sellAmount alUSD on the router
 *   [5] PushToken(borrowOutIdx, manager)   — manager now holds the alUSD CoW will sell
 */
function buildAlchemixPreInstructions(params: AlchemixALInstructionParams): ProtocolInstruction[] {
  return [
    createRouterInstruction(encodeToOutput(params.flashAmountUsdc, params.collateralToken)),
    createRouterInstruction(encodeApprove(1, ALCHEMIX_GATEWAY_NAME)),
    createProtocolInstruction(
      ALCHEMIX_GATEWAY_NAME,
      encodeLendingInstruction(
        LendingOp.DepositCollateral,
        params.collateralToken,
        params.userAddress,
        0n,
        params.alchemixContext,
        1,
      ),
    ),
    createProtocolInstruction(
      ALCHEMIX_GATEWAY_NAME,
      encodeLendingInstruction(
        LendingOp.Borrow,
        params.debtToken,
        params.userAddress,
        0n,
        params.alchemixContext,
        0,
      ),
    ),
    // After approve(1) emits a UTXO, deposit emits 0, borrow emits 1 → borrow output sits at UTXO[3].
    createRouterInstruction(encodePushToken(3, params.orderManagerAddress)),
  ];
}

/**
 * Post-instructions for alchemix AL. UTXO map after manager auto-injects two ToOutputs:
 *   [0] ToOutput(actualSell, alUSD)
 *   [1] ToOutput(actualBuy, USDC)
 *   [2] ToOutput(flashAmount, USDC)        — declarative for the split
 *   [3] Subtract(1, 2) = actualBuy - flash — surplus USDC (the leverage gain)
 *   [4] Approve(in=3, alchemix-v3)         — approve only the surplus for re-deposit
 *   [5] DepositCollateral(USDC, in=3)      — re-deposits surplus as additional collateral
 *   [6] PushToken(2, adapter)              — exact flash amount → adapter for repayment
 */
function buildAlchemixPostInstructions(params: AlchemixALInstructionParams): ProtocolInstruction[] {
  return [
    createRouterInstruction(encodeToOutput(params.flashAmountUsdc, params.collateralToken)),
    createRouterInstruction(encodeSubtract(1, 2)),
    createRouterInstruction(encodeApprove(3, ALCHEMIX_GATEWAY_NAME)),
    createProtocolInstruction(
      ALCHEMIX_GATEWAY_NAME,
      encodeLendingInstruction(
        LendingOp.DepositCollateral,
        params.collateralToken,
        params.userAddress,
        0n,
        params.alchemixContext,
        3,
      ),
    ),
    createRouterInstruction(encodePushToken(2, params.cowAdapterAddress as Address)),
  ];
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

  // Alchemix routes through TransientAutoLeverageTrigger because its AL flow has state-mutating
  // preInstructions (deposit + borrow inside the manager pre-hook), which would desync the
  // standard AutoLeverageTrigger's dynamic `calculateExecution` from the on-chain ERC-1271 sig
  // check. The transient trigger snapshots its outputs to per-tx transient storage during a
  // dedicated `prepareCacheBySalt` pre-interaction.
  const { data: transientAutoLeverageTriggerInfo } = useDeployedContractInfo({
    contractName: "TransientAutoLeverageTrigger",
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

      const isAlchemix = protocolName === ALCHEMIX_GATEWAY_NAME;

      const orderManagerAddress = conditionalOrderManagerInfo?.address as Address | undefined;
      const triggerAddress = (
        isAlchemix
          ? transientAutoLeverageTriggerInfo?.address
          : autoLeverageTriggerInfo?.address
      ) as Address | undefined;
      const cowAdapterAddress = cowAdapterInfo?.address as Address | undefined;

      assertContractDeployed(orderManagerAddress, "KapanConditionalOrderManager");
      assertContractDeployed(
        triggerAddress,
        isAlchemix ? "TransientAutoLeverageTrigger" : "AutoLeverageTrigger",
      );
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
        validOrderManager, connectedAddress as Address, "auto-leverage"
      );

      // Generate unique salt
      const salt = generateOrderSalt() as `0x${string}`;

      // Encode trigger static data
      const triggerStaticData = encodeAutoLeverageTriggerParams(triggerParams) as `0x${string}`;

      // Topology branches by protocol family:
      //
      //   Aave / Morpho / Compound / Venus / Euler — flash DEBT, fund manager directly:
      //     pre   = empty (adapter.fundOrderWithBalance writes sellToken into manager)
      //     CoW   = sells debt, manager receives collateral
      //     post  = deposit collateral, borrow new debt, push to manager (refund flash)
      //
      //   Alchemix V3 — flash COLLATERAL underlying (alAsset has no flash liquidity):
      //     pre   = ToOutput(flash) + Approve + DepositCollateral + Borrow alAsset + Push to manager
      //     CoW   = sells alAsset, manager receives collateral underlying
      //     post  = Subtract surplus, re-deposit surplus as collateral, push exact flash to adapter
      //   The flash recipient is the ROUTER (not manager) so DepositCollateral can pull it.
      //   The TransientAutoLeverageTrigger's prepareCacheBySalt is added as an extra pre-hook
      //   between adapter funding and the manager pre-hook — without it, the manager pre-hook's
      //   state mutations would desync the on-chain ERC-1271 sig check from the WatchTower-signed
      //   amounts.
      let preInstructions: ProtocolInstruction[];
      let postInstructions: ProtocolInstruction[];
      const flashTokenForAlchemix = triggerParams.collateralToken as Address;

      if (isAlchemix) {
        const alchemixParams: AlchemixALInstructionParams = {
          collateralToken: triggerParams.collateralToken as Address,
          debtToken: triggerParams.debtToken as Address,
          userAddress,
          alchemixContext: triggerParams.protocolContext as Hex,
          flashAmountUsdc: flashLoanConfig.amount,
          orderManagerAddress: validOrderManager,
          cowAdapterAddress: validCowAdapter,
        };
        preInstructions = buildAlchemixPreInstructions(alchemixParams);
        postInstructions = buildAlchemixPostInstructions(alchemixParams);
      } else {
        // Standard Aave/Morpho/Compound/Venus/Euler post-hook flow (empty pre).
        preInstructions = [];
        const { instructions } = buildAutoLeveragePostInstructions(
          protocolName,
          triggerParams.collateralToken,
          triggerParams.debtToken,
          userAddress,
          triggerParams.protocolContext,
          validOrderManager,
        );
        postInstructions = instructions;
      }

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
      // For alchemix the auth flow also needs to see the preInstructions (Borrow needs
      // approveMint, Deposit needs ERC20 allowance) — those run on top of the same UTXOs.
      const allInstructions = isAlchemix
        ? [...dummyUtxoInstructions, ...preInstructions, ...postInstructions]
        : [...dummyUtxoInstructions, ...postInstructions];
      const authCalls = await getAuthorizations(allInstructions);

      // Flash-loan token diverges by protocol family: Aave/Morpho-shaped flows flash the DEBT
      // (manager already holds sellToken before CoW pulls). Alchemix-shaped flows flash the
      // COLLATERAL underlying because alAsset has no flash liquidity, and the pre-hook needs
      // the underlying available on the router for DepositCollateral.
      const flashToken: Address = isAlchemix ? flashTokenForAlchemix : (triggerParams.debtToken as Address);
      const flashLoanAppDataConfig = buildFlashLoanAppDataConfig(
        chainId,
        flashToken,
        flashLoanConfig.amount,
      );
      // Alchemix routes the flashed underlying directly to the router; non-alchemix delivers to
      // the manager (existing behavior).
      if (isAlchemix && routerContract?.address) {
        flashLoanAppDataConfig.recipient = routerContract.address;
      }

      // Alchemix also needs an extra pre-interaction: TransientAutoLeverageTrigger.prepareCacheBySalt(user, salt)
      // — runs AFTER adapter funding (which already deposited the flashed underlying into the
      // router) but BEFORE the manager pre-hook executes its mutating preInstructions, so the
      // trigger snapshot reflects pre-mutation state. Without this hook the on-chain ERC-1271
      // sig check would see post-mutation amounts and reject the trade.
      const PREPARE_CACHE_IFACE = [
        "function prepareCacheBySalt(address user, bytes32 salt) external",
      ];
      const prepareCacheCalldata = isAlchemix
        ? encodeFunctionData({
            abi: [{ name: "prepareCacheBySalt", type: "function", stateMutability: "nonpayable", inputs: [{ name: "user", type: "address" }, { name: "salt", type: "bytes32" }], outputs: [] }],
            functionName: "prepareCacheBySalt",
            args: [userAddress, salt],
          })
        : "0x";
      const extraPreHooks = isAlchemix
        ? [
            {
              target: validTrigger,
              callData: prepareCacheCalldata,
              gasLimit: "350000",
              dappId: "kapan://flashloans/alchemix/prepare-cache",
            },
          ]
        : undefined;
      // Suppress lint for the iface constant — kept here for human reference even though we
      // build calldata via encodeFunctionData inline.
      void PREPARE_CACHE_IFACE;

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
          // Alchemix's pre-hook is non-empty (deposit + borrow + push); Aave/Morpho's is empty.
          preHookGasLimit: isAlchemix ? "1500000" : "500000",
          postHookGasLimit: "1500000", // Post-hook: deposit collateral + borrow debt + push (Venus is gas-heavy)
          flashLoan: flashLoanAppDataConfig,
          extraPreHooks,
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
    transientAutoLeverageTriggerInfo,
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

  const { data: transientAutoLeverageTriggerInfo, isLoading: isLoadingTransientTrigger } = useDeployedContractInfo({
    contractName: "TransientAutoLeverageTrigger",
    chainId,
  } as any);

  const { data: viewRouterInfo, isLoading: isLoadingViewRouter } = useDeployedContractInfo({
    contractName: "KapanViewRouter",
    chainId,
  } as any);

  return {
    conditionalOrderManagerAddress: conditionalOrderManagerInfo?.address as Address | undefined,
    autoLeverageTriggerAddress: autoLeverageTriggerInfo?.address as Address | undefined,
    transientAutoLeverageTriggerAddress: transientAutoLeverageTriggerInfo?.address as Address | undefined,
    viewRouterAddress: viewRouterInfo?.address as Address | undefined,
    isLoading: isLoadingManager || isLoadingTrigger || isLoadingTransientTrigger || isLoadingViewRouter,
    // The cogwheel only needs the *standard* trigger to consider AL supported on a chain;
    // alchemix-specific code paths additionally check `transientAutoLeverageTriggerAddress`.
    isSupported:
      !!conditionalOrderManagerInfo?.address &&
      !!autoLeverageTriggerInfo?.address &&
      !!viewRouterInfo?.address,
  };
}
