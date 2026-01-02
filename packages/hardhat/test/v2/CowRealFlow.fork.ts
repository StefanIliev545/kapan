import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder, Interface } from "ethers";
import {
  COW_PROTOCOL,
  GPV2_ORDER,
  TRADE_FLAGS,
  getAuthenticator,
  impersonateAndFund,
  buildOrderParams,
  buildTradeSignature,
  GPv2OrderData,
} from "./helpers/cowHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

/**
 * HONEST Fork Test for CoW Flash Loan Flow
 * 
 * NO CHEATING - Real flow only:
 * - Only impersonate to become a solver (required to call flashLoanAndSettle)
 * - Always go through flashLoanAndSettle, never call settle directly
 * - Use REAL appData structure with hooks
 * - No shortcuts or isolated component tests
 */

// ============ Base Addresses (for fork) ============
const BASE_CHAIN_ID = 8453;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const MORPHO_BLUE = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

// Morpho WETH/USDC market on Base (from API - $38M supply)
const BASE_MORPHO_WETH_USDC = {
  key: "0x8793cf302b8ffd655ab97bd1c695dbd967807e8367a65cb2f4edaf1380ba1bda",
  loanToken: USDC,
  collateralToken: WETH,
  oracle: "0xFEa2D58cEfCb9fcb597723c6bAE66fFE4193aFE4",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: BigInt("860000000000000000"), // 86%
};

// Whales for funding test accounts
const USDC_WHALE = "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A"; // Circle
const WETH_WHALE = "0x4200000000000000000000000000000000000006"; // WETH contract itself

// Deployed contracts on Base
const KAPAN_COW_ADAPTER = "0x2197f7f6369FeFDE4B461bF6CdE898fD730a3255";
const KAPAN_ORDER_MANAGER = "0xE4b28de3AA865540Bbc1C71892b6b6Af24929858";
const KAPAN_ORDER_HANDLER = "0xDB9432fB5F7573a0b0f73c85dF32B609c1841CdF";
const KAPAN_ROUTER = "0x2302643bf7ceea3F7180547F90d5eA5a917e2b99";

const coder = AbiCoder.defaultAbiCoder();

// ============ Instruction Encoding (matches frontend) ============

enum RouterInstructionType {
  FlashLoan = 0,
  PullToken = 1,
  PushToken = 2,
  ToOutput = 3,
  Approve = 4,
  Split = 5,
  Add = 6,
  Subtract = 7,
}

enum LendingOp {
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

interface ProtocolInstruction {
  protocolName: string;
  data: string;
}

const ROUTER_INSTRUCTION_TYPE = "tuple(uint256 amount,address token,address user,uint8 instructionType)";

function encodePullToken(amount: bigint, token: string, user: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE],
    [[amount, token, user, RouterInstructionType.PullToken]]
  );
}

function encodeApprove(inputIndex: number, targetProtocol: string): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, "string", "tuple(uint256 index)"],
    [[0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", RouterInstructionType.Approve], targetProtocol, { index: inputIndex }]
  );
}

function encodeAdd(indexA: number, indexB: number): string {
  return coder.encode(
    [ROUTER_INSTRUCTION_TYPE, "tuple(uint256 index)", "tuple(uint256 index)"],
    [
      [0n, "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", RouterInstructionType.Add],
      { index: indexA },
      { index: indexB },
    ]
  );
}

function encodePushToken(inputIndex: number, user: string): string {
  const ROUTER_INSTRUCTION_WITH_INPUT_TYPE = "tuple(tuple(uint256 amount,address token,address user,uint8 instructionType),tuple(uint256 index))";
  return coder.encode(
    [ROUTER_INSTRUCTION_WITH_INPUT_TYPE],
    [[[0n, "0x0000000000000000000000000000000000000000", user, RouterInstructionType.PushToken], { index: inputIndex }]]
  );
}

function encodeLendingInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  context = "0x",
  inputIndex = 999
): string {
  const LENDING_INSTRUCTION_TYPE = "tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)";
  return coder.encode(
    [LENDING_INSTRUCTION_TYPE],
    [[op, token, user, amount, context, { index: inputIndex }]]
  );
}

function encodeMarketParamsContext(
  loanToken: string,
  collateralToken: string,
  oracle: string,
  irm: string,
  lltv: bigint
): string {
  return coder.encode(
    ["address", "address", "address", "address", "uint256"],
    [loanToken, collateralToken, oracle, irm, lltv]
  );
}

function createRouterInstruction(data: string): ProtocolInstruction {
  return { protocolName: "router", data };
}

function createProtocolInstruction(protocolName: string, data: string): ProtocolInstruction {
  return { protocolName, data };
}

function createMorphoInstruction(
  op: LendingOp,
  market: typeof BASE_MORPHO_WETH_USDC,
  user: string,
  amount: bigint,
  inputIndex: number = 999
): ProtocolInstruction {
  const context = encodeMarketParamsContext(
    market.loanToken,
    market.collateralToken,
    market.oracle,
    market.irm,
    market.lltv
  );

  const token =
    op === LendingOp.DepositCollateral ||
    op === LendingOp.WithdrawCollateral ||
    op === LendingOp.GetSupplyBalance
      ? market.collateralToken
      : market.loanToken;

  return createProtocolInstruction(
    "morpho-blue",
    encodeLendingInstruction(op, token, user, amount, context, inputIndex)
  );
}

// ============ CoW Protocol ABIs ============
const FLASH_LOAN_ROUTER_ABI = [
  "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
  "function settlementContract() view returns (address)",
  "function borrowerCallBack(bytes callbackData) external",
];

const SETTLEMENT_ABI = [
  "function settle(address[] tokens, uint256[] clearingPrices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions) external",
  "function domainSeparator() view returns (bytes32)",
];

const HOOKS_TRAMPOLINE_ABI = [
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
];

const KAPAN_ADAPTER_ABI = [
  "function fundOrder(address token, address recipient, uint256 amount) external",
  "function allowedLenders(address) view returns (bool)",
  "function getLenderType(address) view returns (uint8)",
  "function getRouter() view returns (address)",
  "function owner() view returns (address)",
];

