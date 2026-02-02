import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import { encodeAbiParameters } from "viem";
import {
  ProtocolInstruction,
  LendingOp,
  createRouterInstruction,
  createProtocolInstruction,
  encodeApprove,
  encodePushToken,
  encodeLendingInstruction,
  normalizeProtocolName,
  encodeMorphoContext,
  encodeEulerContext,
  MorphoMarketContextForEncoding,
  EulerVaultContextForEncoding,
} from "~~/utils/v2/instructionHelpers";

// Re-export types for consumers
export type { MorphoMarketContextForEncoding, EulerVaultContextForEncoding, ProtocolInstruction };

const coder = AbiCoder.defaultAbiCoder();

// ============ Protocol ID Constants ============

// These must match LtvTrigger.sol constants
export const PROTOCOL_IDS = {
  AAVE_V3: keccak256(toUtf8Bytes("aave-v3")).slice(0, 10) as `0x${string}`,
  COMPOUND_V3: keccak256(toUtf8Bytes("compound-v3")).slice(0, 10) as `0x${string}`,
  MORPHO_BLUE: keccak256(toUtf8Bytes("morpho-blue")).slice(0, 10) as `0x${string}`,
  EULER_V2: keccak256(toUtf8Bytes("euler-v2")).slice(0, 10) as `0x${string}`,
  VENUS: keccak256(toUtf8Bytes("venus")).slice(0, 10) as `0x${string}`,
} as const;

// ============ Types ============

export interface TriggerParamsInput {
  protocolName: string;
  protocolContext: string;
  triggerLtvBps: number;
  targetLtvBps: number;
  collateralToken: string;
  debtToken: string;
  collateralDecimals: number;
  debtDecimals: number;
  maxSlippageBps: number;
  numChunks: number;
}

export interface ADLValidationResult {
  isValid: boolean;
  errors: string[];
}

// ============ Protocol ID Mapping ============

/**
 * Map protocol name to bytes4 protocol ID
 * Must match LtvTrigger.sol constants
 */
export function getProtocolId(protocolName: string): `0x${string}` {
  const normalized = normalizeProtocolName(protocolName);

  switch (normalized) {
    case "aave":
      return PROTOCOL_IDS.AAVE_V3;
    case "compound":
      return PROTOCOL_IDS.COMPOUND_V3;
    case "morpho-blue":
    case "morpho":
      return PROTOCOL_IDS.MORPHO_BLUE;
    case "euler":
      return PROTOCOL_IDS.EULER_V2;
    case "venus":
      return PROTOCOL_IDS.VENUS;
    default:
      throw new Error(`Unknown protocol: ${protocolName}`);
  }
}

// ============ TriggerParams Encoding ============

/**
 * Encode LtvTrigger.TriggerParams struct
 * Must match the Solidity struct exactly
 */
export function encodeTriggerParams(params: TriggerParamsInput): string {
  const protocolId = getProtocolId(params.protocolName);

  // Ensure numChunks is at least 1
  const numChunks = Math.max(1, params.numChunks);

  // TriggerParams struct layout:
  // bytes4 protocolId
  // bytes protocolContext
  // uint256 triggerLtvBps
  // uint256 targetLtvBps
  // address collateralToken
  // address debtToken
  // uint8 collateralDecimals
  // uint8 debtDecimals
  // uint256 maxSlippageBps
  // uint8 numChunks
  return coder.encode(
    [
      "tuple(bytes4 protocolId, bytes protocolContext, uint256 triggerLtvBps, uint256 targetLtvBps, address collateralToken, address debtToken, uint8 collateralDecimals, uint8 debtDecimals, uint256 maxSlippageBps, uint8 numChunks)",
    ],
    [
      [
        protocolId,
        params.protocolContext,
        BigInt(params.triggerLtvBps),
        BigInt(params.targetLtvBps),
        params.collateralToken,
        params.debtToken,
        params.collateralDecimals,
        params.debtDecimals,
        BigInt(params.maxSlippageBps),
        numChunks,
      ],
    ],
  );
}

// ============ Protocol Context Encoding ============

/**
 * Encode protocol-specific context for ADL orders
 */
