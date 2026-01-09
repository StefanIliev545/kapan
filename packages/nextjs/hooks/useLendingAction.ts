import type { Network } from "./useTokenBalance";
import { useTokenBalance } from "./useTokenBalance";
import { CairoCustomEnum, CallData, Contract, num, uint256, Call, AccountInterface, Uint256 } from "starknet";
import { parseUnits } from "viem";
import { useDeployedContractInfo as useStarkDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useSmartTransactor } from "~~/hooks/scaffold-stark";
import { useLendingAuthorizations, type BaseProtocolInstruction, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { feltToString } from "~~/utils/protocols";
import { logger } from "~~/utils/logger";
import { buildVesuContextOption, type VesuContext } from "~~/utils/vesu";
import { useVesuV2Vault, useVesuV2VaultBalance } from "~~/hooks/useVesuV2Vault";

export type Action = "Borrow" | "Deposit" | "Withdraw" | "Repay";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse the preview_redeem response from ERC4626 contract.
 * Handles various response formats from starknet.js
 */
function parsePreviewRedeemResponse(previewRes: unknown, fallbackValue: bigint): bigint {
  if (!previewRes) return fallbackValue;

  // Handle { assets: { low, high } } format
  if (typeof previewRes === "object" && "assets" in (previewRes as Record<string, unknown>)) {
    const assets = (previewRes as { assets: unknown }).assets;
    if (typeof assets === "object" && assets !== null && "low" in assets && "high" in assets) {
      const { low, high } = assets as { low: unknown; high: unknown };
      return BigInt(low as string | number | bigint) + (BigInt(high as string | number | bigint) << 128n);
    }
    if (typeof assets === "bigint" || typeof assets === "number" || typeof assets === "string") {
      return BigInt(assets);
    }
  }

  // Handle array response format
  if (Array.isArray(previewRes) && previewRes[0]) {
    const v = previewRes[0] as unknown;
    if (typeof v === "object" && v !== null && "low" in v && "high" in v) {
      const { low, high } = v as { low: unknown; high: unknown };
      return BigInt(low as string | number | bigint) + (BigInt(high as string | number | bigint) << 128n);
    }
    return BigInt(v as string | number | bigint);
  }

  return fallbackValue;
}

/**
 * Build a lending instruction enum based on action type.
 * Uses a factory pattern instead of switch chain.
 */
function buildLendingInstruction(
  action: Action,
  basic: { token: string; amount: Uint256; user: string },
  context: ReturnType<typeof buildVesuContextOption>,
  isMax: boolean,
): CairoCustomEnum {
  const baseVariants = {
    Deposit: undefined,
    Borrow: undefined,
    Repay: undefined,
    Withdraw: undefined,
  };

  const instructionBuilders: Record<Action, () => CairoCustomEnum> = {
    Deposit: () => new CairoCustomEnum({ ...baseVariants, Deposit: { basic, context } }),
    Withdraw: () => new CairoCustomEnum({ ...baseVariants, Withdraw: { basic, withdraw_all: isMax, context } }),
    Borrow: () => new CairoCustomEnum({ ...baseVariants, Borrow: { basic, context } }),
    Repay: () => new CairoCustomEnum({ ...baseVariants, Repay: { basic, repay_all: isMax, context } }),
  };

  return instructionBuilders[action]();
}

/**
 * Check if position is a vToken position based on context.
 */
function checkIsVTokenPosition(isVesuV2: boolean, vesuContext?: VesuContext): boolean {
  if (!isVesuV2 || !vesuContext) return false;

  // Check explicit isVtoken flag
  if ("isVtoken" in vesuContext && vesuContext.isVtoken) return true;

  // Check if counterpart is zero address
  if ("positionCounterpartToken" in vesuContext) {
    const counterpart = vesuContext.positionCounterpartToken;
    return counterpart === "0x0" || counterpart === "0x00" || BigInt(counterpart) === 0n;
  }

  return false;
}

/**
 * Calculate the parsed amount with max adjustments for Repay/Withdraw actions.
 */
function calculateParsedAmountWithMax(
  action: Action,
  amount: string,
  decimals: number,
  isMax: boolean,
  maxAmount: bigint | undefined,
  walletBalance: bigint,
): bigint {
  const parsedAmount = parseUnits(amount, decimals);

  if (!isMax) return parsedAmount;

  if (action === "Repay") {
    const basis = maxAmount ?? parsedAmount;
    const bumped = (basis * 101n) / 100n;
    return bumped > walletBalance ? walletBalance : bumped;
  }

  if (action === "Withdraw") {
    const basis = maxAmount ?? parsedAmount;
    return (basis * 101n) / 100n;
  }

  return parsedAmount;
}

/**
 * Parse authorization instructions from contract response.
 */
function parseAuthorizationInstructions(protocolInstructions: unknown): LendingAuthorization[] {
  const authorizations: LendingAuthorization[] = [];

  if (!Array.isArray(protocolInstructions)) return authorizations;

  for (const inst of protocolInstructions as unknown[]) {
    const instArray = inst as [unknown, unknown, bigint[]];
    const addr = num.toHexString(instArray[0] as bigint);
    const entry = feltToString(instArray[1] as bigint);
    authorizations.push({
      contractAddress: addr,
      entrypoint: entry,
      calldata: instArray[2].map(f => num.toHexString(f)),
    });
  }

  return authorizations;
}

// ============================================================================
// VToken Migration Calls Builder
// ============================================================================

interface VTokenMigrationParams {
  amount: string;
  decimals: number;
  starkAddress: string;
  starkAccount: AccountInterface;
  tokenAddress: string;
  collateralTokenAddress: string;
  collateralVTokenAddress: string;
  protocolName: string;
  poolAddress: string;
  vTokenBalance: bigint;
  routerGatewayAddress: string;
  getAuthorizations: (instructions: BaseProtocolInstruction[]) => Promise<Call[]>;
}

const ERC4626_PREVIEW_ABI = [
  {
    name: "preview_redeem",
    type: "function",
    inputs: [{ name: "shares", type: "core::integer::u256" }],
    outputs: [{ name: "assets", type: "core::integer::u256" }],
    state_mutability: "view",
  },
] as const;

async function buildVTokenMigrationCalls(params: VTokenMigrationParams): Promise<Call[] | null> {
  const {
    amount,
    decimals,
    starkAddress,
    starkAccount,
    tokenAddress,
    collateralTokenAddress,
    collateralVTokenAddress,
    protocolName,
    poolAddress,
    vTokenBalance,
    routerGatewayAddress,
    getAuthorizations,
  } = params;

  try {
    const borrowAmount = parseUnits(amount, decimals);
    const borrowAmountU256 = uint256.bnToUint256(borrowAmount);
    const debtTokenAddress = tokenAddress;

    const shareBalance = vTokenBalance || 0n;
    const shareBalanceU256 = uint256.bnToUint256(shareBalance);

    // Compute assets from shares via ERC4626.preview_redeem
    const erc4626 = new Contract({
      abi: ERC4626_PREVIEW_ABI as unknown as Contract["abi"],
      address: collateralVTokenAddress,
      providerOrAccount: starkAccount,
    });
    const previewRes = await erc4626.call("preview_redeem", [shareBalanceU256]);
    const assetsAmount = parsePreviewRedeemResponse(previewRes, shareBalance);
    const assetsU256 = uint256.bnToUint256(assetsAmount);

    // Build contexts for deposit and borrow instructions
    const depositCtx = buildVesuContextOption({
      protocolKey: "vesu_v2",
      poolAddress,
      positionCounterpartToken: debtTokenAddress,
    });
    const borrowCtx = buildVesuContextOption({
      protocolKey: "vesu_v2",
      poolAddress,
      positionCounterpartToken: collateralTokenAddress,
    });

    // Build deposit instruction enum
    const depositEnum = new CairoCustomEnum({
      Deposit: {
        basic: { token: collateralTokenAddress, amount: assetsU256, user: starkAddress },
        context: depositCtx,
      },
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
    });

    // Build borrow instruction enum
    const borrowEnum = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: {
        basic: { token: debtTokenAddress, amount: borrowAmountU256, user: starkAddress },
        context: borrowCtx,
      },
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
    });

    const baseInstruction: BaseProtocolInstruction = {
      protocol_name: protocolName.toLowerCase(),
      instructions: [depositEnum, borrowEnum],
    };

    const fullInstruction = CallData.compile({ instructions: [baseInstruction] });
    const auths = await getAuthorizations([baseInstruction]);

    const authCalls: Call[] = [
      ...auths,
      {
        contractAddress: routerGatewayAddress,
        entrypoint: "process_protocol_instructions",
        calldata: fullInstruction,
      },
    ];

    // Final sequence: redeem -> authorizations -> process
    return [
      {
        contractAddress: collateralVTokenAddress,
        entrypoint: "redeem",
        calldata: [
          shareBalanceU256.low.toString(),
          shareBalanceU256.high.toString(),
          starkAddress,
          starkAddress,
        ],
      },
      ...authCalls,
    ];
  } catch (error) {
    console.error("Error building vToken migration calls:", error);
    return null;
  }
}

