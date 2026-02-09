/**
 * Fork Tests for Close With Collateral Conditional Orders - Euler V2
 *
 * These tests verify the EXACT same instruction flow that the frontend generates,
 * executed through the real CoW Protocol FlashLoanRouter.
 *
 * Flow being tested (BUY order - exact debt repayment):
 * 1. User has position: collateral (wstETH) + debt (USDC) on Euler V2
 * 2. User wants to close position by selling collateral for debt
 * 3. Flash loan collateral (wstETH) -> sell in swap -> receive debt (USDC)
 * 4. Post-hook: Approve + Repay debt + Withdraw collateral + Return to manager
 *
 * Key differences from Morpho version:
 * - Uses Euler V2 vaults instead of Morpho Blue markets
 * - Protocol name is "euler"
 * - Context encodes (borrowVault, collateralVaults[], subAccountIndex)
 * - EVC authorization required for gateway operator access
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/CloseWithCollateralConditionalOrder.Euler.fork.ts
 */

import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder, Signer, Contract } from "ethers";
import {
  encodeApprove,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
  encodePushToken,
  encodePullToken,
  LendingOp,
  deployRouterWithAuthHelper,
} from "./helpers/instructionHelpers";
import {
  COW_PROTOCOL,
  GPV2_ORDER,
  TRADE_FLAGS,
  getSettlement,
  impersonateAndFund,
  becomeSolver,
  GPv2OrderData,
  buildTradeSignature,
} from "./helpers/cowHelpers";

const coder = AbiCoder.defaultAbiCoder();

// ============ Arbitrum Addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";
const USDC_WHALE = "0x47c031236e19d024b42f8AE6780E44A573170703";

// EVC on Arbitrum
const EVC_ADDRESS = "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066";

// Morpho Blue on Arbitrum (0% fee flash loans)
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

// Euler vaults on Arbitrum (from euler-labels repo)
const ARB_EULER_VAULTS = {
  USDC: {
    vault: "0x0a1eCC5Fe8C9be3C809844fcBe615B46A869b899",
    asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
  },
  wstETH: {
    vault: "0xA8616E4D9f3f0aa01aff1d7c3b66249f8a5f1A58",
    asset: "0x5979D7b546E38E414F7E9822514be443A4800529",
    decimals: 18,
  },
};

// Protocol ID (bytes4) for Euler
const EULER_ID = ethers.keccak256(ethers.toUtf8Bytes("euler")).slice(0, 10) as `0x${string}`;

// HooksTrampoline interface
const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
]);

// Flash Loan Router ABI
const FLASH_LOAN_ROUTER_ABI = [
  "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
];

// Adapter interface
const ADAPTER_IFACE = new ethers.Interface([
  "function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient) external",
]);

// Type helper for ERC20 contracts
type IERC20 = Contract & {
  transfer: (to: string, amount: bigint) => Promise<any>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  balanceOf: (account: string) => Promise<bigint>;
  connect: (signer: any) => IERC20;
};

/**
 * Encode Euler vault context for use in LendingInstruction context
 * Format: (address borrowVault, address[] collateralVaults, uint8 subAccountIndex)
 */
function encodeEulerContext(borrowVault: string, collateralVault: string, subAccountIndex: number = 0): string {
  return coder.encode(
    ["address", "address[]", "uint8"],
    [borrowVault, [collateralVault], subAccountIndex]
  );
}

/**
 * Get the natural sub-account index for a user (their "main" account)
 * This is the last byte of the user's address.
 */
function getUserMainAccountIndex(user: string): number {
  return Number(BigInt(user) & BigInt(0xFF));
}

