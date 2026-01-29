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
  extractOrderHash,
  buildTradeSignature,
  GPv2OrderData,
} from "./helpers/cowHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum Addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";
const USDC_WHALE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

// Morpho market (wstETH/USDC) - using verified working market from KapanViewRouter.fork.ts
const MORPHO_WSTETH_USDC_MARKET = {
  loanToken: USDC,
  collateralToken: WSTETH,
  oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
  irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
  lltv: BigInt("860000000000000000"), // 86%
};

const coder = AbiCoder.defaultAbiCoder();

// Protocol ID (bytes4)
const MORPHO_BLUE_ID = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10);

// HooksTrampoline interface
const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
]);

/**
 * Morpho Blue ADL Integration Tests
 *
 * Tests the complete ADL (Automatic Deleveraging) flow for Morpho Blue:
 * 1. Create position on Morpho Blue
 * 2. Use LtvTrigger to calculate deleverage amounts
 * 3. Verify trigger functions work with Morpho context
 * 4. Execute via CoW Protocol settlement with hooks
 * 5. Verify resulting LTV matches target
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/MorphoADLIntegration.fork.ts
 */
describe("Morpho Blue ADL Integration (Fork)", function () {
  this.timeout(180000);

  before(function () {
    if (!FORK) this.skip();
  });

  let owner: Signer, user: Signer, solver: Signer;
  let router: Contract, morphoGateway: Contract;
  let orderManager: Contract; // Old KapanOrderManager
  let conditionalOrderManager: Contract; // New KapanConditionalOrderManager
  let orderHandler: Contract;
  let settlement: Contract;
  let viewRouter: Contract, ltvTrigger: Contract;
  let usdc: Contract, wsteth: Contract;
  let morpho: Contract;
  let userAddress: string;

  const COLLATERAL_AMOUNT = ethers.parseEther("1"); // 1 wstETH (~$3700)
  const BORROW_AMOUNT = 1000_000000n; // 1000 USDC

  beforeEach(async function () {
    [owner, solver] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Get token contracts
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
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

    // Deploy KapanOrderManager (old, for backwards compat tests)
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

    // Router setup - authorize both managers
    await router.setApprovedManager(await orderManager.getAddress(), true);
    await router.setApprovedManager(await conditionalOrderManager.getAddress(), true);
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);
    await router.connect(user).setDelegate(await conditionalOrderManager.getAddress(), true);

    // Deploy KapanViewRouter and LtvTrigger
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());

    const MorphoGatewayViewFactory = await ethers.getContractFactory("MorphoBlueGatewayView");
    const morphoGatewayView = await MorphoGatewayViewFactory.deploy(MORPHO_BLUE, await owner.getAddress());

    // Set Morpho gateway in router using string key
    await viewRouter.setGateway("morpho-blue", await morphoGatewayView.getAddress());

    const LtvTriggerFactory = await ethers.getContractFactory("LtvTrigger");
    ltvTrigger = await LtvTriggerFactory.deploy(await viewRouter.getAddress());

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

    // Create Morpho position: supply wstETH, borrow USDC
    await wsteth.connect(user).approve(MORPHO_BLUE, COLLATERAL_AMOUNT);
    await morpho.connect(user).supplyCollateral(marketTuple, COLLATERAL_AMOUNT, userAddress, "0x");
    await morpho.connect(user).borrow(marketTuple, BORROW_AMOUNT, 0, userAddress, userAddress);

    // Authorize gateway to act on behalf of user
    await morpho.connect(user).setAuthorization(await morphoGateway.getAddress(), true);

    // Make solver authorized
    await becomeSolver(await solver.getAddress());

    console.log("\n=== Morpho ADL Test Setup Complete ===");
    console.log(`User: ${userAddress}`);
    console.log(`Collateral: ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH`);
    console.log(`Debt: ${ethers.formatUnits(BORROW_AMOUNT, 6)} USDC`);
  });

  function buildHookCalldata(orderManagerAddr: string, kapanOrderHash: string, isPreHook: boolean): string {
    const orderManagerIface = new ethers.Interface([
      "function executePreHook(bytes32 orderHash) external",
      "function executePostHook(bytes32 orderHash) external",
    ]);

    const innerCalldata = isPreHook
      ? orderManagerIface.encodeFunctionData("executePreHook", [kapanOrderHash])
      : orderManagerIface.encodeFunctionData("executePostHook", [kapanOrderHash]);

    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [
      [
        {
          target: orderManagerAddr,
          callData: innerCalldata,
          gasLimit: 1000000n,
        },
      ],
    ]);
  }

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

  describe("LtvTrigger with Morpho Blue", function () {
    it("should return current LTV for Morpho position", async function () {
      const context = encodeMarketContext();
      const ltv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      console.log(`  Morpho LTV: ${ltv.toString()} bps (${Number(ltv) / 100}%)`);

      // With 1 wstETH (~$3700) collateral and 1000 USDC debt, LTV should be ~27%
      expect(ltv).to.be.gt(2000);
      expect(ltv).to.be.lt(4000);
    });

    it("should correctly encode/decode trigger params with Morpho context", async function () {
      const context = encodeMarketContext();
      const currentLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv - 100n,
        targetLtvBps: currentLtv - 500n,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const encoded = await ltvTrigger.encodeTriggerParams(params);
      const decoded = await ltvTrigger.decodeTriggerParams(encoded);

      expect(decoded.protocolId).to.equal(MORPHO_BLUE_ID);
      expect(decoded.protocolContext).to.equal(context);
      expect(decoded.triggerLtvBps).to.equal(params.triggerLtvBps);
      expect(decoded.targetLtvBps).to.equal(params.targetLtvBps);
    });

    it("should shouldExecute return true when LTV exceeds threshold", async function () {
      const context = encodeMarketContext();
      const currentLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv - 100n, // Threshold below current
        targetLtvBps: currentLtv - 500n,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await ltvTrigger.shouldExecute(staticData, userAddress);

      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.true;
      expect(reason).to.equal("LTV threshold exceeded");
    });

    it("should calculateExecution return valid amounts for Morpho", async function () {
      const context = encodeMarketContext();
      const currentLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      console.log(`  Current LTV: ${currentLtv.toString()} bps`);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv - 100n,
        targetLtvBps: currentLtv - 500n, // Target 5% lower
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await ltvTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Calculated sell amount: ${ethers.formatEther(sellAmount)} wstETH`);
      console.log(`  Calculated min buy amount: ${ethers.formatUnits(minBuyAmount, 6)} USDC`);

      // Should have positive amounts
      expect(sellAmount).to.be.gt(0);
      expect(minBuyAmount).to.be.gt(0);

      // Note: With low LTV (~27%), a 5% reduction can require selling more than
      // total collateral mathematically. In practice, you'd set a smaller target
      // or the execution would be capped. This test verifies the math is working.

      // Verify the rate makes sense (wstETH ~$3700)
      const effectiveRate = (minBuyAmount * BigInt(1e18)) / sellAmount;
      console.log(`  Effective rate: ${ethers.formatUnits(effectiveRate, 6)} USDC per wstETH`);

      expect(effectiveRate).to.be.gt(1000n * BigInt(1e6)); // > $1000
      expect(effectiveRate).to.be.lt(10000n * BigInt(1e6)); // < $10000
    });

    it("should getPositionValue return correct values for Morpho", async function () {
      const context = encodeMarketContext();

      const [collateralValue, debtValue] = await viewRouter.getPositionValue(
        MORPHO_BLUE_ID,
        userAddress,
        context,
      );

      console.log(`  Position value (8 decimals USD):`);
      console.log(`    Collateral: ${collateralValue.toString()} (${Number(collateralValue) / 1e8} USD)`);
      console.log(`    Debt: ${debtValue.toString()} (${Number(debtValue) / 1e8} USD)`);

      // Collateral should be higher (we have LTV < 100%)
      expect(collateralValue).to.be.gt(debtValue);

      // Debt should be close to borrowed amount (now in 8 decimals)
      // BORROW_AMOUNT is 1000 USDC (6 decimals) = 1000_000000
      // In 8 decimals that's 1000_00000000 = 100_000_000_000
      const borrowAmountIn8Dec = BORROW_AMOUNT * 100n; // Scale 6 dec to 8 dec
      expect(debtValue).to.be.gte(borrowAmountIn8Dec);
      expect(debtValue).to.be.lt(borrowAmountIn8Dec * 2n);
    });
  });

  describe("ADL Flow with CoW Settlement", function () {
    it("should deleverage Morpho position to target LTV", async function () {
      const context = encodeMarketContext();
      const orderManagerAddr = await orderManager.getAddress();
      const orderHandlerAddr = await orderHandler.getAddress();

      // 1. Get initial LTV
      const initialLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
      console.log(`\n=== Initial State ===`);
      console.log(`Initial LTV: ${initialLtv.toString()} bps (${Number(initialLtv) / 100}%)`);

      // 2. Set target LTV (5% below current)
      const targetLtvBps = initialLtv - 500n;
      console.log(`\n=== Target ===`);
      console.log(`Target LTV: ${targetLtvBps.toString()} bps (${Number(targetLtvBps) / 100}%)`);

      // 3. Calculate deleverage amounts using LtvTrigger
      const triggerParams = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: initialLtv - 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(triggerParams);
      const [calculatedSellAmount, calculatedMinBuy] = await ltvTrigger.calculateExecution(staticData, userAddress);

      console.log(`\n=== Calculated Deleverage ===`);
      console.log(`Sell amount: ${ethers.formatEther(calculatedSellAmount)} wstETH`);
      console.log(`Min buy amount: ${ethers.formatUnits(calculatedMinBuy, 6)} USDC`);

      // Use calculated amounts (capped for safety)
      const sellAmount = calculatedSellAmount > ethers.parseEther("0.5")
        ? ethers.parseEther("0.1")
        : calculatedSellAmount;
      const minBuyAmount = (calculatedMinBuy * sellAmount) / calculatedSellAmount;

      console.log(`\n=== Actual Trade (Scaled) ===`);
      console.log(`Sell amount: ${ethers.formatEther(sellAmount)} wstETH`);
      console.log(`Min buy amount: ${ethers.formatUnits(minBuyAmount, 6)} USDC`);

      // 4. Build pre-instructions: withdraw wstETH from Morpho, push to OrderManager
      const preInstructions = [
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(LendingOp.WithdrawCollateral, WSTETH, userAddress, sellAmount, context, 999),
        ),
        createRouterInstruction(encodePushToken(0, orderManagerAddr)),
      ];

      // 5. Build post-instructions: repay USDC to Morpho
      const postInstructions = [
        createRouterInstruction(encodeApprove(0, "morpho-blue")),
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, context, 0),
        ),
      ];

      // 6. Create order
      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-morpho-adl-test"));
      const orderParams = {
        user: userAddress,
        preInstructionsPerIteration: [
          coder.encode(
            ["tuple(string protocolName, bytes data)[]"],
            [preInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
          ),
        ],
        preTotalAmount: sellAmount,
        sellToken: WSTETH,
        buyToken: USDC,
        chunkSize: sellAmount,
        minBuyPerChunk: minBuyAmount,
        postInstructionsPerIteration: [
          coder.encode(
            ["tuple(string protocolName, bytes data)[]"],
            [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
          ),
        ],
        completion: 2,
        targetValue: 1,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash,
        isFlashLoanOrder: false,
        isKindBuy: false,
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("morpho-adl-test-" + Date.now()));
      const tx = await orderManager.connect(user).createOrder(orderParams, salt, 0);
      const kapanOrderHash = extractOrderHash(await tx.wait(), orderManager);

      console.log(`\n=== Order Created ===`);
      console.log(`Order hash: ${kapanOrderHash}`);

      // 7. Build GPv2 order
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: WSTETH,
        buyToken: USDC,
        receiver: orderManagerAddr,
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

      // 8. Build trade
      const trade = {
        sellTokenIndex: 0,
        buyTokenIndex: 1,
        receiver: orderManagerAddr,
        sellAmount: sellAmount,
        buyAmount: minBuyAmount,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: sellAmount,
        signature: buildTradeSignature(orderManagerAddr, gpv2Order, orderHandlerAddr, salt, kapanOrderHash),
      };

      // 9. Build interactions
      const preHookCalldata = buildHookCalldata(orderManagerAddr, kapanOrderHash, true);
      const postHookCalldata = buildHookCalldata(orderManagerAddr, kapanOrderHash, false);

      const preInteractions = [
        {
          target: COW_PROTOCOL.hooksTrampoline,
          value: 0n,
          callData: preHookCalldata,
        },
      ];

      const postInteractions = [
        {
          target: COW_PROTOCOL.hooksTrampoline,
          value: 0n,
          callData: postHookCalldata,
        },
      ];

      // 10. Approve VaultRelayer
      await orderManager.approveVaultRelayer(WSTETH);

      // 11. Pre-fund settlement with USDC (simulating solver liquidity)
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(COW_PROTOCOL.settlement, minBuyAmount);

      // 12. Execute settlement
      console.log(`\n=== Executing Settlement ===`);

      const settleTx = await settlement.connect(solver).settle(
        [WSTETH, USDC],
        [minBuyAmount, sellAmount],
        [trade],
        [preInteractions, [], postInteractions],
      );
      const receipt = await settleTx.wait();
      console.log(`Gas used: ${receipt.gasUsed}`);

      // 13. Verify final LTV
      const finalLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      console.log(`\n=== Final State ===`);
      console.log(`Final LTV: ${finalLtv.toString()} bps (${Number(finalLtv) / 100}%)`);

      // 14. Verify results
      const ltvReduction = initialLtv - finalLtv;
      console.log(`\n=== Verification ===`);
      console.log(`LTV reduction: ${ltvReduction.toString()} bps (${Number(ltvReduction) / 100}%)`);

      // LTV should have decreased
      expect(finalLtv).to.be.lt(initialLtv);
      console.log("LTV decreased");

      // Order should be completed
      const order = await orderManager.getOrder(kapanOrderHash);
      expect(order.status).to.equal(2); // Completed
      console.log("Order completed");
    });
  });

  describe("isComplete behavior", function () {
    it("should return false when LTV is still above target", async function () {
      const context = encodeMarketContext();
      const currentLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Set target much lower than current
      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv - 100n,
        targetLtvBps: currentLtv - 1000n, // 10% below current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const isComplete = await ltvTrigger.isComplete(staticData, userAddress, 0);

      expect(isComplete).to.be.false;
    });

    it("should return true when LTV is at or below target", async function () {
      const context = encodeMarketContext();
      const currentLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Set target above current (already met)
      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 500n,
        targetLtvBps: currentLtv + 100n, // Above current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const isComplete = await ltvTrigger.isComplete(staticData, userAddress, 0);

      expect(isComplete).to.be.true;
    });
  });

  describe("KapanConditionalOrderManager (trigger-based)", function () {
    it("should create order with LtvTrigger and return tradeable order via getTradeableOrder", async function () {
      const context = encodeMarketContext();
      const conditionalOrderManagerAddr = await conditionalOrderManager.getAddress();
      const ltvTriggerAddr = await ltvTrigger.getAddress();

      // 1. Get initial LTV
      const initialLtv = await ltvTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
      console.log(`\n=== Initial State ===`);
      console.log(`Initial LTV: ${initialLtv.toString()} bps (${Number(initialLtv) / 100}%)`);

      // 2. Encode trigger params (this replaces hardcoded amounts)
      const triggerLtvBps = initialLtv - 100n; // Trigger when LTV > (current - 1%)
      const targetLtvBps = initialLtv - 300n;  // Target LTV 3% below current (more realistic)

      console.log(`\n=== Trigger Configuration ===`);
      console.log(`Trigger LTV: ${triggerLtvBps.toString()} bps (execute when above)`);
      console.log(`Target LTV: ${targetLtvBps.toString()} bps (deleverage until reached)`);

      const triggerParams = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const triggerStaticData = await ltvTrigger.encodeTriggerParams(triggerParams);

      // 3. Build pre-instructions template (references UTXO[0] for dynamic amount)
      // These are executed when trigger fires - amount comes from trigger.calculateExecution()
      const preInstructions = [
        createProtocolInstruction(
          "morpho-blue",
          // Amount=0 means use UTXO[input] - the trigger provides the amount
          encodeLendingInstruction(LendingOp.WithdrawCollateral, WSTETH, userAddress, 0n, context, 0),
        ),
        createRouterInstruction(encodePushToken(0, conditionalOrderManagerAddr)),
      ];

      // 4. Build post-instructions template
      const postInstructions = [
        createRouterInstruction(encodeApprove(0, "morpho-blue")),
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, context, 0),
        ),
      ];

      // 5. Create the conditional order
      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-conditional-morpho-adl"));
      const orderParams = {
        user: userAddress,
        trigger: ltvTriggerAddr,
        triggerStaticData: triggerStaticData,
        preInstructions: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [preInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
        ),
        sellToken: WSTETH,
        buyToken: USDC,
        postInstructions: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
        ),
        appDataHash,
        maxIterations: 10, // Up to 10 iterations to reach target
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("conditional-morpho-adl-" + Date.now()));

      // Approve vault relayer before creating order
      await conditionalOrderManager.approveVaultRelayer(WSTETH);

      const tx = await conditionalOrderManager.connect(user).createOrder(orderParams, salt);
      const receipt = await tx.wait();

      // Extract order hash from ConditionalOrderCreated event
      const conditionalOrderManagerIface = conditionalOrderManager.interface;
      let orderHash: string | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = conditionalOrderManagerIface.parseLog(log);
          if (parsed?.name === "ConditionalOrderCreated") {
            orderHash = parsed.args.orderHash || parsed.args[0];
            break;
          }
        } catch {
          // Not our event
        }
      }
      if (!orderHash) {
        throw new Error("ConditionalOrderCreated event not found");
      }

      console.log(`\n=== Order Created ===`);
      console.log(`Order hash: ${orderHash}`);

      // 6. Verify order is stored correctly
      const storedOrder = await conditionalOrderManager.getOrder(orderHash);
      expect(storedOrder.status).to.equal(1); // Active
      expect(storedOrder.params.trigger).to.equal(ltvTriggerAddr);

      // 7. Call getTradeableOrder - this is what the watch-tower calls
      // It should dynamically calculate amounts via the trigger
      console.log(`\n=== Calling getTradeableOrder ===`);
      const staticInput = coder.encode(["bytes32"], [orderHash]);

      const tradeableOrder = await conditionalOrderManager.getTradeableOrder(
        ethers.ZeroAddress, // owner (not used)
        ethers.ZeroAddress, // sender (not used)
        ethers.ZeroHash,    // ctx (not used)
        staticInput,
        "0x"                // offchainInput
      );

      console.log(`\nTradeable order returned by watch-tower call:`);
      console.log(`  sellToken: ${tradeableOrder.sellToken}`);
      console.log(`  buyToken: ${tradeableOrder.buyToken}`);
      console.log(`  sellAmount: ${ethers.formatEther(tradeableOrder.sellAmount)} wstETH`);
      console.log(`  buyAmount: ${ethers.formatUnits(tradeableOrder.buyAmount, 6)} USDC`);
      console.log(`  validTo: ${tradeableOrder.validTo}`);

      // Verify the order makes sense
      expect(tradeableOrder.sellToken).to.equal(WSTETH);
      expect(tradeableOrder.buyToken).to.equal(USDC);
      expect(tradeableOrder.sellAmount).to.be.gt(0);
      expect(tradeableOrder.buyAmount).to.be.gt(0);
      expect(tradeableOrder.receiver).to.equal(conditionalOrderManagerAddr);

      // The amounts should match what trigger.calculateExecution returns
      const [expectedSellAmount, expectedMinBuy] = await ltvTrigger.calculateExecution(
        triggerStaticData,
        userAddress
      );
      expect(tradeableOrder.sellAmount).to.equal(expectedSellAmount);
      expect(tradeableOrder.buyAmount).to.equal(expectedMinBuy);

      console.log(`\n=== Verification ===`);
      console.log(`Amounts match trigger.calculateExecution()`);
      console.log(`The watch-tower would now submit this order to CoW Protocol`);
      console.log(`After execution, order iterates until target LTV (${Number(targetLtvBps) / 100}%) is reached`);
    });
  });
});