// ============================================================================
// Direct Vault Calls Builder
// ============================================================================

interface DirectVaultParams {
  action: Action;
  amount: string;
  decimals: number;
  isMax: boolean;
  starkAddress: string;
  tokenAddress: string;
  vtokenAddress: string;
  directVTokenBalance: bigint | undefined;
}

function buildDirectVaultCalls(params: DirectVaultParams): Call[] | null {
  const {
    action,
    amount,
    decimals,
    isMax,
    starkAddress,
    tokenAddress,
    vtokenAddress,
    directVTokenBalance,
  } = params;

  logger.debug("Using direct ERC4626 vault interaction for", action);

  try {
    let parsedAmount = parseUnits(amount, decimals);

    if (action === "Withdraw") {
      const userShares = directVTokenBalance || 0n;
      if (isMax || parsedAmount > userShares) {
        parsedAmount = userShares;
      }
    }

    if (action === "Deposit") {
      const amountU256 = uint256.bnToUint256(parsedAmount);
      return [
        {
          contractAddress: tokenAddress,
          entrypoint: "approve",
          calldata: [vtokenAddress, amountU256.low.toString(), amountU256.high.toString()],
        },
        {
          contractAddress: vtokenAddress,
          entrypoint: "deposit",
          calldata: [amountU256.low.toString(), amountU256.high.toString(), starkAddress],
        },
      ];
    }

    if (action === "Withdraw") {
      const sharesU256 = uint256.bnToUint256(parsedAmount);
      return [
        {
          contractAddress: vtokenAddress,
          entrypoint: "redeem",
          calldata: [sharesU256.low.toString(), sharesU256.high.toString(), starkAddress, starkAddress],
        },
      ];
    }

    return null;
  } catch (error) {
    console.error("Error building ERC4626 vault calls:", error);
    return null;
  }
}

