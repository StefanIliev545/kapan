import { AbiCoder } from "ethers";

// Router instruction types enum (matches Solidity)
export enum RouterInstructionType {
  FlashLoanV2 = 0,
  FlashLoanV3 = 1,
  PullToken = 2,
  PushToken = 3,
  ToOutput = 4,
  Approve = 5,
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
 * Encode a FlashLoanV2 router instruction
 */
export function encodeFlashLoanV2(amount: bigint, token: string, user: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, user, RouterInstructionType.FlashLoanV2]]
  );
}

/**
 * Encode a FlashLoanV3 router instruction
 */
export function encodeFlashLoanV3(amount: bigint, token: string, user: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, user, RouterInstructionType.FlashLoanV3]]
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
  context: string,
  inputIndex: number
): { protocolName: string; data: string } {
  return createProtocolInstruction("aave", encodeLendingInstruction(op, token, user, amount, context, inputIndex));
}

/**
 * Encode a MockGateway instruction
 * @param produceOutput Whether the mock gateway should produce an output
 */
export function encodeMockInstruction(produceOutput: boolean): string {
  return coder.encode(["tuple(bool produceOutput)"], [{ produceOutput }]);
}

