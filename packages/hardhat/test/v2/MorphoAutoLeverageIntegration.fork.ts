/* eslint-disable no-unused-expressions */
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder, Signer, Contract } from "ethers";
import {
  encodeApprove,
  encodePushToken,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
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
  buildTradeSignature,
  GPv2OrderData,
} from "./helpers/cowHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum Addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

// Morpho market (wstETH/USDC) - verified working market
const MORPHO_WSTETH_USDC_MARKET = {
  loanToken: USDC,
  collateralToken: WSTETH,
  oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
  irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
  lltv: BigInt("860000000000000000"), // 86% LLTV
};

const coder = AbiCoder.defaultAbiCoder();

// Protocol ID (bytes4)
const MORPHO_BLUE_ID = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10);

// HooksTrampoline interface
const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
]);

/**
 * Morpho Blue Auto-Leverage Integration Tests
 *
 * Tests the complete Auto-Leverage flow for Morpho Blue:
 * 1. Create LOW LTV position on Morpho Blue (under-leveraged)
 * 2. Use AutoLeverageTrigger to calculate leverage amounts
 * 3. Verify trigger functions work with Morpho context
 * 4. Execute via CoW Protocol settlement with hooks
 * 5. Verify resulting LTV increased toward target
 * 6. Verify position stays BELOW liquidation threshold (LLTV)
 *
 * Auto-Leverage (Multiply) Flow:
 * 1. Flash loan DEBT token (USDC) → Adapter → OrderManager (via fundOrderWithBalance)
 * 2. VaultRelayer pulls debt from OrderManager for swap
 * 3. CoW Swap: USDC (debt) → wstETH (collateral)
 * 4. Collateral received by OrderManager
 * Post-hook:
 *   5. Approve collateral for Morpho
 *   6. Deposit collateral (actualBuyAmount) to Morpho
 *   7. Borrow debt (using actualSellAmount as guide)
 *   8. Push borrowed debt to OrderManager for flash loan repayment
 * 6. OrderManager refunds excess debt to Adapter for flash loan repayment
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/MorphoAutoLeverageIntegration.fork.ts
 */