export function encodeProtocolContext(
  protocolName: string,
  options: {
    morphoContext?: MorphoMarketContextForEncoding;
    eulerContext?: EulerVaultContextForEncoding;
    compoundMarket?: string;
  },
): string {
  const normalized = normalizeProtocolName(protocolName);

  switch (normalized) {
    case "aave":
    case "venus":
      // Aave and Venus use empty context
      return "0x";

    case "compound":
      // Compound uses market address as context
      if (options.compoundMarket) {
        return encodeAbiParameters([{ type: "address" }], [options.compoundMarket as `0x${string}`]);
      }
      return "0x";

    case "morpho-blue":
    case "morpho":
      // Morpho uses MarketParams
      if (options.morphoContext) {
        return encodeMorphoContext(options.morphoContext);
      }
      throw new Error("Morpho requires morphoContext");

    case "euler":
      // Euler uses vault context
      if (options.eulerContext) {
        return encodeEulerContext(options.eulerContext);
      }
      throw new Error("Euler requires eulerContext");

    default:
      return "0x";
  }
}

// ============ Instruction Building ============

/**
 * Build pre-instructions for ADL order (non-flash-loan mode)
 * Pre-hook executes BEFORE the swap - withdraws collateral to order manager
 *
 * WARNING: This mode fails when LTV is high because withdrawing collateral
 * increases LTV further, and the lending protocol will reject the withdrawal.
 * Use buildADLFlashLoanPreInstructions for high-LTV positions.
 *
 * UTXO layout at pre-hook start:
 * [0] = sellAmount (calculated by trigger, prepended by contract)
 *
 * Pre-instructions:
 * [1] WithdrawCollateral(collateral, user, UTXO[0]) -> UTXO[1] (tokens on router)
 * [2] PushToken(1, orderManager) -> transfers UTXO[1] to order manager for CoW swap
 */
export function buildADLPreInstructions(
  protocolName: string,
  collateralToken: string,
  userAddress: string,
  protocolContext: string,
  orderManagerAddress: string,
): ProtocolInstruction[] {
  const normalized = normalizeProtocolName(protocolName);

  // WithdrawCollateral uses UTXO[0] for amount (prepended by contract)
  // Tokens end up on the router after this instruction -> UTXO[1]
  const withdrawInstruction = createProtocolInstruction(
    normalized,
    encodeLendingInstruction(
      LendingOp.WithdrawCollateral,
      collateralToken,
      userAddress,
      0n, // Amount comes from UTXO[0]
      protocolContext,
      0, // inputIndex = 0 (use UTXO[0])
    ),
  );

  // PushToken transfers UTXO[1] (withdrawn collateral) from router to order manager
  // This is required because CoW Protocol needs tokens on the order manager to execute the swap
  const pushToOrderManagerInstruction = createRouterInstruction(
    encodePushToken(1, orderManagerAddress),
  );

  return [withdrawInstruction, pushToOrderManagerInstruction];
}

/**
 * Build pre-instructions for ADL order (flash loan mode)
 *
 * IMPORTANT: Pre-instructions are EMPTY for flash loan ADL!
 *
 * Token routing is handled by appData hooks, NOT contract pre-instructions:
 * 1. Flash loan → KapanCowAdapter (via FlashLoanRouter)
 * 2. appData pre-hook 1: adapter.fundOrderWithBalance() → moves ALL tokens to OrderManager
 * 3. appData pre-hook 2: manager.executePreHookBySalt() → caches amounts (runs these pre-instructions)
 * 4. VaultRelayer pulls sellAmount from OrderManager for swap
 *
 * Since fundOrderWithBalance already moved tokens to OrderManager,
 * there's nothing for pre-instructions to do.
 *
 * @deprecated Parameters kept for backwards compatibility but are unused
 */
export function buildADLFlashLoanPreInstructions(
  _collateralToken: string,
  _hooksTrampolineAddress: string,
  _orderManagerAddress: string,
): ProtocolInstruction[] {
  // EMPTY - token routing handled by appData hooks (fundOrderWithBalance)
  return [];
}

