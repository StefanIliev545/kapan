import { ethers, network } from "hardhat";
import { AbiCoder } from "ethers";

// ============ CoW Protocol Addresses (Arbitrum) ============
export const COW_PROTOCOL = {
  settlement: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
  composableCoW: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74",
  vaultRelayer: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
  hooksTrampoline: "0x60Bf78233f48eC42eE3F101b9a05eC7878728006",
  authenticator: "0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE",
  allowlistManager: "0x66331f0b9cb30d38779c786Bda5a3d57d12fbA50",
} as const;

// ============ GPv2Order Constants ============
export const GPV2_ORDER = {
  KIND_SELL: ethers.keccak256(ethers.toUtf8Bytes("sell")),
  KIND_BUY: ethers.keccak256(ethers.toUtf8Bytes("buy")),
  BALANCE_ERC20: ethers.keccak256(ethers.toUtf8Bytes("erc20")),
  BALANCE_EXTERNAL: ethers.keccak256(ethers.toUtf8Bytes("external")),
  BALANCE_INTERNAL: ethers.keccak256(ethers.toUtf8Bytes("internal")),
  // Order type hash for EIP-712
  TYPE_HASH: ethers.keccak256(ethers.toUtf8Bytes(
    "Order(address sellToken,address buyToken,address receiver,uint256 sellAmount,uint256 buyAmount,uint32 validTo,bytes32 appData,uint256 feeAmount,bytes32 kind,bool partiallyFillable,bytes32 sellTokenBalance,bytes32 buyTokenBalance)"
  )),
} as const;

// Trade flags encoding
export const TRADE_FLAGS = {
  // Bits 5-6: signing scheme (00=EIP-712, 01=eth_sign, 10=EIP-1271, 11=pre_sign)
  EIP1271: 0x40, // 0b01000000 - EIP-1271 signature scheme
  SELL_ORDER: 0x00,
  BUY_ORDER: 0x01,
  FILL_OR_KILL: 0x00,
  PARTIALLY_FILLABLE: 0x02,
} as const;

// ============ CoW Protocol ABIs ============
const COMPOSABLE_COW_ABI = [
  "function create(tuple(address handler, bytes32 salt, bytes staticData) params, bool dispatch) external",
  "function remove(bytes32 orderHash) external",
  "function cabinet(address owner, bytes32 ctx) external view returns (bytes32)",
  "function singleOrders(address owner, bytes32 orderHash) external view returns (bool)",
  "function hash(tuple(address handler, bytes32 salt, bytes staticData) params) external pure returns (bytes32)",
  "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof) external view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)",
];

const SETTLEMENT_ABI = [
  "function settle(address[] tokens, uint256[] clearingPrices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions) external",
  "function domainSeparator() view returns (bytes32)",
  "function vaultRelayer() view returns (address)",
  "function authenticator() view returns (address)",
  "function filledAmount(bytes) view returns (uint256)",
  "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)",
  "event Settlement(address indexed solver)",
];

const AUTHENTICATOR_ABI = [
  "function addSolver(address solver) external",
  "function removeSolver(address solver) external",
  "function isSolver(address) view returns (bool)",
  "function manager() view returns (address)",
];

// ============ Contract Getters ============
export async function getComposableCoW() {
  return ethers.getContractAt(COMPOSABLE_COW_ABI, COW_PROTOCOL.composableCoW);
}

export async function getSettlement() {
  return ethers.getContractAt(SETTLEMENT_ABI, COW_PROTOCOL.settlement);
}

export async function getAuthenticator() {
  return ethers.getContractAt(AUTHENTICATOR_ABI, COW_PROTOCOL.authenticator);
}

// ============ Solver Authorization ============

/**
 * Impersonate and fund an address
 */
export async function impersonateAndFund(address: string) {
  await network.provider.request({ method: "hardhat_impersonateAccount", params: [address] });
  await network.provider.send("hardhat_setBalance", [address, "0x56BC75E2D63100000"]); // 100 ETH
}

/**
 * Add an address as an authorized solver by impersonating the allowlist manager
 */