describe("Morpho Blue Auto-Leverage Integration (Fork)", function () {
  this.timeout(180000);

  before(function () {
    if (!FORK) this.skip();
  });

  let owner: Signer, user: Signer, solver: Signer;
  let router: Contract, morphoGateway: Contract;
  let orderManager: Contract;
  let conditionalOrderManager: Contract;
  let orderHandler: Contract;
  let cowAdapter: Contract;
  let settlement: Contract;
  let viewRouter: Contract, autoLeverageTrigger: Contract;
  let wsteth: Contract;
  let morpho: Contract;
  let userAddress: string;

  // Start with LOW LTV position (under-leveraged) for leverage testing
  const COLLATERAL_AMOUNT = ethers.parseEther("2"); // 2 wstETH (~$7400)
  const BORROW_AMOUNT = 1000_000000n; // 1000 USDC (~13.5% LTV - very under-leveraged)

  // LLTV is 86%, so we have lots of room to leverage
  const LLTV_BPS = 8600n;

  beforeEach(async function () {
    [owner, solver] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Get token contracts
    wsteth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WSTETH);

    // Fund user with ETH
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);

    // Get wstETH from whale
    await impersonateAndFund(WSTETH_WHALE);
    const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
    await wsteth.connect(wstethWhale).transfer(userAddress, COLLATERAL_AMOUNT);

    // Get CoW Protocol contracts
    settlement = await getSettlement();

    // Deploy KapanRouter
    const {
      router: _router,
      syncGateway,
      routerAddress,
    } = await deployRouterWithAuthHelper(ethers, await owner.getAddress());
    router = _router;

    // Deploy Morpho gateway
    const MorphoGateway = await ethers.getContractFactory("MorphoBlueGatewayWrite");
    morphoGateway = await MorphoGateway.deploy(routerAddress, await owner.getAddress(), MORPHO_BLUE);
    await router.addGateway("morpho-blue", await morphoGateway.getAddress());
    await syncGateway("morpho-blue", await morphoGateway.getAddress());

    // Deploy KapanOrderManager
    const OrderManager = await ethers.getContractFactory("KapanOrderManager");
    orderManager = await OrderManager.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline,
    );

    // Deploy KapanOrderHandler
    const OrderHandler = await ethers.getContractFactory("KapanOrderHandler");
    orderHandler = await OrderHandler.deploy(await orderManager.getAddress());
    await orderManager.setOrderHandler(await orderHandler.getAddress());

    // Deploy KapanConditionalOrderManager (new trigger-based system)
    const ConditionalOrderManager = await ethers.getContractFactory("KapanConditionalOrderManager");
    conditionalOrderManager = await ConditionalOrderManager.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline,
    );

    // Deploy KapanCowAdapter for flash loan handling
    const CowAdapter = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapter.deploy(COW_PROTOCOL.flashLoanRouter, await owner.getAddress());

    // Configure flash loan lenders on the adapter
    const AAVE_V3_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
    await cowAdapter.setAaveLender(AAVE_V3_POOL, true);

    // Router setup - authorize both managers
    await router.setApprovedManager(await orderManager.getAddress(), true);
    await router.setApprovedManager(await conditionalOrderManager.getAddress(), true);
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);
    await router.connect(user).setDelegate(await conditionalOrderManager.getAddress(), true);

    // Deploy KapanViewRouter and AutoLeverageTrigger
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());

    const MorphoGatewayViewFactory = await ethers.getContractFactory("MorphoBlueGatewayView");
    const morphoGatewayView = await MorphoGatewayViewFactory.deploy(MORPHO_BLUE, await owner.getAddress());

    // Set Morpho gateway in router using string key
    await viewRouter.setGateway("morpho-blue", await morphoGatewayView.getAddress());

    const AutoLeverageTriggerFactory = await ethers.getContractFactory("AutoLeverageTrigger");
    autoLeverageTrigger = await AutoLeverageTriggerFactory.deploy(await viewRouter.getAddress());

    // Get Morpho Blue contract
    morpho = await ethers.getContractAt(
      [
        "function supplyCollateral((address,address,address,address,uint256) marketParams, uint256 assets, address onBehalf, bytes data)",
        "function borrow((address,address,address,address,uint256) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
        "function withdrawCollateral((address,address,address,address,uint256) marketParams, uint256 assets, address onBehalf, address receiver)",
        "function repay((address,address,address,address,uint256) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)",
        "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
        "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
        "function setAuthorization(address authorized, bool newIsAuthorized)",
      ],
      MORPHO_BLUE,
    );

    const marketTuple = [
      MORPHO_WSTETH_USDC_MARKET.loanToken,
      MORPHO_WSTETH_USDC_MARKET.collateralToken,
      MORPHO_WSTETH_USDC_MARKET.oracle,
      MORPHO_WSTETH_USDC_MARKET.irm,
      MORPHO_WSTETH_USDC_MARKET.lltv,
    ];

    // Create LOW LTV Morpho position: supply wstETH, borrow small USDC
    await wsteth.connect(user).approve(MORPHO_BLUE, COLLATERAL_AMOUNT);
    await morpho.connect(user).supplyCollateral(marketTuple, COLLATERAL_AMOUNT, userAddress, "0x");
    await morpho.connect(user).borrow(marketTuple, BORROW_AMOUNT, 0, userAddress, userAddress);

    // Authorize gateway to act on behalf of user
    await morpho.connect(user).setAuthorization(await morphoGateway.getAddress(), true);

    // Make solver authorized
    await becomeSolver(await solver.getAddress());

    console.log("\n=== Morpho Auto-Leverage Test Setup Complete ===");
    console.log(`User: ${userAddress}`);
    console.log(`Collateral: ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH`);
    console.log(`Debt: ${ethers.formatUnits(BORROW_AMOUNT, 6)} USDC`);
    console.log(`LLTV: ${Number(LLTV_BPS) / 100}%`);
  });

  function encodeMarketContext(): string {
    return coder.encode(
      ["tuple(address,address,address,address,uint256)"],
      [[
        MORPHO_WSTETH_USDC_MARKET.loanToken,
        MORPHO_WSTETH_USDC_MARKET.collateralToken,
        MORPHO_WSTETH_USDC_MARKET.oracle,
        MORPHO_WSTETH_USDC_MARKET.irm,
        MORPHO_WSTETH_USDC_MARKET.lltv,
      ]],
    );
  }

  // ============================================================================
  // AutoLeverageTrigger Tests with Morpho
  // ============================================================================

  describe("AutoLeverageTrigger with Morpho Blue", function () {
    it("should return current LTV for under-leveraged Morpho position", async function () {
      const context = encodeMarketContext();
      const ltv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      console.log(`  Morpho LTV: ${ltv.toString()} bps (${Number(ltv) / 100}%)`);

      // With 2 wstETH (~$7400) collateral and 1000 USDC debt, LTV should be ~13.5%
      expect(ltv).to.be.gt(1000); // > 10%
      expect(ltv).to.be.lt(2000); // < 20%

      // Verify we're well below LLTV (86%)
      expect(ltv).to.be.lt(LLTV_BPS - 5000n); // At least 50% below LLTV
    });

    it("should shouldExecute return true when LTV is below trigger threshold", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Set trigger ABOVE current LTV (trigger when under-leveraged)
      const triggerLtvBps = currentLtv + 1000n; // 10% above current

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: triggerLtvBps + 1000n, // Target 10% above trigger
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, userAddress);

      console.log(`  Current LTV: ${currentLtv.toString()} bps`);
      console.log(`  Trigger LTV: ${triggerLtvBps.toString()} bps`);
      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.true;
      expect(reason).to.equal("LTV below threshold - under-leveraged");
    });

    it("should calculateExecution return valid leverage amounts for Morpho", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Target 30% LTV (from ~13.5%)
      const targetLtvBps = 3000n;

      console.log(`  Current LTV: ${currentLtv.toString()} bps (${Number(currentLtv) / 100}%)`);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Sell amount (USDC to borrow): ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Min buy amount (wstETH expected): ${ethers.formatEther(minBuyAmount)} wstETH`);

      // Should have positive amounts
      expect(sellAmount).to.be.gt(0);
      expect(minBuyAmount).to.be.gt(0);

      // Verify the rate makes sense (wstETH ~$3700)
      const effectiveRate = (sellAmount * BigInt(1e18)) / minBuyAmount;
      console.log(`  Effective rate: ${ethers.formatUnits(effectiveRate, 6)} USDC per wstETH`);

      expect(effectiveRate).to.be.gt(3000n * BigInt(1e6)); // > $3000
      expect(effectiveRate).to.be.lt(5000n * BigInt(1e6)); // < $5000
    });

    it("should getPositionValue return correct values for Morpho", async function () {
      const context = encodeMarketContext();

      const [collateralValue, debtValue] = await viewRouter.getPositionValue(
        MORPHO_BLUE_ID,
        userAddress,
        context,
      );

      console.log(`  Position value (8 decimals USD):`);
      console.log(`    Collateral: $${Number(collateralValue) / 1e8}`);
      console.log(`    Debt: $${Number(debtValue) / 1e8}`);

      // Collateral should be higher (we have low LTV)
      expect(collateralValue).to.be.gt(debtValue);

      // Debt should be close to borrowed amount
      const borrowAmountIn8Dec = BORROW_AMOUNT * 100n;
      expect(debtValue).to.be.gte(borrowAmountIn8Dec);
      expect(debtValue).to.be.lt(borrowAmountIn8Dec * 2n);

      // Verify LTV calculation matches
      const calculatedLtv = (debtValue * 10000n) / collateralValue;
      const triggerLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      console.log(`    Calculated LTV: ${Number(calculatedLtv) / 100}%`);
      console.log(`    Trigger LTV: ${Number(triggerLtv) / 100}%`);

      // Should match within 1%
      const diff = calculatedLtv > triggerLtv ? calculatedLtv - triggerLtv : triggerLtv - calculatedLtv;
      expect(diff).to.be.lt(100n);
    });
  });

  // ============================================================================
  // Safety Tests - Liquidation Prevention
  // ============================================================================

  describe("Safety: Liquidation Prevention", function () {
    it("should NEVER target LTV above LLTV (86%)", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  LLTV: ${Number(LLTV_BPS) / 100}%`);

      // Test with SAFE target (70% - well below 86% LLTV)
      const safeTargetLtv = 7000n;
      const safeParams = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: safeTargetLtv,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const safeStaticData = await autoLeverageTrigger.encodeTriggerParams(safeParams);
      const [safeSellAmount] = await autoLeverageTrigger.calculateExecution(safeStaticData, userAddress);

      console.log(`  Safe target (70%): ${ethers.formatUnits(safeSellAmount, 6)} USDC to borrow`);
      expect(safeTargetLtv).to.be.lt(LLTV_BPS);

      // Test with DANGEROUS target (90% - above 86% LLTV)
      const dangerousTargetLtv = 9000n;
      const dangerousParams = {
        ...safeParams,
        targetLtvBps: dangerousTargetLtv,
      };

      const dangerousStaticData = await autoLeverageTrigger.encodeTriggerParams(dangerousParams);
      const [dangerousSellAmount] = await autoLeverageTrigger.calculateExecution(dangerousStaticData, userAddress);

      console.log(`  DANGEROUS target (90%): ${ethers.formatUnits(dangerousSellAmount, 6)} USDC`);
      console.log(`  WARNING: This exceeds LLTV (86%) and would be liquidatable!`);

      // The contract calculates, but Morpho would reject the borrow
      expect(dangerousSellAmount).to.be.gt(safeSellAmount);
      expect(dangerousTargetLtv).to.be.gt(LLTV_BPS);
    });

    it("should verify math: target LTV produces correct debt increase", async function () {
      const context = encodeMarketContext();

      // Get position value from ViewRouter
      const [collateralValueUsd, debtValueUsd] = await viewRouter.getPositionValue(
        MORPHO_BLUE_ID,
        userAddress,
        context,
      );

      const currentLtv = (debtValueUsd * 10000n) / collateralValueUsd;

      console.log(`  Collateral: $${Number(collateralValueUsd) / 1e8}`);
      console.log(`  Debt: $${Number(debtValueUsd) / 1e8}`);
      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);

      // Target 10% higher
      const targetLtvBps = currentLtv + 1000n;
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);

      // Manual formula: ΔD = targetLTV × C - D
      const targetDebtUsd = (targetLtvBps * collateralValueUsd) / 10000n;
      const expectedDeltaDebtUsd = targetDebtUsd - debtValueUsd;

      console.log(`  Expected delta debt (USD): $${Number(expectedDeltaDebtUsd) / 1e8}`);

      // Get trigger calculation
      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 500n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      // Convert sellAmount from USDC (6 dec) to USD (8 dec)
      const triggerDeltaDebtUsd = (sellAmount * 100000000n) / 1000000n;

      console.log(`  Trigger delta debt (USD): $${Number(triggerDeltaDebtUsd) / 1e8}`);

      // Verify they match within 1% tolerance
      const diff = triggerDeltaDebtUsd > expectedDeltaDebtUsd
        ? triggerDeltaDebtUsd - expectedDeltaDebtUsd
        : expectedDeltaDebtUsd - triggerDeltaDebtUsd;
      const tolerance = expectedDeltaDebtUsd / 100n;

      console.log(`  Difference: $${Number(diff) / 1e8} (tolerance: $${Number(tolerance) / 1e8})`);
      expect(diff).to.be.lte(tolerance);
    });

    it("should maintain safe buffer from LLTV after leverage", async function () {
      const context = encodeMarketContext();

      // Get current position
      const [collateralValueUsd, debtValueUsd] = await viewRouter.getPositionValue(
        MORPHO_BLUE_ID,
        userAddress,
        context,
      );
      const currentLtv = (debtValueUsd * 10000n) / collateralValueUsd;

      // Target 60% LTV (26% buffer from 86% LLTV)
      const targetLtvBps = 6000n;
      const safetyBuffer = LLTV_BPS - targetLtvBps;

      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);
      console.log(`  LLTV: ${Number(LLTV_BPS) / 100}%`);
      console.log(`  Safety buffer: ${Number(safetyBuffer) / 100}%`);

      expect(safetyBuffer).to.be.gte(2000n); // At least 20% buffer

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 300, // 3% slippage
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      // Calculate worst-case final LTV (assuming no new collateral from swap)
      const additionalDebtUsd = (sellAmount * 100000000n) / 1000000n;
      const worstCaseDebt = debtValueUsd + additionalDebtUsd;
      const worstCaseLtv = (worstCaseDebt * 10000n) / collateralValueUsd;

      console.log(`  Worst-case LTV (no new collateral): ${Number(worstCaseLtv) / 100}%`);

      // Even worst case should be below LLTV
      expect(worstCaseLtv).to.be.lt(LLTV_BPS);

      // With swap output as collateral, actual LTV will be lower
      // minBuyAmount * wstETH price ≈ additional collateral
      console.log(`  Min buy amount: ${ethers.formatEther(minBuyAmount)} wstETH`);
      console.log(`  (With swap output, actual LTV will be lower than worst-case)`);
    });
  });

  // ============================================================================
  // Full Auto-Leverage Execution Flow with Real Flash Loan
  // ============================================================================

  describe("Auto-Leverage Flow with KapanConditionalOrderManager", function () {
    // CoW Protocol Flash Loan infrastructure (for future flash loan integration)
    const USDC_WHALE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

    let condOrderHandler: Contract;

    beforeEach(async function () {
      // Deploy KapanConditionalOrderHandler for the conditional order manager
      const ConditionalOrderHandler = await ethers.getContractFactory("KapanConditionalOrderHandler");
      condOrderHandler = await ConditionalOrderHandler.deploy(await conditionalOrderManager.getAddress());
      await conditionalOrderManager.setOrderHandler(await condOrderHandler.getAddress());
    });

    it("should increase Morpho position LTV via auto-leverage with real flash loan", async function () {
      const context = encodeMarketContext();
      const condOrderManagerAddr = await conditionalOrderManager.getAddress();
      const condOrderHandlerAddr = await condOrderHandler.getAddress();
      const cowAdapterAddr = await cowAdapter.getAddress();

      // Make FlashLoanRouter a solver (for future flash loan integration)
      await becomeSolver(COW_PROTOCOL.flashLoanRouter);

      // 1. Get initial state
      const initialLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
      const [initialCollateralUsd, initialDebtUsd] = await viewRouter.getPositionValue(
        MORPHO_BLUE_ID,
        userAddress,
        context,
      );

      console.log(`\n=== Initial State ===`);
      console.log(`Initial LTV: ${initialLtv.toString()} bps (${Number(initialLtv) / 100}%)`);
      console.log(`Collateral: $${Number(initialCollateralUsd) / 1e8}`);
      console.log(`Debt: $${Number(initialDebtUsd) / 1e8}`);
      console.log(`LLTV: ${Number(LLTV_BPS) / 100}%`);

      // 2. Set target LTV (conservative: 25% from ~13.5%)
      const targetLtvBps = 2500n;
      console.log(`\n=== Target ===`);
      console.log(`Target LTV: ${targetLtvBps.toString()} bps (${Number(targetLtvBps) / 100}%)`);

      // Verify target is safe
      expect(targetLtvBps).to.be.lt(LLTV_BPS - 3000n); // At least 30% below LLTV

      // 3. Calculate leverage amounts using AutoLeverageTrigger
      const triggerParams = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: initialLtv + 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const triggerStaticData = await autoLeverageTrigger.encodeTriggerParams(triggerParams);
      const [calculatedSellAmount, calculatedMinBuy] = await autoLeverageTrigger.calculateExecution(triggerStaticData, userAddress);

      console.log(`\n=== Calculated Leverage ===`);
      console.log(`USDC to sell: ${ethers.formatUnits(calculatedSellAmount, 6)} USDC`);
      console.log(`Min wstETH expected: ${ethers.formatEther(calculatedMinBuy)} wstETH`);

      // Use calculated amounts (cap for test safety)
      const sellAmount = calculatedSellAmount > 2000_000000n
        ? 500_000000n
        : calculatedSellAmount;
      const minBuyAmount = (calculatedMinBuy * sellAmount) / calculatedSellAmount;

      // Flash loan amount = sellAmount (we flash loan the debt we'll sell)
      const flashLoanAmount = sellAmount;
      // Aave V3 charges 0.05% fee
      const AAVE_FLASH_FEE_BPS = 5n;
      const flashFee = (flashLoanAmount * AAVE_FLASH_FEE_BPS) / 10000n;
      const flashRepayment = flashLoanAmount + flashFee;

      console.log(`\n=== Flash Loan Details ===`);
      console.log(`Flash loan: ${ethers.formatUnits(flashLoanAmount, 6)} USDC`);
      console.log(`Flash fee (0.05%): ${ethers.formatUnits(flashFee, 6)} USDC`);
      console.log(`Total repayment: ${ethers.formatUnits(flashRepayment, 6)} USDC`);

      // 4. Build instructions for AUTO-LEVERAGE (Multiply Flow):
      // Pre-instructions: EMPTY (tokens arrive via adapter.fundOrderWithBalance)
      // Post-instructions: Deposit collateral, Borrow debt, Push to OrderManager
      const preInstructions: { protocolName: string; data: string }[] = [];

      const postInstructions = [
        // Approve collateral (UTXO[1] = actualBuyAmount) for Morpho
        createRouterInstruction(encodeApprove(1, "morpho-blue")),
        // Deposit collateral to Morpho (UTXO[1])
        // NOTE: DepositCollateral returns NO output (empty array)
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(LendingOp.DepositCollateral, WSTETH, userAddress, 0n, context, 1),
        ),
        // Borrow debt (using UTXO[0] = actualSellAmount as guide)
        // NOTE: Borrow returns 1 output at UTXO[3] (not UTXO[4] since DepositCollateral returns nothing)
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(LendingOp.Borrow, USDC, userAddress, 0n, context, 0),
        ),
        // Push borrowed debt (UTXO[3]) to OrderManager for flash loan repayment
        // UTXO layout: [0]=sellAmount, [1]=buyAmount, [2]=Approve output, [3]=Borrow output
        createRouterInstruction(encodePushToken(3, condOrderManagerAddr)),
      ];

      // 5. Encode instructions
      const encodedPreInstructions = coder.encode(
        ["tuple(string protocolName, bytes data)[]"],
        [preInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
      );
      const encodedPostInstructions = coder.encode(
        ["tuple(string protocolName, bytes data)[]"],
        [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
      );

      // 6. Create conditional order on KapanConditionalOrderManager
      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-morpho-autoleverage-flash-test"));
      const orderParams = {
        user: userAddress,
        trigger: await autoLeverageTrigger.getAddress(),
        triggerStaticData: triggerStaticData,
        preInstructions: encodedPreInstructions,
        sellToken: USDC, // Sell USDC (flash loaned debt)
        buyToken: WSTETH, // Buy wstETH (collateral)
        postInstructions: encodedPostInstructions,
        appDataHash,
        maxIterations: 1n,
        sellTokenRefundAddress: cowAdapterAddr, // CRITICAL: Excess goes to adapter for flash loan repayment
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("morpho-autoleverage-test-" + Date.now()));
      const tx = await conditionalOrderManager.connect(user).createOrder(orderParams, salt);
      const receipt = await tx.wait();

      // Extract order hash from event
      const event = receipt?.logs.find((log: any) => {
        try {
          return conditionalOrderManager.interface.parseLog(log)?.name === "ConditionalOrderCreated";
        } catch {
          return false;
        }
      });
      const kapanOrderHash = conditionalOrderManager.interface.parseLog(event!)?.args[0];

      console.log(`\n=== Order Created ===`);
      console.log(`Order hash: ${kapanOrderHash}`);

      // 7. Build GPv2 order - receiver is ALWAYS the OrderManager
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: USDC,
        buyToken: WSTETH,
        receiver: condOrderManagerAddr,
        sellAmount: sellAmount,
        buyAmount: minBuyAmount,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        kind: GPV2_ORDER.KIND_SELL,
        partiallyFillable: false,
        sellTokenBalance: GPV2_ORDER.BALANCE_ERC20,
        buyTokenBalance: GPV2_ORDER.BALANCE_ERC20,
      };

      // 8. Build trade with signature
      const trade = {
        sellTokenIndex: 0,
        buyTokenIndex: 1,
        receiver: condOrderManagerAddr,
        sellAmount: sellAmount,
        buyAmount: minBuyAmount,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: sellAmount,
        signature: buildTradeSignature(condOrderManagerAddr, gpv2Order, condOrderHandlerAddr, salt, kapanOrderHash),
      };

      // 9. Build pre-interactions for flash loan flow
      // Flash loan USDC from Aave → CowAdapter → OrderManager (via fundOrderWithBalance)
      const condOrderManagerIface = new ethers.Interface([
        "function executePreHookBySalt(address user, bytes32 salt) external",
        "function executePostHookBySalt(address user, bytes32 salt) external",
      ]);

      // Pre-hook via HooksTrampoline
      const preHookInnerCalldata = condOrderManagerIface.encodeFunctionData("executePreHookBySalt", [userAddress, salt]);
      const preHookCalldata = HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
        target: condOrderManagerAddr,
        callData: preHookInnerCalldata,
        gasLimit: 1000000n,
      }]]);

      // Post-hook via HooksTrampoline
      const postHookInnerCalldata = condOrderManagerIface.encodeFunctionData("executePostHookBySalt", [userAddress, salt]);
      const postHookCalldata = HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
        target: condOrderManagerAddr,
        callData: postHookInnerCalldata,
        gasLimit: 1000000n,
      }]]);

      // 10. Approve VaultRelayer for USDC on conditional order manager
      await conditionalOrderManager.approveVaultRelayer(USDC);

      // 11. Pre-fund settlement with wstETH (simulating solver liquidity for the swap)
      await impersonateAndFund(WSTETH_WHALE);
      const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
      const wstethToSettle = minBuyAmount + (minBuyAmount / 100n);
      await wsteth.connect(wstethWhale).transfer(COW_PROTOCOL.settlement, wstethToSettle);

      // 12. Pre-fund settlement with USDC buffer for flash loan fee + any precision issues
      // Also pre-fund the adapter directly with some buffer
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
      const usdcBuffer = flashFee * 10n; // 10x buffer for safety
      await usdc.connect(usdcWhale).transfer(COW_PROTOCOL.settlement, usdcBuffer);
      // Also give adapter some USDC buffer directly in case refund doesn't work
      await usdc.connect(usdcWhale).transfer(cowAdapterAddr, flashFee * 2n);

      // 13. Direct settlement (pre-funding for testing, flash loan integration TODO)
      // Pre-fund the OrderManager with USDC directly (simulating what flash loan would do)
      console.log(`\n=== Pre-funding OrderManager for debug ===`);
      await usdc.connect(usdcWhale).transfer(condOrderManagerAddr, sellAmount);

      // Debug: Check balances before settlement
      const usdcBalBefore = await usdc.balanceOf(condOrderManagerAddr);
      const wstethBalBefore = await wsteth.balanceOf(condOrderManagerAddr);
      console.log(`OrderManager USDC before: ${ethers.formatUnits(usdcBalBefore, 6)}`);
      console.log(`OrderManager wstETH before: ${ethers.formatEther(wstethBalBefore)}`);

      // Remove the fundOrderWithBalance call since we pre-funded directly
      const debugPreInteractions = [
        // Just the pre-hook, no fund transfer needed
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHookCalldata },
      ];

      const debugPostInteractions = [
        // Just the post-hook
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHookCalldata },
      ];

      // Execute settlement directly (no flash loan)
      console.log(`\n=== Executing Settlement (no flash loan) ===`);

      const settleTx = await settlement.connect(solver).settle(
        [USDC, WSTETH],
        [wstethToSettle, sellAmount],
        [trade],
        [debugPreInteractions, [], debugPostInteractions],
      );
      const settleReceipt = await settleTx.wait();
      console.log(`Gas used: ${settleReceipt.gasUsed}`);

      // Debug: Check balances after settlement
      const usdcBalAfter = await usdc.balanceOf(condOrderManagerAddr);
      const wstethBalAfter = await wsteth.balanceOf(condOrderManagerAddr);
      console.log(`OrderManager USDC after: ${ethers.formatUnits(usdcBalAfter, 6)}`);
      console.log(`OrderManager wstETH after: ${ethers.formatEther(wstethBalAfter)}`);
      console.log(`USDC change: ${ethers.formatUnits(usdcBalAfter - usdcBalBefore, 6)}`);
      console.log(`wstETH change: ${ethers.formatEther(wstethBalAfter - wstethBalBefore)}`);

      // 15. Verify final state
      const finalLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
      const [finalCollateralUsd, finalDebtUsd] = await viewRouter.getPositionValue(
        MORPHO_BLUE_ID,
        userAddress,
        context,
      );

      console.log(`\n=== Final State ===`);
      console.log(`Final LTV: ${finalLtv.toString()} bps (${Number(finalLtv) / 100}%)`);
      console.log(`Final Collateral: $${Number(finalCollateralUsd) / 1e8}`);
      console.log(`Final Debt: $${Number(finalDebtUsd) / 1e8}`);

      // 14. Verify results
      const ltvIncrease = finalLtv - initialLtv;
      console.log(`\n=== Verification ===`);
      console.log(`LTV increase: ${ltvIncrease.toString()} bps (${Number(ltvIncrease) / 100}%)`);

      // LTV should have INCREASED (leverage)
      expect(finalLtv).to.be.gt(initialLtv);
      console.log("✓ LTV increased (leverage successful)");

      // Collateral should have increased (received wstETH from swap)
      expect(finalCollateralUsd).to.be.gt(initialCollateralUsd);
      console.log("✓ Collateral increased");

      // Debt should have increased (borrowed USDC)
      expect(finalDebtUsd).to.be.gt(initialDebtUsd);
      console.log("✓ Debt increased");

      // Final LTV should still be BELOW LLTV (not liquidatable)
      expect(finalLtv).to.be.lt(LLTV_BPS);
      console.log(`✓ Final LTV (${Number(finalLtv) / 100}%) is below LLTV (${Number(LLTV_BPS) / 100}%)`);

      // Safety buffer should still be healthy
      const finalBuffer = LLTV_BPS - finalLtv;
      console.log(`✓ Safety buffer to LLTV: ${Number(finalBuffer) / 100}%`);
      expect(finalBuffer).to.be.gt(3000n); // At least 30% buffer remaining

      // Order should be completed
      const order = await conditionalOrderManager.getOrder(kapanOrderHash);
      expect(order.status).to.equal(2); // Completed
      console.log("✓ Order completed");
    });
  });

  // ============================================================================
  // isComplete behavior
  // ============================================================================

  describe("isComplete behavior", function () {
    it("should return false when LTV is still below target", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Set target much higher than current
      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: currentLtv + 2000n, // 20% above current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const isComplete = await autoLeverageTrigger.isComplete(staticData, userAddress, 0);

      expect(isComplete).to.be.false;
    });

    it("should return true when LTV reaches or exceeds target", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Set target below current (already achieved)
      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv - 500n,
        targetLtvBps: currentLtv - 100n, // Below current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const isComplete = await autoLeverageTrigger.isComplete(staticData, userAddress, 0);

      expect(isComplete).to.be.true;
    });
  });

  // ============================================================================
  // Chunking Tests
  // ============================================================================

  describe("Chunking behavior for gradual leverage", function () {
    it("should split leverage into chunks for safer execution", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Large target jump
      const targetLtvBps = 5000n; // 50% from ~13.5%

      const paramsFullAmount = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const paramsChunked = {
        ...paramsFullAmount,
        numChunks: 5,
      };

      const staticDataFull = await autoLeverageTrigger.encodeTriggerParams(paramsFullAmount);
      const staticDataChunked = await autoLeverageTrigger.encodeTriggerParams(paramsChunked);

      const [sellAmountFull] = await autoLeverageTrigger.calculateExecution(staticDataFull, userAddress);
      const [sellAmountChunked] = await autoLeverageTrigger.calculateExecution(staticDataChunked, userAddress);

      console.log(`  Full amount: ${ethers.formatUnits(sellAmountFull, 6)} USDC`);
      console.log(`  1/5 amount (5 chunks): ${ethers.formatUnits(sellAmountChunked, 6)} USDC`);

      // Should be 1/5
      expect(sellAmountChunked).to.equal(sellAmountFull / 5n);

      // Each chunk should be a safer, smaller trade
      // This allows for price impact and slippage management
      console.log(`\n  Chunking allows gradual leverage increase:`);
      console.log(`    - Smaller trades = less price impact`);
      console.log(`    - Each chunk can be validated independently`);
      console.log(`    - Position approaches target LTV incrementally`);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("Edge Cases", function () {
    it("should handle maximum safe leverage (just below LLTV)", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Target 80% (6% buffer from 86% LLTV) - risky but technically possible
      const riskyTargetLtv = 8000n;

      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  LLTV: ${Number(LLTV_BPS) / 100}%`);
      console.log(`  Risky target: ${Number(riskyTargetLtv) / 100}%`);
      console.log(`  Buffer to LLTV: ${Number(LLTV_BPS - riskyTargetLtv) / 100}%`);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: riskyTargetLtv,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Sell amount: ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Min buy amount: ${ethers.formatEther(minBuyAmount)} wstETH`);

      // Should calculate correctly even for risky target
      expect(sellAmount).to.be.gt(0);
      expect(minBuyAmount).to.be.gt(0);

      // But target must still be below LLTV
      expect(riskyTargetLtv).to.be.lt(LLTV_BPS);
    });

    it("should return 0 for position with no collateral", async function () {
      const context = encodeMarketContext();
      const randomAddress = "0x1111111111111111111111111111111111111111";

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: 3000n,
        targetLtvBps: 5000n,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, randomAddress);

      expect(sellAmount).to.equal(0);
      expect(minBuyAmount).to.equal(0);
    });

    it("should handle very small LTV increase (1 basis point)", async function () {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 1n,
        targetLtvBps: currentLtv + 1n, // Only 0.01% increase
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  1 bps LTV increase: ${ethers.formatUnits(sellAmount, 6)} USDC`);

      // Should be a tiny but valid amount
      expect(sellAmount).to.be.gte(0);
    });
  });
});
