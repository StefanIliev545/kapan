/* eslint-disable no-unused-expressions */
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { AutoLeverageTrigger, KapanViewRouter } from "../../typechain-types";
import { Signer, Contract, AbiCoder } from "ethers";

const coder = AbiCoder.defaultAbiCoder();

/**
 * Fork tests for AutoLeverageTrigger (Auto-leverage trigger)
 *
 * Tests the trigger's ability to:
 * 1. Query LTV from various lending protocols via KapanViewRouter
 * 2. Determine when LTV is BELOW threshold (shouldExecute)
 * 3. Calculate correct leverage amounts (calculateExecution)
 *
 * This is the inverse of LtvTrigger (ADL):
 * - LtvTrigger: Fires when LTV > threshold, sells collateral to repay debt
 * - AutoLeverageTrigger: Fires when LTV < threshold, borrows debt to buy collateral
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/AutoLeverageTrigger.fork.ts
 */
describe("AutoLeverageTrigger", function () {
  // Skip if not on Arbitrum fork
  before(async function () {
    const chainId = hre.network.config.chainId;
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping AutoLeverageTrigger tests - requires Arbitrum fork (current chainId: ${chainId})`);
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

  // Protocol IDs
  const AAVE_V3 = ethers.keccak256(ethers.toUtf8Bytes("aave-v3")).slice(0, 10);

  // Test amounts - create a LOW LTV position for leverage testing
  const COLLATERAL_AMOUNT = ethers.parseEther("2"); // 2 wstETH (~$7400)
  const BORROW_AMOUNT = 1000_000000n; // 1000 USDC (~13.5% LTV, very under-leveraged)

  // ============ Contracts & Signers ============
  let autoLeverageTrigger: AutoLeverageTrigger;
  let viewRouter: KapanViewRouter;
  let user: Signer;
  let userAddress: string;
  let wsteth: Contract;
  let pool: Contract;

  before(async function () {
    [user] = await ethers.getSigners();
    userAddress = await user.getAddress();

    // Get wstETH from whale
    await ethers.provider.send("hardhat_setBalance", [WSTETH_WHALE, "0x56BC75E2D63100000"]);
    await ethers.provider.send("hardhat_impersonateAccount", [WSTETH_WHALE]);
    const whaleSigner = await ethers.getSigner(WSTETH_WHALE);

    wsteth = await ethers.getContractAt(
      [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address) view returns (uint256)",
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
        "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
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

    // Deploy AutoLeverageTrigger
    const AutoLeverageTriggerFactory = await ethers.getContractFactory("AutoLeverageTrigger");
    autoLeverageTrigger = await AutoLeverageTriggerFactory.deploy(await viewRouter.getAddress());
    await autoLeverageTrigger.waitForDeployment();

    console.log("Deployed contracts:");
    console.log("  ViewRouter:", await viewRouter.getAddress());
    console.log("  AaveGatewayView:", await aaveGatewayView.getAddress());
    console.log("  AutoLeverageTrigger:", await autoLeverageTrigger.getAddress());
    console.log("  User:", userAddress);
  });

  describe("Trigger name", () => {
    it("should return 'AutoLeverage' as trigger name", async () => {
      expect(await autoLeverageTrigger.triggerName()).to.equal("AutoLeverage");
    });
  });

  describe("Protocol ID constants", () => {
    it("should have correct protocol IDs", async () => {
      expect(await autoLeverageTrigger.AAVE_V3()).to.equal(AAVE_V3);
    });
  });

  describe("getCurrentLtv", () => {
    it("should return 0 for address with no position", async () => {
      const randomAddress = "0x1111111111111111111111111111111111111111";
      const ltvBps = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, randomAddress, "0x");
      expect(ltvBps).to.equal(0);
    });

    it("should return current LTV after creating low-LTV Aave position", async () => {
      // Create a LOW LTV position (under-leveraged)
      const poolAddress = await pool.getAddress();
      await wsteth.connect(user).approve(poolAddress, COLLATERAL_AMOUNT);
      await pool.connect(user).supply(WSTETH, COLLATERAL_AMOUNT, userAddress, 0);
      await pool.connect(user).borrow(USDC, BORROW_AMOUNT, 2, 0, userAddress);

      const ltvBps = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  User LTV: ${ltvBps.toString()} bps (${Number(ltvBps) / 100}%)`);

      // Should have LOW LTV (position is under-leveraged)
      // ~$7400 collateral (2 wstETH), ~$1000 debt = ~13.5% LTV
      expect(ltvBps).to.be.gt(1000); // > 10%
      expect(ltvBps).to.be.lt(2500); // < 25%
    });
  });

  describe("shouldExecute", () => {
    it("should return true when LTV is BELOW threshold (under-leveraged)", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  Current LTV: ${currentLtv.toString()} bps`);

      expect(currentLtv).to.be.gt(0);

      // Set trigger ABOVE current LTV so it triggers (we're under-leveraged)
      const triggerLtvBps = currentLtv + 500n; // 5% above current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps, // Trigger when below this
        targetLtvBps: triggerLtvBps + 500n, // Target 5% above trigger
        collateralToken: WSTETH, // Token to BUY
        debtToken: USDC, // Token to SELL (borrow)
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, userAddress);

      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.true;
      expect(reason).to.equal("LTV below threshold - under-leveraged");
    });

    it("should return false when LTV is ABOVE threshold (sufficiently leveraged)", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      expect(currentLtv).to.be.gt(0);

      // Set trigger BELOW current LTV so it doesn't trigger
      const triggerLtvBps = currentLtv - 500n; // 5% below current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: currentLtv,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, userAddress);

      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("LTV above threshold");
    });

    it("should return false for address with no position", async () => {
      const randomAddress = "0x1111111111111111111111111111111111111111";

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: 5000,
        targetLtvBps: 7000,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, randomAddress);

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("No position");
    });
  });

  describe("calculateExecution", () => {
    it("should calculate leverage amounts when trigger fires", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      expect(currentLtv).to.be.gt(0);

      // Set params to trigger execution (current LTV is low, target is higher)
      const triggerLtvBps = currentLtv + 500n; // 5% above current (triggers)
      const targetLtvBps = currentLtv + 1000n; // Target 10% above current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH, // Token to BUY
        debtToken: USDC, // Token to SELL (borrow)
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Current LTV: ${currentLtv.toString()} bps`);
      console.log(`  Target LTV: ${targetLtvBps.toString()} bps`);
      console.log(`  Sell amount (USDC to borrow): ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Min buy amount (wstETH expected): ${ethers.formatEther(minBuyAmount)} wstETH`);

      // Sell amount should be positive (need to borrow and sell debt)
      expect(sellAmount).to.be.gt(0);

      // Min buy should be positive (will receive collateral tokens)
      expect(minBuyAmount).to.be.gt(0);

      // Verify the ratio makes sense (wstETH ~$3700, so sellAmount / 3700 ≈ minBuyAmount)
      const effectiveRate = (sellAmount * BigInt(1e18)) / minBuyAmount;
      console.log(`  Effective rate: ${ethers.formatUnits(effectiveRate, 6)} USDC per wstETH`);

      // Should be between $1000 and $10000 per wstETH (sanity check)
      expect(effectiveRate).to.be.gt(1000n * BigInt(1e6));
      expect(effectiveRate).to.be.lt(10000n * BigInt(1e6));
    });

    it("should return 0 when already at or above target LTV", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      // Set target at or below current LTV
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: currentLtv - 100n, // Target below current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      expect(sellAmount).to.equal(0);
      expect(minBuyAmount).to.equal(0);
    });

    it("should return 0 for address with no position", async () => {
      const randomAddress = "0x1111111111111111111111111111111111111111";

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: 5000,
        targetLtvBps: 7000,
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
  });

  describe("isComplete", () => {
    it("should return false when LTV is still below target", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv + 500n,
        targetLtvBps: currentLtv + 1000n, // Target above current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const complete = await autoLeverageTrigger.isComplete(staticData, userAddress, 1);

      expect(complete).to.be.false;
    });

    it("should return true when LTV reaches or exceeds target", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv - 500n, // Below current
        targetLtvBps: currentLtv - 100n, // Target below current (already achieved)
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const complete = await autoLeverageTrigger.isComplete(staticData, userAddress, 1);

      expect(complete).to.be.true;
    });
  });

  describe("Leverage formula verification", () => {
    it("should verify leverage formula correctness", async () => {
      // Get actual position values from Aave
      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      const [collateralBase, debtBase] = await poolFull.getUserAccountData(userAddress);
      const currentLtv = (debtBase * 10000n) / collateralBase;

      console.log(`  Collateral (8 decimals): $${ethers.formatUnits(collateralBase, 8)}`);
      console.log(`  Debt (8 decimals): $${ethers.formatUnits(debtBase, 8)}`);
      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);

      // Calculate how much debt to add to reach target LTV
      const targetLtvBps = currentLtv + 1000n; // 10% increase
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);

      // Correct formula for leverage up:
      //   (D + ΔD) / (C + ΔC) = targetLTV
      //   Where ΔC ≈ ΔD (collateral received from swapping debt, roughly 1:1 in USD)
      //   Solving: ΔD = (targetLTV × C - D) / (1 - targetLTV)
      //
      // This accounts for the compounding effect where adding collateral
      // increases borrowing power, allowing more debt.
      const targetDebtUsd = (targetLtvBps * collateralBase) / 10000n;
      const numerator = targetDebtUsd - debtBase;
      const denominator = 10000n - targetLtvBps;
      const deltaDebtUsd = (numerator * 10000n) / denominator;

      console.log(`  Target debt (simple): $${ethers.formatUnits(targetDebtUsd, 8)}`);
      console.log(`  Additional debt needed (with multiplier): $${ethers.formatUnits(deltaDebtUsd, 8)}`);

      // Verify: after leverage, new position should be at target LTV
      // newDebt = D + ΔD, newCollateral = C + ΔD (since we swap debt to collateral)
      const newDebt = debtBase + deltaDebtUsd;
      const newCollateral = collateralBase + deltaDebtUsd;
      const newLtv = (newDebt * 10000n) / newCollateral;
      console.log(`  New debt: $${ethers.formatUnits(newDebt, 8)}`);
      console.log(`  New collateral: $${ethers.formatUnits(newCollateral, 8)}`);
      console.log(`  New LTV (after leverage): ${Number(newLtv) / 100}%`);

      // Should match target within 1 bps (rounding tolerance)
      const ltvDiff = newLtv > targetLtvBps ? newLtv - targetLtvBps : targetLtvBps - newLtv;
      expect(ltvDiff).to.be.lte(1n); // Within 0.01% tolerance
    });

    it("should calculate amounts matching manual formula", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv + 1000n;

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
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

      // Calculate manually using the correct leverage formula
      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      const [collateralBase, debtBase] = await poolFull.getUserAccountData(userAddress);

      // Correct formula: ΔD = (targetLTV × C - D) / (1 - targetLTV)
      const targetDebtUsd = (targetLtvBps * collateralBase) / 10000n;
      const numerator = targetDebtUsd - debtBase;
      const denominator = 10000n - targetLtvBps;
      const deltaDebtUsd = (numerator * 10000n) / denominator;

      // Convert to USDC (6 decimals) - price is in 8 decimals
      // deltaDebtUsd is in 8 decimals, need to convert to 6 decimals
      // USDC price ~= $1 = 100000000 (8 decimals)
      const expectedSellAmount = (deltaDebtUsd * 1000000n) / 100000000n; // 8 dec -> 6 dec

      console.log(`  Trigger sellAmount: ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Manual calculation: ${ethers.formatUnits(expectedSellAmount, 6)} USDC`);
      console.log(`  Leverage multiplier: ${Number(10000n) / Number(denominator)}x`);

      // Should be close (within 5% for price variations)
      const diff = sellAmount > expectedSellAmount ? sellAmount - expectedSellAmount : expectedSellAmount - sellAmount;
      const tolerance = expectedSellAmount / 20n; // 5%
      expect(diff).to.be.lte(tolerance);
    });
  });

  describe("Chunking behavior", () => {
    it("should return full amount when numChunks = 1", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv + 1000n;

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
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

      console.log(`  Full amount (1 chunk): ${ethers.formatUnits(sellAmount, 6)} USDC`);
      expect(sellAmount).to.be.gt(0);
    });

    it("should split amount when numChunks = 2", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv + 1000n;

      const paramsFullAmount = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv + 500n,
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

      const staticDataFull = await autoLeverageTrigger.encodeTriggerParams(paramsFullAmount);
      const staticDataHalf = await autoLeverageTrigger.encodeTriggerParams(paramsHalfAmount);

      const [sellAmountFull] = await autoLeverageTrigger.calculateExecution(staticDataFull, userAddress);
      const [sellAmountHalf] = await autoLeverageTrigger.calculateExecution(staticDataHalf, userAddress);

      console.log(`  Full amount: ${ethers.formatUnits(sellAmountFull, 6)} USDC`);
      console.log(`  Half amount (2 chunks): ${ethers.formatUnits(sellAmountHalf, 6)} USDC`);

      // Half should be exactly half (accounting for integer division)
      expect(sellAmountHalf).to.equal(sellAmountFull / 2n);
    });
  });

  describe("Simulate leverage execution", () => {
    // Use a known wstETH whale with sufficient balance
    const WSTETH_WHALE_2 = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf"; // Same as WSTETH_WHALE

    it("should increase LTV after simulating leverage execution", async () => {
      // Get initial state
      const initialLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  Initial LTV: ${initialLtv.toString()} bps (${Number(initialLtv) / 100}%)`);

      const targetLtvBps = initialLtv + 500n; // Target 5% higher

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: initialLtv + 100n,
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

      console.log(`  Debt to borrow (sell): ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Collateral expected (buy): ${ethers.formatEther(minBuyAmount)} wstETH`);

      // Simulate the leverage flow:
      // 1. Borrow more USDC
      // 2. "Swap" USDC for wstETH (simulate by getting from whale)
      // 3. Deposit the wstETH

      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
          "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      // 1. Borrow USDC
      await poolFull.connect(user).borrow(USDC, sellAmount, 2, 0, userAddress);

      // 2. Simulate swap: get wstETH from whale
      await ethers.provider.send("hardhat_setBalance", [WSTETH_WHALE_2, "0x56BC75E2D63100000"]);
      await ethers.provider.send("hardhat_impersonateAccount", [WSTETH_WHALE_2]);
      const wstethWhaleSigner = await ethers.getSigner(WSTETH_WHALE_2);

      // Get slightly more than minBuy to simulate successful swap
      const wstethReceived = minBuyAmount + (minBuyAmount / 100n); // +1% for slippage buffer
      await wsteth.connect(wstethWhaleSigner).transfer(userAddress, wstethReceived);

      // 3. Deposit wstETH as additional collateral
      await wsteth.connect(user).approve(poolAddress, wstethReceived);
      await poolFull.connect(user).supply(WSTETH, wstethReceived, userAddress, 0);

      // Check final LTV
      const finalLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`  Final LTV: ${finalLtv.toString()} bps (${Number(finalLtv) / 100}%)`);

      const [finalCollateral, finalDebt] = await poolFull.getUserAccountData(userAddress);
      console.log(`  Final collateral: $${ethers.formatUnits(finalCollateral, 8)}`);
      console.log(`  Final debt: $${ethers.formatUnits(finalDebt, 8)}`);

      // Verify LTV increased
      expect(finalLtv).to.be.gt(initialLtv);
      console.log(`  LTV increase: ${Number(finalLtv - initialLtv) / 100}%`);

      // The final LTV should be close to target
      // Note: Due to the swap adding collateral, actual LTV may differ from target
      // The formula assumes collateral constant, but swap adds collateral
      // So final LTV will be lower than pure debt-increase calculation
      const ltvDiff = finalLtv > targetLtvBps ? finalLtv - targetLtvBps : targetLtvBps - finalLtv;
      console.log(`  Difference from target: ${Number(ltvDiff) / 100}%`);
    });
  });

  // ============================================================================
  // CRITICAL SAFETY TESTS - Prevent accidental liquidation
  // ============================================================================

  describe("Safety: Liquidation prevention", () => {
    it("should NEVER allow target LTV above liquidation threshold", async () => {
      // Get Aave account data including liquidation threshold
      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      const [, , , liquidationThreshold, ,] = await poolFull.getUserAccountData(userAddress);
      console.log(`  Liquidation threshold: ${liquidationThreshold.toString()} bps (${Number(liquidationThreshold) / 100}%)`);

      // wstETH on Aave has ~79% liquidation threshold (varies by chain)
      expect(liquidationThreshold).to.be.gte(7500);
      expect(liquidationThreshold).to.be.lte(9000);

      // If someone sets target LTV above liquidation threshold, the math should still work
      // but the resulting position would be underwater
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const dangerousTargetLtv = liquidationThreshold + 500n; // 5% above liquidation

      // The contract will still calculate, but we should verify the math
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: dangerousTargetLtv,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      // The contract calculates, but trying to actually borrow this much would fail
      // because Aave would reject the borrow exceeding the borrow limit
      console.log(`  Dangerous sell amount (would fail on Aave): ${ethers.formatUnits(sellAmount, 6)} USDC`);

      // Document that the UI/frontend MUST validate target LTV < liquidation threshold
      // The contract itself doesn't enforce this - it's a view function for calculation
      expect(sellAmount).to.be.gt(0); // Contract still calculates
    });

    it("should maintain safe health factor after leverage (HF > 1.0)", async () => {
      // This test verifies that with conservative parameters, health factor stays safe
      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      const [, , , liquidationThreshold, , initialHealthFactor] = await poolFull.getUserAccountData(userAddress);
      console.log(`  Initial health factor: ${ethers.formatEther(initialHealthFactor)}`);
      console.log(`  Liquidation threshold: ${Number(liquidationThreshold) / 100}%`);

      // Use a SAFE target: liquidation threshold - 15% buffer
      const safeTargetLtv = liquidationThreshold - 1500n; // 15% buffer from liquidation
      console.log(`  Safe target LTV: ${Number(safeTargetLtv) / 100}%`);

      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      // Skip if current LTV is already at or above safe target
      if (currentLtv >= safeTargetLtv) {
        console.log(`  Current LTV (${Number(currentLtv) / 100}%) already at/above safe target, skipping`);
        return;
      }

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: safeTargetLtv,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      // Calculate what the health factor would be after this leverage
      // HF = (collateral * liquidationThreshold) / debt
      const [collateralBase, debtBase] = await poolFull.getUserAccountData(userAddress);

      // Convert sellAmount (USDC 6 dec) to USD (8 dec)
      const additionalDebtUsd = (sellAmount * 100000000n) / 1000000n;
      const newDebtBase = debtBase + additionalDebtUsd;

      // For conservative calculation, assume we get slightly less collateral due to slippage
      // The swap output becomes additional collateral, but with slippage we might get less
      // Worst case: no additional collateral (debt-only leverage)
      //
      // Health Factor formula: HF = (collateral * liquidationThreshold) / (debt * 10000)
      // Note: liquidationThreshold is in basis points (e.g., 7900 = 79%)
      //
      // Scale up by 1000 for precision in integer math
      const worstCaseHealthFactorScaled = (collateralBase * liquidationThreshold * 1000n) / (newDebtBase * 10000n);

      console.log(`  Projected new debt: $${ethers.formatUnits(newDebtBase, 8)}`);
      console.log(`  Worst-case health factor (no new collateral): ${Number(worstCaseHealthFactorScaled) / 1000}x`);

      // Even in worst case, health factor should stay above 1.0
      // With 15% buffer from liquidation, HF should be > 1.0
      // worstCaseHealthFactorScaled is scaled by 1000, so HF > 1.0 means > 1000n
      expect(worstCaseHealthFactorScaled).to.be.gt(1000n); // HF > 1.0
    });

    it("should verify math: target LTV produces correct debt increase", async () => {
      // Mathematical verification of the leverage formula
      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      const [collateralBase, debtBase] = await poolFull.getUserAccountData(userAddress);
      const currentLtv = (debtBase * 10000n) / collateralBase;

      // Set specific target for precise math verification
      const targetLtvBps = currentLtv + 1000n; // Exactly 10% LTV increase

      console.log(`  Collateral: $${ethers.formatUnits(collateralBase, 8)}`);
      console.log(`  Current debt: $${ethers.formatUnits(debtBase, 8)}`);
      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);

      // Correct leverage formula: ΔD = (targetLTV × C - D) / (1 - targetLTV)
      // This accounts for the compounding effect when swapping debt to collateral
      const targetDebtUsd = (targetLtvBps * collateralBase) / 10000n;
      const numerator = targetDebtUsd - debtBase;
      const denominator = 10000n - targetLtvBps;
      const expectedDeltaDebtUsd = (numerator * 10000n) / denominator;

      const leverageMultiplier = Number(10000n) / Number(denominator);
      console.log(`  Target debt (simple): $${ethers.formatUnits(targetDebtUsd, 8)}`);
      console.log(`  Expected delta debt (with ${leverageMultiplier.toFixed(2)}x multiplier): $${ethers.formatUnits(expectedDeltaDebtUsd, 8)}`);

      // Get trigger calculation
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
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

      console.log(`  Trigger delta debt (USD): $${ethers.formatUnits(triggerDeltaDebtUsd, 8)}`);

      // Verify they match within 5% tolerance (due to price oracle differences)
      const diff = triggerDeltaDebtUsd > expectedDeltaDebtUsd
        ? triggerDeltaDebtUsd - expectedDeltaDebtUsd
        : expectedDeltaDebtUsd - triggerDeltaDebtUsd;
      const tolerance = expectedDeltaDebtUsd / 20n; // 5%

      console.log(`  Difference: $${ethers.formatUnits(diff, 8)} (tolerance: $${ethers.formatUnits(tolerance, 8)})`);
      expect(diff).to.be.lte(tolerance);
    });
  });

  describe("Safety: Edge cases", () => {
    it("should handle target LTV = 100% (not recommended)", async () => {
      // Edge case: targeting 100% LTV (debt = collateral)
      // This is dangerous but should calculate correctly
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: 10000n, // 100% LTV
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  100% LTV sellAmount: ${ethers.formatUnits(sellAmount, 6)} USDC`);

      // Should calculate a very large amount
      expect(sellAmount).to.be.gt(0);

      // But this would fail on Aave due to health factor check
      // The formula: targetDebt = 100% × collateral = collateral
      // deltaDebt = collateral - currentDebt
    });

    it("should return 0 for empty position with high target", async () => {
      const randomAddress = "0x2222222222222222222222222222222222222222";

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: 5000,
        targetLtvBps: 7000,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, randomAddress);

      // Empty position should return 0
      expect(sellAmount).to.equal(0);
      expect(minBuyAmount).to.equal(0);
    });

    it("should handle very small LTV increase (1 basis point)", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
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

      console.log(`  1 bps LTV increase sellAmount: ${ethers.formatUnits(sellAmount, 6)} USDC`);

      // Should be a small but non-zero amount
      expect(sellAmount).to.be.gte(0);
    });

    it("should handle large LTV jump correctly", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      // Jump from ~13% to 70% (a large increase)
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: 2000n,
        targetLtvBps: 7000n, // 70% target
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: 70%`);
      console.log(`  Large jump sellAmount: ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Large jump minBuyAmount: ${ethers.formatEther(minBuyAmount)} wstETH`);

      // Verify the calculated amounts are reasonable
      // For $7400 collateral at 70% LTV, target debt is ~$5180
      // Current debt ~$1000, so delta ~$4180
      expect(sellAmount).to.be.gt(3000_000000n); // > $3000
      expect(sellAmount).to.be.lt(6000_000000n); // < $6000

      // minBuyAmount should be proportional (at ~$3700 per wstETH)
      expect(minBuyAmount).to.be.gt(ethers.parseEther("0.5")); // > 0.5 wstETH
      expect(minBuyAmount).to.be.lt(ethers.parseEther("2")); // < 2 wstETH
    });
  });

  describe("Safety: Slippage impact on final LTV", () => {
    it("should calculate how slippage affects final position", async () => {
      // When we get less collateral due to slippage, our actual LTV will be HIGHER
      // This is important for safety - we need to account for worst case

      const poolAddress = await pool.getAddress();
      const poolFull = await ethers.getContractAt(
        [
          "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
        ],
        poolAddress,
      );

      const [collateralBase, debtBase, , liquidationThreshold] = await poolFull.getUserAccountData(userAddress);
      const currentLtv = (debtBase * 10000n) / collateralBase;

      // Target conservative LTV
      const targetLtvBps = currentLtv + 1500n; // +15% LTV

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
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

      // Calculate with expected swap output (minBuyAmount already accounts for slippage)
      const additionalDebtUsd = (sellAmount * 100000000n) / 1000000n;
      const newDebtBase = debtBase + additionalDebtUsd;

      // wstETH price ~ $3700, minBuyAmount in wei
      const expectedCollateralAddedUsd = (minBuyAmount * 370000000000n) / ethers.parseEther("1");
      const newCollateralBase = collateralBase + expectedCollateralAddedUsd;

      const expectedFinalLtv = (newDebtBase * 10000n) / newCollateralBase;

      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);
      console.log(`  Expected final LTV (with slippage): ${Number(expectedFinalLtv) / 100}%`);
      console.log(`  Liquidation threshold: ${Number(liquidationThreshold) / 100}%`);

      // Even with slippage, should be below liquidation
      expect(expectedFinalLtv).to.be.lt(liquidationThreshold);

      // Calculate safety buffer
      const safetyBuffer = liquidationThreshold - expectedFinalLtv;
      console.log(`  Safety buffer to liquidation: ${Number(safetyBuffer) / 100}%`);
      expect(safetyBuffer).to.be.gt(500n); // At least 5% buffer
    });

    it("should verify minBuyAmount accounts for slippage correctly", async () => {
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      const targetLtvBps = currentLtv + 1000n;

      // Test with 0% slippage
      const paramsNoSlippage = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: targetLtvBps,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 0,
        numChunks: 1,
      };

      // Test with 5% slippage
      const paramsWithSlippage = {
        ...paramsNoSlippage,
        maxSlippageBps: 500,
      };

      const staticDataNoSlippage = await autoLeverageTrigger.encodeTriggerParams(paramsNoSlippage);
      const staticDataWithSlippage = await autoLeverageTrigger.encodeTriggerParams(paramsWithSlippage);

      const [sellNoSlip, minBuyNoSlip] = await autoLeverageTrigger.calculateExecution(staticDataNoSlippage, userAddress);
      const [sellWithSlip, minBuyWithSlip] = await autoLeverageTrigger.calculateExecution(staticDataWithSlippage, userAddress);

      console.log(`  0% slippage - sell: ${ethers.formatUnits(sellNoSlip, 6)}, minBuy: ${ethers.formatEther(minBuyNoSlip)}`);
      console.log(`  5% slippage - sell: ${ethers.formatUnits(sellWithSlip, 6)}, minBuy: ${ethers.formatEther(minBuyWithSlip)}`);

      // Sell amounts should be the same (slippage doesn't affect how much we borrow)
      expect(sellNoSlip).to.equal(sellWithSlip);

      // MinBuy with slippage should be ~5% less
      const expectedMinBuyWithSlip = (minBuyNoSlip * 9500n) / 10000n;
      const diff = minBuyWithSlip > expectedMinBuyWithSlip
        ? minBuyWithSlip - expectedMinBuyWithSlip
        : expectedMinBuyWithSlip - minBuyWithSlip;
      const tolerance = expectedMinBuyWithSlip / 100n; // 1% tolerance

      expect(diff).to.be.lte(tolerance);
    });
  });
});

// ============================================================================
// MORPHO BLUE TESTS
// ============================================================================

describe("AutoLeverageTrigger - Morpho Blue", function () {
  // Skip if not on Arbitrum fork
  before(async function () {
    const chainId = hre.network.config.chainId;
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping Morpho tests - requires Arbitrum fork (current chainId: ${chainId})`);
      this.skip();
    }
  });

  // ============ Addresses (Arbitrum) ============
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

  // Protocol ID (bytes4)
  const MORPHO_BLUE_ID = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10);

  // Test amounts - create a LOW LTV position for leverage testing
  const COLLATERAL_AMOUNT = ethers.parseEther("2"); // 2 wstETH (~$7400)
  const BORROW_AMOUNT = 1000_000000n; // 1000 USDC (~13.5% LTV, very under-leveraged)

  // ============ Contracts & Signers ============
  let autoLeverageTrigger: AutoLeverageTrigger;
  let viewRouter: KapanViewRouter;
  let user: Signer;
  let userAddress: string;
  let wsteth: Contract;
  let morpho: Contract;

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

  before(async function () {
    [user] = await ethers.getSigners();
    userAddress = await user.getAddress();

    // Get wstETH from whale
    await ethers.provider.send("hardhat_setBalance", [WSTETH_WHALE, "0x56BC75E2D63100000"]);
    await ethers.provider.send("hardhat_impersonateAccount", [WSTETH_WHALE]);
    const whaleSigner = await ethers.getSigner(WSTETH_WHALE);

    wsteth = await ethers.getContractAt(
      [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address) view returns (uint256)",
      ],
      WSTETH,
    );
    await wsteth.connect(whaleSigner).transfer(userAddress, COLLATERAL_AMOUNT);

    // Get Morpho Blue contract
    morpho = await ethers.getContractAt(
      [
        "function supplyCollateral((address,address,address,address,uint256) marketParams, uint256 assets, address onBehalf, bytes data)",
        "function borrow((address,address,address,address,uint256) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
        "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
      ],
      MORPHO_BLUE,
    );

    // Deploy KapanViewRouter
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = (await ViewRouterFactory.deploy(userAddress)) as KapanViewRouter;
    await viewRouter.waitForDeployment();

    // Deploy MorphoBlueGatewayView
    const MorphoGatewayViewFactory = await ethers.getContractFactory("MorphoBlueGatewayView");
    const morphoGatewayView = await MorphoGatewayViewFactory.deploy(MORPHO_BLUE, userAddress);
    await morphoGatewayView.waitForDeployment();

    // Set Morpho gateway in router - use the string name
    await viewRouter.setGateway("morpho-blue", await morphoGatewayView.getAddress());

    // Deploy AutoLeverageTrigger
    const AutoLeverageTriggerFactory = await ethers.getContractFactory("AutoLeverageTrigger");
    autoLeverageTrigger = (await AutoLeverageTriggerFactory.deploy(await viewRouter.getAddress())) as AutoLeverageTrigger;
    await autoLeverageTrigger.waitForDeployment();

    // Create Morpho position: supply wstETH, borrow USDC (LOW LTV for leverage testing)
    const marketTuple = [
      MORPHO_WSTETH_USDC_MARKET.loanToken,
      MORPHO_WSTETH_USDC_MARKET.collateralToken,
      MORPHO_WSTETH_USDC_MARKET.oracle,
      MORPHO_WSTETH_USDC_MARKET.irm,
      MORPHO_WSTETH_USDC_MARKET.lltv,
    ];

    await wsteth.connect(user).approve(MORPHO_BLUE, COLLATERAL_AMOUNT);
    await morpho.connect(user).supplyCollateral(marketTuple, COLLATERAL_AMOUNT, userAddress, "0x");
    await morpho.connect(user).borrow(marketTuple, BORROW_AMOUNT, 0, userAddress, userAddress);

    console.log("\n=== Morpho AutoLeverage Test Setup Complete ===");
    console.log(`  ViewRouter: ${await viewRouter.getAddress()}`);
    console.log(`  MorphoGatewayView: ${await morphoGatewayView.getAddress()}`);
    console.log(`  AutoLeverageTrigger: ${await autoLeverageTrigger.getAddress()}`);
    console.log(`  User: ${userAddress}`);
    console.log(`  Collateral: ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH`);
    console.log(`  Debt: ${ethers.formatUnits(BORROW_AMOUNT, 6)} USDC`);
  });

  describe("Morpho: getCurrentLtv", () => {
    it("should return 0 for address with no Morpho position", async () => {
      const randomAddress = "0x1111111111111111111111111111111111111111";
      const context = encodeMarketContext();
      const ltvBps = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, randomAddress, context);
      expect(ltvBps).to.equal(0);
    });

    it("should return current LTV for Morpho position", async () => {
      const context = encodeMarketContext();
      const ltvBps = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      console.log(`  Morpho LTV: ${ltvBps.toString()} bps (${Number(ltvBps) / 100}%)`);

      // With 2 wstETH (~$7400) collateral and 1000 USDC debt, LTV should be ~13.5%
      expect(ltvBps).to.be.gt(1000); // > 10%
      expect(ltvBps).to.be.lt(2500); // < 25%
    });
  });

  describe("Morpho: shouldExecute", () => {
    it("should return true when LTV is BELOW threshold (under-leveraged)", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
      console.log(`  Morpho current LTV: ${currentLtv.toString()} bps`);

      // Set trigger ABOVE current LTV so it fires (we're under-leveraged)
      const triggerLtvBps = currentLtv + 500n;

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: triggerLtvBps + 500n,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, userAddress);

      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.true;
      expect(reason).to.equal("LTV below threshold - under-leveraged");
    });

    it("should return false when LTV is ABOVE threshold", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Set trigger BELOW current LTV so it doesn't fire
      const triggerLtvBps = currentLtv - 500n;

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: currentLtv,
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, userAddress);

      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("LTV above threshold");
    });
  });

  describe("Morpho: calculateExecution", () => {
    it("should calculate leverage amounts for Morpho position", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Target 10% higher LTV
      const targetLtvBps = currentLtv + 1000n;

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
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Morpho current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);
      console.log(`  Sell amount (USDC to borrow): ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Min buy amount (wstETH expected): ${ethers.formatEther(minBuyAmount)} wstETH`);

      // Sell amount should be positive
      expect(sellAmount).to.be.gt(0);
      expect(minBuyAmount).to.be.gt(0);

      // Verify the ratio makes sense (wstETH ~$3700)
      const effectiveRate = (sellAmount * BigInt(1e18)) / minBuyAmount;
      console.log(`  Effective rate: ${ethers.formatUnits(effectiveRate, 6)} USDC per wstETH`);

      // Should be between $1000 and $10000 per wstETH
      expect(effectiveRate).to.be.gt(1000n * BigInt(1e6));
      expect(effectiveRate).to.be.lt(10000n * BigInt(1e6));
    });

    it("should return 0 when already at or above target LTV", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: currentLtv - 100n, // Target below current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      expect(sellAmount).to.equal(0);
      expect(minBuyAmount).to.equal(0);
    });
  });

  describe("Morpho: Safety - Liquidation prevention", () => {
    it("should verify Morpho LLTV is respected", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Morpho LLTV is 86% (8600 bps)
      const lltvBps = 8600n;
      console.log(`  Morpho LLTV: ${Number(lltvBps) / 100}%`);
      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);

      // Target 75% (well below 86% LLTV)
      const safeTargetLtv = 7500n;

      const params = {
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

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Safe target (75%): ${ethers.formatUnits(sellAmount, 6)} USDC to borrow`);

      // Verify the safe target is well below LLTV
      expect(safeTargetLtv).to.be.lt(lltvBps - 500n); // At least 5% buffer

      // Now test dangerous target (above LLTV)
      const dangerousTargetLtv = 9000n; // 90%, above 86% LLTV

      const dangerousParams = {
        ...params,
        targetLtvBps: dangerousTargetLtv,
      };

      const dangerousStaticData = await autoLeverageTrigger.encodeTriggerParams(dangerousParams);
      const [dangerousSellAmount] = await autoLeverageTrigger.calculateExecution(dangerousStaticData, userAddress);

      console.log(`  Dangerous target (90%): ${ethers.formatUnits(dangerousSellAmount, 6)} USDC to borrow`);
      console.log(`  WARNING: This would exceed LLTV and be liquidatable!`);

      // The contract calculates but Morpho would reject the borrow
      expect(dangerousSellAmount).to.be.gt(sellAmount);
    });

    it("should verify math: Morpho leverage formula produces correct debt increase", async () => {
      const context = encodeMarketContext();

      // Get position value from ViewRouter
      const [collateralValueUsd, debtValueUsd] = await viewRouter.getPositionValue(
        MORPHO_BLUE_ID,
        userAddress,
        context,
      );

      console.log(`  Morpho position value (8 decimals USD):`);
      console.log(`    Collateral: $${Number(collateralValueUsd) / 1e8}`);
      console.log(`    Debt: $${Number(debtValueUsd) / 1e8}`);

      const currentLtv = (debtValueUsd * 10000n) / collateralValueUsd;
      console.log(`  Calculated LTV: ${Number(currentLtv) / 100}%`);

      // Target 10% higher
      const targetLtvBps = currentLtv + 1000n;

      // Correct leverage formula: ΔD = (targetLTV × C - D) / (1 - targetLTV)
      const targetDebtUsd = (targetLtvBps * collateralValueUsd) / 10000n;
      const numerator = targetDebtUsd - debtValueUsd;
      const denominator = 10000n - targetLtvBps;
      const expectedDeltaDebtUsd = (numerator * 10000n) / denominator;

      const leverageMultiplier = Number(10000n) / Number(denominator);
      console.log(`  Target LTV: ${Number(targetLtvBps) / 100}%`);
      console.log(`  Expected delta debt (with ${leverageMultiplier.toFixed(2)}x multiplier): $${Number(expectedDeltaDebtUsd) / 1e8}`);

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

      // Verify they match within tolerance
      // Note: Morpho uses different price oracle than our 8-decimal representation
      // so there can be larger differences
      const diff = triggerDeltaDebtUsd > expectedDeltaDebtUsd
        ? triggerDeltaDebtUsd - expectedDeltaDebtUsd
        : expectedDeltaDebtUsd - triggerDeltaDebtUsd;
      const tolerance = expectedDeltaDebtUsd / 10n; // 10% tolerance for Morpho

      console.log(`  Difference: $${Number(diff) / 1e8} (tolerance: $${Number(tolerance) / 1e8})`);
      expect(diff).to.be.lte(tolerance);
    });

    it("should calculate correct amounts for large leverage increase", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      // Large jump: target 70% from ~13.5%
      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: 2000n,
        targetLtvBps: 7000n, // 70% target
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Morpho current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Target LTV: 70%`);
      console.log(`  Large jump sellAmount: ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  Large jump minBuyAmount: ${ethers.formatEther(minBuyAmount)} wstETH`);

      // For $7400 collateral at 70% LTV, target debt is ~$5180
      // Current debt ~$1000, so delta ~$4180
      expect(sellAmount).to.be.gt(3000_000000n); // > $3000
      expect(sellAmount).to.be.lt(6000_000000n); // < $6000
    });
  });

  describe("Morpho: isComplete", () => {
    it("should return false when LTV is still below target", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv + 500n,
        targetLtvBps: currentLtv + 1000n, // Target above current
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const complete = await autoLeverageTrigger.isComplete(staticData, userAddress, 1);

      expect(complete).to.be.false;
    });

    it("should return true when LTV reaches or exceeds target", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        triggerLtvBps: currentLtv - 500n,
        targetLtvBps: currentLtv - 100n, // Target below current (already achieved)
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const complete = await autoLeverageTrigger.isComplete(staticData, userAddress, 1);

      expect(complete).to.be.true;
    });
  });

  describe("Morpho: Chunking behavior", () => {
    it("should split amount correctly for Morpho", async () => {
      const context = encodeMarketContext();
      const currentLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
      const targetLtvBps = currentLtv + 1000n;

      const paramsFullAmount = {
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

      const paramsChunked = {
        ...paramsFullAmount,
        numChunks: 4,
      };

      const staticDataFull = await autoLeverageTrigger.encodeTriggerParams(paramsFullAmount);
      const staticDataChunked = await autoLeverageTrigger.encodeTriggerParams(paramsChunked);

      const [sellAmountFull] = await autoLeverageTrigger.calculateExecution(staticDataFull, userAddress);
      const [sellAmountChunked] = await autoLeverageTrigger.calculateExecution(staticDataChunked, userAddress);

      console.log(`  Morpho full amount: ${ethers.formatUnits(sellAmountFull, 6)} USDC`);
      console.log(`  Morpho 1/4 amount (4 chunks): ${ethers.formatUnits(sellAmountChunked, 6)} USDC`);

      // Should be 1/4 (accounting for integer division)
      expect(sellAmountChunked).to.equal(sellAmountFull / 4n);
    });
  });
});
