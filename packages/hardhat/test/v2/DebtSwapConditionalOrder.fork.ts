/**
 * Fork Tests for Debt Swap Conditional Orders
 *
 * These tests verify the EXACT same instruction flow that the frontend generates,
 * executed through the real CoW Protocol FlashLoanRouter.
 *
 * Flow being tested (for Aave/standard protocols):
 * 1. User has position: collateral (wstETH) + debt (USDC)
 * 2. User wants to swap debt from USDC to USDT
 * 3. Flash loan USDT (new debt) → sell in swap → receive USDC (old debt)
 * 4. Post-hook: Approve + Repay USDC debt + Borrow USDT to repay flash loan
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/DebtSwapConditionalOrder.fork.ts
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
const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";
const USDC_WHALE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const AAVE_DATA_PROVIDER = "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654";

// Morpho Blue on Arbitrum (0% fee flash loans)
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

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

describe("Debt Swap Conditional Order - Full Flow (Fork)", function () {
  before(async function () {
    const net = await ethers.provider.getNetwork();
    const chainId = Number(net.chainId);
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping - requires Arbitrum fork (got chainId ${chainId})`);
      this.skip();
    }
  });

  // Test amounts
  const COLLATERAL_AMOUNT = ethers.parseEther("5"); // 5 wstETH
  const BORROW_AMOUNT = 5000_000000n; // 5000 USDC debt
  const SWAP_AMOUNT = 1000_000000n; // Swap 1000 USDC worth of debt

  let orderManager: Contract;
  let orderHandler: Contract;
  let cowAdapter: Contract;
  let router: Contract;
  let aaveGateway: Contract;
  let owner: Signer;
  let user: Signer;
  let userAddress: string;
  let orderManagerAddress: string;
  let orderHandlerAddress: string;
  let adapterAddress: string;
  let routerAddress: string;
  let wsteth: Contract;
  let usdc: Contract;
  let usdt: Contract;
  let pool: Contract;
  let settlement: Contract;
  let flashLoanRouter: Contract;

  const erc20Abi = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ];

  before(async function () {
    [owner] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Fund user with ETH
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);

    // Get token contracts
    wsteth = await ethers.getContractAt(erc20Abi, WSTETH);
    usdc = await ethers.getContractAt(erc20Abi, USDC);
    usdt = await ethers.getContractAt(erc20Abi, USDT);

    // Get wstETH from whale for collateral
    await impersonateAndFund(WSTETH_WHALE);
    const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
    await wsteth.connect(wstethWhale).transfer(userAddress, COLLATERAL_AMOUNT);

    // Get Aave pool
    const poolProvider = await ethers.getContractAt(
      ["function getPool() view returns (address)"],
      AAVE_POOL_ADDRESSES_PROVIDER,
    );
    const poolAddress = await poolProvider.getPool();
    pool = await ethers.getContractAt(
      [
        "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
        "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
        "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)",
      ],
      poolAddress,
    );

    // Create Aave position: supply wstETH, borrow USDC
    await wsteth.connect(user).approve(poolAddress, COLLATERAL_AMOUNT);
    await pool.connect(user).supply(WSTETH, COLLATERAL_AMOUNT, userAddress, 0);
    await pool.connect(user).borrow(USDC, BORROW_AMOUNT, 2, 0, userAddress); // Variable rate

    console.log("\n=== Initial Aave Position Created ===");
    console.log(`Collateral: ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH`);
    console.log(`Debt: ${ethers.formatUnits(BORROW_AMOUNT, 6)} USDC`);

    // Get CoW Protocol contracts
    settlement = await getSettlement();
    flashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, COW_PROTOCOL.flashLoanRouter);

    // Deploy KapanRouter
    const deployed = await deployRouterWithAuthHelper(ethers, await owner.getAddress());
    router = deployed.router;
    routerAddress = deployed.routerAddress;
    const { syncGateway } = deployed;

    // Deploy Aave gateway
    const AaveGatewayFactory = await ethers.getContractFactory("AaveGatewayWrite");
    aaveGateway = await AaveGatewayFactory.deploy(routerAddress, AAVE_POOL_ADDRESSES_PROVIDER, 0);
    await router.addGateway("aave", await aaveGateway.getAddress());
    await syncGateway("aave", await aaveGateway.getAddress());

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

    // User approves variable debt token for credit delegation to gateway
    const dataProvider = await ethers.getContractAt(
      ["function getReserveTokensAddresses(address) view returns (address aToken, address stableDebt, address variableDebt)"],
      AAVE_DATA_PROVIDER,
    );
    const [, , variableDebtUsdt] = await dataProvider.getReserveTokensAddresses(USDT);

    const debtTokenAbi = ["function approveDelegation(address delegatee, uint256 amount)"];
    const vDebtUsdt = await ethers.getContractAt(debtTokenAbi, variableDebtUsdt);

    // Delegate borrowing power to gateway for new debt token
    await vDebtUsdt.connect(user).approveDelegation(await aaveGateway.getAddress(), ethers.MaxUint256);

    // Make owner a solver
    await becomeSolver(await owner.getAddress());

    console.log("\n=== Contracts Deployed ===");
    console.log(`Router: ${routerAddress}`);
    console.log(`OrderManager: ${orderManagerAddress}`);
    console.log(`CowAdapter: ${adapterAddress}`);
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

  describe("Aave Debt Swap: USDC → USDT", () => {
    it("should execute debt swap via flashLoanAndSettle with REAL frontend instructions", async function () {
      this.timeout(180000);

      /**
       * DEBT SWAP FLOW (exactly as frontend builds it):
       *
       * Flash loan: Borrow USDT (new debt token)
       * Swap: Sell USDT → Buy USDC
       *
       * Post-hook (Manager prepends):
       * - UTXO[0] = ToOutput(actualSellAmount, USDT) - what we sold
       * - UTXO[1] = ToOutput(actualBuyAmount, USDC) - what we received
       *
       * User post-instructions (exactly as frontend encodes):
       * [0] Approve(input=1, aave) → allows gateway to use USDC
       * [1] Repay(USDC, input=1, context=0x) → repay old USDC debt
       * [2] Borrow(USDT, input=0, context=0x) → borrow USDT to repay flash loan
       */

      // Calculate amounts
      // We want to repay 1000 USDC of debt, so we need to buy 1000 USDC
      // We'll sell enough USDT to get 1000 USDC (approximately 1:1 for stablecoins)
      const buyAmount = SWAP_AMOUNT; // 1000 USDC (6 decimals)
      const sellAmount = SWAP_AMOUNT; // 1000 USDT (6 decimals) - roughly 1:1

      console.log("\n=== Debt Swap Configuration ===");
      console.log(`Selling: ${ethers.formatUnits(sellAmount, 6)} USDT (new debt)`);
      console.log(`Buying: ${ethers.formatUnits(buyAmount, 6)} USDC (to repay old debt)`);

      // ============ BUILD POST-INSTRUCTIONS (EXACTLY AS FRONTEND DOES) ============
      // This is the critical part - must match useDebtSwapConfig.tsx exactly

      const normalizedProtocol = "aave"; // normalizeProtocolName("Aave V3") returns "aave"
      const protocolContext = "0x"; // Aave uses empty context

      const postInstructions = [
        // [0] Approve UTXO[1] (USDC received) for repayment → UTXO[2]
        createRouterInstruction(encodeApprove(1, normalizedProtocol)),

        // [1] Repay USDC debt using UTXO[1] → UTXO[3]
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, protocolContext, 1)
        ),

        // [2] Borrow USDT to repay flash loan using UTXO[0] (sellAmount) → UTXO[4]
        createProtocolInstruction(
          normalizedProtocol,
          encodeLendingInstruction(LendingOp.Borrow, USDT, userAddress, 0n, protocolContext, 0)
        ),

        // [3] Push borrowed USDT (UTXO[4]) to OrderManager so sellTokenRefundAddress can send to adapter
        // Without this, borrowed USDT stays stuck in the router!
        createRouterInstruction(encodePushToken(4, orderManagerAddress)),
      ];

      console.log("\n=== Post-Instructions (Frontend Format) ===");
      postInstructions.forEach((inst, i) => {
        console.log(`  [${i}] ${inst.protocolName}: ${inst.data.slice(0, 66)}...`);
      });

      // ============ CREATE CONDITIONAL ORDER ============
      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-debt-swap-test"));
      const salt = ethers.keccak256(ethers.toUtf8Bytes("debt-swap-" + Date.now()));

      // Deploy LimitPriceTrigger (same as production)
      const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
      const viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());
      const LimitPriceTriggerFactory = await ethers.getContractFactory("LimitPriceTrigger");
      const limitPriceTrigger = await LimitPriceTriggerFactory.deploy(await viewRouter.getAddress());

      // Use CONTRACT's encodeTriggerParams function - EXACTLY as frontend does
      // This ensures encoding matches what the contract expects
      //
      // For BUY order: limitPrice = (buyAmount / sellAmount) * 1e8 represents max price willing to pay
      // For stablecoins USDT/USDC at 1:1: limitPrice = 1e8
      // Setting it slightly higher (1.05e8) to allow for slippage
      const limitPrice = 105_000_000n; // 1.05 * 1e8 - willing to pay up to 1.05 USDT per USDC

      const triggerStaticData = await limitPriceTrigger.encodeTriggerParams({
        protocolId: ethers.keccak256(ethers.toUtf8Bytes("aave-v3")).slice(0, 10) as `0x${string}`,
        protocolContext: "0x",
        sellToken: USDT,
        buyToken: USDC,
        sellDecimals: 6,
        buyDecimals: 6,
        limitPrice, // Price threshold (8 decimals, like Chainlink)
        triggerAbovePrice: false,
        totalSellAmount: sellAmount,
        totalBuyAmount: buyAmount,
        numChunks: 1,
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
        sellToken: USDT,
        buyToken: USDC,
        postInstructions: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))]
        ),
        appDataHash,
        maxIterations: 1,
        sellTokenRefundAddress: adapterAddress, // Refund leftover USDT to adapter for flash loan repayment
        isKindBuy: true, // BUY order: exact buyAmount (USDC for repaying debt), max sellAmount (USDT)
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
      // The trigger calculates the actual amounts based on limit price and slippage
      // We must use these amounts in the trade to match what getTradeableOrderWithSignature returns
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
      console.log(`  sellAmount: ${ethers.formatUnits(triggerSellAmount, 6)} USDT`);
      console.log(`  buyAmount: ${ethers.formatUnits(triggerBuyAmount, 6)} USDC`);

      // ============ BUILD GPV2 ORDER ============
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: USDT,
        buyToken: USDC,
        receiver: orderManagerAddress,
        sellAmount: triggerSellAmount,  // Use trigger-calculated amount
        buyAmount: triggerBuyAmount,    // Use trigger-calculated amount
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
      // Pre-hook 1: Adapter funds order with flash loaned USDT
      const preHook1 = buildAdapterFundHookCalldata(userAddress, salt, USDT, orderManagerAddress);

      // Pre-hook 2: Execute pre-hook (empty for debt swap, but sets up state)
      const preHook2 = buildHookCalldata(orderManagerAddress, "executePreHookBySalt", [userAddress, salt]);

      // Post-hook: Execute post-hook (repay + borrow)
      const postHook = buildHookCalldata(orderManagerAddress, "executePostHookBySalt", [userAddress, salt]);

      const preInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook1 },
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook2 },
      ];
      const postInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHook },
      ];

      // ============ APPROVE VAULT RELAYER ============
      await orderManager.approveVaultRelayer(USDT);

      // ============ FUND SETTLEMENT WITH SOLVER LIQUIDITY (USDC) ============
      // Solver provides USDC to buy from the order
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(COW_PROTOCOL.settlement, buyAmount * 2n);
      console.log(`\nFunded settlement with ${ethers.formatUnits(buyAmount * 2n, 6)} USDC (solver liquidity)`);

      // ============ RECORD STATE BEFORE ============
      const [collateralBefore, debtBefore] = await pool.getUserAccountData(userAddress);

      // Get individual debt balances
      const dataProvider = await ethers.getContractAt(
        ["function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)"],
        AAVE_DATA_PROVIDER,
      );
      const [, , usdcDebtBefore] = await dataProvider.getUserReserveData(USDC, userAddress);
      const [, , usdtDebtBefore] = await dataProvider.getUserReserveData(USDT, userAddress);

      console.log("\n=== Before Settlement ===");
      console.log(`Total Collateral: $${ethers.formatUnits(collateralBefore, 8)}`);
      console.log(`Total Debt: $${ethers.formatUnits(debtBefore, 8)}`);
      console.log(`USDC Debt: ${ethers.formatUnits(usdcDebtBefore, 6)}`);
      console.log(`USDT Debt: ${ethers.formatUnits(usdtDebtBefore, 6)}`);

      // ============ BUILD FLASH LOAN CONFIG ============
      // Flash loan the exact amount that will be sold in the trade
      const loans = [{
        amount: triggerSellAmount,
        borrower: adapterAddress,
        lender: MORPHO_BLUE,
        token: USDT,
      }];

      console.log("\n=== Flash Loan Config ===");
      console.log(`Lender: Morpho Blue (0% fee)`);
      console.log(`Token: USDT`);
      console.log(`Amount: ${ethers.formatUnits(triggerSellAmount, 6)}`);

      // Build settlement calldata
      // Clearing prices: sellAmount * clearingPrices[0] >= buyAmount * clearingPrices[1]
      // For 1:1 stablecoin swap, we set prices to achieve the desired amounts
      const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
        [USDT, USDC],
        [triggerBuyAmount, triggerSellAmount], // Clearing prices
        [trade],
        [preInteractions, [], postInteractions],
      ]);

      // ============ DEBUG: Verify order is tradeable via ComposableCoW ============
      console.log("\n=== Verifying Order via ComposableCoW ===");
      const composableCoW = await ethers.getContractAt(
        [
          "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof) external view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)",
        ],
        COW_PROTOCOL.composableCoW,
      );

      const cowParams = {
        handler: orderHandlerAddress,
        salt: salt,
        staticData: coder.encode(["bytes32"], [orderHash]),
      };

      try {
        const [freshOrder, sig] = await composableCoW.getTradeableOrderWithSignature(
          orderManagerAddress,
          cowParams,
          "0x",
          [],
        );
        console.log(`Order from ComposableCoW:`);
        console.log(`  sellToken: ${freshOrder.sellToken}`);
        console.log(`  buyToken: ${freshOrder.buyToken}`);
        console.log(`  receiver: ${freshOrder.receiver}`);
        console.log(`  sellAmount: ${ethers.formatUnits(freshOrder.sellAmount, 6)}`);
        console.log(`  buyAmount: ${ethers.formatUnits(freshOrder.buyAmount, 6)}`);
        console.log(`  validTo: ${freshOrder.validTo}`);
        console.log(`  signature length: ${sig.length}`);
      } catch (err: unknown) {
        console.log(`ComposableCoW.getTradeableOrderWithSignature FAILED: ${(err as Error).message}`);
      }

      // ============ DEBUG: Check order amounts from trigger ============
      console.log("\n=== Verifying Order Amounts from Trigger ===");
      const triggerContract = await ethers.getContractAt(
        [
          "function calculateExecution(bytes calldata staticData, address owner, uint256 iterationCount) external pure returns (uint256 sellAmount, uint256 buyAmount)",
          "function decodeTriggerParams(bytes calldata staticData) external pure returns (tuple(bytes4 protocolId, bytes protocolContext, address sellToken, address buyToken, uint8 sellDecimals, uint8 buyDecimals, uint256 limitPrice, bool triggerAbovePrice, uint256 totalSellAmount, uint256 totalBuyAmount, uint8 numChunks, uint256 maxSlippageBps, bool isKindBuy) params)",
        ],
        await limitPriceTrigger.getAddress(),
      );
      const [calcSellAmount, calcBuyAmount] = await triggerContract.calculateExecution(triggerStaticData, userAddress, 0);
      console.log(`Trigger.calculateExecution(iteration=0):`);
      console.log(`  sellAmount: ${ethers.formatUnits(calcSellAmount, 6)} USDT`);
      console.log(`  buyAmount: ${ethers.formatUnits(calcBuyAmount, 6)} USDC`);

      const decodedParams = await triggerContract.decodeTriggerParams(triggerStaticData);
      console.log(`Decoded trigger params:`);
      console.log(`  limitPrice: ${decodedParams.limitPrice}`);
      console.log(`  isKindBuy: ${decodedParams.isKindBuy}`);
      console.log(`  totalSellAmount: ${ethers.formatUnits(decodedParams.totalSellAmount, 6)}`);
      console.log(`  totalBuyAmount: ${ethers.formatUnits(decodedParams.totalBuyAmount, 6)}`);

      // ============ EXECUTE FLASH LOAN AND SETTLE ============
      console.log("\n=== Executing flashLoanAndSettle ===");

      // Debug: Check adapter's allowedLenders
      const adapterContract = await ethers.getContractAt(
        ["function allowedLenders(address) view returns (bool)", "function lenderTypes(address) view returns (uint8)"],
        adapterAddress,
      );
      const morphoAllowed = await adapterContract.allowedLenders(MORPHO_BLUE);
      const morphoType = await adapterContract.lenderTypes(MORPHO_BLUE);
      console.log(`Adapter configuration:`);
      console.log(`  Morpho allowed: ${morphoAllowed}`);
      console.log(`  Morpho lenderType: ${morphoType} (1=Aave, 2=Morpho)`);

      // Debug: Check if owner is authorized solver
      const authenticator = await ethers.getContractAt(
        ["function isSolver(address) view returns (bool)"],
        COW_PROTOCOL.authenticator,
      );
      const ownerAddress = await owner.getAddress();
      const isSolverAuthorized = await authenticator.isSolver(ownerAddress);
      console.log(`Solver authorization:`);
      console.log(`  Owner address: ${ownerAddress}`);
      console.log(`  Is authorized solver: ${isSolverAuthorized}`);

      // Debug: Check OrderManager's USDT balance before
      const orderManagerUsdtBefore = await usdt.balanceOf(orderManagerAddress);
      console.log(`OrderManager USDT before: ${ethers.formatUnits(orderManagerUsdtBefore, 6)}`);

      // Debug: Test Morpho flash loan availability
      console.log(`\nMorpho flash loan test:`);
      console.log(`  Morpho address: ${MORPHO_BLUE}`);
      const morphoUsdtLiquidity = await usdt.balanceOf(MORPHO_BLUE);
      console.log(`  USDT liquidity: ${ethers.formatUnits(morphoUsdtLiquidity, 6)}`);

      // Debug: Test HooksTrampoline can call adapter
      console.log(`\n=== Testing HooksTrampoline → Adapter Flow ===`);

      // Fund adapter with some USDT to test the transfer
      const usdtWhaleAddr = "0xF977814e90dA44bFA03b6295A0616a897441aceC"; // USDT whale
      await impersonateAndFund(usdtWhaleAddr);
      const usdtWhaleSigner = await ethers.getSigner(usdtWhaleAddr);
      await usdt.connect(usdtWhaleSigner).transfer(adapterAddress, 100_000000n); // 100 USDT
      console.log(`Funded adapter with 100 USDT for testing`);

      // Test calling HooksTrampoline.execute directly (impersonating Settlement)
      await impersonateAndFund(COW_PROTOCOL.settlement);
      const settlementSigner = await ethers.getSigner(COW_PROTOCOL.settlement);
      const hooksTrampoline = await ethers.getContractAt(
        HOOKS_TRAMPOLINE_IFACE.fragments.map(f => f.format("full")),
        COW_PROTOCOL.hooksTrampoline,
        settlementSigner,
      );

      const testHookCalldata = ADAPTER_IFACE.encodeFunctionData("fundOrderWithBalance", [
        userAddress,
        salt,
        USDT,
        orderManagerAddress,
      ]);

      try {
        await hooksTrampoline.execute([{
          target: adapterAddress,
          callData: testHookCalldata,
          gasLimit: 500000n,
        }]);
        const adapterBalanceAfter = await usdt.balanceOf(adapterAddress);
        const managerBalanceAfter = await usdt.balanceOf(orderManagerAddress);
        console.log(`✓ HooksTrampoline → adapter.fundOrderWithBalance succeeded!`);
        console.log(`  Adapter USDT after: ${ethers.formatUnits(adapterBalanceAfter, 6)}`);
        console.log(`  OrderManager USDT after: ${ethers.formatUnits(managerBalanceAfter, 6)}`);
      } catch (hookErr: unknown) {
        console.log(`✗ HooksTrampoline test failed: ${(hookErr as Error).message}`);
      }

      // DEBUG: Trace the expected balance flow
      console.log(`\n=== Expected Balance Flow ===`);
      console.log(`1. Morpho flash loans ${ethers.formatUnits(triggerSellAmount, 6)} USDT to adapter`);
      console.log(`2. Pre-hook: adapter.fundOrderWithBalance transfers USDT to OrderManager`);
      console.log(`3. Trade: VaultRelayer pulls ${ethers.formatUnits(triggerSellAmount, 6)} USDT from OrderManager`);
      console.log(`4. Trade: Settlement sends ${ethers.formatUnits(triggerBuyAmount, 6)} USDC to OrderManager`);
      console.log(`5. Post-hook: OrderManager.executePostHookBySalt:`);
      console.log(`   - UTXO[0] = actualSellAmount (USDT sold in trade)`);
      console.log(`   - UTXO[1] = actualBuyAmount (USDC received from trade)`);
      console.log(`   - [0] Approve USDC for gateway`);
      console.log(`   - [1] Repay USDC debt using UTXO[1]`);
      console.log(`   - [2] Borrow USDT using UTXO[0] amount`);
      console.log(`6. Manager refunds remaining sellToken (USDT) to adapter`);
      console.log(`7. Morpho pulls ${ethers.formatUnits(triggerSellAmount, 6)} USDT repayment from adapter`);
      console.log(`\nCRITICAL: Does step 5's Borrow send USDT to router/manager, or to user?`);
      console.log(`If USDT goes to user, adapter won't have enough for step 7!`);

      // Debug: Check order state
      console.log(`\nOrder state check:`);
      const storedOrder = await orderManager.getOrder(orderHash);
      console.log(`  Status: ${storedOrder.status} (1=Active)`);
      console.log(`  Iteration count: ${storedOrder.iterationCount}`);
      console.log(`  User: ${storedOrder.params.user}`);
      console.log(`  SellToken: ${storedOrder.params.sellToken}`);
      console.log(`  BuyToken: ${storedOrder.params.buyToken}`);
      console.log(`  SellTokenRefund: ${storedOrder.params.sellTokenRefundAddress}`);

      try {
        // Try static call first to get better error info
        console.log(`\nAttempting staticCall to flashLoanAndSettle...`);
        try {
          await flashLoanRouter.connect(owner).flashLoanAndSettle.staticCall(
            loans,
            settlementCalldata,
            { gasLimit: 8000000 },
          );
          console.log(`Static call succeeded!`);
        } catch (staticErr: unknown) {
          console.log(`Static call failed: ${(staticErr as Error).message}`);
        }

        const settleTx = await flashLoanRouter.connect(owner).flashLoanAndSettle(
          loans,
          settlementCalldata,
          { gasLimit: 8000000 },
        );
        const settleReceipt = await settleTx.wait();
        console.log(`Gas used: ${settleReceipt.gasUsed}`);
        console.log("\n✅ flashLoanAndSettle SUCCEEDED!");
      } catch (error: unknown) {
        console.log(`\n❌ flashLoanAndSettle FAILED!`);
        console.log(`Error: ${(error as Error).message}`);

        // Debug info
        const adapterUsdtBalance = await usdt.balanceOf(adapterAddress);
        const orderManagerUsdtAfter = await usdt.balanceOf(orderManagerAddress);
        const morphoUsdtBalance = await usdt.balanceOf(MORPHO_BLUE);
        console.log(`\nDebug balances after failure:`);
        console.log(`  Adapter USDT: ${ethers.formatUnits(adapterUsdtBalance, 6)}`);
        console.log(`  OrderManager USDT: ${ethers.formatUnits(orderManagerUsdtAfter, 6)}`);
        console.log(`  Morpho USDT: ${ethers.formatUnits(morphoUsdtBalance, 6)}`);

        // Try to debug the settlement by checking signature verification
        console.log(`\n=== Attempting ERC-1271 signature verification ===`);
        try {
          const orderManagerContract = await ethers.getContractAt(
            ["function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4)"],
            orderManagerAddress,
          );
          const domainSeparator = await settlement.domainSeparator();
          const orderDigest = ethers.keccak256(ethers.concat([
            "0x1901",
            domainSeparator,
            ethers.keccak256(coder.encode(
              ["bytes32", "address", "address", "address", "uint256", "uint256", "uint32", "bytes32", "uint256", "bytes32", "bool", "bytes32", "bytes32"],
              [
                GPV2_ORDER.TYPE_HASH,
                gpv2Order.sellToken,
                gpv2Order.buyToken,
                gpv2Order.receiver,
                gpv2Order.sellAmount,
                gpv2Order.buyAmount,
                gpv2Order.validTo,
                gpv2Order.appData,
                gpv2Order.feeAmount,
                gpv2Order.kind,
                gpv2Order.partiallyFillable,
                gpv2Order.sellTokenBalance,
                gpv2Order.buyTokenBalance,
              ]
            )),
          ]));

          // Extract inner signature (skip first 20 bytes which is owner address)
          const innerSignature = trade.signature.slice(42); // 0x + 40 hex chars = 20 bytes
          const result = await orderManagerContract.isValidSignature(orderDigest, "0x" + innerSignature);
          console.log(`isValidSignature result: ${result}`);
          console.log(`Expected: 0x1626ba7e (ERC1271_MAGIC_VALUE)`);
        } catch (sigErr: unknown) {
          console.log(`isValidSignature error: ${(sigErr as Error).message}`);
        }

        throw error;
      }

      // ============ VERIFY RESULTS ============
      const [collateralAfter, debtAfter] = await pool.getUserAccountData(userAddress);
      const [, , usdcDebtAfter] = await dataProvider.getUserReserveData(USDC, userAddress);
      const [, , usdtDebtAfter] = await dataProvider.getUserReserveData(USDT, userAddress);

      console.log("\n=== After Settlement ===");
      console.log(`Total Collateral: $${ethers.formatUnits(collateralAfter, 8)}`);
      console.log(`Total Debt: $${ethers.formatUnits(debtAfter, 8)}`);
      console.log(`USDC Debt: ${ethers.formatUnits(usdcDebtAfter, 6)} (was ${ethers.formatUnits(usdcDebtBefore, 6)})`);
      console.log(`USDT Debt: ${ethers.formatUnits(usdtDebtAfter, 6)} (was ${ethers.formatUnits(usdtDebtBefore, 6)})`);

      // Verify debt swap occurred
      expect(usdcDebtAfter).to.be.lt(usdcDebtBefore, "USDC debt should decrease");
      const usdcReduction = usdcDebtBefore - usdcDebtAfter;
      expect(usdcReduction).to.be.closeTo(buyAmount, buyAmount / 100n, "USDC reduction should match buy amount");
      console.log(`\n✓ USDC debt reduced by ${ethers.formatUnits(usdcReduction, 6)}`);

      expect(usdtDebtAfter).to.be.gt(usdtDebtBefore, "USDT debt should increase");
      console.log(`✓ USDT debt increased by ${ethers.formatUnits(usdtDebtAfter - usdtDebtBefore, 6)}`);

      // Verify order completed
      const order = await orderManager.getOrder(orderHash);
      expect(order.status).to.equal(2, "Order should be completed");
      console.log(`✓ Order status: Completed`);

      // Verify adapter has the test pre-funding (100 USDT) back plus minimal dust
      // The 100 USDT we funded for hook testing comes back via sellTokenRefundAddress
      const adapterUsdtBalance = await usdt.balanceOf(adapterAddress);
      expect(adapterUsdtBalance).to.be.gte(ethers.parseUnits("99", 6), "Adapter should have ~100 USDT back from test pre-funding");
      expect(adapterUsdtBalance).to.be.lt(ethers.parseUnits("101", 6), "Adapter should have ~100 USDT (not more)");
      console.log(`✓ Flash loan repaid, test pre-funding returned (adapter USDT: ${ethers.formatUnits(adapterUsdtBalance, 6)})`);

      console.log("\n=== Debt Swap Conditional Order Test PASSED ===");
      console.log("Full flow executed:");
      console.log("  1. Flash loan: Borrowed USDT from Morpho");
      console.log("  2. Pre-hook: Moved USDT to OrderManager");
      console.log("  3. Swap: Sold USDT for USDC");
      console.log("  4. Post-hook: Repaid USDC debt, borrowed USDT");
      console.log("  5. Flash loan repaid via sellTokenRefundAddress");
    });
  });
});
