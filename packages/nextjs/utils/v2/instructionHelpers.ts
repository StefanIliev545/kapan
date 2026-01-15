import { AbiCoder } from "ethers";

// Zero address constant to avoid duplication
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Router instruction types enum (matches Solidity)
export enum RouterInstructionType {
  FlashLoan = 0,
  PullToken = 1,
  PushToken = 2,
  ToOutput = 3,
  Approve = 4,
  Split = 5,
  Add = 6,
  Subtract = 7,
}

// Flash loan provider enum (matches Solidity)
export enum FlashLoanProvider {
  BalancerV2 = 0,
  BalancerV3 = 1,
  Aave = 2,
  ZeroLend = 3,
  UniswapV3 = 4,
  Morpho = 5,
}

// Lending operation types enum (matches Solidity)
export enum LendingOp {
  Deposit = 0,
  DepositCollateral = 1,
  WithdrawCollateral = 2,
  Borrow = 3,
  Repay = 4,
  GetBorrowBalance = 5,
  GetSupplyBalance = 6,
  Swap = 7,
  SwapExactOut = 8,
}

// Protocol instruction structure (matches Solidity ProtocolTypes.ProtocolInstruction)
export interface ProtocolInstruction {
  protocolName: string;
  data: string; // hex-encoded bytes
}

const coder = AbiCoder.defaultAbiCoder();

// Router instruction encoding
const ROUTER_INSTRUCTION_TYPE = "tuple(uint256 amount,address token,address user,uint8 instructionType)";
const INPUT_PTR_TYPE = "tuple(uint256 index)";

/**
 * Encode a FlashLoan router instruction
 * @param provider - Flash loan provider (BalancerV2, BalancerV3, Aave, ZeroLend, UniswapV3, Morpho)
 * @param inputIndex - Index of the UTXO to use as input (amount and token come from here)
 * @param pool - Pool address (only used for UniswapV3, otherwise address(0))
 */
export function encodeFlashLoan(
  provider: FlashLoanProvider,
  inputIndex: number,
  pool = ZERO_ADDRESS
): string {
  // instruction.data encodes: (RouterInstruction, FlashLoanProvider, InputPtr, address pool)
  // pool is only used for UniswapV3
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, "uint8", INPUT_PTR_TYPE, "address"],
    [[0n, ZERO_ADDRESS, ZERO_ADDRESS, RouterInstructionType.FlashLoan], provider, { index: inputIndex }, pool]
  );
}

/**
 * Encode a legacy FlashLoan router instruction (deprecated, use encodeFlashLoan)
 * @deprecated Use encodeFlashLoan with appropriate FlashLoanProvider instead
 */
function encodeLegacyFlashLoan(amount: bigint, token: string, user: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, user, RouterInstructionType.FlashLoan]]
  );
}

/**
 * Encode a FlashLoanV2 router instruction (deprecated, use encodeFlashLoan)
 * @deprecated Use encodeFlashLoan with FlashLoanProvider.BalancerV2 instead
 */
export function encodeFlashLoanV2(amount: bigint, token: string, user: string): string {
  return encodeLegacyFlashLoan(amount, token, user);
}

/**
 * Encode a FlashLoanV3 router instruction (deprecated, use encodeFlashLoan)
 * @deprecated Use encodeFlashLoan with FlashLoanProvider.BalancerV3 instead
 */
export function encodeFlashLoanV3(amount: bigint, token: string, user: string): string {
  return encodeLegacyFlashLoan(amount, token, user);
}

/**
 * Encode a PullToken router instruction (pulls tokens from user to router)
 */
export function encodePullToken(amount: bigint, token: string, user: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, user, RouterInstructionType.PullToken]]
  );
}

/**
 * Encode an Approve router instruction
 * @param inputIndex - Index of the UTXO to approve
 * @param targetProtocol - Protocol name to approve ("router" or gateway name like "aave", "compound")
 */
export function encodeApprove(inputIndex: number, targetProtocol: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, "string", INPUT_PTR_TYPE],
    [[0n, ZERO_ADDRESS, ZERO_ADDRESS, RouterInstructionType.Approve], targetProtocol, { index: inputIndex }]
  );
}

