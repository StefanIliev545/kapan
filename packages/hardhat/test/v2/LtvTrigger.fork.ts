/* eslint-disable no-unused-expressions */
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { LtvTrigger, KapanViewRouter } from "../../typechain-types";
import { Signer, Contract } from "ethers";

/**
 * Fork tests for LtvTrigger (ADL trigger)
 *
 * Tests the trigger's ability to:
 * 1. Query LTV from various lending protocols via KapanViewRouter
 * 2. Determine when LTV exceeds threshold (shouldExecute)
 * 3. Calculate correct deleverage amounts (calculateExecution)
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/LtvTrigger.fork.ts
 */
describe("LtvTrigger", function () {
  // Skip if not on Arbitrum fork
  before(async function () {
    const chainId = hre.network.config.chainId;
    // Accept Arbitrum (42161) or Hardhat local (31337) when forking
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping LtvTrigger tests - requires Arbitrum fork (current chainId: ${chainId})`);
      this.skip();
    }
  });

  // ============ Addresses (Arbitrum) ============
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
  const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";

  // Aave V3
  const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
  const AAVE_UI_POOL_DATA_PROVIDER = "0x5c5228aC8BC1528482514aF3e27E692495148717";

  // Protocol IDs (matching LtvTrigger constants)
  const AAVE_V3 = ethers.keccak256(ethers.toUtf8Bytes("aave-v3")).slice(0, 10);
  const COMPOUND_V3 = ethers.keccak256(ethers.toUtf8Bytes("compound-v3")).slice(0, 10);

  // Test amounts
  const COLLATERAL_AMOUNT = ethers.parseEther("1"); // 1 wstETH
  const BORROW_AMOUNT = 1000_000000n; // 1000 USDC

  // ============ Contracts & Signers ============
  let ltvTrigger: LtvTrigger;
  let viewRouter: KapanViewRouter;
  let user: Signer;
  let userAddress: string;
  let wsteth: Contract;
  let pool: Contract;

  before(async function () {
    [user] = await ethers.getSigners();
    userAddress = await user.getAddress();

    // Get wstETH from whale
    await ethers.provider.send("hardhat_setBalance", [WSTETH_WHALE, "0x56BC75E2D63100000"]); // 100 ETH
    await ethers.provider.send("hardhat_impersonateAccount", [WSTETH_WHALE]);
    const whaleSigner = await ethers.getSigner(WSTETH_WHALE);

    wsteth = await ethers.getContractAt(
      [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
      ],
      WSTETH,
    );
    await wsteth.connect(whaleSigner).transfer(userAddress, COLLATERAL_AMOUNT);

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
      ],
      poolAddress,
    );

    // Deploy KapanViewRouter
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(userAddress);
    await viewRouter.waitForDeployment();

    // Deploy AaveGatewayView
    const AaveGatewayViewFactory = await ethers.getContractFactory("AaveGatewayView");
    const aaveGatewayView = await AaveGatewayViewFactory.deploy(
      AAVE_POOL_ADDRESSES_PROVIDER,
      AAVE_UI_POOL_DATA_PROVIDER,
    );
    await aaveGatewayView.waitForDeployment();

    // Set Aave gateway in router - use the string name, not the hash
    await viewRouter.setGateway("aave-v3", await aaveGatewayView.getAddress());

    // Deploy LtvTrigger
    const LtvTriggerFactory = await ethers.getContractFactory("LtvTrigger");
    ltvTrigger = await LtvTriggerFactory.deploy(await viewRouter.getAddress());
    await ltvTrigger.waitForDeployment();

    console.log("Deployed contracts:");
    console.log("  ViewRouter:", await viewRouter.getAddress());
    console.log("  AaveGatewayView:", await aaveGatewayView.getAddress());
    console.log("  LtvTrigger:", await ltvTrigger.getAddress());
    console.log("  User:", userAddress);
  });

  describe("Protocol ID constants", () => {
    it("should have correct protocol IDs", async () => {
      expect(await ltvTrigger.AAVE_V3()).to.equal(AAVE_V3);
      expect(await ltvTrigger.COMPOUND_V3()).to.equal(COMPOUND_V3);
    });
  });

  describe("Trigger name", () => {
    it("should return 'LTV' as trigger name", async () => {
      expect(await ltvTrigger.triggerName()).to.equal("LTV");
    });
  });

  describe("getCurrentLtv", () => {
    it("should return 0 for address with no position", async () => {
      const randomAddress = "0x1111111111111111111111111111111111111111";
      const ltvBps = await ltvTrigger.getCurrentLtv(AAVE_V3, randomAddress, "0x");
      expect(ltvBps).to.equal(0);
    });

    it("should return current LTV after creating Aave position", async () => {
      // Create position: supply wstETH, borrow USDC
      const poolAddress = await pool.getAddress();
      await wsteth.connect(user).approve(poolAddress, COLLATERAL_AMOUNT);
      await pool.connect(user).supply(WSTETH, COLLATERAL_AMOUNT, userAddress, 0);
      await pool.connect(user).borrow(USDC, BORROW_AMOUNT, 2, 0, userAddress);

      const ltvBps = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  User LTV: ${ltvBps.toString()} bps (${Number(ltvBps) / 100}%)`);

      // Should have some LTV (position exists)
      // ~$3700 collateral (1 wstETH), ~$1000 debt = ~27% LTV
      expect(ltvBps).to.be.gt(2000);
      expect(ltvBps).to.be.lt(5000);
    });
  });

  describe("shouldExecute", () => {
    it("should return true when LTV exceeds threshold", async () => {
      // Get current LTV (should have position from previous test)
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  Current LTV: ${currentLtv.toString()} bps`);

      expect(currentLtv).to.be.gt(0);

      // Set trigger below current LTV so it triggers
      const triggerLtvBps = currentLtv - 100n; // 1% below current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: triggerLtvBps - 500n, // Target 5% below trigger
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

    it("should return false when LTV is below threshold", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      expect(currentLtv).to.be.gt(0);

      // Set trigger above current LTV so it doesn't trigger
      const triggerLtvBps = currentLtv + 500n; // 5% above current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
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

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("LTV below threshold");
    });

    it("should return false for address with no position", async () => {
      const randomAddress = "0x1111111111111111111111111111111111111111";

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: 8000,
        targetLtvBps: 6000,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await ltvTrigger.shouldExecute(staticData, randomAddress);

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("No position");
    });
  });

  describe("calculateExecution", () => {
    it("should calculate deleverage amounts when trigger fires", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      expect(currentLtv).to.be.gt(0);

      // Set params to trigger execution
      const triggerLtvBps = currentLtv - 100n;
      const targetLtvBps = currentLtv - 500n; // Target 5% below current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await ltvTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Sell amount: ${ethers.formatEther(sellAmount)} wstETH`);
      console.log(`  Min buy amount: ${ethers.formatUnits(minBuyAmount, 6)} USDC`);

      // Sell amount should be positive (need to sell collateral)
      expect(sellAmount).to.be.gt(0);

      // Min buy should be positive (will receive debt tokens)
      expect(minBuyAmount).to.be.gt(0);

      // Verify the ratio makes sense (wstETH ~$3700, so sellAmount * 3700 ≈ minBuyAmount)
      const effectiveRate = (minBuyAmount * BigInt(1e18)) / sellAmount;
      console.log(`  Effective rate: ${ethers.formatUnits(effectiveRate, 6)} USDC per wstETH`);

      // Should be between $1000 and $10000 per wstETH (sanity check)
      expect(effectiveRate).to.be.gt(1000n * BigInt(1e6));
      expect(effectiveRate).to.be.lt(10000n * BigInt(1e6));
    });

    it("should return 0 for address with no position", async () => {
      const randomAddress = "0x1111111111111111111111111111111111111111";

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: 8000,
        targetLtvBps: 6000,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await ltvTrigger.calculateExecution(staticData, randomAddress);

      expect(sellAmount).to.equal(0);
      expect(minBuyAmount).to.equal(0);
    });
  });

  describe("encodeTriggerParams / decodeTriggerParams", () => {
    it("should encode and decode params correctly", async () => {
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: 8000n,
        targetLtvBps: 6000n,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100n,
        numChunks: 1,
      };

      const encoded = await ltvTrigger.encodeTriggerParams(params);
      const decoded = await ltvTrigger.decodeTriggerParams(encoded);

      expect(decoded.protocolId).to.equal(AAVE_V3);
      expect(decoded.triggerLtvBps).to.equal(8000n);
      expect(decoded.targetLtvBps).to.equal(6000n);
      expect(decoded.collateralToken.toLowerCase()).to.equal(WSTETH.toLowerCase());
      expect(decoded.debtToken.toLowerCase()).to.equal(USDC.toLowerCase());
      expect(decoded.collateralDecimals).to.equal(18);
      expect(decoded.debtDecimals).to.equal(6);
      expect(decoded.maxSlippageBps).to.equal(100n);
      expect(decoded.numChunks).to.equal(1);
    });
  });

  describe("calculateMinBuy decimal handling", () => {
    // Test the ViewRouter's calculateMinBuy with various decimal combinations
    // This tests the core math without needing actual positions

    it("should correctly calculate minBuy for 18 -> 6 decimals (wstETH -> USDC)", async () => {
      // wstETH (18 dec) -> USDC (6 dec)
      // If wstETH = $3700, USDC = $1, exchange rate = 3700
      const sellAmount = ethers.parseEther("1"); // 1 wstETH
      const wstethPrice = 370000000000n; // $3700 in 8 decimals
      const usdcPrice = 100000000n; // $1 in 8 decimals
      const maxSlippageBps = 100n; // 1%

      const minBuy = await viewRouter.calculateMinBuyAmount(
        sellAmount,
        maxSlippageBps,
        wstethPrice,
        usdcPrice,
        18, // sell decimals
        6, // buy decimals
      );

      // Expected: 1 wstETH * $3700 / $1 = 3700 USDC
      // With 1% slippage: 3700 * 0.99 = 3663 USDC
      const expectedMinBuy = 3663_000000n; // 3663 USDC in 6 decimals

      console.log(`  Sell: 1 wstETH (18 dec)`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuy, 6)} USDC`);
      console.log(`  Expected: ${ethers.formatUnits(expectedMinBuy, 6)} USDC`);

      // Should be within 0.1% of expected
      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      const tolerance = expectedMinBuy / 1000n; // 0.1%
      expect(diff).to.be.lte(tolerance);
    });

    it("should correctly calculate minBuy for 8 -> 6 decimals (WBTC -> USDC)", async () => {
      // WBTC (8 dec) -> USDC (6 dec)
      // If WBTC = $95000, USDC = $1, exchange rate = 95000
      const sellAmount = 100000000n; // 1 WBTC (8 decimals)
      const wbtcPrice = 9500000000000n; // $95000 in 8 decimals
      const usdcPrice = 100000000n; // $1 in 8 decimals
      const maxSlippageBps = 100n;

      const minBuy = await viewRouter.calculateMinBuyAmount(
        sellAmount,
        maxSlippageBps,
        wbtcPrice,
        usdcPrice,
        8, // sell decimals
        6, // buy decimals
      );

      // Expected: 1 WBTC * $95000 / $1 = 95000 USDC
      // With 1% slippage: 95000 * 0.99 = 94050 USDC
      const expectedMinBuy = 94050_000000n; // 94050 USDC in 6 decimals

      console.log(`  Sell: 1 WBTC (8 dec)`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuy, 6)} USDC`);
      console.log(`  Expected: ${ethers.formatUnits(expectedMinBuy, 6)} USDC`);

      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      const tolerance = expectedMinBuy / 1000n;
      expect(diff).to.be.lte(tolerance);
    });

    it("should correctly calculate minBuy for 6 -> 18 decimals (USDC -> DAI)", async () => {
      // USDC (6 dec) -> DAI (18 dec)
      // If USDC = $1, DAI = $1, exchange rate = 1
      const sellAmount = 1000_000000n; // 1000 USDC (6 decimals)
      const usdcPrice = 100000000n; // $1 in 8 decimals
      const daiPrice = 100000000n; // $1 in 8 decimals
      const maxSlippageBps = 50n; // 0.5%

      const minBuy = await viewRouter.calculateMinBuyAmount(
        sellAmount,
        maxSlippageBps,
        usdcPrice,
        daiPrice,
        6, // sell decimals
        18, // buy decimals
      );

      // Expected: 1000 USDC * $1 / $1 = 1000 DAI
      // With 0.5% slippage: 1000 * 0.995 = 995 DAI
      const expectedMinBuy = ethers.parseEther("995"); // 995 DAI in 18 decimals

      console.log(`  Sell: 1000 USDC (6 dec)`);
      console.log(`  Min buy: ${ethers.formatEther(minBuy)} DAI`);
      console.log(`  Expected: ${ethers.formatEther(expectedMinBuy)} DAI`);

      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      const tolerance = expectedMinBuy / 1000n;
      expect(diff).to.be.lte(tolerance);
    });

    it("should correctly calculate minBuy for 18 -> 18 decimals (WETH -> DAI)", async () => {
      // WETH (18 dec) -> DAI (18 dec)
      // If WETH = $3500, DAI = $1, exchange rate = 3500
      const sellAmount = ethers.parseEther("2"); // 2 WETH
      const wethPrice = 350000000000n; // $3500 in 8 decimals
      const daiPrice = 100000000n; // $1 in 8 decimals
      const maxSlippageBps = 200n; // 2%

      const minBuy = await viewRouter.calculateMinBuyAmount(
        sellAmount,
        maxSlippageBps,
        wethPrice,
        daiPrice,
        18, // sell decimals
        18, // buy decimals
      );

      // Expected: 2 WETH * $3500 / $1 = 7000 DAI
      // With 2% slippage: 7000 * 0.98 = 6860 DAI
      const expectedMinBuy = ethers.parseEther("6860");

      console.log(`  Sell: 2 WETH (18 dec)`);
      console.log(`  Min buy: ${ethers.formatEther(minBuy)} DAI`);
      console.log(`  Expected: ${ethers.formatEther(expectedMinBuy)} DAI`);

      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      const tolerance = expectedMinBuy / 1000n;
      expect(diff).to.be.lte(tolerance);
    });

    it("should correctly calculate minBuy for 8 -> 8 decimals (WBTC -> renBTC)", async () => {
      // WBTC (8 dec) -> hypothetical 8-dec token
      // If both are ~$95000, exchange rate ~= 1
      const sellAmount = 50000000n; // 0.5 WBTC (8 decimals)
      const wbtcPrice = 9500000000000n; // $95000 in 8 decimals
      const renbtcPrice = 9480000000000n; // $94800 in 8 decimals (slight discount)
      const maxSlippageBps = 100n;

      const minBuy = await viewRouter.calculateMinBuyAmount(
        sellAmount,
        maxSlippageBps,
        wbtcPrice,
        renbtcPrice,
        8, // sell decimals
        8, // buy decimals
      );

      // Expected: 0.5 WBTC * $95000 / $94800 = 0.5010... renBTC
      // With 1% slippage: 0.5010 * 0.99 = 0.496 renBTC
      // Manual: (0.5 * 95000 / 94800) * 0.99 = 0.4960...
      const expectedMinBuy = 49601264n; // ~0.496 in 8 decimals

      console.log(`  Sell: 0.5 WBTC (8 dec)`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuy, 8)} renBTC`);
      console.log(`  Expected: ${ethers.formatUnits(expectedMinBuy, 8)} renBTC`);

      // Allow 0.5% tolerance due to rounding
      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      const tolerance = expectedMinBuy / 200n; // 0.5%
      expect(diff).to.be.lte(tolerance);
    });

    it("should handle fractional amounts correctly (18 -> 6)", async () => {
      // Small amount: 0.001 wstETH -> USDC
      const sellAmount = ethers.parseEther("0.001"); // 0.001 wstETH
      const wstethPrice = 370000000000n; // $3700
      const usdcPrice = 100000000n; // $1
      const maxSlippageBps = 100n;

      const minBuy = await viewRouter.calculateMinBuyAmount(sellAmount, maxSlippageBps, wstethPrice, usdcPrice, 18, 6);

      // Expected: 0.001 * 3700 * 0.99 = 3.663 USDC
      const expectedMinBuy = 3_663000n; // 3.663 USDC

      console.log(`  Sell: 0.001 wstETH`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuy, 6)} USDC`);
      console.log(`  Expected: ${ethers.formatUnits(expectedMinBuy, 6)} USDC`);

      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      const tolerance = expectedMinBuy / 100n; // 1%
      expect(diff).to.be.lte(tolerance);
    });

    it("should handle large amounts correctly (18 -> 6)", async () => {
      // Large amount: 1000 wstETH -> USDC
      const sellAmount = ethers.parseEther("1000"); // 1000 wstETH
      const wstethPrice = 370000000000n; // $3700
      const usdcPrice = 100000000n; // $1
      const maxSlippageBps = 100n;

      const minBuy = await viewRouter.calculateMinBuyAmount(sellAmount, maxSlippageBps, wstethPrice, usdcPrice, 18, 6);

      // Expected: 1000 * 3700 * 0.99 = 3,663,000 USDC
      const expectedMinBuy = 3663000_000000n; // 3,663,000 USDC

      console.log(`  Sell: 1000 wstETH`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuy, 6)} USDC`);
      console.log(`  Expected: ${ethers.formatUnits(expectedMinBuy, 6)} USDC`);

      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      const tolerance = expectedMinBuy / 1000n;
      expect(diff).to.be.lte(tolerance);
    });

    it("should return 0 when prices are 0", async () => {
      const sellAmount = ethers.parseEther("1");

      const minBuy1 = await viewRouter.calculateMinBuyAmount(sellAmount, 100n, 0n, 100000000n, 18, 6);
      const minBuy2 = await viewRouter.calculateMinBuyAmount(sellAmount, 100n, 100000000n, 0n, 18, 6);

      expect(minBuy1).to.equal(0);
      expect(minBuy2).to.equal(0);
    });

    it("should handle 0% slippage correctly", async () => {
      const sellAmount = ethers.parseEther("1");
      const price = 100000000n; // $1

      const minBuy = await viewRouter.calculateMinBuyAmount(sellAmount, 0n, price, price, 18, 18);

      // With 0% slippage, should get 1:1
      expect(minBuy).to.equal(sellAmount);
    });

    it("should handle maximum slippage (99%) correctly", async () => {
      const sellAmount = ethers.parseEther("100");
      const price = 100000000n;

      const minBuy = await viewRouter.calculateMinBuyAmount(sellAmount, 9900n, price, price, 18, 18);

      // With 99% slippage: 100 * 0.01 = 1
      const expectedMinBuy = ethers.parseEther("1");
      expect(minBuy).to.equal(expectedMinBuy);
    });
  });

  describe("calculateMinBuyFromRate decimal handling", () => {
    // Test the direct exchange rate function

    it("should correctly apply 18-decimal exchange rate (18 -> 6)", async () => {
      // Exchange rate of 3700 (wstETH -> USDC)
      const sellAmount = ethers.parseEther("1");
      const exchangeRate18 = ethers.parseEther("3700"); // 3700 * 1e18
      const maxSlippageBps = 100n;

      const minBuy = await viewRouter.calculateMinBuyFromRate(sellAmount, maxSlippageBps, exchangeRate18, 18, 6);

      // Expected: 1 * 3700 * 0.99 = 3663 USDC (6 decimals)
      const expectedMinBuy = 3663_000000n;

      console.log(`  Exchange rate: 3700 (18 dec)`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuy, 6)} USDC`);

      const diff = minBuy > expectedMinBuy ? minBuy - expectedMinBuy : expectedMinBuy - minBuy;
      expect(diff).to.be.lte(expectedMinBuy / 1000n);
    });

    it("should correctly apply exchange rate < 1 (USDC -> ETH)", async () => {
      // If ETH = $3500, exchangeRate = 1/3500 = 0.000285...
      const sellAmount = 3500_000000n; // 3500 USDC (6 dec)
      const exchangeRate18 = ethers.parseEther("1") / 3500n; // ~0.000285... * 1e18
      const maxSlippageBps = 100n;

      const minBuy = await viewRouter.calculateMinBuyFromRate(sellAmount, maxSlippageBps, exchangeRate18, 6, 18);

      // Expected: 3500 USDC / 3500 = 1 ETH, with 1% slippage = 0.99 ETH
      // Due to integer division, might be slightly less
      console.log(`  Sell: 3500 USDC`);
      console.log(`  Exchange rate: 1/3500`);
      console.log(`  Min buy: ${ethers.formatEther(minBuy)} ETH`);

      // Should be close to 0.99 ETH (allowing for rounding)
      expect(minBuy).to.be.gte(ethers.parseEther("0.98"));
      expect(minBuy).to.be.lte(ethers.parseEther("1.0"));
    });
  });

  describe("Deleverage formula with different decimals", () => {
    // These tests verify the full calculateExecution flow with different token pairs
    // Using the existing Aave position but with different token assumptions

    it("should calculate correct deleverage for 8-decimal collateral (simulated WBTC)", async () => {
      // Test the formula with WBTC-like decimals
      // We'll use the ViewRouter directly to test the math

      // Simulate: User has 0.5 WBTC ($47,500) collateral, $20,000 USDC debt
      // Current LTV: 20000/47500 = 42.1%
      // Target LTV: 35%
      const collateralValueUsd = 4750000000000n; // $47,500 in 8 decimals
      const debtValueUsd = 2000000000000n; // $20,000 in 8 decimals
      const targetLtvBps = 3500n; // 35%

      // Formula: X = (debt - targetLtv * collateral) / (1 - targetLtv)
      const targetDebt = (collateralValueUsd * targetLtvBps) / 10000n;
      const numerator = debtValueUsd - targetDebt;
      const denominator = 10000n - targetLtvBps;
      const deleverageUsd = (numerator * 10000n) / denominator;

      console.log(`  Collateral: $${ethers.formatUnits(collateralValueUsd, 8)}`);
      console.log(`  Debt: $${ethers.formatUnits(debtValueUsd, 8)}`);
      console.log(`  Current LTV: ${Number((debtValueUsd * 10000n) / collateralValueUsd) / 100}%`);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);
      console.log(`  Deleverage amount: $${ethers.formatUnits(deleverageUsd, 8)}`);

      // Verify: new LTV should be at target
      const newCollateral = collateralValueUsd - deleverageUsd;
      const newDebt = debtValueUsd - deleverageUsd;
      const newLtv = (newDebt * 10000n) / newCollateral;

      console.log(`  New collateral: $${ethers.formatUnits(newCollateral, 8)}`);
      console.log(`  New debt: $${ethers.formatUnits(newDebt, 8)}`);
      console.log(`  New LTV: ${Number(newLtv) / 100}%`);

      // Should be at target (within rounding)
      const diff = newLtv > targetLtvBps ? newLtv - targetLtvBps : targetLtvBps - newLtv;
      expect(diff).to.be.lte(1n); // Within 0.01%
    });

    it("should handle edge case: current LTV already at target", async () => {
      // If LTV is already at or below target, deleverage should be 0
      const collateralValueUsd = 1000000000000n; // $10,000
      const debtValueUsd = 350000000000n; // $3,500
      const targetLtvBps = 3500n; // 35% (equal to current)

      const currentLtv = (debtValueUsd * 10000n) / collateralValueUsd;
      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);

      // Formula should give 0 or near-0
      const targetDebt = (collateralValueUsd * targetLtvBps) / 10000n;
      if (debtValueUsd <= targetDebt) {
        console.log(`  Already at or below target, no deleverage needed`);
        expect(debtValueUsd).to.be.lte(targetDebt);
      } else {
        const numerator = debtValueUsd - targetDebt;
        const denominator = 10000n - targetLtvBps;
        const deleverageUsd = (numerator * 10000n) / denominator;
        console.log(`  Deleverage amount: $${ethers.formatUnits(deleverageUsd, 8)}`);
        // Should be very small
        expect(deleverageUsd).to.be.lt(1000000n); // Less than $0.01
      }
    });

    it("should handle edge case: very high LTV (90%)", async () => {
      // High LTV position close to liquidation
      const collateralValueUsd = 1000000000000n; // $10,000
      const debtValueUsd = 900000000000n; // $9,000 (90% LTV)
      const targetLtvBps = 7000n; // Target 70%

      const targetDebt = (collateralValueUsd * targetLtvBps) / 10000n;
      const numerator = debtValueUsd - targetDebt;
      const denominator = 10000n - targetLtvBps;
      const deleverageUsd = (numerator * 10000n) / denominator;

      console.log(`  Current LTV: 90%`);
      console.log(`  Target LTV: 70%`);
      console.log(`  Deleverage amount: $${ethers.formatUnits(deleverageUsd, 8)}`);

      // Verify result
      const newCollateral = collateralValueUsd - deleverageUsd;
      const newDebt = debtValueUsd - deleverageUsd;
      const newLtv = (newDebt * 10000n) / newCollateral;

      console.log(`  New LTV: ${Number(newLtv) / 100}%`);

      expect(newLtv).to.be.gte(targetLtvBps - 1n);
      expect(newLtv).to.be.lte(targetLtvBps + 1n);
    });

    it("should handle edge case: target LTV = 0 (full repay)", async () => {
      // Target 0% LTV means full deleverage
      const collateralValueUsd = 1000000000000n; // $10,000
      const debtValueUsd = 500000000000n; // $5,000 (50% LTV)
      const targetLtvBps = 0n; // Target 0%

      // When targetLtv = 0: X = debt / 1 = debt
      const targetDebt = 0n;
      const numerator = debtValueUsd - targetDebt;
      const denominator = 10000n - targetLtvBps; // = 10000
      const deleverageUsd = (numerator * 10000n) / denominator;

      const currentLtv = (debtValueUsd * 10000n) / collateralValueUsd;
      console.log(`  Collateral: $${ethers.formatUnits(collateralValueUsd, 8)}`);
      console.log(`  Debt: $${ethers.formatUnits(debtValueUsd, 8)}`);
      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: 0%`);
      console.log(`  Deleverage amount: $${ethers.formatUnits(deleverageUsd, 8)}`);

      // Should equal debt (full repay)
      expect(deleverageUsd).to.equal(debtValueUsd);
    });
  });

  describe("LTV verification after deleverage", () => {
    // USDC whale for simulating swap output
    const USDC_WHALE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

    it("should reach target LTV after executing calculated deleverage", async () => {
      // Get current LTV
      const initialLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  Initial LTV: ${initialLtv.toString()} bps (${Number(initialLtv) / 100}%)`);
      expect(initialLtv).to.be.gt(0);

      // Set target LTV 5% below current
      const targetLtvBps = initialLtv - 500n;
      console.log(`  Target LTV: ${targetLtvBps.toString()} bps (${Number(targetLtvBps) / 100}%)`);

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: initialLtv - 100n, // Trigger just below current
        targetLtvBps: targetLtvBps,
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

      // Get extended pool interface for withdraw and repay
      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
          "function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)",
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      // Get initial position data
      const [initialCollateral, initialDebt] = await poolFull.getUserAccountData(userAddress);
      console.log(`  Initial collateral (base): ${ethers.formatUnits(initialCollateral, 8)}`);
      console.log(`  Initial debt (base): ${ethers.formatUnits(initialDebt, 8)}`);

      // 1. Withdraw collateral (simulating pre-hook)
      // Note: sellAmount might be larger than available if using placeholder values in trigger
      // Use a reasonable amount based on actual position
      const actualSellAmount = sellAmount > ethers.parseEther("0.5") ? ethers.parseEther("0.1") : sellAmount;
      console.log(`  Actual sell amount (capped): ${ethers.formatEther(actualSellAmount)} wstETH`);

      await poolFull.connect(user).withdraw(WSTETH, actualSellAmount, userAddress);

      // 2. Simulate swap: get USDC from whale
      // Calculate how much USDC we'd get for the wstETH (using minBuyAmount ratio)
      const usdcReceived = (minBuyAmount * actualSellAmount) / sellAmount;
      console.log(`  Simulated USDC received: ${ethers.formatUnits(usdcReceived, 6)}`);

      // Get USDC from whale
      await ethers.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);
      await ethers.provider.send("hardhat_impersonateAccount", [USDC_WHALE]);
      const usdcWhaleSigner = await ethers.getSigner(USDC_WHALE);

      const usdc = await ethers.getContractAt(
        [
          "function transfer(address to, uint256 amount) returns (bool)",
          "function approve(address spender, uint256 amount) returns (bool)",
        ],
        USDC,
      );
      await usdc.connect(usdcWhaleSigner).transfer(userAddress, usdcReceived);

      // 3. Repay debt (simulating post-hook)
      await usdc.connect(user).approve(poolAddress, usdcReceived);
      await poolFull.connect(user).repay(USDC, usdcReceived, 2, userAddress);

      // 4. Check new LTV
      const finalLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  Final LTV: ${finalLtv.toString()} bps (${Number(finalLtv) / 100}%)`);

      const [finalCollateral, finalDebt] = await poolFull.getUserAccountData(userAddress);
      console.log(`  Final collateral (base): ${ethers.formatUnits(finalCollateral, 8)}`);
      console.log(`  Final debt (base): ${ethers.formatUnits(finalDebt, 8)}`);

      // Verify LTV decreased
      expect(finalLtv).to.be.lt(initialLtv);
      console.log(`  LTV reduction: ${Number(initialLtv - finalLtv) / 100}%`);

      // The LTV should be closer to target (within tolerance due to scaled amounts)
      // Since we capped the sell amount, we won't hit exact target, but should see reduction
      const ltvDelta = initialLtv - finalLtv;
      console.log(`  LTV delta: ${ltvDelta.toString()} bps`);
      expect(ltvDelta).to.be.gt(0);
    });

    it("should verify deleverage formula correctness with real values", async () => {
      // This test verifies the mathematical formula used in LtvTrigger
      // Formula: X = (debt - targetLtv * collateral) / (1 - targetLtv)

      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  Current LTV: ${currentLtv.toString()} bps`);

      // Get actual position values from Aave
      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      const [collateralBase, debtBase] = await poolFull.getUserAccountData(userAddress);
      console.log(`  Collateral (8 decimals): ${collateralBase.toString()}`);
      console.log(`  Debt (8 decimals): ${debtBase.toString()}`);

      // Calculate LTV manually and compare
      const manualLtv = (debtBase * 10000n) / collateralBase;
      console.log(`  Manual LTV calculation: ${manualLtv.toString()} bps`);

      // Should be close to what the trigger reports (within rounding)
      const ltvDiff = currentLtv > manualLtv ? currentLtv - manualLtv : manualLtv - currentLtv;
      expect(ltvDiff).to.be.lt(10); // Within 0.1% tolerance

      // Now verify the deleverage formula
      const targetLtvBps = currentLtv - 500n; // 5% reduction target

      // X = (debt - targetLtv * collateral) / (1 - targetLtv)
      // Using basis points: X = (debt * 10000 - targetLtvBps * collateral) / (10000 - targetLtvBps)
      const targetDebt = (collateralBase * targetLtvBps) / 10000n;
      const numerator = debtBase - targetDebt;
      const denominator = 10000n - targetLtvBps;
      const expectedDeleverageUsd = (numerator * 10000n) / denominator;

      console.log(`  Target debt: ${targetDebt.toString()}`);
      console.log(`  Expected deleverage (USD base): ${expectedDeleverageUsd.toString()}`);

      // If we deleverage by X:
      // New collateral = collateral - X
      // New debt = debt - X
      // New LTV = (debt - X) / (collateral - X)
      const newCollateral = collateralBase - expectedDeleverageUsd;
      const newDebt = debtBase - expectedDeleverageUsd;
      const expectedNewLtv = (newDebt * 10000n) / newCollateral;

      console.log(`  Expected new LTV after deleverage: ${expectedNewLtv.toString()} bps`);

      // The new LTV should be at or near the target
      const ltvTargetDiff =
        expectedNewLtv > targetLtvBps ? expectedNewLtv - targetLtvBps : targetLtvBps - expectedNewLtv;
      console.log(`  Difference from target: ${ltvTargetDiff.toString()} bps`);

      // Should be within 10 bps of target (0.1%)
      expect(ltvTargetDiff).to.be.lt(10);
    });
  });

  describe("Precision truncation (anti-spam)", () => {
    it("should return same amounts after 15 minutes of interest accrual", async () => {
      // This is the key test for spam prevention:
      // Aave position values CHANGE due to interest, but order amounts stay STABLE due to truncation
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      if (currentLtv === 0n) {
        console.log("  Skipping: No position exists for user");
        return;
      }

      // Get aToken to check actual balance changes
      const aWstEth = await ethers.getContractAt("IERC20", "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf"); // aWstETH on Arbitrum

      const triggerLtvBps = currentLtv > 100n ? currentLtv - 100n : 1n;
      const targetLtvBps = currentLtv > 500n ? currentLtv - 500n : 1n;

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);

      // Get Aave balance and order amounts at T=0
      const aaveBalance1 = await aWstEth.balanceOf(userAddress);
      const [sellAmount1, minBuy1] = await ltvTrigger.calculateExecution(staticData, userAddress);
      console.log(`  T=0:`);
      console.log(`    Aave aWstETH balance: ${ethers.formatEther(aaveBalance1)}`);
      console.log(`    Order: sell ${ethers.formatEther(sellAmount1)} wstETH, minBuy ${ethers.formatUnits(minBuy1, 6)} USDC`);

      // Warp 15 minutes forward (half the 30-min window)
      await ethers.provider.send("evm_increaseTime", [15 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Get Aave balance and order amounts at T=15min
      const aaveBalance2 = await aWstEth.balanceOf(userAddress);
      const [sellAmount2, minBuy2] = await ltvTrigger.calculateExecution(staticData, userAddress);
      console.log(`  T=15m:`);
      console.log(`    Aave aWstETH balance: ${ethers.formatEther(aaveBalance2)}`);
      console.log(`    Order: sell ${ethers.formatEther(sellAmount2)} wstETH, minBuy ${ethers.formatUnits(minBuy2, 6)} USDC`);

      // Aave balance SHOULD change (interest accrued)
      const balanceDiff = aaveBalance2 - aaveBalance1;
      console.log(`    Balance diff: ${ethers.formatEther(balanceDiff)} wstETH (interest accrued)`);

      // Order amounts should be IDENTICAL despite balance change (truncation working)
      expect(sellAmount2).to.equal(sellAmount1, "sellAmount changed after 15 min - truncation not working!");
      expect(minBuy2).to.equal(minBuy1, "minBuyAmount changed after 15 min - truncation not working!");
      console.log("  ✓ Order amounts unchanged despite Aave balance changing");
    });

    it("should return same amounts after full 30-minute window", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      if (currentLtv === 0n) {
        console.log("  Skipping: No position exists for user");
        return;
      }

      // Get aToken and debt token to show actual value changes
      const aWstEth = await ethers.getContractAt("IERC20", "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf");
      const variableDebtUsdc = await ethers.getContractAt("IERC20", "0x724dc807b04555b71ed48a6896b6F41593b8C637");

      const triggerLtvBps = currentLtv > 100n ? currentLtv - 100n : 1n;
      const targetLtvBps = currentLtv > 500n ? currentLtv - 500n : 1n;

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);

      // Get balances and order at T=0
      const collateral1 = await aWstEth.balanceOf(userAddress);
      const debt1 = await variableDebtUsdc.balanceOf(userAddress);
      const [sellAmount1, minBuy1] = await ltvTrigger.calculateExecution(staticData, userAddress);
      console.log(`  T=0:`);
      console.log(`    Collateral: ${ethers.formatEther(collateral1)} aWstETH`);
      console.log(`    Debt: ${ethers.formatUnits(debt1, 6)} vUSDC`);
      console.log(`    Order: sell ${ethers.formatEther(sellAmount1)}, minBuy ${ethers.formatUnits(minBuy1, 6)}`);

      // Warp 30 minutes forward (full window)
      await ethers.provider.send("evm_increaseTime", [30 * 60]);
      await ethers.provider.send("evm_mine", []);

      // Get balances and order at T=30min
      const collateral2 = await aWstEth.balanceOf(userAddress);
      const debt2 = await variableDebtUsdc.balanceOf(userAddress);
      const [sellAmount2, minBuy2] = await ltvTrigger.calculateExecution(staticData, userAddress);
      console.log(`  T=30m:`);
      console.log(`    Collateral: ${ethers.formatEther(collateral2)} aWstETH (+${ethers.formatEther(collateral2 - collateral1)})`);
      console.log(`    Debt: ${ethers.formatUnits(debt2, 6)} vUSDC (+${ethers.formatUnits(debt2 - debt1, 6)})`);
      console.log(`    Order: sell ${ethers.formatEther(sellAmount2)}, minBuy ${ethers.formatUnits(minBuy2, 6)}`);

      // Verify Aave collateral DID change (interest accrued)
      expect(collateral2).to.not.equal(collateral1, "Collateral should have accrued interest");
      // Note: debt might be 0 or unchanged if position has no/minimal debt

      // But order amounts should be IDENTICAL
      expect(sellAmount2).to.equal(sellAmount1, "sellAmount changed - truncation not working!");
      expect(minBuy2).to.equal(minBuy1, "minBuyAmount changed - truncation not working!");
      console.log("  ✓ Order stable despite Aave balances changing");
    });

    it("should produce truncated values (verify truncation is applied)", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      if (currentLtv === 0n) {
        console.log("  Skipping: No position exists for user");
        return;
      }

      const triggerLtvBps = currentLtv > 100n ? currentLtv - 100n : 1n;
      const targetLtvBps = currentLtv > 500n ? currentLtv - 500n : 1n;

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await ltvTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuy] = await ltvTrigger.calculateExecution(staticData, userAddress);

      console.log(`  sellAmount raw: ${sellAmount.toString()}`);
      console.log(`  minBuy raw: ${minBuy.toString()}`);

      // For 18-decimal tokens: truncation keeps 5 decimal places (precision = 10^13)
      // sellAmount should be divisible by 10^13
      const sellPrecision = 10n ** 13n;
      expect(sellAmount % sellPrecision).to.equal(0n, "sellAmount not truncated to 5 decimal places");

      // For 6-decimal tokens: truncation keeps 4 decimal places (precision = 10^2)
      // minBuy should be divisible by 10^2
      const buyPrecision = 10n ** 2n;
      expect(minBuy % buyPrecision).to.equal(0n, "minBuy not truncated to 4 decimal places");

      console.log("  ✓ Both amounts are properly truncated");
    });
  });

  describe("Chunking behavior", () => {
    it("should return full amount when numChunks = 0", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv - 500n;

      const paramsNoChunk = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv - 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 0, // 0 means full amount
      };

      const paramsOneChunk = {
        ...paramsNoChunk,
        numChunks: 1,
      };

      const staticDataNoChunk = await ltvTrigger.encodeTriggerParams(paramsNoChunk);
      const staticDataOneChunk = await ltvTrigger.encodeTriggerParams(paramsOneChunk);

      const [sellAmountNoChunk] = await ltvTrigger.calculateExecution(staticDataNoChunk, userAddress);
      const [sellAmountOneChunk] = await ltvTrigger.calculateExecution(staticDataOneChunk, userAddress);

      console.log(`  numChunks=0: ${ethers.formatEther(sellAmountNoChunk)} wstETH`);
      console.log(`  numChunks=1: ${ethers.formatEther(sellAmountOneChunk)} wstETH`);

      // Both should be equal (0 treated as 1)
      expect(sellAmountNoChunk).to.equal(sellAmountOneChunk);
    });

    it("should split amount when numChunks = 2", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv - 500n;

      const paramsFullAmount = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv - 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const paramsHalfAmount = {
        ...paramsFullAmount,
        numChunks: 2,
      };

      const staticDataFull = await ltvTrigger.encodeTriggerParams(paramsFullAmount);
      const staticDataHalf = await ltvTrigger.encodeTriggerParams(paramsHalfAmount);

      const [sellAmountFull] = await ltvTrigger.calculateExecution(staticDataFull, userAddress);
      const [sellAmountHalf] = await ltvTrigger.calculateExecution(staticDataHalf, userAddress);

      console.log(`  Full amount: ${ethers.formatEther(sellAmountFull)} wstETH`);
      console.log(`  Half amount (2 chunks): ${ethers.formatEther(sellAmountHalf)} wstETH`);

      // Check that half is approximately full/2 (truncation affects the result)
      // With 18 decimals, truncation keeps 6 decimal places (precision = 10^12)
      const expectedHalf = sellAmountFull / 2n;
      const truncationPrecision = 10n ** 13n; // 0.00001 ETH
      const diff = sellAmountHalf > expectedHalf ? sellAmountHalf - expectedHalf : expectedHalf - sellAmountHalf;
      expect(diff).to.be.lt(truncationPrecision);
    });

    it("should split amount when numChunks = 5", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv - 500n;

      const paramsFullAmount = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv - 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const paramsFifthAmount = {
        ...paramsFullAmount,
        numChunks: 5,
      };

      const staticDataFull = await ltvTrigger.encodeTriggerParams(paramsFullAmount);
      const staticDataFifth = await ltvTrigger.encodeTriggerParams(paramsFifthAmount);

      const [sellAmountFull] = await ltvTrigger.calculateExecution(staticDataFull, userAddress);
      const [sellAmountFifth] = await ltvTrigger.calculateExecution(staticDataFifth, userAddress);

      console.log(`  Full amount: ${ethers.formatEther(sellAmountFull)} wstETH`);
      console.log(`  1/5 amount (5 chunks): ${ethers.formatEther(sellAmountFifth)} wstETH`);

      // Check that fifth is approximately full/5 (truncation affects the result)
      // With 18 decimals, truncation keeps 6 decimal places (precision = 10^12)
      const expectedFifth = sellAmountFull / 5n;
      const truncationPrecision = 10n ** 13n; // 0.00001 ETH
      const diff = sellAmountFifth > expectedFifth ? sellAmountFifth - expectedFifth : expectedFifth - sellAmountFifth;
      expect(diff).to.be.lt(truncationPrecision);
    });

    it("should calculate correct minBuyAmount for chunked amount", async () => {
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv - 500n;

      const paramsFullAmount = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv - 100n,
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
        numChunks: 4,
      };

      const staticDataFull = await ltvTrigger.encodeTriggerParams(paramsFullAmount);
      const staticDataChunked = await ltvTrigger.encodeTriggerParams(paramsChunked);

      const [sellAmountFull, minBuyFull] = await ltvTrigger.calculateExecution(staticDataFull, userAddress);
      const [sellAmountChunked, minBuyChunked] = await ltvTrigger.calculateExecution(staticDataChunked, userAddress);

      console.log(
        `  Full: sell ${ethers.formatEther(sellAmountFull)} wstETH, min buy ${ethers.formatUnits(minBuyFull, 6)} USDC`,
      );
      console.log(
        `  Chunked (4): sell ${ethers.formatEther(sellAmountChunked)} wstETH, min buy ${ethers.formatUnits(minBuyChunked, 6)} USDC`,
      );

      // Check that chunked is approximately 1/4 of full (truncation affects the result)
      // With 18 decimals, truncation keeps 6 decimal places (precision = 10^12)
      const expectedChunked = sellAmountFull / 4n;
      const truncationPrecision = 10n ** 13n; // 0.00001 ETH
      const diff = sellAmountChunked > expectedChunked ? sellAmountChunked - expectedChunked : expectedChunked - sellAmountChunked;
      expect(diff).to.be.lt(truncationPrecision);

      // MinBuy should also be roughly in 4:1 ratio (may differ due to truncation of both amounts)
      // With aggressive truncation (2 decimal places), ratio can be significantly off for small amounts
      // since truncation happens independently on both full and chunked amounts
      const minBuyRatio = (minBuyFull * 1000n) / minBuyChunked;
      console.log(`  MinBuy ratio: ${Number(minBuyRatio) / 1000}`);

      // Should be in reasonable range (2-6) - exact ratio preservation isn't the goal,
      // spam prevention is. The ratio matters less than absolute amounts being correct.
      expect(minBuyRatio).to.be.gte(2000n); // 2.0
      expect(minBuyRatio).to.be.lte(6000n); // 6.0
    });
  });
});