export async function becomeSolver(solverAddress: string): Promise<void> {
  await impersonateAndFund(COW_PROTOCOL.allowlistManager);
  const managerSigner = await ethers.getSigner(COW_PROTOCOL.allowlistManager);
  const authenticator = await getAuthenticator();
  await authenticator.connect(managerSigner).addSolver(solverAddress);
}

/**
 * Check if an address is an authorized solver
 */
export async function isSolver(address: string): Promise<boolean> {
  const authenticator = await getAuthenticator();
  return authenticator.isSolver(address);
}

// ============ Order Params Builder ============
export interface KapanOrderParamsInput {
  user: string;
  preInstructions?: any[];
  preTotalAmount: bigint;
  sellToken: string;
  buyToken: string;
  chunkSize: bigint;
  minBuyPerChunk: bigint;
  postInstructions?: any[];
  completion?: number; // 0=TargetLTV, 1=TargetBalance, 2=Iterations, 3=UntilCancelled
  targetValue?: number;
  minHealthFactor?: bigint;
  appDataHash?: string;
}

const coder = AbiCoder.defaultAbiCoder();

export function buildOrderParams(input: KapanOrderParamsInput) {
  const encodeInstructions = (instructions: any[] | undefined) => {
    if (!instructions || instructions.length === 0) return "0x";
    return coder.encode(
      ["tuple(string protocolName, bytes data)[]"],
      [instructions.map(i => ({ protocolName: i.protocolName, data: i.data }))]
    );
  };

  return {
    user: input.user,
    preInstructionsData: encodeInstructions(input.preInstructions),
    preTotalAmount: input.preTotalAmount,
    sellToken: input.sellToken,
    buyToken: input.buyToken,
    chunkSize: input.chunkSize,
    minBuyPerChunk: input.minBuyPerChunk,
    postInstructionsData: encodeInstructions(input.postInstructions),
    completion: input.completion ?? 2, // Default: Iterations
    targetValue: input.targetValue ?? 1,
    minHealthFactor: input.minHealthFactor ?? ethers.parseEther("1.1"),
    appDataHash: input.appDataHash ?? ethers.keccak256(ethers.toUtf8Bytes("kapan-order")),
  };
}

// ============ Event Helpers ============
export function extractOrderHash(receipt: any, orderManager: any): string {
  const event = receipt?.logs.find((log: any) => {
    try {
      return orderManager.interface.parseLog(log)?.name === "OrderCreated";
    } catch {
      return false;
    }
  });
  if (!event) throw new Error("OrderCreated event not found");
  const parsed = orderManager.interface.parseLog(event);
  return parsed?.args[0];
}

// ============ GPv2Order Hashing (EIP-712) ============

export interface GPv2OrderData {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: bigint;
  buyAmount: bigint;
  validTo: number;
  appData: string;
  feeAmount: bigint;
  kind: string;
  partiallyFillable: boolean;
  sellTokenBalance: string;
  buyTokenBalance: string;
}

/**
 * Compute the EIP-712 struct hash of a GPv2Order
 */
export function hashOrderStruct(order: GPv2OrderData): string {
  return ethers.keccak256(
    coder.encode(
      ["bytes32", "address", "address", "address", "uint256", "uint256", "uint32", "bytes32", "uint256", "bytes32", "bool", "bytes32", "bytes32"],
      [
        GPV2_ORDER.TYPE_HASH,
        order.sellToken,
        order.buyToken,
        order.receiver,
        order.sellAmount,
        order.buyAmount,
        order.validTo,
        order.appData,
        order.feeAmount,
        order.kind,
        order.partiallyFillable,
        order.sellTokenBalance,
        order.buyTokenBalance,
      ]
    )
  );
}

/**
 * Compute the EIP-712 digest for a GPv2Order
 */
export function hashOrder(order: GPv2OrderData, domainSeparator: string): string {
  const structHash = hashOrderStruct(order);
  return ethers.keccak256(
    ethers.concat([
      "0x1901",
      domainSeparator,
      structHash,
    ])
  );
}

/**
 * Compute the order UID (unique identifier) - packed as: orderDigest (32) + owner (20) + validTo (4)
 */
export function computeOrderUid(orderDigest: string, owner: string, validTo: number): string {
  return ethers.solidityPacked(
    ["bytes32", "address", "uint32"],
    [orderDigest, owner, validTo]
  );
}