// ============================================================================
// Standard Protocol Calls Builder
// ============================================================================

interface StandardProtocolParams {
  action: Action;
  amount: string;
  decimals: number;
  isMax: boolean;
  maxAmount: bigint | undefined;
  starkAddress: string;
  starkAccount: AccountInterface;
  tokenAddress: string;
  protocolName: string;
  vesuContext: VesuContext | undefined;
  walletBalance: bigint;
  routerGateway: { abi: Contract["abi"]; address: string };
}

async function buildStandardProtocolCalls(params: StandardProtocolParams): Promise<Call[] | null> {
  const {
    action,
    amount,
    decimals,
    isMax,
    maxAmount,
    starkAddress,
    starkAccount,
    tokenAddress,
    protocolName,
    vesuContext,
    walletBalance,
    routerGateway,
  } = params;

  try {
    const parsedAmount = calculateParsedAmountWithMax(action, amount, decimals, isMax, maxAmount, walletBalance);

    const basic = {
      token: tokenAddress,
      amount: uint256.bnToUint256(parsedAmount),
      user: starkAddress,
    };
    const context = buildVesuContextOption(vesuContext);

    logger.debug("token.address", tokenAddress);
    logger.debug("parsedAmount", parsedAmount);

    const lendingInstruction = buildLendingInstruction(action, basic, context, isMax);

    const baseInstruction = {
      protocol_name: protocolName.toLowerCase(),
      instructions: [lendingInstruction],
    };

    const fullInstruction = CallData.compile({ instructions: [baseInstruction] });
    const authInstruction = CallData.compile({ instructions: [baseInstruction], rawSelectors: false });

    const contract = new Contract({
      abi: routerGateway.abi,
      address: routerGateway.address,
      providerOrAccount: starkAccount,
    });

    const protocolInstructions = await contract.call("get_authorizations_for_instructions", authInstruction);
    const authorizations = parseAuthorizationInstructions(protocolInstructions);
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(authorizations);

    authorizations.push({
      contractAddress: routerGateway.address,
      entrypoint: "process_protocol_instructions",
      calldata: fullInstruction,
    });

    return [...authorizations, ...revokeAuthorizations];
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ============================================================================
// Main Hook
// ============================================================================

export const useLendingAction = (
  network: Network,
  action: Action,
  tokenAddress: string,
  protocolName: string,
  decimals?: number,
  vesuContext?: VesuContext,
  maxAmount?: bigint,
  walletBalanceParam?: bigint,
) => {
  // Starknet hooks
  const { address: starkAddress, account: starkAccount } = useStarkAccount();
  const sendTxn = useSmartTransactor();
  const { balance: starkWalletBalanceHook = 0n } = useTokenBalance(tokenAddress, "stark", undefined, decimals);
  const { data: starkRouterGateway } = useStarkDeployedContractInfo("RouterGateway");
  const starkWalletBalance = walletBalanceParam ?? starkWalletBalanceHook;
  const { getAuthorizations } = useLendingAuthorizations();

  // VesuV2 configuration
  const isVesuV2 = protocolName === "vesu_v2";
  const poolAddress =
    vesuContext && "poolAddress" in vesuContext
      ? vesuContext.poolAddress
      : "0x451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5";

  const isVTokenPositionCheck = checkIsVTokenPosition(isVesuV2, vesuContext);

  const { vtokenAddress } = useVesuV2Vault(tokenAddress, poolAddress);
  useStarkDeployedContractInfo("VesuGatewayV2"); // Keeping hook call for potential future use

  // Collateral token configuration
  const collateralTokenAddress = getCollateralTokenAddress(vesuContext, tokenAddress);
  const { vtokenAddress: collateralVTokenAddress } = useVesuV2Vault(collateralTokenAddress, poolAddress);

  const { balance: vTokenBalance } = useVesuV2VaultBalance(
    collateralVTokenAddress,
    starkAddress,
    isVesuV2 && action === "Borrow" && isVTokenPositionCheck,
  );

  const { balance: directVTokenBalance } = useVesuV2VaultBalance(
    vtokenAddress,
    starkAddress,
    isVesuV2 && action === "Withdraw" && isVTokenPositionCheck,
  );

  const buildStarkCalls = async (amount: string, isMax = false): Promise<Call[] | null> => {
    if (!starkAddress || !starkAccount || decimals == null) return null;

    const shouldUseDirectVault =
      isVesuV2 && vtokenAddress && isVTokenPositionCheck && (action === "Deposit" || action === "Withdraw");
    const shouldMigrateVTokenToBorrow = isVesuV2 && vtokenAddress && isVTokenPositionCheck && action === "Borrow";

    // Handle vToken to lending position migration for borrow
    if (shouldMigrateVTokenToBorrow) {
      if (!collateralVTokenAddress || !starkRouterGateway || !vesuContext || vTokenBalance === undefined) {
        return null;
      }
      return buildVTokenMigrationCalls({
        amount,
        decimals,
        starkAddress,
        starkAccount,
        tokenAddress,
        collateralTokenAddress,
        collateralVTokenAddress,
        protocolName,
        poolAddress,
        vTokenBalance,
        routerGatewayAddress: starkRouterGateway.address,
        getAuthorizations,
      });
    }

    // Handle direct vault interactions
    if (shouldUseDirectVault) {
      if (!vtokenAddress) {
        logger.debug("vtokenAddress not available");
        return null;
      }
      return buildDirectVaultCalls({
        action,
        amount,
        decimals,
        isMax,
        starkAddress,
        tokenAddress,
        vtokenAddress,
        directVTokenBalance,
      });
    }

    // Handle standard protocol calls
    if (!starkRouterGateway) return null;
    return buildStandardProtocolCalls({
      action,
      amount,
      decimals,
      isMax,
      maxAmount,
      starkAddress,
      starkAccount,
      tokenAddress,
      protocolName,
      vesuContext,
      walletBalance: starkWalletBalance,
      routerGateway: starkRouterGateway,
    });
  };

  const executeStark = async (amount: string, isMax = false) => {
    if (!starkAccount) {
      throw new Error("Account not connected");
    }
    const calls = await buildStarkCalls(amount, isMax);
    if (!calls) {
      throw new Error("Failed to build transaction calls");
    }
    await sendTxn(calls);
  };

  return { execute: executeStark, buildTx: undefined, buildCalls: buildStarkCalls };
};

/**
 * Get the collateral token address from context or fallback to token address.
 */
function getCollateralTokenAddress(vesuContext: VesuContext | undefined, tokenAddress: string): string {
  if (vesuContext && "collateralToken" in vesuContext && vesuContext.collateralToken) {
    return vesuContext.collateralToken;
  }
  if (vesuContext && "positionCounterpartToken" in vesuContext) {
    return vesuContext.positionCounterpartToken;
  }
  return tokenAddress;
}