/**
 * Encode a ToOutput router instruction (creates UTXO from hardcoded values)
 */
export function encodeToOutput(amount: bigint, token: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, ZERO_ADDRESS, RouterInstructionType.ToOutput]]
  );
}

/**
 * Encode a PushToken router instruction (pushes UTXO at index to user)
 * @param inputIndex - Index of the UTXO to push to user
 * @param user - Address of the user to receive tokens
 */
export function encodePushToken(inputIndex: number, user: string): string {
  // PushToken encodes: (RouterInstruction, InputPtr)
  // RouterInstruction has (amount, token, user, instructionType) but amount/token come from UTXO
  // So we use 0 for amount/token and PushToken type, InputPtr for the UTXO index
  const ROUTER_INSTRUCTION_WITH_INPUT_TYPE = "tuple(tuple(uint256 amount,address token,address user,uint8 instructionType),tuple(uint256 index))";
  return coder.encode(
    [ROUTER_INSTRUCTION_WITH_INPUT_TYPE],
    [[[0n, ZERO_ADDRESS, user, RouterInstructionType.PushToken], { index: inputIndex }]]
  );
}

// Lending instruction encoding
const LENDING_INSTRUCTION_TYPE = "tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)";

/**
 * Encode a Lending instruction
 * @param op - Lending operation type
 * @param token - Token address
 * @param user - User address
 * @param amount - Amount (use 0n for balance queries)
 * @param context - Protocol-specific context (use "0x" for most operations, or encoded market address for Compound)
 * @param inputIndex - UTXO index to use as input (use 999 for invalid index to force using amount parameter)
 */
export function encodeLendingInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  context = "0x",
  inputIndex = 999
): string {
  return coder.encode(
    [LENDING_INSTRUCTION_TYPE],
    [[op, token, user, amount, context, { index: inputIndex }]]
  );
}

/**
 * Helper to create a ProtocolInstruction with router protocol
 */
export function createRouterInstruction(data: string): ProtocolInstruction {
  return { protocolName: "router", data };
}

/**
 * Helper to create a ProtocolInstruction with a specific protocol
 */
export function createProtocolInstruction(protocolName: string, data: string): ProtocolInstruction {
  return { protocolName, data };
}

/**
 * Normalize protocol names to match gateway registration
 * Converts "Aave V3" -> "aave", "Compound V3" -> "compound", etc.
 */
export function normalizeProtocolName(protocolName: string): string {
  let normalized = protocolName.toLowerCase();
  // Remove version suffixes like " v3", " v2", etc.
  normalized = normalized.replace(/\s+v\d+$/i, "");
  // Remove all spaces
  normalized = normalized.replace(/\s+/g, "");
  
  // Special case: Morpho Blue -> morpho-blue (gateway is registered with hyphen)
  if (normalized === "morphoblue") {
    return "morpho-blue";
  }
  
  return normalized;
}

/**
 * Helper to create a lending instruction for Aave
 */
export function createAaveInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  context = "0x",
  inputIndex = 999
): ProtocolInstruction {
  return createProtocolInstruction("aave", encodeLendingInstruction(op, token, user, amount, context, inputIndex));
}

/**
 * Helper to create a lending instruction for Compound
 */
export function createCompoundInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  context = "0x", // For Compound, context can encode market base token address
  inputIndex = 999
): ProtocolInstruction {
  return createProtocolInstruction("compound", encodeLendingInstruction(op, token, user, amount, context, inputIndex));
}

/**
 * Helper to create a lending instruction for Venus
 */
export function createVenusInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  context = "0x",
  inputIndex = 999
): ProtocolInstruction {
  return createProtocolInstruction("venus", encodeLendingInstruction(op, token, user, amount, context, inputIndex));
}

/**
 * Morpho market context interface
 */
export interface MorphoMarketContextForEncoding {
  marketId: string;
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: bigint;
}

/**
 * Encode Morpho market context into bytes for lending instructions
 * Morpho expects MarketParams: (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)
 */
export function encodeMorphoContext(context: MorphoMarketContextForEncoding): string {
  const coder = AbiCoder.defaultAbiCoder();
  return coder.encode(
    ["tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"],
    [[context.loanToken, context.collateralToken, context.oracle, context.irm, context.lltv]]
  );
}