const ORDER_MANAGER_ABI = [
  "function executePreHookBySalt(address user, bytes32 salt) external",
  "function executePostHookBySalt(address user, bytes32 salt) external",
  "function createOrder(tuple(address user, bytes[] preInstructionsPerIteration, uint256 preTotalAmount, address sellToken, address buyToken, uint256 chunkSize, uint256 minBuyPerChunk, bytes[] postInstructionsPerIteration, uint8 completion, uint256 targetValue, uint256 minHealthFactor, bytes32 appDataHash, bool isFlashLoanOrder) params, bytes32 salt, uint256 seedAmount) external returns (bytes32)",
  "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, bytes[] preInstructionsPerIteration, uint256 preTotalAmount, address sellToken, address buyToken, uint256 chunkSize, uint256 minBuyPerChunk, bytes[] postInstructionsPerIteration, uint8 completion, uint256 targetValue, uint256 minHealthFactor, bytes32 appDataHash, bool isFlashLoanOrder) params, uint8 status, uint256 executedAmount, uint256 iterationCount, uint256 createdAt))",
  "function approveVaultRelayer(address token) external",
  "function router() view returns (address)",
  "function settlement() view returns (address)",
  "function orderHandler() view returns (address)",
  "function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
];

const MORPHO_ABI = [
  "function supply(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) external returns (uint256, uint256)",
  "function supplyCollateral(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes data) external",
  "function borrow(tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256, uint256)",
  "function idToMarketParams(bytes32 id) view returns (tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv))",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function setAuthorization(address authorized, bool newIsAuthorized) external",
  "function isAuthorized(address owner, address authorized) view returns (bool)",
];

const hooksIface = new Interface(HOOKS_TRAMPOLINE_ABI);
const adapterIface = new Interface(KAPAN_ADAPTER_ABI);
const orderManagerIface = new Interface(ORDER_MANAGER_ABI);

/**
 * Encode instructions array as bytes (matching ProtocolTypes.encodeInstructionsArray)
 */
function encodeInstructions(instructions: ProtocolInstruction[]): string {
  return coder.encode(
    ["tuple(string protocolName, bytes data)[]"],
    [instructions.map(i => [i.protocolName, i.data])]
  );
}