/**
 * Build post-instructions for ADL order (non-flash-loan mode)
 * Post-hook executes AFTER the swap - repays debt
 *
 * UTXO layout at post-hook start (from KapanConditionalOrderManager._buildPostHookInstructions):
 * [0] = actualSellAmount (collateral sold in swap)
 * [1] = actualBuyAmount (debt tokens received from swap)
 *
 * Post-instructions:
 * [2] Approve(debt, protocol, UTXO[1]) -> approve debt for repayment
 * [3] Repay(debt, user, UTXO[1]) -> repay debt
 */
export function buildADLPostInstructions(
  protocolName: string,
  debtToken: string,
  userAddress: string,
  protocolContext: string,
): ProtocolInstruction[] {
  const normalized = normalizeProtocolName(protocolName);

  // Approve debt token for the protocol (using UTXO[1] = actualBuyAmount)
  const approveInstruction = createRouterInstruction(encodeApprove(1, normalized));

  // Repay debt using UTXO[1] amount
  const repayInstruction = createProtocolInstruction(
    normalized,
    encodeLendingInstruction(
      LendingOp.Repay,
      debtToken,
      userAddress,
      0n, // Amount comes from UTXO[1]
      protocolContext,
      1, // inputIndex = 1 (use UTXO[1] = actualBuyAmount)
    ),
  );

  return [approveInstruction, repayInstruction];
}

/**
 * Build post-instructions for ADL order (flash loan mode)
 * Similar to close-with-collateral: repay debt first (unlocks collateral),
 * then withdraw collateral to repay flash loan.
 *
 * UTXO layout at post-hook start (from KapanConditionalOrderManager._buildPostHookInstructions):
 * [0] = actualSellAmount (collateral - needed for WithdrawCollateral to repay flash loan)
 * [1] = actualBuyAmount (debt tokens received from swap, already on router)
 *
 * Post-instructions:
 * [2] Approve: approve debt for lending protocol (using UTXO[1]) -> UTXO[2]
 * [3] Repay: repay user's debt using UTXO[1] - unlocks original collateral -> UTXO[3]
 * [4] WithdrawCollateral: withdraw collateral equal to actualSellAmount (UTXO[0]) -> UTXO[4]
 * [5] PushToken: push withdrawn collateral (UTXO[4]) to OrderManager for auto-refund to adapter
 *
 * Flash loan repayment flow:
 * - UTXO[4] contains withdrawn collateral = flash loan amount
 * - PushToken moves it to OrderManager
 * - OrderManager's sellTokenRefundAddress auto-refunds to adapter
 * - Adapter repays flash loan to Morpho
 *
 * @param orderManagerAddress - Required for PushToken to know where to send collateral
 */
export function buildADLFlashLoanPostInstructions(
  protocolName: string,
  collateralToken: string,
  debtToken: string,
  userAddress: string,
  protocolContext: string,
  orderManagerAddress: string,
): { instructions: ProtocolInstruction[]; flashLoanRepaymentUtxoIndex: number } {
  const normalized = normalizeProtocolName(protocolName);

  const instructions: ProtocolInstruction[] = [
    // [0] Approve debt for lending protocol (using UTXO[1] = actualBuyAmount) -> UTXO[2]
    createRouterInstruction(encodeApprove(1, normalized)),

    // [1] Repay user's debt using UTXO[1] - unlocks original collateral -> UTXO[3]
    createProtocolInstruction(
      normalized,
      encodeLendingInstruction(
        LendingOp.Repay,
        debtToken,
        userAddress,
        0n, // Amount from UTXO[1]
        protocolContext,
        1, // inputIndex = 1 (use UTXO[1] = actualBuyAmount)
      ),
    ),

    // [2] WithdrawCollateral: withdraw collateral equal to actualSellAmount (UTXO[0]) -> UTXO[4]
    // This is the same amount that was flash loaned and sold
    createProtocolInstruction(
      normalized,
      encodeLendingInstruction(
        LendingOp.WithdrawCollateral,
        collateralToken,
        userAddress,
        0n, // Amount from UTXO[0]
        protocolContext,
        0, // inputIndex = 0 (use UTXO[0] = actualSellAmount)
      ),
    ),

    // [3] PushToken: push withdrawn collateral (UTXO[4]) to OrderManager
    // This is CRITICAL for flash loan repayment:
    // - Collateral goes to manager
    // - Manager's sellTokenRefundAddress auto-refunds to adapter
    // - Adapter repays flash loan
    createRouterInstruction(encodePushToken(4, orderManagerAddress)),
  ];

  return {
    instructions,
    flashLoanRepaymentUtxoIndex: 4, // UTXO[4] = withdrawn collateral = flash loan repayment
  };
}