// ============ ERC-1271 Signature Helpers ============

/**
 * Build ERC-1271 signature for ComposableCoW verification (used by KapanOrderManager.isValidSignature)
 */
export function buildERC1271Signature(
  handlerAddress: string,
  salt: string,
  orderHash: string
): string {
  const staticInput = coder.encode(["bytes32"], [orderHash]);
  
  const conditionalOrderParams = {
    handler: handlerAddress,
    salt: salt,
    staticData: staticInput,
  };

  const payload = {
    proof: [],
    params: conditionalOrderParams,
    offchainInput: "0x",
  };

  return coder.encode(
    ["tuple(bytes32[] proof, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput)"],
    [payload]
  );
}

/**
 * Build the signature bytes for a GPv2Trade with ERC-1271 signing scheme
 * Format: abi.encodePacked(address owner, bytes signature)
 * The settlement contract will call owner.isValidSignature(orderDigest, signature)
 */
export function buildTradeSignature(
  ownerAddress: string,
  handlerAddress: string,
  salt: string,
  kapanOrderHash: string
): string {
  const innerSignature = buildERC1271Signature(handlerAddress, salt, kapanOrderHash);
  // Pack owner address (20 bytes) + inner signature
  return ethers.concat([ownerAddress, innerSignature]);
}

// ============ Settlement Helpers ============

export interface SettlementParams {
  // Order details
  orderManager: any;
  orderHandler: any;
  kapanOrderHash: string;
  salt: string;
  
  // Tokens
  sellToken: string;
  buyToken: string;
  sellAmount: bigint;
  buyAmount: bigint;
  
  // Timing
  validTo: number;
  appDataHash: string;
  
  // Hooks
  preHookCalldata: string;
  postHookCalldata: string;
}

/**
 * Build the full settlement parameters for GPv2Settlement.settle()
 */
export async function buildSettlementParams(params: SettlementParams) {
  const orderManagerAddr = await params.orderManager.getAddress();
  const orderHandlerAddr = await params.orderHandler.getAddress();
  
  // 1. Tokens array (indices: 0=sellToken, 1=buyToken)
  const tokens = [params.sellToken, params.buyToken];
  
  // 2. Clearing prices (1:1 ratio scaled, will be adjusted for actual amounts)
  // Price equation: sellAmount * sellPrice = buyAmount * buyPrice
  // We set prices such that the trade executes at our desired rate
  const clearingPrices = [params.buyAmount, params.sellAmount];
  
  // 3. Build the trade
  const trade = {
    sellTokenIndex: 0,
    buyTokenIndex: 1,
    receiver: orderManagerAddr, // OrderManager receives buy tokens for post-hook
    sellAmount: params.sellAmount,
    buyAmount: params.buyAmount,
    validTo: params.validTo,
    appData: params.appDataHash,
    feeAmount: 0n, // No fee for simplicity
    flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
    executedAmount: params.sellAmount, // For fill-or-kill, this equals sellAmount
    signature: buildTradeSignature(orderManagerAddr, orderHandlerAddr, params.salt, params.kapanOrderHash),
  };
  
  // 4. Build interactions
  // interactions[0] = pre-hooks (before token transfers)
  // interactions[1] = intra-hooks (between in-transfers and out-transfers) 
  // interactions[2] = post-hooks (after token transfers)
  
  const preInteractions = [{
    target: COW_PROTOCOL.hooksTrampoline,
    value: 0n,
    callData: params.preHookCalldata,
  }];
  
  const intraInteractions: any[] = []; // Empty - we pre-fund the settlement
  
  const postInteractions = [{
    target: COW_PROTOCOL.hooksTrampoline,
    value: 0n,
    callData: params.postHookCalldata,
  }];
  
  return {
    tokens,
    clearingPrices,
    trades: [trade],
    interactions: [preInteractions, intraInteractions, postInteractions] as const,
  };
}

/**
 * Execute a full settlement through GPv2Settlement.settle()
 */
export async function executeSettlement(
  solver: any,
  params: Awaited<ReturnType<typeof buildSettlementParams>>
) {
  const settlement = await getSettlement();
  return settlement.connect(solver).settle(
    params.tokens,
    params.clearingPrices,
    params.trades,
    params.interactions
  );
}
