import { AbiCoder } from "ethers";

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

// Router instruction struct
export interface RouterInstruction {
  amount: bigint;
  token: string;
  user: string;
  instructionType: RouterInstructionType;
}

// Lending instruction struct
export interface LendingInstruction {
  op: LendingOp;
  token: string;
  user: string;
  amount: bigint;
  context: string;
  input: { index: number };
}

const coder = AbiCoder.defaultAbiCoder();

// Router instruction encoding
const ROUTER_INSTRUCTION_TYPE = "tuple(uint256 amount,address token,address user,uint8 instructionType)";

/**
 * Encode a FlashLoan router instruction
 * @param provider - Flash loan provider (BalancerV2, BalancerV3, Aave, ZeroLend, UniswapV3, Morpho)
 * @param inputIndex - Index of the UTXO to use as input (amount and token come from here)
 * @param pool - Pool address (only used for UniswapV3, otherwise address(0))
 */
export function encodeFlashLoan(
  provider: FlashLoanProvider,
  inputIndex: number,
  pool = "0x0000000000000000000000000000000000000000"
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
 * Encode a PullToken router instruction
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
 * @param targetProtocol - Protocol name to approve ("router" or gateway name)
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
 */
export function encodeLendingInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  context: string,
  inputIndex: number
): string {
  return coder.encode(
    [LENDING_INSTRUCTION_TYPE],
    [[op, token, user, amount, context, { index: inputIndex }]]
  );
}

/**
 * Helper to create a ProtocolInstruction with router protocol
 */
export function createRouterInstruction(data: string): { protocolName: string; data: string } {
  return { protocolName: "router", data };
}

/**
 * Helper to create a ProtocolInstruction with a specific protocol
 */
export function createProtocolInstruction(protocolName: string, data: string): { protocolName: string; data: string } {
  return { protocolName, data };
}

/**
 * Helper to create a lending instruction for Aave
 */
export function createAaveInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  context: string = "0x",
  inputIndex: number = 999
): { protocolName: string; data: string } {
  return createProtocolInstruction("aave", encodeLendingInstruction(op, token, user, amount, context, inputIndex));
}

/**
 * Helper to create a GetSupplyBalance instruction
 * This queries the user's supply/deposit balance and produces an output
 */
export function createGetSupplyBalanceInstruction(
  protocolName: string,
  token: string,
  user: string
): { protocolName: string; data: string } {
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
): { protocolName: string; data: string } {
  return createProtocolInstruction(
    protocolName,
    encodeLendingInstruction(LendingOp.GetBorrowBalance, token, user, 0n, "0x", 999)
  );
}

/**
 * Encode a MockGateway instruction
 * @param produceOutput Whether the mock gateway should produce an output
 */
export function encodeMockInstruction(produceOutput: boolean): string {
  return coder.encode(["tuple(bool produceOutput)"], [{ produceOutput }]);
}

/**
 * Encode a Deposit lending instruction
 */
export function encodeDeposit(token: string, amount: bigint, user: string): string {
  return encodeLendingInstruction(LendingOp.Deposit, token, user, amount, "0x", 999);
}

/**
 * Encode a Split router instruction
 * Splits an output into two parts: fee (based on basis points) and remainder.
 * @param inputIndex - Index of the UTXO to split
 * @param basisPoints - Fee percentage in basis points (e.g., 30 = 0.3%, 100 = 1%)
 */
export function encodeSplit(inputIndex: number, basisPoints: number): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, "tuple(uint256 index)", "uint256"],
    [
      [0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", RouterInstructionType.Split],
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
    [ROUTER_INSTRUCTION_TYPE, "tuple(uint256 index)", "tuple(uint256 index)"],
    [
      [0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", RouterInstructionType.Add],
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
    [ROUTER_INSTRUCTION_TYPE, "tuple(uint256 index)", "tuple(uint256 index)"],
    [
      [0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", RouterInstructionType.Subtract],
      { index: minuendIndex },
      { index: subtrahendIndex },
    ]
  );
}