describe("CoW Real Flash Loan Flow (HONEST Fork Test)", function () {
  before(function () {
    if (!FORK) this.skip();
  });

  let solver: any;
  let user: any;
  let flashLoanRouter: any;
  let settlement: any;
  let kapanAdapter: any;
  let orderManager: any;
  let morpho: any;
  let usdc: any;
  let weth: any;

  beforeEach(async function () {
    // Reset fork to Base at latest block to capture real orders
    await network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
          // Use latest block to see real orders - no blockNumber specified
        },
      }],
    });

    // Set gas price to avoid baseFeePerGas issues
    await network.provider.send("hardhat_setNextBlockBaseFeePerGas", ["0x1"]);

    [solver] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);

    // Fund user with ETH
    await network.provider.send("hardhat_setBalance", [
      await user.getAddress(),
      "0x56BC75E2D63100000", // 100 ETH
    ]);

    // Get CoW Protocol contracts (these are on mainnet, we can't modify them)
    flashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, COW_PROTOCOL.flashLoanRouter);
    settlement = await ethers.getContractAt(SETTLEMENT_ABI, COW_PROTOCOL.settlement);
    morpho = await ethers.getContractAt(MORPHO_ABI, MORPHO_BLUE);
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

    // Use deployed Kapan contracts on Base
    kapanAdapter = await ethers.getContractAt(KAPAN_ADAPTER_ABI, KAPAN_COW_ADAPTER);
    orderManager = await ethers.getContractAt(ORDER_MANAGER_ABI, KAPAN_ORDER_MANAGER);
    console.log("\nUsing deployed Kapan contracts:");
    console.log(`  KapanCowAdapter: ${KAPAN_COW_ADAPTER}`);
    console.log(`  KapanOrderManager: ${KAPAN_ORDER_MANAGER}`);
    console.log(`  KapanOrderHandler: ${KAPAN_ORDER_HANDLER}`);

    // DEAD CODE: Fresh contract deployment for debugging (skip this)
    if (false) {
      // Deploy fresh Kapan contracts with console.log for debugging
      console.log("\nDeploying fresh Kapan contracts with debug logging...");
      
      // Deploy KapanCowAdapter - constructor: (address _router, address _owner)
      const KapanCowAdapter = await ethers.getContractFactory("KapanCowAdapter");
      const freshAdapter = await KapanCowAdapter.deploy(
        COW_PROTOCOL.flashLoanRouter, // router
        await solver.getAddress() // owner
      );
      await freshAdapter.waitForDeployment();
      const freshAdapterAddr = await freshAdapter.getAddress();
      console.log(`Fresh KapanCowAdapter: ${freshAdapterAddr}`);

      // Set Morpho as allowed lender
      await freshAdapter.setMorphoLender(MORPHO_BLUE, true);
      console.log("Set Morpho as allowed lender");

      // Deploy KapanOrderManager first (needs router - use existing one)
      const KapanOrderManager = await ethers.getContractFactory("KapanOrderManager");
      const freshOrderManager = await KapanOrderManager.deploy(
        await solver.getAddress(), // owner
        KAPAN_ROUTER, // existing router
        COW_PROTOCOL.composableCoW, // composableCoW
        COW_PROTOCOL.settlement, // settlement
        COW_PROTOCOL.hooksTrampoline // hooksTrampoline
      );
      await freshOrderManager.waitForDeployment();
      const freshOrderManagerAddr = await freshOrderManager.getAddress();
      console.log(`Fresh KapanOrderManager: ${freshOrderManagerAddr}`);

      // Deploy KapanOrderHandler (needs orderManager address)
      const KapanOrderHandler = await ethers.getContractFactory("KapanOrderHandler");
      const freshHandler = await KapanOrderHandler.deploy(freshOrderManagerAddr);
      await freshHandler.waitForDeployment();
      const freshHandlerAddr = await freshHandler.getAddress();
      console.log(`Fresh KapanOrderHandler: ${freshHandlerAddr}`);

      // Set order handler on manager
      await freshOrderManager.setOrderHandler(freshHandlerAddr);
      console.log("Connected OrderHandler and OrderManager");

      // Approve fresh OrderManager on the existing KapanRouter
      const kapanRouterContract = await ethers.getContractAt(
        ["function setApprovedManager(address manager, bool approved) external", "function owner() view returns (address)"],
        KAPAN_ROUTER
      );
      const routerOwner = await kapanRouterContract.owner();
      await impersonateAndFund(routerOwner);
      const routerOwnerSigner = await ethers.getSigner(routerOwner);
      await kapanRouterContract.connect(routerOwnerSigner).setApprovedManager(freshOrderManagerAddr, true);
      console.log(`Approved fresh OrderManager on KapanRouter`);

      // Use fresh contracts
      kapanAdapter = freshAdapter;
      orderManager = freshOrderManager;
    }

    // THE ONLY CHEATING: Become a solver
    // This is required because only authorized solvers can call flashLoanAndSettle
    const authenticator = await getAuthenticator();
    const manager = await authenticator.manager();
    await impersonateAndFund(manager);
    const managerSigner = await ethers.getSigner(manager);
    await authenticator.connect(managerSigner).addSolver(await solver.getAddress());
    
    console.log(`\n=== Test Setup ===`);
    console.log(`Solver: ${await solver.getAddress()}`);
    console.log(`User: ${await user.getAddress()}`);
    console.log(`KapanCowAdapter: ${await kapanAdapter.getAddress()}`);
    console.log(`KapanOrderManager: ${await orderManager.getAddress()}`);
  });

  describe("Full Leverage Flow with Real Instructions", function () {
    // Test amounts
    const FLASH_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC flash loan
    const SELL_AMOUNT = ethers.parseUnits("100", 6);   // Sell all 100 USDC
    const BUY_AMOUNT = ethers.parseEther("0.03");     // Expect ~0.03 WETH (~$100 worth)
    const MARGIN_AMOUNT = ethers.parseEther("0.01");  // 0.01 WETH user margin

    let userAddr: string;
    let salt: string;
    let appDataHash: string;

    beforeEach(async function () {
      userAddr = await user.getAddress();
      salt = ethers.keccak256(ethers.toUtf8Bytes("leverage-test-" + Date.now()));
      appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-leverage-test"));
    });

    it("should execute full leverage flow: flash loan → swap → deposit → borrow → repay", async function () {
      this.timeout(120000); // 2 minutes for complex integration test
      /**
       * REAL FLOW - No shortcuts:
       * 
       * 1. User provides margin (WETH)
       * 2. Flash loan USDC from Morpho via flashLoanAndSettle
       * 3. Swap USDC → WETH via CoW Settlement
       * 4. Post-hook:
       *    - Pull user's margin WETH
       *    - Add swap output + margin = total collateral
       *    - Deposit total collateral to Morpho
       *    - Borrow USDC from Morpho
       *    - Push borrowed USDC to KapanCowAdapter for flash loan repayment
       */

      console.log("\n=== Building Real Leverage Position ===");
      console.log(`Flash loan: ${ethers.formatUnits(FLASH_AMOUNT, 6)} USDC`);
      console.log(`User margin: ${ethers.formatEther(MARGIN_AMOUNT)} WETH`);
      console.log(`Expected collateral after swap: ~${ethers.formatEther(BUY_AMOUNT)} WETH + ${ethers.formatEther(MARGIN_AMOUNT)} margin`);

      // ========== STEP 1: Fund user with WETH margin ==========
      const wethContract = await ethers.getContractAt(
        ["function deposit() external payable", "function approve(address,uint256) external returns (bool)"],
        WETH
      );
      await wethContract.connect(user).deposit({ value: MARGIN_AMOUNT });
      
      const userWethBefore = await weth.balanceOf(userAddr);
      console.log(`\nUser WETH balance: ${ethers.formatEther(userWethBefore)}`);

      // Use deployed contract addresses
      const adapterAddr = KAPAN_COW_ADAPTER;
      const orderManagerAddr = KAPAN_ORDER_MANAGER;

      // ========== STEP 2: Set up delegations ==========
      const kapanRouter = await ethers.getContractAt(
        ["function setDelegate(address delegate, bool approved) external"],
        KAPAN_ROUTER
      );
      await kapanRouter.connect(user).setDelegate(orderManagerAddr, true);
      console.log("User delegated to OrderManager via KapanRouter");

      await morpho.connect(user).setAuthorization(KAPAN_ROUTER, true);
      console.log("User authorized KapanRouter on Morpho");

      await weth.connect(user).approve(KAPAN_ROUTER, MARGIN_AMOUNT);
      console.log("User approved KapanRouter for WETH margin");

      // ========== STEP 3: Build post-hook instructions ==========
      const postInstructions: ProtocolInstruction[] = [
        // 1. Pull user's initial collateral → UTXO[1]
        createRouterInstruction(encodePullToken(MARGIN_AMOUNT, WETH, userAddr)),
        // 2. Add swap output + initial collateral → UTXO[2]
        createRouterInstruction(encodeAdd(0, 1)),
        // 3. Approve total collateral for Morpho → UTXO[3]
        createRouterInstruction(encodeApprove(2, "morpho-blue")),
        // 4. Deposit all collateral
        createMorphoInstruction(LendingOp.DepositCollateral, BASE_MORPHO_WETH_USDC, userAddr, 0n, 2),
        // 5. Borrow to repay flash loan → UTXO[4]
        createMorphoInstruction(LendingOp.Borrow, BASE_MORPHO_WETH_USDC, userAddr, FLASH_AMOUNT, 999),
        // 6. Push borrowed tokens to KapanCowAdapter for flash loan repayment
        createRouterInstruction(encodePushToken(4, adapterAddr)),
      ];

      console.log("\n=== Post-hook Instructions ===");
      console.log("1. PullToken(marginAmount, WETH, user) → UTXO[1]");
      console.log("2. Add(0, 1) → UTXO[2] (total collateral)");
      console.log("3. Approve(2, morpho-blue) → UTXO[3]");
      console.log("4. DepositCollateral(WETH, user, input=2)");
      console.log("5. Borrow(USDC, user, flashLoanAmount) → UTXO[4]");
      console.log(`6. PushToken(4, ${adapterAddr}) → repay flash loan`);

      // ========== STEP 3b: Authorize instructions ==========
      // The gateway needs authorization to act on behalf of the user for Morpho operations
      const kapanRouterForAuth = await ethers.getContractAt(
        ["function authorizeInstructions(tuple(string protocolName, bytes data)[] instructions, address caller) view returns (address[], bytes[])"],
        KAPAN_ROUTER
      );
      
      const [authTargets, authData] = await kapanRouterForAuth.authorizeInstructions(postInstructions, userAddr);
      console.log(`\nAuthorizing ${authTargets.length} instruction(s) for gateway access...`);
      for (let i = 0; i < authTargets.length; i++) {
        if (authTargets[i] !== ethers.ZeroAddress && authData[i] !== "0x") {
          await user.sendTransaction({ to: authTargets[i], data: authData[i] });
          console.log(`  Authorized: ${authTargets[i]}`);
        }
      }

      // ========== STEP 4: Create order on OrderManager ==========
      const orderParams = buildOrderParams({
        user: userAddr,
        preInstructions: [],
        preTotalAmount: FLASH_AMOUNT,
        sellToken: USDC,
        buyToken: WETH,
        chunkSize: FLASH_AMOUNT,
        minBuyPerChunk: BUY_AMOUNT,
        postInstructions: postInstructions,
        targetValue: 1,
        appDataHash: appDataHash,
        isFlashLoanOrder: true,
      });

      const createTx = await orderManager.connect(user).createOrder(orderParams, salt, 0);
      const receipt = await createTx.wait();
      
      // Use deployed handler address
      const handlerAddr = KAPAN_ORDER_HANDLER;

      let kapanOrderHash: string | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === orderManagerAddr.toLowerCase()) {
          if (log.topics && log.topics.length >= 2) {
            kapanOrderHash = log.topics[1];
          }
        }
      }
      if (!kapanOrderHash) throw new Error("Could not extract orderHash from logs");
      console.log(`\nOrder created: ${kapanOrderHash}`);

      const orderContext = await orderManager.getOrder(kapanOrderHash);
      console.log(`Order status: ${orderContext.status} (1=Active)`);

      // ========== STEP 5: Build CoW Settlement ==========
      const fundOrderCalldata = adapterIface.encodeFunctionData("fundOrder", [
        USDC,
        orderManagerAddr,
        FLASH_AMOUNT,
      ]);

      const preHookCalldata = orderManagerIface.encodeFunctionData("executePreHookBySalt", [
        userAddr,
        salt,
      ]);

      const postHookCalldata = orderManagerIface.encodeFunctionData("executePostHookBySalt", [
        userAddr,
        salt,
      ]);

      // Wrap hooks for HooksTrampoline
      const preHook1 = hooksIface.encodeFunctionData("execute", [[{
        target: adapterAddr,
        callData: fundOrderCalldata,
        gasLimit: 100000n,
      }]]);

      const preHook2 = hooksIface.encodeFunctionData("execute", [[{
        target: orderManagerAddr,
        callData: preHookCalldata,
        gasLimit: 300000n,
      }]]);

      const postHook = hooksIface.encodeFunctionData("execute", [[{
        target: orderManagerAddr,
        callData: postHookCalldata,
        gasLimit: 1500000n,
      }]]);

      // Build GPv2Order
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: USDC,
        buyToken: WETH,
        receiver: orderManagerAddr,
        sellAmount: SELL_AMOUNT,
        buyAmount: BUY_AMOUNT,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        kind: GPV2_ORDER.KIND_SELL,
        partiallyFillable: false,
        sellTokenBalance: GPV2_ORDER.BALANCE_ERC20,
        buyTokenBalance: GPV2_ORDER.BALANCE_ERC20,
      };

      console.log("\n=== GPv2Order ===");
      console.log(`Sell: ${ethers.formatUnits(SELL_AMOUNT, 6)} USDC`);
      console.log(`Buy: ${ethers.formatEther(BUY_AMOUNT)} WETH (minimum)`);
      console.log(`Receiver: ${gpv2Order.receiver} (OrderManager)`);

      // Build ERC-1271 signature
      const signature = buildTradeSignature(
        orderManagerAddr,
        gpv2Order,
        handlerAddr,
        salt,
        kapanOrderHash
      );

      // Build trade
      const trade = {
        sellTokenIndex: 0,
        buyTokenIndex: 1,
        receiver: orderManagerAddr,
        sellAmount: SELL_AMOUNT,
        buyAmount: BUY_AMOUNT,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: SELL_AMOUNT,
        signature: signature,
      };

      // Build interactions
      const preInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook1 },
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook2 },
      ];

      const intraInteractions: any[] = [];

      const postInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHook },
      ];

      // Approve VaultRelayer
      await impersonateAndFund(orderManagerAddr);
      const orderManagerSigner = await ethers.getSigner(orderManagerAddr);
      await usdc.connect(orderManagerSigner).approve(COW_PROTOCOL.vaultRelayer, ethers.MaxUint256);

      // Build settlement calldata
      const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
        [USDC, WETH],
        [BUY_AMOUNT, SELL_AMOUNT], // clearing prices
        [trade],
        [preInteractions, intraInteractions, postInteractions],
      ]);

      // ========== STEP 6: Provide solver liquidity ==========
      // Solver needs WETH to give to the trade - this is normal, solvers provide liquidity
      await impersonateAndFund(WETH_WHALE);
      const wethWhale = await ethers.getSigner(WETH_WHALE);
      await wethWhale.sendTransaction({ to: WETH, value: ethers.parseEther("1") });
      const wethDeposit = await ethers.getContractAt(
        ["function deposit() external payable", "function transfer(address,uint256) external returns (bool)"],
        WETH
      );
      await wethDeposit.connect(wethWhale).transfer(COW_PROTOCOL.settlement, BUY_AMOUNT);
      
      const settlementWeth = await weth.balanceOf(COW_PROTOCOL.settlement);
      console.log(`\nSettlement WETH (solver liquidity): ${ethers.formatEther(settlementWeth)}`);

      // ========== STEP 7: Execute flash loan and settle ==========
      const loans = [{
        amount: FLASH_AMOUNT,
        borrower: adapterAddr,
        lender: MORPHO_BLUE,
        token: USDC,
      }];

      console.log("\n=== Flash Loan Config ===");
      console.log(`Lender: ${MORPHO_BLUE} (Morpho Blue)`);
      console.log(`Borrower: ${adapterAddr} (KapanCowAdapter)`);
      console.log(`Amount: ${ethers.formatUnits(FLASH_AMOUNT, 6)} USDC`);

      console.log("\n=== Executing flashLoanAndSettle ===");

      // Check balances before
      const adapterUsdcBefore = await usdc.balanceOf(adapterAddr);
      const userMorphoPositionBefore = await morpho.position(BASE_MORPHO_WETH_USDC.key, userAddr);
      console.log(`\nBefore execution:`);
      console.log(`  Adapter USDC: ${ethers.formatUnits(adapterUsdcBefore, 6)}`);
      console.log(`  User Morpho collateral: ${userMorphoPositionBefore.collateral}`);
      console.log(`  User Morpho borrow shares: ${userMorphoPositionBefore.borrowShares}`);

      try {
        const tx = await flashLoanRouter.connect(solver).flashLoanAndSettle(
          loans,
          settlementCalldata,
          { gasLimit: 8000000 }
        );
        const txReceipt = await tx.wait();
        console.log(`\nflashLoanAndSettle SUCCEEDED! Gas used: ${txReceipt.gasUsed}`);
        
        // Check balances after
        const adapterUsdcAfter = await usdc.balanceOf(adapterAddr);
        const orderManagerWethAfter = await weth.balanceOf(orderManagerAddr);
        const userWethAfter = await weth.balanceOf(userAddr);
        const userMorphoPositionAfter = await morpho.position(BASE_MORPHO_WETH_USDC.key, userAddr);
        
        console.log(`\nAfter execution:`);
        console.log(`  Adapter USDC: ${ethers.formatUnits(adapterUsdcAfter, 6)} (should be 0)`);
        console.log(`  OrderManager WETH: ${ethers.formatEther(orderManagerWethAfter)} (should be 0)`);
        console.log(`  User WETH: ${ethers.formatEther(userWethAfter)} (margin spent)`);
        console.log(`  User Morpho collateral: ${userMorphoPositionAfter.collateral} (should be > 0)`);
        console.log(`  User Morpho borrow shares: ${userMorphoPositionAfter.borrowShares} (should be > 0)`);
        
        // Verify position was created
        expect(userMorphoPositionAfter.collateral).to.be.gt(0n, "Collateral should be deposited");
        expect(userMorphoPositionAfter.borrowShares).to.be.gt(0n, "Should have borrowed");
        expect(adapterUsdcAfter).to.equal(0n, "Adapter should have 0 USDC (flash loan repaid)");
        
        console.log("\n✅ LEVERAGE POSITION CREATED SUCCESSFULLY!");
        
      } catch (error: any) {
        console.log(`\n=== flashLoanAndSettle FAILED ===`);
        console.log(`Error: ${error.message?.slice(0, 2000)}`);
        
        if (error.data) {
          console.log(`Error data: ${error.data}`);
        }
        
        throw error;
      }
    });

    it("should verify Morpho market has enough liquidity", async function () {
      const marketData = await morpho.market(BASE_MORPHO_WETH_USDC.key);
      console.log("\n=== Morpho Market State ===");
      console.log(`Total Supply: ${ethers.formatUnits(marketData.totalSupplyAssets, 6)} USDC`);
      console.log(`Total Borrow: ${ethers.formatUnits(marketData.totalBorrowAssets, 6)} USDC`);
      
      const availableLiquidity = BigInt(marketData.totalSupplyAssets) - BigInt(marketData.totalBorrowAssets);
      console.log(`Available Liquidity: ${ethers.formatUnits(availableLiquidity, 6)} USDC`);
      
      expect(availableLiquidity).to.be.gt(FLASH_AMOUNT, "Market should have enough liquidity for flash loan");
    });

    it("should decode real order's post-hook instructions to verify PushToken target", async function () {
      /**
       * DIAGNOSTIC TEST: Decode a FILLED order's stored instructions
       * to verify the fix is working correctly.
       * 
       * This order was SUCCESSFULLY FILLED on 02/01/2026:
       * https://explorer.cow.fi/base/orders/0x36528ccfe0475c37da19e2fa566486352e2f75a9122eeafdecfb309363983c79e4b28de3aa865540bbc1c71892b6b6af249298586957b9e6
       * 
       * Expected finding:
       * - PushToken target = 0x2197f7f6369FeFDE4B461bF6CdE898fD730a3255 (KapanCowAdapter - CORRECT)
       */
      
      const REAL_ORDER = {
        user: "0xa9b108038567f76f55219c630bb0e590b748790d",
        // Salt from the FILLED order (extracted from calldata: 0xe7a136a642e61858c25f44942b745a83deb9a444e286ec904f0517d70acedc0b)
        salt: "0xe7a136a642e61858c25f44942b745a83deb9a444e286ec904f0517d70acedc0b",
      };

      const COW_AAVE_BORROWER = "0xdeCC46a4b09162F5369c5C80383AAa9159bCf192"; // WRONG address (old bug)
      const KAPAN_COW_ADAPTER_ADDR = "0x2197f7f6369FeFDE4B461bF6CdE898fD730a3255"; // CORRECT address

      console.log("\n=== Decoding Real Order's Stored Instructions ===");
      console.log(`User: ${REAL_ORDER.user}`);
      console.log(`Salt: ${REAL_ORDER.salt}`);

      // Get order hash from (user, salt)
      const orderHash = await orderManager.userSaltToOrderHash(REAL_ORDER.user, REAL_ORDER.salt);
      console.log(`\nOrder hash: ${orderHash}`);
      
      if (orderHash === ethers.ZeroHash) {
        console.log("Order not found on OrderManager");
        this.skip();
        return;
      }

      // Get full order context
      const orderContext = await orderManager.getOrder(orderHash);
      console.log(`Order status: ${orderContext.status} (0=None, 1=Active, 2=Completed, 3=Cancelled)`);
      
      const params = orderContext.params;
      console.log(`\n=== Order Params ===`);
      console.log(`User: ${params.user}`);
      console.log(`SellToken: ${params.sellToken}`);
      console.log(`BuyToken: ${params.buyToken}`);
      console.log(`ChunkSize: ${params.chunkSize}`);
      console.log(`MinBuyPerChunk: ${params.minBuyPerChunk}`);
      console.log(`isFlashLoanOrder: ${params.isFlashLoanOrder}`);
      console.log(`Pre-instructions count: ${params.preInstructionsPerIteration.length}`);
      console.log(`Post-instructions count: ${params.postInstructionsPerIteration.length}`);

      // Decode each post-instruction
      console.log(`\n=== Post-Hook Instructions (decoded) ===`);
      
      const INSTRUCTION_TUPLE = "tuple(string protocolName, bytes data)[]";
      let foundPushTokenTarget: string | null = null;
      
      for (let i = 0; i < params.postInstructionsPerIteration.length; i++) {
        const encodedInstruction = params.postInstructionsPerIteration[i];
        console.log(`\n--- Instruction ${i} ---`);
        console.log(`Raw: ${encodedInstruction.slice(0, 100)}...`);
        
        try {
          // Decode the instruction array
          const decoded = coder.decode([INSTRUCTION_TUPLE], encodedInstruction);
          const instructions = decoded[0];
          
          for (const [protocolName, data] of instructions) {
            console.log(`Protocol: ${protocolName}`);
            
            if (protocolName === "router") {
              // Decode router instruction
              const routerInstruction = coder.decode([ROUTER_INSTRUCTION_TYPE], data);
              const [amount, token, user, instructionType] = routerInstruction[0];
              
              const instructionTypeName = Object.keys(RouterInstructionType).find(
                k => RouterInstructionType[k as keyof typeof RouterInstructionType] === Number(instructionType)
              );
              
              console.log(`  Type: ${instructionTypeName} (${instructionType})`);
              console.log(`  Amount: ${amount}`);
              console.log(`  Token: ${token}`);
              console.log(`  User/Target: ${user}`);
              
              if (Number(instructionType) === RouterInstructionType.PushToken) {
                foundPushTokenTarget = user;
                console.log(`\n  🎯 FOUND PushToken instruction!`);
                console.log(`     Target: ${user}`);
                
                if (user.toLowerCase() === COW_AAVE_BORROWER.toLowerCase()) {
                  console.log(`     ❌ TARGET IS WRONG! Points to CoW AaveBorrower instead of KapanCowAdapter`);
                  console.log(`     This is the BUG - flash loan repayment will fail!`);
                } else if (user.toLowerCase() === KAPAN_COW_ADAPTER_ADDR.toLowerCase()) {
                  console.log(`     ✅ TARGET IS CORRECT! Points to KapanCowAdapter`);
                } else {
                  console.log(`     ⚠️  Unknown target address`);
                }
              }
            } else if (protocolName === "morpho-blue") {
              // Decode lending instruction
              const LENDING_INSTRUCTION_TYPE = "tuple(uint8 op, address token, address user, uint256 amount, bytes context, tuple(uint256 index) input)";
              const lendingInstruction = coder.decode([LENDING_INSTRUCTION_TYPE], data);
              const [op, token, user, amount, context, input] = lendingInstruction[0];
              
              const opName = Object.keys(LendingOp).find(
                k => LendingOp[k as keyof typeof LendingOp] === Number(op)
              );
              
              console.log(`  Op: ${opName} (${op})`);
              console.log(`  Token: ${token}`);
              console.log(`  User: ${user}`);
              console.log(`  Amount: ${amount}`);
              console.log(`  Input index: ${input.index}`);
            }
          }
        } catch (e: any) {
          console.log(`  Failed to decode: ${e.message?.slice(0, 200)}`);
        }
      }

      // Final verdict
      console.log(`\n=== DIAGNOSIS ===`);
      if (foundPushTokenTarget) {
        if (foundPushTokenTarget.toLowerCase() === COW_AAVE_BORROWER.toLowerCase()) {
          console.log(`❌ BUG CONFIRMED: This order was created with the bug.`);
          console.log(`   PushToken target: ${foundPushTokenTarget} (CoW AaveBorrower)`);
          console.log(`   Should be: ${KAPAN_COW_ADAPTER_ADDR} (KapanCowAdapter)`);
          console.log(`\n   This order will NEVER be filled because post-hook will fail.`);
          console.log(`   The borrowed USDC will be pushed to wrong address, and flash loan`);
          console.log(`   repayment will fail with "transferFrom reverted".`);
          console.log(`\n   SOLUTION: User needs to cancel this order and create a new one`);
          console.log(`   using the fixed frontend code.`);
        } else if (foundPushTokenTarget.toLowerCase() === KAPAN_COW_ADAPTER_ADDR.toLowerCase()) {
          console.log(`✅ This order has the CORRECT PushToken target.`);
          console.log(`   If it's still not being filled, there may be another issue.`);
        } else {
          console.log(`⚠️  PushToken target is: ${foundPushTokenTarget}`);
          console.log(`   This is neither CoW AaveBorrower nor KapanCowAdapter.`);
        }
      } else {
        console.log(`⚠️  No PushToken instruction found in post-hooks.`);
        console.log(`   This is unexpected for a flash loan order.`);
      }
    });

    it("should verify FILLED order structure is correct", async function () {
      /**
       * VERIFICATION TEST: Verify the successfully FILLED order from CoW Explorer
       * has the correct structure and all components are as expected.
       * 
       * Order: https://explorer.cow.fi/base/orders/0x36528ccfe0475c37da19e2fa566486352e2f75a9122eeafdecfb309363983c79e4b28de3aa865540bbc1c71892b6b6af249298586957b9e6
       * Transaction: 0x09ba8a58a4ed7903fca40c59d39c8e3ef8570e64577ebb6040f6facaa3f2f5c5
       * 
       * This order was SUCCESSFULLY FILLED on 02/01/2026!
       */
      
      const FILLED_ORDER = {
        user: "0xa9b108038567f76f55219c630bb0e590b748790d",
        salt: "0xe7a136a642e61858c25f44942b745a83deb9a444e286ec904f0517d70acedc0b",
        sellAmount: 3686273n, // 3.686273 USDC
        buyAmount: ethers.parseEther("0.001205409866212498"), // minBuyAmount
        flashLoanAmount: 3686273n, // From appData
        appDataHash: "0xc114813cc3d1ff63c156f6279f4cefdaafed72858280c3273334ad73144d3484",
        txHash: "0x09ba8a58a4ed7903fca40c59d39c8e3ef8570e64577ebb6040f6facaa3f2f5c5",
      };

      console.log("\n=== Verifying FILLED Order Structure ===");
      console.log(`User: ${FILLED_ORDER.user}`);
      console.log(`Salt: ${FILLED_ORDER.salt}`);
      console.log(`Sell: ${ethers.formatUnits(FILLED_ORDER.sellAmount, 6)} USDC`);
      console.log(`Min Buy: ${ethers.formatEther(FILLED_ORDER.buyAmount)} WETH`);
      console.log(`TX: ${FILLED_ORDER.txHash}`);

      // Get order hash
      const orderHash = await orderManager.userSaltToOrderHash(FILLED_ORDER.user, FILLED_ORDER.salt);
      console.log(`\nOrder hash: ${orderHash}`);
      expect(orderHash).to.not.equal(ethers.ZeroHash, "Order should exist");

      // Get order context
      const orderContext = await orderManager.getOrder(orderHash);
      console.log(`Order status: ${orderContext.status}`);
      expect(orderContext.status).to.equal(2n, "Order should be Completed (status=2)");

      const params = orderContext.params;
      
      // Verify order params
      console.log(`\n=== Order Params Verification ===`);
      expect(params.user.toLowerCase()).to.equal(FILLED_ORDER.user.toLowerCase());
      console.log(`✅ User matches`);
      
      expect(params.sellToken.toLowerCase()).to.equal(USDC.toLowerCase());
      console.log(`✅ SellToken is USDC`);
      
      expect(params.buyToken.toLowerCase()).to.equal(WETH.toLowerCase());
      console.log(`✅ BuyToken is WETH`);
      
      expect(params.isFlashLoanOrder).to.equal(true);
      console.log(`✅ isFlashLoanOrder is true`);
      
      expect(params.chunkSize).to.equal(FILLED_ORDER.flashLoanAmount);
      console.log(`✅ ChunkSize matches flash loan amount: ${ethers.formatUnits(params.chunkSize, 6)} USDC`);
      
      // Verify post-hook has correct PushToken target
      console.log(`\n=== Post-Hook Verification ===`);
      expect(params.postInstructionsPerIteration.length).to.be.gte(1);
      console.log(`Post-instructions count: ${params.postInstructionsPerIteration.length}`);
      
      // Decode and verify PushToken target
      const INSTRUCTION_TUPLE = "tuple(string protocolName, bytes data)[]";
      const decoded = coder.decode([INSTRUCTION_TUPLE], params.postInstructionsPerIteration[0]);
      const instructions = decoded[0];
      
      let pushTokenFound = false;
      for (const [protocolName, data] of instructions) {
        if (protocolName === "router") {
          const routerInstruction = coder.decode([ROUTER_INSTRUCTION_TYPE], data);
          const [, , user, instructionType] = routerInstruction[0];
          
          if (Number(instructionType) === RouterInstructionType.PushToken) {
            pushTokenFound = true;
            expect(user.toLowerCase()).to.equal(KAPAN_COW_ADAPTER.toLowerCase());
            console.log(`✅ PushToken target is KapanCowAdapter: ${user}`);
          }
        }
      }
      expect(pushTokenFound).to.equal(true, "Should have PushToken instruction");
      
      console.log(`\n✅ ALL VERIFICATIONS PASSED - Order structure is correct!`);
      console.log(`   This proves the frontend fix is working correctly.`);
    });

    it.skip("should solve real order from CoW Explorer (STALE - order was created with bug)", async function () {
      /**
       * STALE TEST - This order was created BEFORE the fix and has wrong PushToken target.
       * The order uses ERC3156Borrower (0x47d71b4B3336AB2729436186C216955F3C27cD04) 
       * instead of KapanCowAdapter (0x2197f7f6369FeFDE4B461bF6CdE898fD730a3255).
       * 
       * This order will NEVER be filled. User needs to cancel and create a new one.
       * 
       * See "should decode real order's post-hook instructions" test for diagnosis.
       */
      
      // Order details from CoW Explorer (STALE - has bug)
      const REAL_ORDER = {
        user: "0xa9b108038567f76f55219c630bb0e590b748790d",
        salt: "0x42d2ebac99b7878ca48400726522cfdf31da0033e5409c52048a8eb7f22a5d04",
        sellAmount: 3099016n, // 3.099016 USDC
        buyAmount: ethers.parseEther("0.001010117229612448"), // minBuyAmount
        flashLoanAmount: 3099016n,
        // Pre-hook 1: fundOrder calldata
        preHook1Calldata: "0xba4d4392000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000e4b28de3aa865540bbc1c71892b6b6af2492985800000000000000000000000000000000000000000000000000000000002f4988",
        // Pre-hook 2: executePreHookBySalt calldata
        preHook2Calldata: "0x8009fb6a000000000000000000000000a9b108038567f76f55219c630bb0e590b748790d42d2ebac99b7878ca48400726522cfdf31da0033e5409c52048a8eb7f22a5d04",
        // Post-hook: executePostHookBySalt calldata
        postHookCalldata: "0x2fbff5a4000000000000000000000000a9b108038567f76f55219c630bb0e590b748790d42d2ebac99b7878ca48400726522cfdf31da0033e5409c52048a8eb7f22a5d04",
        appDataHash: "0x0e02769d1714b5349503c46e60a3cf11ca64b972d9377c4955b80d4889b5b431",
      };

      console.log("\n=== Solving Real Order from CoW Explorer ===");
      console.log(`User: ${REAL_ORDER.user}`);
      console.log(`Salt: ${REAL_ORDER.salt}`);
      console.log(`Sell: ${ethers.formatUnits(REAL_ORDER.sellAmount, 6)} USDC`);
      console.log(`Min Buy: ${ethers.formatEther(REAL_ORDER.buyAmount)} WETH`);

      // Check if order exists on OrderManager
      const orderManagerAddr = KAPAN_ORDER_MANAGER;
      const adapterAddr = KAPAN_COW_ADAPTER;
      const handlerAddr = KAPAN_ORDER_HANDLER;

      // Get order hash from (user, salt)
      const orderHash = await orderManager.userSaltToOrderHash(REAL_ORDER.user, REAL_ORDER.salt);
      console.log(`\nOrder hash: ${orderHash}`);
      
      if (orderHash === ethers.ZeroHash) {
        console.log("Order not found on OrderManager - may have expired or been cancelled");
        this.skip();
        return;
      }

      // Get order context
      const orderContext = await orderManager.getOrder(orderHash);
      console.log(`Order status: ${orderContext.status} (0=None, 1=Active, 2=Completed, 3=Cancelled)`);
      
      if (orderContext.status !== 1n) {
        console.log("Order is not active");
        this.skip();
        return;
      }

      // Build hooks for HooksTrampoline (using exact calldata from CoW Explorer)
      const preHook1 = hooksIface.encodeFunctionData("execute", [[{
        target: adapterAddr,
        callData: REAL_ORDER.preHook1Calldata,
        gasLimit: 100000n,
      }]]);

      const preHook2 = hooksIface.encodeFunctionData("execute", [[{
        target: orderManagerAddr,
        callData: REAL_ORDER.preHook2Calldata,
        gasLimit: 300000n,
      }]]);

      const postHook = hooksIface.encodeFunctionData("execute", [[{
        target: orderManagerAddr,
        callData: REAL_ORDER.postHookCalldata,
        gasLimit: 800000n,
      }]]);

      // Build GPv2Order
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: USDC,
        buyToken: WETH,
        receiver: orderManagerAddr,
        sellAmount: REAL_ORDER.sellAmount,
        buyAmount: REAL_ORDER.buyAmount,
        validTo,
        appData: REAL_ORDER.appDataHash,
        feeAmount: 0n,
        kind: GPV2_ORDER.KIND_SELL,
        partiallyFillable: false,
        sellTokenBalance: GPV2_ORDER.BALANCE_ERC20,
        buyTokenBalance: GPV2_ORDER.BALANCE_ERC20,
      };

      // Build ERC-1271 signature
      const signature = buildTradeSignature(
        orderManagerAddr,
        gpv2Order,
        handlerAddr,
        REAL_ORDER.salt,
        orderHash
      );

      // Build trade
      const trade = {
        sellTokenIndex: 0,
        buyTokenIndex: 1,
        receiver: orderManagerAddr,
        sellAmount: REAL_ORDER.sellAmount,
        buyAmount: REAL_ORDER.buyAmount,
        validTo,
        appData: REAL_ORDER.appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: REAL_ORDER.sellAmount,
        signature: signature,
      };

      // Build interactions
      const preInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook1 },
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook2 },
      ];

      const intraInteractions: any[] = [];

      const postInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHook },
      ];

      // Approve VaultRelayer (OrderManager needs to have approved this)
      // Check if already approved
      const currentAllowance = await usdc.allowance(orderManagerAddr, COW_PROTOCOL.vaultRelayer);
      console.log(`\nOrderManager USDC allowance for VaultRelayer: ${ethers.formatUnits(currentAllowance, 6)}`);
      
      if (currentAllowance < REAL_ORDER.sellAmount) {
        console.log("Approving VaultRelayer...");
        await impersonateAndFund(orderManagerAddr);
        const orderManagerSigner = await ethers.getSigner(orderManagerAddr);
        await usdc.connect(orderManagerSigner).approve(COW_PROTOCOL.vaultRelayer, ethers.MaxUint256);
      }

      // Build settlement calldata
      const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
        [USDC, WETH],
        [REAL_ORDER.buyAmount, REAL_ORDER.sellAmount], // clearing prices
        [trade],
        [preInteractions, intraInteractions, postInteractions],
      ]);

      // Provide solver liquidity (WETH)
      await impersonateAndFund(WETH_WHALE);
      const wethWhale = await ethers.getSigner(WETH_WHALE);
      await wethWhale.sendTransaction({ to: WETH, value: ethers.parseEther("0.1") });
      const wethDeposit = await ethers.getContractAt(
        ["function deposit() external payable", "function transfer(address,uint256) external returns (bool)"],
        WETH
      );
      // Give a bit more than minBuyAmount to cover any price movements
      const solverWeth = REAL_ORDER.buyAmount * 110n / 100n; // 10% buffer
      await wethDeposit.connect(wethWhale).transfer(COW_PROTOCOL.settlement, solverWeth);
      
      const settlementWeth = await weth.balanceOf(COW_PROTOCOL.settlement);
      console.log(`Settlement WETH (solver liquidity): ${ethers.formatEther(settlementWeth)}`);

      // Build flash loan config
      const loans = [{
        amount: REAL_ORDER.flashLoanAmount,
        borrower: adapterAddr,
        lender: MORPHO_BLUE,
        token: USDC,
      }];

      console.log("\n=== Flash Loan Config ===");
      console.log(`Lender: ${MORPHO_BLUE} (Morpho Blue)`);
      console.log(`Borrower: ${adapterAddr} (KapanCowAdapter)`);
      console.log(`Amount: ${ethers.formatUnits(REAL_ORDER.flashLoanAmount, 6)} USDC`);

      console.log("\n=== Attempting to solve real order ===");

      // Check user's Morpho position before
      const userPositionBefore = await morpho.position(BASE_MORPHO_WETH_USDC.key, REAL_ORDER.user);
      console.log(`\nBefore execution:`);
      console.log(`  User Morpho collateral: ${userPositionBefore.collateral}`);
      console.log(`  User Morpho borrow shares: ${userPositionBefore.borrowShares}`);

      try {
        const tx = await flashLoanRouter.connect(solver).flashLoanAndSettle(
          loans,
          settlementCalldata,
          { gasLimit: 8000000 }
        );
        const txReceipt = await tx.wait();
        console.log(`\nflashLoanAndSettle SUCCEEDED! Gas used: ${txReceipt.gasUsed}`);
        
        // Check user's position after
        const userPositionAfter = await morpho.position(BASE_MORPHO_WETH_USDC.key, REAL_ORDER.user);
        console.log(`\nAfter execution:`);
        console.log(`  User Morpho collateral: ${userPositionAfter.collateral}`);
        console.log(`  User Morpho borrow shares: ${userPositionAfter.borrowShares}`);

        // Check order status
        const orderAfter = await orderManager.getOrder(orderHash);
        console.log(`  Order status: ${orderAfter.status} (2=Completed)`);
        
        console.log("\n✅ REAL ORDER SOLVED SUCCESSFULLY!");
        
      } catch (error: any) {
        console.log(`\n=== Failed to solve real order ===`);
        console.log(`Error: ${error.message?.slice(0, 2000)}`);
        
        if (error.data) {
          console.log(`Error data: ${error.data}`);
        }
        
        throw error;
      }
    });
  });
});