describe("Close With Collateral Conditional Order - Euler V2 (Fork)", function () {
  before(async function () {
    const net = await ethers.provider.getNetwork();
    const chainId = Number(net.chainId);
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping - requires Arbitrum fork (got chainId ${chainId})`);
      this.skip();
    }

    // Check EVC exists
    const evcCode = await ethers.provider.getCode(EVC_ADDRESS);
    if (evcCode === "0x") {
      console.log("EVC not deployed at expected address, skipping");
      this.skip();
    }
  });

  // Test amounts
  const COLLATERAL_AMOUNT = ethers.parseEther("2"); // 2 wstETH
  const BORROW_AMOUNT = 2000_000000n; // 2000 USDC debt
  const CLOSE_AMOUNT = 1000_000000n; // Close 1000 USDC worth (partial close)

  let orderManager: Contract;
  let orderHandler: Contract;
  let cowAdapter: Contract;
  let router: Contract;
  let eulerGateway: Contract;
  let owner: Signer;
  let user: Signer;
  let userAddress: string;
  let orderManagerAddress: string;
  let orderHandlerAddress: string;
  let adapterAddress: string;
  let routerAddress: string;
  let wsteth: IERC20;
  let usdc: IERC20;
  let evc: Contract;
  let settlement: Contract;
  let flashLoanRouter: Contract;

  const erc20Abi = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ];

  before(async function () {
    this.timeout(180000);

    [owner] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Fund user with ETH
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);

    // Get token contracts
    wsteth = await ethers.getContractAt(erc20Abi, WSTETH) as IERC20;
    usdc = await ethers.getContractAt(erc20Abi, USDC) as IERC20;

    // Get wstETH from whale for collateral
    await impersonateAndFund(WSTETH_WHALE);
    const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
    await wsteth.connect(wstethWhale).transfer(userAddress, COLLATERAL_AMOUNT);

    // Get EVC contract
    evc = await ethers.getContractAt("IEVC", EVC_ADDRESS);

    // Get CoW Protocol contracts
    settlement = await getSettlement();
    flashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, COW_PROTOCOL.flashLoanRouter);

    // Deploy KapanRouter
    const deployed = await deployRouterWithAuthHelper(ethers, await owner.getAddress());
    router = deployed.router;
    routerAddress = deployed.routerAddress;
    const { syncGateway } = deployed;

    // Deploy Euler gateway
    const EulerGatewayFactory = await ethers.getContractFactory("EulerGatewayWrite");
    eulerGateway = await EulerGatewayFactory.deploy(routerAddress, await owner.getAddress(), EVC_ADDRESS);
    const eulerGatewayAddress = await eulerGateway.getAddress();
    await router.addGateway("euler", eulerGatewayAddress);
    await syncGateway("euler", eulerGatewayAddress);

    // Use user's natural sub-account index so sub-account = user.address
    const subAccountIndex = getUserMainAccountIndex(userAddress);
    const borrowVault = ARB_EULER_VAULTS.USDC.vault;
    const collateralVault = ARB_EULER_VAULTS.wstETH.vault;

    // Setup EVC authorization for user
    await evc.connect(user).enableCollateral(userAddress, collateralVault);
    await evc.connect(user).enableController(userAddress, borrowVault);
    await evc.connect(user).setAccountOperator(userAddress, eulerGatewayAddress, true);

    // Create Euler position via router: deposit wstETH collateral, borrow USDC
    const eulerContext = encodeEulerContext(borrowVault, collateralVault, subAccountIndex);

    // Approve router and deposit collateral
    await wsteth.connect(user).approve(routerAddress, COLLATERAL_AMOUNT);

    const depositInstrs = [
      createRouterInstruction(encodePullToken(COLLATERAL_AMOUNT, ARB_EULER_VAULTS.wstETH.asset, userAddress)),
      createRouterInstruction(encodeApprove(0, "euler")),
      createProtocolInstruction(
        "euler",
        encodeLendingInstruction(LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, userAddress, 0n, eulerContext, 0)
      ),
    ];

    await router.connect(user).processProtocolInstructions(depositInstrs);

    // Borrow USDC
    const borrowInstrs = [
      createProtocolInstruction(
        "euler",
        encodeLendingInstruction(LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, userAddress, BORROW_AMOUNT, eulerContext, 999)
      ),
      createRouterInstruction(encodePushToken(0, userAddress)),
    ];

    await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 1_500_000 });

    // Verify position created
    const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
    const usdcVault = await ethers.getContractAt("IEulerVault", borrowVault);

    const userCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(userAddress));
    const userDebt = await usdcVault.debtOf(userAddress);

    console.log("\n=== Initial Euler Position Created ===");
    console.log(`Collateral: ${ethers.formatEther(userCollateral)} wstETH`);
    console.log(`Debt: ${ethers.formatUnits(userDebt, 6)} USDC`);

    // Deploy KapanCowAdapter
    const CowAdapterFactory = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapterFactory.deploy(
      COW_PROTOCOL.flashLoanRouter,
      await owner.getAddress(),
    );
    adapterAddress = await cowAdapter.getAddress();
    await cowAdapter.setMorphoLender(MORPHO_BLUE, true);

    // Deploy KapanConditionalOrderManager
    const OrderManagerFactory = await ethers.getContractFactory("KapanConditionalOrderManager");
    orderManager = await OrderManagerFactory.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline,
    );
    orderManagerAddress = await orderManager.getAddress();

    // Deploy KapanConditionalOrderHandler
    const OrderHandlerFactory = await ethers.getContractFactory("KapanConditionalOrderHandler");
    orderHandler = await OrderHandlerFactory.deploy(orderManagerAddress);
    orderHandlerAddress = await orderHandler.getAddress();
    await orderManager.setOrderHandler(orderHandlerAddress);

    // Router setup
    await router.setApprovedManager(orderManagerAddress, true);
    await router.connect(user).setDelegate(orderManagerAddress, true);

    // Make owner a solver
    await becomeSolver(await owner.getAddress());

    console.log("\n=== Contracts Deployed ===");
    console.log(`Router: ${routerAddress}`);
    console.log(`OrderManager: ${orderManagerAddress}`);
    console.log(`CowAdapter: ${adapterAddress}`);
    console.log(`EulerGateway: ${eulerGatewayAddress}`);
    console.log(`User: ${userAddress}`);
  });

  function buildHookCalldata(target: string, fnName: string, args: unknown[]): string {
    const orderManagerIface = new ethers.Interface([
      "function executePreHookBySalt(address user, bytes32 salt) external",
      "function executePostHookBySalt(address user, bytes32 salt) external",
    ]);
    const innerCalldata = orderManagerIface.encodeFunctionData(fnName, args);
    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
      target,
      callData: innerCalldata,
      gasLimit: 3000000n,
    }]]);
  }

  function buildAdapterFundHookCalldata(userAddr: string, salt: string, token: string, recipient: string): string {
    const innerCalldata = ADAPTER_IFACE.encodeFunctionData("fundOrderWithBalance", [userAddr, salt, token, recipient]);
    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
      target: adapterAddress,
      callData: innerCalldata,
      gasLimit: 500000n,
    }]]);
  }

  describe("Euler Close With Collateral: Sell wstETH for USDC", () => {
    it("should execute close position via flashLoanAndSettle with REAL frontend instructions", async function () {
      this.timeout(180000);

      /**
       * CLOSE WITH COLLATERAL FLOW (exactly as frontend builds it for Euler):
       *
       * This is a BUY order: We want exact buyAmount (USDC to repay debt)
       * Flash loan: Borrow wstETH (collateral token)
       * Swap: Sell wstETH -> Buy USDC (exact buyAmount)
       *
       * Post-hook (Manager prepends):
       * - UTXO[0] = ToOutput(actualSellAmount, wstETH) - what we sold
       * - UTXO[1] = ToOutput(actualBuyAmount, USDC) - what we received
       *
       * User post-instructions (exactly as frontend encodes in useClosePositionConfig.tsx lines 607-661):
       * [0] Approve(input=1, euler) -> allows gateway to use USDC for repayment
       * [1] Repay(USDC, input=1, context=eulerContext) -> repay user's debt
       * [2] WithdrawCollateral(wstETH, input=0, context=eulerContext) -> withdraw collateral equal to actualSellAmount
       * [3] PushToken(UTXO[4], orderManager) -> send withdrawn collateral to manager for flash loan repayment
       *
       * CRITICAL: No PullToken needed! Manager transfers buyToken (USDC) to router via safeTransfer,
       * so UTXO[1] is already available in the router at the start of post-hook execution.
       */

      // Calculate amounts based on current wstETH price (~$3700)
      // To repay 1000 USDC debt, we need roughly 0.27 wstETH
      const buyAmount = CLOSE_AMOUNT; // 1000 USDC (exact debt to repay)
      const sellAmount = ethers.parseEther("0.3"); // ~0.3 wstETH (with buffer for price and slippage)

      console.log("\n=== Close With Collateral Configuration ===");
      console.log(`Selling: ${ethers.formatEther(sellAmount)} wstETH (collateral)`);
      console.log(`Buying: ${ethers.formatUnits(buyAmount, 6)} USDC (to repay debt)`);

      // ============ BUILD POST-INSTRUCTIONS (EXACTLY AS FRONTEND DOES) ============
      // This matches useClosePositionConfig.tsx lines 607-661 for Euler

      const normalizedProtocol = "euler";
      const subAccountIndex = getUserMainAccountIndex(userAddress);
      const borrowVault = ARB_EULER_VAULTS.USDC.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const protocolContext = encodeEulerContext(borrowVault, collateralVault, subAccountIndex);

      const postInstructions = [
        // [0] Approve UTXO[1] (USDC received from swap) for repayment -> UTXO[2]
        // Frontend: postInstructions.push(createRouterInstruction(encodeApprove(1, normalizedProtocol)));
        createRouterInstruction(encodeApprove(1, normalizedProtocol)),

        // [1] Repay debt using UTXO[1] (USDC already in router) -> UTXO[3] (repay refund)
        // Frontend: postInstructions.push(createProtocolInstruction(...encodeLendingInstruction(LendingOp.Repay, debtToken, userAddress, 0n, context, 1)))
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, protocolContext, 1)
        ),

        // [2] Withdraw collateral using UTXO[0] (actualSellAmount) -> UTXO[4] (withdrawn collateral)
        // Frontend: postInstructions.push(createProtocolInstruction(...encodeLendingInstruction(LendingOp.WithdrawCollateral, collateralToken, userAddress, 0n, context, 0)))
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.WithdrawCollateral, WSTETH, userAddress, 0n, protocolContext, 0)
        ),

        // [3] Push withdrawn collateral (UTXO[4]) to OrderManager for flash loan repayment
        // Frontend: postInstructions.push(createRouterInstruction(encodePushToken(withdrawUtxo, conditionalOrderManagerAddress)))
        // withdrawUtxo = 4 (as calculated in frontend)
        createRouterInstruction(encodePushToken(4, orderManagerAddress)),
      ];

      console.log("\n=== Post-Instructions (Frontend Format) ===");
      postInstructions.forEach((inst, i) => {
        console.log(`  [${i}] ${inst.protocolName}: ${inst.data.slice(0, 66)}...`);
      });

      // ============ CREATE CONDITIONAL ORDER ============
      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-close-with-collateral-euler-test"));
      const salt = ethers.keccak256(ethers.toUtf8Bytes("close-pos-euler-" + Date.now()));

      // Deploy LimitPriceTrigger (same as production)
      const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
      const viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());

      // Set up Euler gateway in view router
      const EulerGatewayViewFactory = await ethers.getContractFactory("EulerGatewayView");
      const eulerGatewayView = await EulerGatewayViewFactory.deploy(EVC_ADDRESS);
      await viewRouter.setGateway("euler", await eulerGatewayView.getAddress());

      const LimitPriceTriggerFactory = await ethers.getContractFactory("LimitPriceTrigger");
      const limitPriceTrigger = await LimitPriceTriggerFactory.deploy(await viewRouter.getAddress());

      // Use CONTRACT's encodeTriggerParams function - EXACTLY as frontend does
      // For BUY order: limitPrice = (buyAmount / sellAmount) * 1e8
      // wstETH at $3700, USDC at $1: 1000 USDC / 0.27 wstETH ~ 3700 USDC/wstETH
      // Setting limitPrice lower to ensure trigger fires (we're buying USDC)
      const limitPrice = 350000000000n; // 3500 * 1e8 - price threshold for wstETH/USDC

      const triggerStaticData = await limitPriceTrigger.encodeTriggerParams({
        protocolId: EULER_ID,
        protocolContext: protocolContext,
        sellToken: WSTETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice, // Price threshold (8 decimals)
        triggerAbovePrice: true, // Trigger when price >= limit (for selling collateral)
        totalSellAmount: sellAmount, // Max amount willing to sell
        totalBuyAmount: buyAmount, // Exact amount to buy (debt to repay)
        numChunks: 1, // Single execution
        maxSlippageBps: 500, // 5% slippage
        isKindBuy: true, // BUY order: exact buyAmount, max sellAmount
      });

      const orderParams = {
        user: userAddress,
        trigger: await limitPriceTrigger.getAddress(),
        triggerStaticData,
        preInstructions: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [[]] // Empty pre-instructions
        ),
        sellToken: WSTETH,
        buyToken: USDC,
        postInstructions: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))]
        ),
        appDataHash,
        maxIterations: 1,
        sellTokenRefundAddress: adapterAddress, // Refund leftover wstETH to adapter for flash loan repayment
        isKindBuy: true, // BUY order: exact buyAmount (USDC for repaying debt), max sellAmount (wstETH)
      };

      const createTx = await orderManager.connect(user).createOrder(orderParams, salt);
      const receipt = await createTx.wait();

      const event = receipt?.logs.find((log: unknown) => {
        try {
          return orderManager.interface.parseLog(log as { topics: string[]; data: string })?.name === "ConditionalOrderCreated";
        } catch {
          return false;
        }
      });
      const orderHash = orderManager.interface.parseLog(event as { topics: string[]; data: string })?.args[0];
      console.log(`\nOrder created: ${orderHash}`);

      // ============ GET ACTUAL AMOUNTS FROM TRIGGER ============
      const triggerContractForAmounts = await ethers.getContractAt(
        [
          "function calculateExecution(bytes calldata staticData, address owner, uint256 iterationCount) external pure returns (uint256 sellAmount, uint256 buyAmount)",
        ],
        await limitPriceTrigger.getAddress(),
      );
      const [triggerSellAmount, triggerBuyAmount] = await triggerContractForAmounts.calculateExecution(
        triggerStaticData,
        userAddress,
        0,
      );
      console.log(`\nUsing trigger-calculated amounts for trade:`);
      console.log(`  sellAmount: ${ethers.formatEther(triggerSellAmount)} wstETH`);
      console.log(`  buyAmount: ${ethers.formatUnits(triggerBuyAmount, 6)} USDC`);

      // ============ BUILD GPV2 ORDER ============
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: WSTETH,
        buyToken: USDC,
        receiver: orderManagerAddress,
        sellAmount: triggerSellAmount,
        buyAmount: triggerBuyAmount,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        kind: GPV2_ORDER.KIND_BUY, // BUY order - exact buyAmount
        partiallyFillable: false,
        sellTokenBalance: GPV2_ORDER.BALANCE_ERC20,
        buyTokenBalance: GPV2_ORDER.BALANCE_ERC20,
      };

      const trade = {
        sellTokenIndex: 0,
        buyTokenIndex: 1,
        receiver: orderManagerAddress,
        sellAmount: triggerSellAmount,
        buyAmount: triggerBuyAmount,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.BUY_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: triggerBuyAmount, // For BUY orders, this is the buy amount
        signature: buildTradeSignature(orderManagerAddress, gpv2Order, orderHandlerAddress, salt, orderHash),
      };

      // ============ BUILD SETTLEMENT INTERACTIONS ============
      // Pre-hook 1: Adapter funds order with flash loaned wstETH
      const preHook1 = buildAdapterFundHookCalldata(userAddress, salt, WSTETH, orderManagerAddress);

      // Pre-hook 2: Execute pre-hook (empty for close position, but sets up state)
      const preHook2 = buildHookCalldata(orderManagerAddress, "executePreHookBySalt", [userAddress, salt]);

      // Post-hook: Execute post-hook (repay debt + withdraw collateral)
      const postHook = buildHookCalldata(orderManagerAddress, "executePostHookBySalt", [userAddress, salt]);

      const preInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook1 },
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook2 },
      ];
      const postInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHook },
      ];

      // ============ APPROVE VAULT RELAYER ============
      await orderManager.approveVaultRelayer(WSTETH);

      // ============ FUND SETTLEMENT WITH SOLVER LIQUIDITY (USDC) ============
      // Solver provides USDC to buy the wstETH from the order
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(COW_PROTOCOL.settlement, buyAmount * 2n);
      console.log(`\nFunded settlement with ${ethers.formatUnits(buyAmount * 2n, 6)} USDC (solver liquidity)`);

      // ============ RECORD STATE BEFORE ============
      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const usdcVault = await ethers.getContractAt("IEulerVault", borrowVault);

      const collateralBefore = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(userAddress));
      const debtBefore = await usdcVault.debtOf(userAddress);

      console.log("\n=== Before Settlement ===");
      console.log(`Collateral: ${ethers.formatEther(collateralBefore)} wstETH`);
      console.log(`Debt: ${ethers.formatUnits(debtBefore, 6)} USDC`);

      // ============ BUILD FLASH LOAN CONFIG ============
      // Flash loan the exact amount of collateral that will be sold
      const loans = [{
        amount: triggerSellAmount,
        borrower: adapterAddress,
        lender: MORPHO_BLUE,
        token: WSTETH,
      }];

      console.log("\n=== Flash Loan Config ===");
      console.log(`Lender: Morpho Blue (0% fee)`);
      console.log(`Token: wstETH`);
      console.log(`Amount: ${ethers.formatEther(triggerSellAmount)}`);

      // Build settlement calldata
      const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
        [WSTETH, USDC],
        [triggerBuyAmount, triggerSellAmount], // Clearing prices
        [trade],
        [preInteractions, [], postInteractions],
      ]);

      // ============ EXECUTE FLASH LOAN AND SETTLE ============
      console.log("\n=== Executing flashLoanAndSettle ===");

      try {
        const settleTx = await flashLoanRouter.connect(owner).flashLoanAndSettle(
          loans,
          settlementCalldata,
          { gasLimit: 8000000 },
        );
        const settleReceipt = await settleTx.wait();
        console.log(`Gas used: ${settleReceipt.gasUsed}`);
        console.log("\nflashLoanAndSettle SUCCEEDED!");
      } catch (error: unknown) {
        console.log(`\nflashLoanAndSettle FAILED!`);
        console.log(`Error: ${(error as Error).message}`);

        // Debug info
        const adapterWstethBalance = await wsteth.balanceOf(adapterAddress);
        const orderManagerWsteth = await wsteth.balanceOf(orderManagerAddress);
        const orderManagerUsdc = await usdc.balanceOf(orderManagerAddress);
        console.log(`\nDebug balances after failure:`);
        console.log(`  Adapter wstETH: ${ethers.formatEther(adapterWstethBalance)}`);
        console.log(`  OrderManager wstETH: ${ethers.formatEther(orderManagerWsteth)}`);
        console.log(`  OrderManager USDC: ${ethers.formatUnits(orderManagerUsdc, 6)}`);

        throw error;
      }

      // ============ VERIFY RESULTS ============
      const collateralAfter = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(userAddress));
      const debtAfter = await usdcVault.debtOf(userAddress);

      console.log("\n=== After Settlement ===");
      console.log(`Collateral: ${ethers.formatEther(collateralAfter)} wstETH (was ${ethers.formatEther(collateralBefore)})`);
      console.log(`Debt: ${ethers.formatUnits(debtAfter, 6)} USDC (was ${ethers.formatUnits(debtBefore, 6)})`);

      // Verify debt was repaid
      expect(debtAfter).to.be.lt(debtBefore, "Debt should decrease");
      const debtRepaid = debtBefore - debtAfter;
      console.log(`\nDebt repaid: ${ethers.formatUnits(debtRepaid, 6)} USDC`);
      // Allow some variance for interest accrual
      expect(debtRepaid).to.be.closeTo(buyAmount, buyAmount / 100n, "Debt repaid should match buy amount");

      // Verify collateral was withdrawn
      const collateralReduction = collateralBefore - collateralAfter;
      console.log(`Collateral withdrawn: ${ethers.formatEther(collateralReduction)} wstETH`);
      expect(collateralReduction).to.be.closeTo(triggerSellAmount, triggerSellAmount / 100n, "Collateral reduction should match sell amount");

      // Verify order completed
      const order = await orderManager.getOrder(orderHash);
      expect(order.status).to.equal(2, "Order should be completed");
      console.log(`Order status: Completed`);

      // Verify adapter has no leftover tokens (flash loan fully repaid)
      const adapterWstethBalance = await wsteth.balanceOf(adapterAddress);
      expect(adapterWstethBalance).to.be.lt(ethers.parseEther("0.001"), "Adapter should have minimal wstETH dust");
      console.log(`Flash loan repaid (adapter wstETH: ${ethers.formatEther(adapterWstethBalance)})`);

      // Verify no tokens stuck in OrderManager
      const omWsteth = await wsteth.balanceOf(orderManagerAddress);
      const omUsdc = await usdc.balanceOf(orderManagerAddress);
      expect(omWsteth).to.be.lt(ethers.parseEther("0.001"), "OrderManager should have minimal wstETH");
      expect(omUsdc).to.be.lt(1_000000n, "OrderManager should have minimal USDC");
      console.log(`No tokens stuck in OrderManager`);

      console.log("\n=== Close With Collateral Conditional Order Test PASSED ===");
      console.log("Full flow executed:");
      console.log("  1. Flash loan: Borrowed wstETH from Morpho");
      console.log("  2. Pre-hook: Moved wstETH to OrderManager");
      console.log("  3. Swap: Sold wstETH for USDC");
      console.log("  4. Post-hook: Repaid USDC debt to Euler, withdrew wstETH collateral");
      console.log("  5. Flash loan repaid via sellTokenRefundAddress + withdrawn collateral");
    });
  });
});