/**
 * Encode instructions array to bytes
 */
export function encodeInstructions(instructions: ProtocolInstruction[]): string {
  return coder.encode(
    ["tuple(string protocolName, bytes data)[]"],
    [instructions.map(i => [i.protocolName, i.data])],
  );
}

// ============ Validation ============

/**
 * Validate ADL configuration parameters
 */
export function validateADLParams(params: {
  currentLtvBps: number;
  liquidationLtvBps: number;
  triggerLtvBps: number;
  targetLtvBps: number;
  maxSlippageBps: number;
  numChunks: number;
  maxIterations: number;
  collateralToken?: string;
}): ADLValidationResult {
  const errors: string[] = [];

  // Target LTV should be lower than trigger (must deleverage)
  if (params.targetLtvBps >= params.triggerLtvBps) {
    errors.push("Target LTV must be lower than trigger LTV");
  }

  // Target LTV should have buffer from liquidation
  const SAFETY_BUFFER_BPS = 200; // 2%
  if (params.targetLtvBps > params.liquidationLtvBps - SAFETY_BUFFER_BPS) {
    errors.push("Target LTV should be at least 2% below liquidation threshold");
  }

  // Trigger LTV should be below liquidation
  if (params.triggerLtvBps >= params.liquidationLtvBps) {
    errors.push("Trigger LTV must be below liquidation threshold");
  }

  // Slippage bounds
  if (params.maxSlippageBps < 10 || params.maxSlippageBps > 1000) {
    errors.push("Slippage must be between 0.1% and 10%");
  }

  // Chunks bounds
  if (params.numChunks < 1 || params.numChunks > 10) {
    errors.push("Number of chunks must be between 1 and 10");
  }

  // Max iterations bounds
  if (params.maxIterations < 1 || params.maxIterations > 100) {
    errors.push("Max iterations must be between 1 and 100");
  }

  // Collateral must be selected
  if (!params.collateralToken) {
    errors.push("Please select a collateral to sell");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============ Flash Loan Amount Calculation ============

/**
 * Calculate the flash loan amount needed for ADL
 *
 * IMPORTANT: This is for automated/conditional orders where the same appData
 * must work for all future iterations. The order could trigger at much higher
 * LTV than the trigger threshold (e.g., during a market crash).
 *
 * Strategy: Calculate correct amount based on trigger→target, then multiply
 * by a safety factor (3x). Excess flash loan is automatically refunded via
 * sellTokenRefundAddress, so there's no cost to over-estimating.
 *
 * Formula matching LtvTrigger.sol:
 *   X = (triggerLtv - targetLtv) * collateral / (1 - targetLtv)
 *
 * @param collateralValueUsd - Total collateral value in USD (8 decimals)
 * @param debtValueUsd - Total debt value in USD (8 decimals) - unused, kept for API compat
 * @param triggerLtvBps - Trigger LTV in basis points
 * @param targetLtvBps - Target LTV in basis points
 * @param numChunks - Number of chunks to split the deleverage into
 * @param safetyMultiplier - Multiplier for future-proofing (default 3x)
 * @returns Per-chunk flash loan amount in USD (8 decimals)
 */
export function calculateADLFlashLoanAmount(
  collateralValueUsd: bigint,
  _debtValueUsd: bigint,
  triggerLtvBps: number,
  targetLtvBps: number,
  numChunks: number,
  safetyMultiplier = 3,
): bigint {
  const BPS_BASE = 10000n;
  const triggerLtv = BigInt(triggerLtvBps);
  const targetLtv = BigInt(targetLtvBps);

  // Must have triggerLtv > targetLtv for deleverage
  if (triggerLtv <= targetLtv) {
    return 0n;
  }

  // Prevent division by zero at 100% target LTV
  if (targetLtv >= BPS_BASE) {
    return 0n;
  }

  // Formula matching LtvTrigger.sol _calculateDeleverageAmount:
  // X = (triggerLtv - targetLtv) * collateral / (1 - targetLtv)
  const deltaLtv = triggerLtv - targetLtv;
  const denominator = BPS_BASE - targetLtv;
  const deleverageUsd = (deltaLtv * collateralValueUsd) / denominator;

  // Per-chunk amount
  const perChunkAmount = deleverageUsd / BigInt(Math.max(1, numChunks));

  // Multiply by safety factor for future iterations (excess is refunded)
  const withSafety = perChunkAmount * BigInt(safetyMultiplier);

  return withSafety;
}

/**
 * Convert USD value to token amount
 * @param usdValue - Value in USD (8 decimals, e.g., from Chainlink oracles)
 * @param tokenPrice - Token price in USD (8 decimals)
 * @param tokenDecimals - Token decimals (e.g., 18 for ETH, 6 for USDC)
 * @returns Token amount in token's native decimals
 */
export function usdToTokenAmount(
  usdValue: bigint,
  tokenPrice: bigint,
  tokenDecimals: number,
): bigint {
  if (tokenPrice <= 0n) return 0n;

  // usdValue is in 8 decimals, tokenPrice is in 8 decimals
  // Result should be in tokenDecimals
  // amount = usdValue * 10^tokenDecimals / tokenPrice
  return (usdValue * BigInt(10 ** tokenDecimals)) / tokenPrice;
}

// ============ AppData Helpers ============

/**
 * Generate a unique salt for the ADL order
 */
export function generateADLSalt(): `0x${string}` {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return ("0x" + Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

// ============ Display Helpers ============

/**
 * Format LTV basis points as percentage string
 */
export function formatLtvPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/**
 * Parse percentage string to basis points
 */
export function parseLtvPercent(percent: string): number {
  const value = parseFloat(percent.replace("%", ""));
  return Math.round(value * 100);
}

// ============ Auto-Leverage Helpers ============

/**
 * Encode AutoLeverageTrigger.TriggerParams struct
 * Same structure as LtvTrigger but with different semantics:
 * - triggerLtvBps: LTV threshold BELOW which to trigger (under-leveraged)
 * - targetLtvBps: Target LTV after leverage (higher than trigger)
 */
export function encodeAutoLeverageTriggerParams(params: TriggerParamsInput): string {
  // Same encoding as ADL trigger - the struct layout is identical
  return encodeTriggerParams(params);
}

/**
 * Build pre-instructions for Auto-Leverage order (flash loan mode)
 *
 * Auto-Leverage flow:
 * 1. Flash loan collateral (wstETH)
 * 2. Deposit collateral to lending protocol
 * 3. Borrow debt against new collateral
 * 4. Push debt to OrderManager for swap
 *
 * UTXO layout at pre-hook start:
 * [0] = sellAmount (debt to sell, calculated by trigger)
 *
 * Pre-instructions:
 * [1] DepositCollateral: deposit flash-loaned collateral -> UTXO[1]
 * [2] Borrow: borrow debt against collateral -> UTXO[2]
 * [3] PushToken: push borrowed debt (UTXO[2]) to order manager
 */
export function buildAutoLeveragePreInstructions(
  protocolName: string,
  collateralToken: string,
  debtToken: string,
  userAddress: string,
  protocolContext: string,
  orderManagerAddress: string,
  flashLoanAmount: bigint,
): ProtocolInstruction[] {
  const normalized = normalizeProtocolName(protocolName);

  // [1] DepositCollateral: deposit the flash-loaned collateral
  // Amount is the flash loan amount (known at order creation)
  const depositInstruction = createProtocolInstruction(
    normalized,
    encodeLendingInstruction(
      LendingOp.DepositCollateral,
      collateralToken,
      userAddress,
      flashLoanAmount, // Flash loan amount
      protocolContext,
      999, // No UTXO input - use explicit amount
    ),
  );

  // [2] Borrow: borrow debt against the deposited collateral
  // Amount comes from UTXO[0] = sellAmount (calculated by trigger)
  const borrowInstruction = createProtocolInstruction(
    normalized,
    encodeLendingInstruction(
      LendingOp.Borrow,
      debtToken,
      userAddress,
      0n, // Amount from UTXO[0]
      protocolContext,
      0, // inputIndex = 0 (use UTXO[0] = sellAmount)
    ),
  );

  // [3] PushToken: push borrowed debt (UTXO[2]) to order manager for CoW swap
  const pushToOrderManagerInstruction = createRouterInstruction(
    encodePushToken(2, orderManagerAddress),
  );

  return [depositInstruction, borrowInstruction, pushToOrderManagerInstruction];
}

/**
 * Build post-instructions for Auto-Leverage order (multiply flow)
 *
 * Flow:
 * 1. Flash loan DEBT token → Adapter → OrderManager
 * 2. Swap: debt → collateral
 * 3. Collateral received by OrderManager
 * 4. Post-hook: Deposit collateral, Borrow debt, Push to OrderManager
 * 5. OrderManager refunds excess sellToken (debt) to Adapter for flash loan repayment
 *
 * UTXO layout at post-hook start (from KapanConditionalOrderManager):
 * [0] = actualSellAmount (debt sold in swap)
 * [1] = actualBuyAmount (collateral received from swap)
 *
 * Post-instructions:
 * [2] Approve: approve collateral for lending protocol (using UTXO[1])
 * [3] DepositCollateral: deposit collateral (UTXO[1]) -> increases borrowing power
 * [4] Borrow: borrow debt to repay flash loan (using UTXO[0] as guide for amount)
 * [5] PushToken: push borrowed debt to OrderManager for refund to Adapter
 */
export function buildAutoLeveragePostInstructions(
  protocolName: string,
  collateralToken: string,
  debtToken: string,
  userAddress: string,
  protocolContext: string,
  orderManagerAddress: string,
): { instructions: ProtocolInstruction[]; flashLoanRepaymentUtxoIndex: number } {
  const normalized = normalizeProtocolName(protocolName);

  const instructions: ProtocolInstruction[] = [
    // [0] Approve collateral for lending protocol (using UTXO[1] = actualBuyAmount)
    createRouterInstruction(encodeApprove(1, normalized)),

    // [1] DepositCollateral: deposit received collateral (UTXO[1])
    createProtocolInstruction(
      normalized,
      encodeLendingInstruction(
        LendingOp.DepositCollateral,
        collateralToken,
        userAddress,
        0n, // Amount from UTXO[1]
        protocolContext,
        1, // inputIndex = 1 (use UTXO[1] = actualBuyAmount)
      ),
    ),

    // [2] Borrow: borrow debt to repay flash loan
    // Amount = actualSellAmount (UTXO[0]) + buffer for flash loan fee
    // Note: We borrow slightly more than sold to cover fees
    createProtocolInstruction(
      normalized,
      encodeLendingInstruction(
        LendingOp.Borrow,
        debtToken,
        userAddress,
        0n, // Amount from UTXO[0]
        protocolContext,
        0, // inputIndex = 0 (use UTXO[0] = actualSellAmount as base)
      ),
    ),

    // [3] PushToken: push borrowed debt (UTXO[3]) to OrderManager
    // NOTE: DepositCollateral returns NO output (empty array), so Borrow output is at index 3, not 4!
    // UTXO layout: [0]=sellAmount, [1]=buyAmount, [2]=Approve output, [3]=Borrow output
    // OrderManager will refund excess to sellTokenRefundAddress (Adapter)
    // Adapter uses it to repay flash loan
    createRouterInstruction(encodePushToken(3, orderManagerAddress)),
  ];

  return {
    instructions,
    flashLoanRepaymentUtxoIndex: 3, // UTXO[3] = borrowed debt for flash loan repayment
  };
}

/**
 * Calculate the estimated flash loan amount needed for Auto-Leverage
 *
 * For auto-leverage, we flash loan collateral to deposit, then borrow debt.
 * The flash loan amount should be enough to support the target debt increase.
 *
 * This calculates based on trigger→target, not current→target, because the order
 * may be set up before the trigger condition is met.
 *
 * @param collateralValueUsd - Total collateral value in USD (8 decimals)
 * @param debtValueUsd - Total debt value in USD (8 decimals)
 * @param triggerLtvBps - Trigger LTV in basis points (when to start leveraging)
 * @param targetLtvBps - Target LTV in basis points
 * @param numChunks - Number of chunks to split the leverage into
 * @param bufferBps - Additional buffer in basis points (default 2000 = 20%)
 * @returns Per-chunk flash loan amount in USD (8 decimals)
 */
export function calculateAutoLeverageFlashLoanAmount(
  collateralValueUsd: bigint,
  _debtValueUsd: bigint,
  _triggerLtvBps: number,
  targetLtvBps: number,
  numChunks: number,
  _bufferBps = 2000,
): bigint {
  // Flash loan must cover the trigger's calculated sell amount!
  //
  // The trigger uses: ΔD = (targetLTV × C - D) / (1 - targetLTV)
  // At worst case (D=0): ΔD = targetLTV × C / (1 - targetLTV)
  //
  // For 80% target LTV: multiplier = 0.8 / 0.2 = 4x collateral
  // For 85% target LTV: multiplier = 0.85 / 0.15 = 5.67x collateral
  //
  // We use: flashLoan = collateral × targetLTV / (1 - targetLTV)
  // This matches the maximum possible sell amount the trigger could request.
  // Any excess automatically refunds via sellTokenRefundAddress.
  if (collateralValueUsd === 0n) {
    return 0n;
  }

  const BPS_BASE = 10000n;
  const targetLtv = BigInt(targetLtvBps);

  if (targetLtv >= BPS_BASE) {
    return 0n; // Invalid: target LTV >= 100%
  }

  // Maximum leverage: targetLTV × C / (1 - targetLTV)
  // This is the amount needed if starting from 0% LTV
  const denominator = BPS_BASE - targetLtv;
  const maxLeverageUsd = (targetLtv * collateralValueUsd) / denominator;

  // 2x buffer for safety - handles price movements, stale data, rounding
  // Excess just gets refunded via sellTokenRefundAddress
  const withBuffer = maxLeverageUsd * 2n;

  // Per-chunk amount
  const perChunkAmount = withBuffer / BigInt(Math.max(1, numChunks));

  return perChunkAmount;
}

/**
 * Validate Auto-Leverage configuration parameters
 */
export function validateAutoLeverageParams(params: {
  currentLtvBps: number;
  liquidationLtvBps: number;
  triggerLtvBps: number;
  targetLtvBps: number;
  maxSlippageBps: number;
  numChunks: number;
  maxIterations: number;
  collateralToken?: string;
}): ADLValidationResult {
  const errors: string[] = [];

  // For auto-leverage: trigger < current < target < liquidation
  // Trigger when LTV drops BELOW trigger (under-leveraged)
  // Target should be HIGHER than trigger (we're increasing leverage)

  // Target LTV should be higher than trigger (must leverage up)
  if (params.targetLtvBps <= params.triggerLtvBps) {
    errors.push("Target LTV must be higher than trigger LTV for auto-leverage");
  }

  // Target LTV should have buffer from liquidation
  const SAFETY_BUFFER_BPS = 200; // 2% safety buffer for auto-leverage
  if (params.targetLtvBps > params.liquidationLtvBps - SAFETY_BUFFER_BPS) {
    errors.push("Target LTV should be at least 2% below liquidation threshold");
  }

  // Trigger LTV should be reasonable (not too low)
  if (params.triggerLtvBps < 500) {
    errors.push("Trigger LTV should be at least 5%");
  }

  // Slippage bounds
  if (params.maxSlippageBps < 10 || params.maxSlippageBps > 1000) {
    errors.push("Slippage must be between 0.1% and 10%");
  }

  // Chunks bounds
  if (params.numChunks < 1 || params.numChunks > 10) {
    errors.push("Number of chunks must be between 1 and 10");
  }

  // Max iterations bounds
  if (params.maxIterations < 1 || params.maxIterations > 100) {
    errors.push("Max iterations must be between 1 and 100");
  }

  // Collateral must be selected
  if (!params.collateralToken) {
    errors.push("Please select a collateral token");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
