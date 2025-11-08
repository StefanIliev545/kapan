import { AbiCoder } from "ethers";

// Router instruction types enum (matches Solidity)
export enum RouterInstructionType {
  FlashLoan = 0,
  PullToken = 1,
  PushToken = 2,
  ToOutput = 3,
  Approve = 4,
}

// Flash loan provider enum (matches Solidity)
export enum FlashLoanProvider {
  BalancerV2 = 0,
  BalancerV3 = 1,
  AaveV3 = 2,
  UniswapV3 = 3,
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
}

// Protocol instruction structure (matches Solidity ProtocolTypes.ProtocolInstruction)
export interface ProtocolInstruction {
  protocolName: string;
  data: string; // hex-encoded bytes
}

const coder = AbiCoder.defaultAbiCoder();

// Router instruction encoding
const ROUTER_INSTRUCTION_TYPE = "tuple(uint256 amount,address token,address user,uint8 instructionType)";

/**
 * Encode a FlashLoan router instruction
 * @param provider - Flash loan provider (BalancerV2, BalancerV3, AaveV3, UniswapV3)
 * @param inputIndex - Index of the UTXO to use as input (amount and token come from here)
 * @param pool - Pool address (only used for UniswapV3, otherwise address(0))
 */
export function encodeFlashLoan(
  provider: FlashLoanProvider,
  inputIndex: number,
  pool: string = "0x0000000000000000000000000000000000000000"
): string {
  // instruction.data encodes: (RouterInstruction, FlashLoanProvider, InputPtr, address pool)
  // The contract first decodes as RouterInstruction, then decodes the full data as:
  // abi.decode(instruction.data, (RouterInstruction, FlashLoanProvider, ProtocolTypes.InputPtr, address))
  // So we encode as a flat list of types and values (like Approve does)
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, "uint8", "tuple(uint256 index)", "address"],
    [[0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", RouterInstructionType.FlashLoan], provider, { index: inputIndex }, pool]
  );
}

/**
 * Encode a FlashLoanV2 router instruction (deprecated, use encodeFlashLoan)
 * @deprecated Use encodeFlashLoan with FlashLoanProvider.BalancerV2 instead
 */
export function encodeFlashLoanV2(amount: bigint, token: string, user: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, user, RouterInstructionType.FlashLoan]]
  );
}

/**
 * Encode a FlashLoanV3 router instruction (deprecated, use encodeFlashLoan)
 * @deprecated Use encodeFlashLoan with FlashLoanProvider.BalancerV3 instead
 */
export function encodeFlashLoanV3(amount: bigint, token: string, user: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, user, RouterInstructionType.FlashLoan]]
  );
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
    [ROUTER_INSTRUCTION_TYPE, "string", "tuple(uint256 index)"],
    [[0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", RouterInstructionType.Approve], targetProtocol, { index: inputIndex }]
  );
}

/**
 * Encode a ToOutput router instruction (creates UTXO from hardcoded values)
 */
export function encodeToOutput(amount: bigint, token: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, "0x0000000000000000000000000000000000000000", RouterInstructionType.ToOutput]]
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
    [[[0n, "0x0000000000000000000000000000000000000000", user, RouterInstructionType.PushToken], { index: inputIndex }]]
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