/**
 * Helper to create a lending instruction for Morpho Blue
 */
export function createMorphoInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  morphoContext: MorphoMarketContextForEncoding,
  inputIndex = 999
): ProtocolInstruction {
  const context = encodeMorphoContext(morphoContext);
  return createProtocolInstruction("morpho-blue", encodeLendingInstruction(op, token, user, amount, context, inputIndex));
}

/**
 * Helper to create a GetSupplyBalance instruction
 * This queries the user's supply/deposit balance and produces an output
 */
export function createGetSupplyBalanceInstruction(
  protocolName: string,
  token: string,
  user: string
): ProtocolInstruction {
  return createProtocolInstruction(
    protocolName,
    encodeLendingInstruction(LendingOp.GetSupplyBalance, token, user, 0n, "0x", 999)
  );
}

/**
 * Helper to create a GetBorrowBalance instruction
 * This queries the user's borrow/debt balance and produces an output
 */
export function createGetBorrowBalanceInstruction(
  protocolName: string,
  token: string,
  user: string
): ProtocolInstruction {
  return createProtocolInstruction(
    protocolName,
    encodeLendingInstruction(LendingOp.GetBorrowBalance, token, user, 0n, "0x", 999)
  );
}

/**
 * Encode a Split router instruction
 * Splits an output into two parts: fee (based on basis points) and remainder.
 * @param inputIndex - Index of the UTXO to split
 * @param basisPoints - Fee percentage in basis points (e.g., 30 = 0.3%, 100 = 1%)
 */
export function encodeSplit(inputIndex: number, basisPoints: number): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, INPUT_PTR_TYPE, "uint256"],
    [
      [0n, ZERO_ADDRESS, ZERO_ADDRESS, RouterInstructionType.Split],
      { index: inputIndex },
      basisPoints,
    ]
  );
}

/**
 * Encode an Add router instruction
 * Combines two outputs of the same token into one by summing their amounts.
 * @param indexA - Index of the first UTXO
 * @param indexB - Index of the second UTXO
 */
export function encodeAdd(indexA: number, indexB: number): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, INPUT_PTR_TYPE, INPUT_PTR_TYPE],
    [
      [0n, ZERO_ADDRESS, ZERO_ADDRESS, RouterInstructionType.Add],
      { index: indexA },
      { index: indexB },
    ]
  );
}

/**
 * Encode a Subtract router instruction
 * Computes the difference between two outputs (minuend - subtrahend).
 * Both outputs must be the same token and minuend.amount >= subtrahend.amount.
 * @param minuendIndex - Index of the UTXO to subtract from
 * @param subtrahendIndex - Index of the UTXO to subtract
 */
export function encodeSubtract(minuendIndex: number, subtrahendIndex: number): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, INPUT_PTR_TYPE, INPUT_PTR_TYPE],
    [
      [0n, ZERO_ADDRESS, ZERO_ADDRESS, RouterInstructionType.Subtract],
      { index: minuendIndex },
      { index: subtrahendIndex },
    ]
  );
}

/**
 * Euler vault context interface for encoding
 */
export interface EulerVaultContextForEncoding {
  borrowVault: string;
  collateralVault: string;
}

/**
 * Encode Euler vault context into bytes for lending instructions
 * Euler expects: (address borrowVault, address collateralVault)
 */
export function encodeEulerContext(context: EulerVaultContextForEncoding): string {
  return coder.encode(
    ["address", "address"],
    [context.borrowVault, context.collateralVault]
  );
}

/**
 * Helper to create a lending instruction for Euler V2
 * @param op - Lending operation type
 * @param token - Token address (underlying asset)
 * @param user - User address
 * @param amount - Amount for the operation
 * @param eulerContext - Euler vault context (borrowVault, collateralVault)
 * @param inputIndex - UTXO index to use as input (default 999 for invalid)
 */
export function createEulerInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  eulerContext: EulerVaultContextForEncoding,
  inputIndex = 999
): ProtocolInstruction {
  const context = encodeEulerContext(eulerContext);
  return createProtocolInstruction("euler", encodeLendingInstruction(op, token, user, amount, context, inputIndex));
}

