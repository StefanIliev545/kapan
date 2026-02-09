/* eslint-disable no-unused-expressions */
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { LimitPriceTrigger } from "../../typechain-types";
import { Signer, Contract, AbiCoder } from "ethers";

// Import deployed addresses
import LimitPriceTriggerDeployment from "../../deployments/arbitrum/LimitPriceTrigger.json";
import KapanViewRouterDeployment from "../../deployments/arbitrum/KapanViewRouter.json";

/**
 * Fork tests for LimitPriceTrigger (chunked limit orders)
 *
 * Tests the trigger's ability to:
 * 1. Query prices from KapanViewRouter
 * 2. Determine when price condition is met (shouldExecute)
 * 3. Calculate correct chunk amounts (calculateExecution)
 * 4. Track completion via iterationCount (isComplete)
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/LimitPriceTrigger.fork.ts --network localhost
 */
describe("LimitPriceTrigger", function () {
  // Skip if not on Arbitrum fork
  before(async function () {
    const chainId = hre.network.config.chainId;
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping LimitPriceTrigger tests - requires Arbitrum fork (current chainId: ${chainId})`);
      this.skip();
    }
  });

  // ============ Addresses (Arbitrum) ============
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
  const WETH_WHALE = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"; // Balancer Vault

  // Morpho Blue
  const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";

  // Morpho market (wstETH/USDC)
  const MORPHO_WSTETH_USDC_MARKET = {
    loanToken: USDC,
    collateralToken: WSTETH,
    oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
    irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
    lltv: BigInt("860000000000000000"),
  };

  // Protocol IDs
  const AAVE_V3 = ethers.keccak256(ethers.toUtf8Bytes("aave-v3")).slice(0, 10);
  const MORPHO_BLUE_ID = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10);

  const coder = AbiCoder.defaultAbiCoder();

  // ============ Contracts & Signers ============
  let limitPriceTrigger: LimitPriceTrigger;
  let user: Signer;
  let userAddress: string;
  let weth: Contract;

  // Helper to encode Morpho market context
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

    // Fund user with ETH
    await ethers.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]); // 100 ETH

    // Get WETH from whale
    await ethers.provider.send("hardhat_setBalance", [WETH_WHALE, "0x56BC75E2D63100000"]);
    await ethers.provider.send("hardhat_impersonateAccount", [WETH_WHALE]);
    const whaleSigner = await ethers.getSigner(WETH_WHALE);

    weth = await ethers.getContractAt(
      ["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"],
      WETH,
    );

    // Transfer 10 WETH to user
    await weth.connect(whaleSigner).transfer(userAddress, ethers.parseEther("10"));

    // Use deployed contracts
    console.log("Using deployed contracts:");
    console.log("  LimitPriceTrigger:", LimitPriceTriggerDeployment.address);
    console.log("  KapanViewRouter:", KapanViewRouterDeployment.address);

    limitPriceTrigger = await ethers.getContractAt(
      "LimitPriceTrigger",
      LimitPriceTriggerDeployment.address,
    ) as unknown as LimitPriceTrigger;

    console.log("  User:", userAddress);

    // Verify the trigger is connected to the correct view router
    const triggerViewRouter = await limitPriceTrigger.viewRouter();
    console.log("  Trigger's ViewRouter:", triggerViewRouter);
    expect(triggerViewRouter.toLowerCase()).to.equal(KapanViewRouterDeployment.address.toLowerCase());
  });

  describe("Trigger basics", () => {
    it("should have correct trigger name", async () => {
      expect(await limitPriceTrigger.triggerName()).to.equal("LimitPrice");
    });

    it("should have correct protocol ID constants", async () => {
      expect(await limitPriceTrigger.AAVE_V3()).to.equal(AAVE_V3);
      expect(await limitPriceTrigger.MORPHO_BLUE()).to.equal(MORPHO_BLUE_ID);
    });
  });

  describe("getCurrentPrice", () => {
    it("should return current WETH price via Aave oracle", async () => {
      const price = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");
      console.log(`  WETH price (Aave): $${ethers.formatUnits(price, 8)}`);

      // WETH should be worth something reasonable ($1000-$10000)
      expect(price).to.be.gt(100000000000n); // > $1000
      expect(price).to.be.lt(1000000000000n); // < $10000
    });

    it("should return current USDC price via Aave oracle", async () => {
      const price = await limitPriceTrigger.getCurrentPrice(AAVE_V3, USDC, "0x");
      console.log(`  USDC price (Aave): $${ethers.formatUnits(price, 8)}`);

      // USDC should be ~$1
      expect(price).to.be.closeTo(100000000n, 5000000n); // $1 +/- $0.05
    });

    it("should return current WSTETH price via Morpho oracle (if gateway configured)", async () => {
      const context = encodeMarketContext();
      // Note: For Morpho, we query the collateral token (WSTETH in this case)
      const price = await limitPriceTrigger.getCurrentPrice(MORPHO_BLUE_ID, WSTETH, context);
      console.log(`  WSTETH price (Morpho): $${ethers.formatUnits(price, 8)}`);

      // Skip if Morpho gateway not configured in deployed ViewRouter
      if (price === 0n) {
        console.log("  Skipping: Morpho gateway not configured in deployed ViewRouter");
        return;
      }

      // wstETH should be worth something reasonable ($1000-$10000)
      expect(price).to.be.gt(100000000000n); // > $1000
      expect(price).to.be.lt(1000000000000n); // < $10000
    });
  });

  describe("shouldExecute with Aave", () => {
    it("should return true when price is above limit (take profit)", async () => {
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");
      console.log(`  Current WETH price: $${ethers.formatUnits(currentPrice, 8)}`);

      // Set limit below current price - should trigger
      const limitPrice = currentPrice - currentPrice / 10n; // 10% below current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: limitPrice,
        triggerAbovePrice: true, // Trigger when price >= limit
        totalSellAmount: ethers.parseEther("1"),
        totalBuyAmount: 0n, // Not used for SELL orders
        numChunks: 1,
        maxSlippageBps: 100,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await limitPriceTrigger.shouldExecute(staticData, userAddress);

      console.log(`  Limit: $${ethers.formatUnits(limitPrice, 8)}`);
      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.true;
      expect(reason).to.equal("Price above limit");
    });

    it("should return false when price is below limit (take profit not met)", async () => {
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      // Set limit above current price - should NOT trigger
      const limitPrice = currentPrice + currentPrice / 10n; // 10% above current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: limitPrice,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("1"),
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await limitPriceTrigger.shouldExecute(staticData, userAddress);

      console.log(`  Current: $${ethers.formatUnits(currentPrice, 8)}, Limit: $${ethers.formatUnits(limitPrice, 8)}`);
      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("Price below limit");
    });

    it("should return true when price is below limit (stop loss)", async () => {
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      // Set limit above current price with triggerAbovePrice=false (stop loss)
      const limitPrice = currentPrice + currentPrice / 10n; // 10% above current

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: limitPrice,
        triggerAbovePrice: false, // Trigger when price <= limit (stop loss)
        totalSellAmount: ethers.parseEther("1"),
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await limitPriceTrigger.shouldExecute(staticData, userAddress);

      console.log(`  Stop loss limit: $${ethers.formatUnits(limitPrice, 8)} (current below)`);
      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.true;
      expect(reason).to.equal("Price below limit");
    });
  });

  describe("shouldExecute with Morpho Blue (if gateway configured)", () => {
    it("should return true when WSTETH price is above limit (take profit)", async () => {
      const context = encodeMarketContext();
      // Use WSTETH price (which is what the Morpho market uses as collateral)
      const currentPrice = await limitPriceTrigger.getCurrentPrice(MORPHO_BLUE_ID, WSTETH, context);
      console.log(`  Current WSTETH price (Morpho): $${ethers.formatUnits(currentPrice, 8)}`);

      // Skip if Morpho gateway not configured
      if (currentPrice === 0n) {
        console.log("  Skipping: Morpho gateway not configured in deployed ViewRouter");
        return;
      }

      // Set limit below current price - should trigger
      const limitPrice = currentPrice - currentPrice / 10n; // 10% below current

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        sellToken: WSTETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: limitPrice,
        triggerAbovePrice: true, // Trigger when price >= limit
        totalSellAmount: ethers.parseEther("1"),
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await limitPriceTrigger.shouldExecute(staticData, userAddress);

      console.log(`  Limit: $${ethers.formatUnits(limitPrice, 8)}`);
      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.true;
      expect(reason).to.equal("Price above limit");
    });

    it("should return false when price is below limit (Morpho)", async () => {
      const context = encodeMarketContext();
      const currentPrice = await limitPriceTrigger.getCurrentPrice(MORPHO_BLUE_ID, WSTETH, context);

      // Skip if Morpho gateway not configured
      if (currentPrice === 0n) {
        console.log("  Skipping: Morpho gateway not configured in deployed ViewRouter");
        return;
      }

      // Set limit above current price - should NOT trigger
      const limitPrice = currentPrice + currentPrice / 10n; // 10% above current

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        sellToken: WSTETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: limitPrice,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("1"),
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await limitPriceTrigger.shouldExecute(staticData, userAddress);

      console.log(`  Current: $${ethers.formatUnits(currentPrice, 8)}, Limit: $${ethers.formatUnits(limitPrice, 8)}`);
      console.log(`  shouldExecute: ${shouldExec}, reason: ${reason}`);

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("Price below limit");
    });
  });

  describe("calculateExecution", () => {
    it("should return full amount for single chunk (numChunks=1)", async () => {
      const totalAmount = ethers.parseEther("5");
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: currentPrice,
        triggerAbovePrice: true,
        totalSellAmount: totalAmount,
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);

      console.log(`  Total: ${ethers.formatEther(totalAmount)} WETH`);
      console.log(`  Sell amount: ${ethers.formatEther(sellAmount)} WETH`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuyAmount, 6)} USDC`);

      // Should sell full amount (after truncation)
      expect(sellAmount).to.be.gt(0);
      expect(sellAmount).to.be.lte(totalAmount);

      // Min buy should be reasonable based on price
      expect(minBuyAmount).to.be.gt(0);
    });

    it("should return chunk amount for multiple chunks", async () => {
      const totalAmount = ethers.parseEther("4");
      const numChunks = 4;
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: currentPrice,
        triggerAbovePrice: true,
        totalSellAmount: totalAmount,
        numChunks: numChunks,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);

      // First chunk (iteration 0)
      const [sellAmount0] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);
      // Second chunk (iteration 1)
      const [sellAmount1] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 1);
      // Third chunk (iteration 2)
      const [sellAmount2] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 2);
      // Last chunk (iteration 3) - should get remainder
      const [sellAmount3] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 3);

      console.log(`  Total: ${ethers.formatEther(totalAmount)} WETH, ${numChunks} chunks`);
      console.log(`  Chunk 0: ${ethers.formatEther(sellAmount0)} WETH`);
      console.log(`  Chunk 1: ${ethers.formatEther(sellAmount1)} WETH`);
      console.log(`  Chunk 2: ${ethers.formatEther(sellAmount2)} WETH`);
      console.log(`  Chunk 3 (last): ${ethers.formatEther(sellAmount3)} WETH`);

      const expectedChunk = totalAmount / BigInt(numChunks);

      // First 3 chunks should be approximately equal
      expect(sellAmount0).to.be.closeTo(expectedChunk, ethers.parseEther("0.01"));
      expect(sellAmount1).to.be.closeTo(expectedChunk, ethers.parseEther("0.01"));
      expect(sellAmount2).to.be.closeTo(expectedChunk, ethers.parseEther("0.01"));

      // Last chunk gets remainder
      expect(sellAmount3).to.be.gt(0);
    });

    it("should use limit price for minBuyAmount calculation", async () => {
      const totalAmount = ethers.parseEther("1");
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      // Set limit price 5% above current (take profit target)
      const limitPrice = currentPrice + currentPrice / 20n;

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: limitPrice,
        triggerAbovePrice: true,
        totalSellAmount: totalAmount,
        numChunks: 1,
        maxSlippageBps: 100, // 1% slippage
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);

      console.log(`  Limit price: $${ethers.formatUnits(limitPrice, 8)}`);
      console.log(`  Sell: ${ethers.formatEther(sellAmount)} WETH`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuyAmount, 6)} USDC`);

      // Calculate expected minBuy based on limit price
      // expectedBuy = sellAmount * limitPrice / usdcPrice (approx $1)
      // With 1% slippage: expectedBuy * 0.99
      const expectedBuyRaw = (sellAmount * limitPrice) / 100000000n; // Divide by USDC price ($1 = 1e8)
      const expectedBuyWithSlippage = (expectedBuyRaw * 99n) / 100n; // 1% slippage
      // Adjust for decimals (18 -> 6)
      const expectedMinBuy = expectedBuyWithSlippage / 10n ** 12n;

      console.log(`  Expected min buy (calc): ${ethers.formatUnits(expectedMinBuy, 6)} USDC`);

      // Should be within reasonable range (truncation affects exact value)
      expect(minBuyAmount).to.be.closeTo(expectedMinBuy, expectedMinBuy / 10n); // Within 10%
    });

    it("should calculate execution with Morpho Blue context (if gateway configured)", async () => {
      const context = encodeMarketContext();
      const totalAmount = ethers.parseEther("1");
      const currentPrice = await limitPriceTrigger.getCurrentPrice(MORPHO_BLUE_ID, WSTETH, context);

      // Skip if Morpho gateway not configured
      if (currentPrice === 0n) {
        console.log("  Skipping: Morpho gateway not configured in deployed ViewRouter");
        return;
      }

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        sellToken: WSTETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: currentPrice,
        triggerAbovePrice: true,
        totalSellAmount: totalAmount,
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);

      console.log(`  Total: ${ethers.formatEther(totalAmount)} WSTETH`);
      console.log(`  Sell amount: ${ethers.formatEther(sellAmount)} WSTETH`);
      console.log(`  Min buy: ${ethers.formatUnits(minBuyAmount, 6)} USDC`);
      console.log(`  WSTETH price: $${ethers.formatUnits(currentPrice, 8)}`);

      // Should sell full amount (after truncation)
      expect(sellAmount).to.be.gt(0);
      expect(sellAmount).to.be.lte(totalAmount);

      // Min buy should be reasonable based on price
      expect(minBuyAmount).to.be.gt(0);
    });
  });

  describe("isComplete", () => {
    it("should return false before all chunks executed (iterationCount=0)", async () => {
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: 300000000000n, // $3000
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("4"),
        numChunks: 4,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);

      const complete0 = await limitPriceTrigger.isComplete(staticData, userAddress, 0);
      const complete1 = await limitPriceTrigger.isComplete(staticData, userAddress, 1);
      const complete2 = await limitPriceTrigger.isComplete(staticData, userAddress, 2);
      const complete3 = await limitPriceTrigger.isComplete(staticData, userAddress, 3);

      console.log(`  iteration 0: isComplete = ${complete0}`);
      console.log(`  iteration 1: isComplete = ${complete1}`);
      console.log(`  iteration 2: isComplete = ${complete2}`);
      console.log(`  iteration 3: isComplete = ${complete3}`);

      expect(complete0).to.be.false;
      expect(complete1).to.be.false;
      expect(complete2).to.be.false;
      expect(complete3).to.be.false;
    });

    it("should return true when all chunks executed (iterationCount >= numChunks)", async () => {
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: 300000000000n,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("4"),
        numChunks: 4,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);

      // After 4 iterations (0,1,2,3), iteration 4 should mark complete
      const complete4 = await limitPriceTrigger.isComplete(staticData, userAddress, 4);
      const complete5 = await limitPriceTrigger.isComplete(staticData, userAddress, 5);

      console.log(`  iteration 4: isComplete = ${complete4}`);
      console.log(`  iteration 5: isComplete = ${complete5}`);

      expect(complete4).to.be.true;
      expect(complete5).to.be.true;
    });

    it("should return true for single chunk order after 1 iteration", async () => {
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: 300000000000n,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("1"),
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);

      const complete0 = await limitPriceTrigger.isComplete(staticData, userAddress, 0);
      const complete1 = await limitPriceTrigger.isComplete(staticData, userAddress, 1);

      console.log(`  iteration 0: isComplete = ${complete0}`);
      console.log(`  iteration 1: isComplete = ${complete1}`);

      expect(complete0).to.be.false;
      expect(complete1).to.be.true;
    });
  });

  describe("Precision truncation (anti-spam)", () => {
    it("should return truncated sell amounts", async () => {
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: currentPrice,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("1.123456789012345678"),
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);

      console.log(`  Raw sell amount: ${sellAmount.toString()}`);
      console.log(`  Raw min buy: ${minBuyAmount.toString()}`);

      // For 18-decimal tokens: truncation keeps 5 decimal places (precision = 10^13)
      const sellPrecision = 10n ** 13n;
      expect(sellAmount % sellPrecision).to.equal(0n, "sellAmount not truncated properly");

      // minBuyAmount is derived from truncated expectedBuy, then slippage applied
      // So it won't itself be truncated, but that's fine - sellAmount truncation
      // provides order hash stability since it's the primary input
      expect(minBuyAmount).to.be.gt(0n);

      console.log("  Sell amount truncation applied correctly");
    });

    it("should return stable amounts across price fluctuations", async () => {
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: currentPrice,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("2"),
        numChunks: 1,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);

      // Get amounts at T=0
      const [sellAmount1, minBuy1] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);

      // Warp time (price oracle might have minor changes)
      await ethers.provider.send("evm_increaseTime", [60]); // 1 minute
      await ethers.provider.send("evm_mine", []);

      // Get amounts at T=1min
      const [sellAmount2, minBuy2] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);

      console.log(`  T=0: sell ${ethers.formatEther(sellAmount1)}, minBuy ${ethers.formatUnits(minBuy1, 6)}`);
      console.log(`  T=1m: sell ${ethers.formatEther(sellAmount2)}, minBuy ${ethers.formatUnits(minBuy2, 6)}`);

      // Sell amount should be identical (based on fixed totalSellAmount)
      expect(sellAmount2).to.equal(sellAmount1);

      // MinBuy might differ slightly if price changed, but truncation should keep it stable
      // for small price movements
      console.log("  Sell amount stable across time");
    });
  });

  describe("encodeTriggerParams / decodeTriggerParams", () => {
    it("should encode and decode params correctly", async () => {
      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: 350000000000n, // $3500
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("5"),
        numChunks: 5,
        maxSlippageBps: 50n,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const encoded = await limitPriceTrigger.encodeTriggerParams(params);
      const decoded = await limitPriceTrigger.decodeTriggerParams(encoded);

      expect(decoded.protocolId).to.equal(AAVE_V3);
      expect(decoded.sellToken.toLowerCase()).to.equal(WETH.toLowerCase());
      expect(decoded.buyToken.toLowerCase()).to.equal(USDC.toLowerCase());
      expect(decoded.sellDecimals).to.equal(18);
      expect(decoded.buyDecimals).to.equal(6);
      expect(decoded.limitPrice).to.equal(350000000000n);
      expect(decoded.triggerAbovePrice).to.equal(true);
      expect(decoded.totalSellAmount).to.equal(ethers.parseEther("5"));
      expect(decoded.numChunks).to.equal(5);
      expect(decoded.maxSlippageBps).to.equal(50n);
    });

    it("should encode and decode params with Morpho context", async () => {
      const context = encodeMarketContext();

      const params = {
        protocolId: MORPHO_BLUE_ID,
        protocolContext: context,
        sellToken: WSTETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: 350000000000n,
        triggerAbovePrice: false,
        totalSellAmount: ethers.parseEther("2"),
        numChunks: 2,
        maxSlippageBps: 100n,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const encoded = await limitPriceTrigger.encodeTriggerParams(params);
      const decoded = await limitPriceTrigger.decodeTriggerParams(encoded);

      expect(decoded.protocolId).to.equal(MORPHO_BLUE_ID);
      expect(decoded.protocolContext).to.equal(context);
      expect(decoded.sellToken.toLowerCase()).to.equal(WSTETH.toLowerCase());
      expect(decoded.triggerAbovePrice).to.equal(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle numChunks = 0 as numChunks = 1", async () => {
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      const paramsZero = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: currentPrice,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("2"),
        numChunks: 0, // Should be treated as 1
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const paramsOne = { ...paramsZero, numChunks: 1 };

      const staticDataZero = await limitPriceTrigger.encodeTriggerParams(paramsZero);
      const staticDataOne = await limitPriceTrigger.encodeTriggerParams(paramsOne);

      const [sellAmountZero] = await limitPriceTrigger.calculateExecution(staticDataZero, userAddress, 0);
      const [sellAmountOne] = await limitPriceTrigger.calculateExecution(staticDataOne, userAddress, 0);

      console.log(`  numChunks=0: ${ethers.formatEther(sellAmountZero)} WETH`);
      console.log(`  numChunks=1: ${ethers.formatEther(sellAmountOne)} WETH`);

      expect(sellAmountZero).to.equal(sellAmountOne);
    });

    it("should return 0 for iteration beyond chunks", async () => {
      const currentPrice = await limitPriceTrigger.getCurrentPrice(AAVE_V3, WETH, "0x");

      const params = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        sellToken: WETH,
        buyToken: USDC,
        sellDecimals: 18,
        buyDecimals: 6,
        limitPrice: currentPrice,
        triggerAbovePrice: true,
        totalSellAmount: ethers.parseEther("2"),
        numChunks: 2,
        maxSlippageBps: 100,
        totalBuyAmount: 0n,
        isKindBuy: false,
      };

      const staticData = await limitPriceTrigger.encodeTriggerParams(params);

      // iteration 2 would be "chunk 3" but we only have 2 chunks
      // last chunk (iteration 1) gets remainder, iteration 2+ should get 0
      const [sellAmount0] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 0);
      const [sellAmount1] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 1);
      const [sellAmount2] = await limitPriceTrigger.calculateExecution(staticData, userAddress, 2);

      console.log(`  iteration 0: ${ethers.formatEther(sellAmount0)} WETH`);
      console.log(`  iteration 1 (last): ${ethers.formatEther(sellAmount1)} WETH`);
      console.log(`  iteration 2 (beyond): ${ethers.formatEther(sellAmount2)} WETH`);

      expect(sellAmount0).to.be.gt(0);
      expect(sellAmount1).to.be.gt(0);
      // Iteration 2 is beyond numChunks, so alreadySold = 2 * chunkSize = totalAmount
      // remaining = 0
      expect(sellAmount2).to.equal(0);
    });
  });
});
