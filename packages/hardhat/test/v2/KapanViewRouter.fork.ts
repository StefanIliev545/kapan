import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";

/**
 * KapanViewRouter Fork Tests
 *
 * Tests the unified view router that aggregates LTV queries across protocols.
 * Creates positions on Aave, Compound, and Morpho then queries via the router.
 *
 * To run:
 *   MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/KapanViewRouter.fork.ts
 */

// ============ Arbitrum Addresses ============
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// Tokens
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";

// Whales
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";

// Protocol addresses
const AAVE_POOL_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const AAVE_UI_POOL_DATA_PROVIDER = "0x5c5228aC8BC1528482514aF3e27E692495148717";
const COMPOUND_USDC_COMET = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
const EVC = "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066";

// Morpho market (wstETH/USDC)
const MORPHO_WSTETH_USDC_MARKET = {
  loanToken: USDC,
  collateralToken: WSTETH,
  oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
  irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
  lltv: BigInt("860000000000000000"),
};

// Position parameters
const COLLATERAL_AMOUNT = ethers.parseEther("1");
const BORROW_AMOUNT_USDC = 1000_000000n;

type IERC20 = Contract & {
  transfer: (to: string, amount: bigint) => Promise<any>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  balanceOf: (account: string) => Promise<bigint>;
  connect: (signer: any) => IERC20;
};

describe("v2 KapanViewRouter (fork)", function () {
  this.timeout(180000);

  let deployer: Signer;
  let user: Signer;
  let userAddress: string;
  let weth: IERC20;
  let wsteth: IERC20;

  // Gateway views
  let aaveView: Contract;
  let compoundView: Contract;
  let morphoView: Contract;
  let eulerView: Contract;

  // Router
  let router: Contract;

  before(async function () {
    if (!FORK) {
      console.log("Skipping fork tests: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }

    [deployer] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Fund user with ETH for gas
    await deployer.sendTransaction({
      to: userAddress,
      value: ethers.parseEther("10"),
    });

    // Get tokens
    weth = (await ethers.getContractAt("IERC20", WETH)) as unknown as IERC20;
    wsteth = (await ethers.getContractAt("IERC20", WSTETH)) as unknown as IERC20;

    // Fund user with WETH by wrapping ETH (more reliable than whale)
    const wethContract = await ethers.getContractAt(["function deposit() payable"], WETH);
    await wethContract.connect(user).deposit({ value: ethers.parseEther("5") });

    // Fund user with wstETH for Morpho (set whale balance first)
    await ethers.provider.send("hardhat_setBalance", [WSTETH_WHALE, "0x56BC75E2D63100000"]);
    await ethers.provider.send("hardhat_impersonateAccount", [WSTETH_WHALE]);
    const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
    await wsteth.connect(wstethWhale).transfer(userAddress, ethers.parseEther("5"));

    // Deploy gateway views
    const AaveViewFactory = await ethers.getContractFactory("AaveGatewayView");
    aaveView = await AaveViewFactory.deploy(AAVE_POOL_PROVIDER, AAVE_UI_POOL_DATA_PROVIDER);

    const CompoundViewFactory = await ethers.getContractFactory("CompoundGatewayView");
    compoundView = await CompoundViewFactory.deploy(await deployer.getAddress());
    // Register USDC Comet
    await compoundView.setCometForBase(USDC, COMPOUND_USDC_COMET);

    const MorphoViewFactory = await ethers.getContractFactory("MorphoBlueGatewayView");
    morphoView = await MorphoViewFactory.deploy(MORPHO_BLUE, await deployer.getAddress());

    const EulerViewFactory = await ethers.getContractFactory("EulerGatewayView");
    eulerView = await EulerViewFactory.deploy(EVC);

    // Deploy router (requires owner address)
    const RouterFactory = await ethers.getContractFactory("KapanViewRouter");
    router = await RouterFactory.deploy(await deployer.getAddress());

    // Configure router with gateways using string keys (consistent with KapanRouter)
    await router.setGateways(
      ["aave-v3", "compound-v3", "morpho-blue", "euler-v2"],
      [
        await aaveView.getAddress(),
        await compoundView.getAddress(),
        await morphoView.getAddress(),
        await eulerView.getAddress(),
      ],
    );

    console.log("\n=== KapanViewRouter Test Setup ===");
    console.log(`Router: ${await router.getAddress()}`);
    console.log(`User: ${userAddress}`);
  });

  describe("Admin Functions", function () {
    it("should set gateways correctly", async function () {
      // Gateways use string keys (consistent with KapanRouter)
      expect(await router.gateways("aave-v3")).to.equal(await aaveView.getAddress());
      expect(await router.gateways("compound-v3")).to.equal(await compoundView.getAddress());
      expect(await router.gateways("morpho-blue")).to.equal(await morphoView.getAddress());
    });

    it("should have correct protocol ID constants", async function () {
      // Protocol IDs are bytes4 truncations of keccak256 hashes
      const AAVE_V3 = await router.AAVE_V3();
      const COMPOUND_V3 = await router.COMPOUND_V3();
      const MORPHO_BLUE = await router.MORPHO_BLUE();

      expect(AAVE_V3).to.equal(ethers.keccak256(ethers.toUtf8Bytes("aave-v3")).slice(0, 10));
      expect(COMPOUND_V3).to.equal(ethers.keccak256(ethers.toUtf8Bytes("compound-v3")).slice(0, 10));
      expect(MORPHO_BLUE).to.equal(ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10));
    });
  });

  describe("Aave V3 via Router", function () {
    it("should return 0 LTV with no position", async function () {
      const ltv = await router.getAaveLtvBps(userAddress);
      expect(ltv).to.equal(0);
    });

    it("should return correct LTV after creating position", async function () {
      // Get Aave pool
      const poolProvider = await ethers.getContractAt(
        ["function getPool() view returns (address)"],
        AAVE_POOL_PROVIDER,
      );
      const poolAddress = await poolProvider.getPool();
      const pool = await ethers.getContractAt(
        [
          "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
          "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
        ],
        poolAddress,
      );

      // Approve and supply WETH
      await weth.connect(user).approve(poolAddress, COLLATERAL_AMOUNT);
      await pool.connect(user).supply(WETH, COLLATERAL_AMOUNT, userAddress, 0);

      // Borrow USDC
      await pool.connect(user).borrow(USDC, BORROW_AMOUNT_USDC, 2, 0, userAddress);

      // Check LTV via router
      const ltv = await router.getAaveLtvBps(userAddress);
      console.log(`  Aave LTV via router: ${ltv} bps (${Number(ltv) / 100}%)`);

      // Should be around 33% for $1000 debt on ~$3000 collateral
      expect(ltv).to.be.gt(2500);
      expect(ltv).to.be.lt(4500);

      // Check liquidation LTV
      const liqLtv = await router.getAaveLiquidationLtvBps(userAddress);
      console.log(`  Aave Liquidation LTV: ${liqLtv} bps (${Number(liqLtv) / 100}%)`);
      expect(liqLtv).to.be.gt(8000);
    });
  });

  describe("Compound V3 via Router", function () {
    let compoundUser: Signer;
    let compoundUserAddress: string;

    before(async function () {
      // Use a separate user for Compound
      compoundUser = ethers.Wallet.createRandom().connect(ethers.provider);
      compoundUserAddress = await compoundUser.getAddress();

      await deployer.sendTransaction({
        to: compoundUserAddress,
        value: ethers.parseEther("5"),
      });

      // Wrap ETH to WETH
      const wethContract = await ethers.getContractAt(["function deposit() payable"], WETH);
      await wethContract.connect(compoundUser).deposit({ value: ethers.parseEther("2") });
    });

    it("should return 0 LTV with no position", async function () {
      const ltv = await router.getCompoundLtvBps(USDC, compoundUserAddress);
      expect(ltv).to.equal(0);
    });

    it("should return correct LTV after creating position", async function () {
      const comet = await ethers.getContractAt(
        [
          "function supply(address asset, uint256 amount)",
          "function withdraw(address asset, uint256 amount)",
        ],
        COMPOUND_USDC_COMET,
      );

      // Supply WETH as collateral
      await weth.connect(compoundUser).approve(COMPOUND_USDC_COMET, COLLATERAL_AMOUNT);
      await comet.connect(compoundUser).supply(WETH, COLLATERAL_AMOUNT);

      // Borrow USDC (withdraw from comet)
      await comet.connect(compoundUser).withdraw(USDC, BORROW_AMOUNT_USDC);

      // Check LTV via router
      const ltv = await router.getCompoundLtvBps(USDC, compoundUserAddress);
      console.log(`  Compound LTV via router: ${ltv} bps (${Number(ltv) / 100}%)`);

      expect(ltv).to.be.gt(2500);
      expect(ltv).to.be.lt(4500);

      // Check liquidation LTV
      const liqLtv = await router.getCompoundLiquidationLtvBps(USDC, compoundUserAddress);
      console.log(`  Compound Liquidation LTV: ${liqLtv} bps (${Number(liqLtv) / 100}%)`);
      expect(liqLtv).to.be.gt(8000);
    });
  });

  describe("Morpho Blue via Router", function () {
    let morphoUser: Signer;
    let morphoUserAddress: string;

    before(async function () {
      // Use a separate user for Morpho
      morphoUser = ethers.Wallet.createRandom().connect(ethers.provider);
      morphoUserAddress = await morphoUser.getAddress();

      await deployer.sendTransaction({
        to: morphoUserAddress,
        value: ethers.parseEther("5"),
      });

      // Whale already impersonated in global before(), just use it
      const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
      await wsteth.connect(wstethWhale).transfer(morphoUserAddress, ethers.parseEther("2"));
    });

    it("should return 0 LTV with no position", async function () {
      const ltv = await router.getMorphoLtvBps(MORPHO_WSTETH_USDC_MARKET, morphoUserAddress);
      expect(ltv).to.equal(0);
    });

    it("should return correct LTV after creating position", async function () {
      const morpho = await ethers.getContractAt(
        [
          "function supplyCollateral((address,address,address,address,uint256) marketParams, uint256 assets, address onBehalf, bytes data)",
          "function borrow((address,address,address,address,uint256) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
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

      // Supply wstETH as collateral
      await wsteth.connect(morphoUser).approve(MORPHO_BLUE, COLLATERAL_AMOUNT);
      await morpho.connect(morphoUser).supplyCollateral(marketTuple, COLLATERAL_AMOUNT, morphoUserAddress, "0x");

      // Borrow USDC
      await morpho.connect(morphoUser).borrow(marketTuple, BORROW_AMOUNT_USDC, 0, morphoUserAddress, morphoUserAddress);

      // Check LTV via router
      const ltv = await router.getMorphoLtvBps(MORPHO_WSTETH_USDC_MARKET, morphoUserAddress);
      console.log(`  Morpho LTV via router: ${ltv} bps (${Number(ltv) / 100}%)`);
      console.log(`  Note: Lower than WETH-based protocols because wstETH ≈ 1.1 WETH`);

      // wstETH is ~10% more valuable, so LTV should be ~10% lower
      expect(ltv).to.be.gt(2000);
      expect(ltv).to.be.lt(4000);

      // Check liquidation LTV
      const liqLtv = await router.getMorphoLiquidationLtvBps(MORPHO_WSTETH_USDC_MARKET);
      console.log(`  Morpho Liquidation LTV: ${liqLtv} bps (${Number(liqLtv) / 100}%)`);
      expect(liqLtv).to.be.gt(8000);
    });

    it("should return position value for Morpho (used by ADL)", async function () {
      // This is critical for ADL - calculateExecution calls getPositionValue
      const MORPHO_BLUE_ID = await router.MORPHO_BLUE();
      const encodedContext = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,address,address,uint256)"],
        [[
          MORPHO_WSTETH_USDC_MARKET.loanToken,
          MORPHO_WSTETH_USDC_MARKET.collateralToken,
          MORPHO_WSTETH_USDC_MARKET.oracle,
          MORPHO_WSTETH_USDC_MARKET.irm,
          MORPHO_WSTETH_USDC_MARKET.lltv,
        ]],
      );

      const [collateralValue, debtValue] = await router.getPositionValue(
        MORPHO_BLUE_ID,
        morphoUserAddress,
        encodedContext,
      );

      console.log(`  Morpho position value via unified interface:`);
      console.log(`    Collateral: ${collateralValue.toString()} (loan token units)`);
      console.log(`    Debt: ${debtValue.toString()} (loan token units)`);

      // Both should be positive (we have a position)
      expect(collateralValue).to.be.gt(0);
      expect(debtValue).to.be.gt(0);

      // Debt should be close to what we borrowed (1000 USDC = 1000_000000)
      expect(debtValue).to.be.gte(BORROW_AMOUNT_USDC);
      expect(debtValue).to.be.lt(BORROW_AMOUNT_USDC * 2n); // Not more than double (sanity)

      // Collateral value should be higher than debt (we're not liquidated)
      expect(collateralValue).to.be.gt(debtValue);
    });
  });

  describe("Liquidation Risk Check", function () {
    it("should correctly identify safe positions", async function () {
      // Aave position with 33% LTV, 84% liquidation = safe
      const atRisk = await router.isAaveAtRisk(userAddress, 500); // 5% buffer
      expect(atRisk).to.equal(false);
    });

    it("should identify positions close to liquidation", async function () {
      // Query current state
      const ltv = await router.getAaveLtvBps(userAddress);
      const liqLtv = await router.getAaveLiquidationLtvBps(userAddress);

      // Use a buffer that would make it "at risk"
      const hugeBuffer = Number(liqLtv) - Number(ltv) + 100; // More than the gap

      const atRisk = await router.isAaveAtRisk(userAddress, hugeBuffer);
      expect(atRisk).to.equal(true);
    });
  });

  describe("Price Queries", function () {
    it("should get WETH price via Aave oracle", async function () {
      const wethPrice = await router.getAavePrice(WETH);
      console.log(`  WETH price (Aave): $${(Number(wethPrice) / 1e8).toFixed(2)}`);

      // WETH should be worth between $1000 and $10000
      expect(wethPrice).to.be.gt(100_000_000_00n); // > $1000
      expect(wethPrice).to.be.lt(10_000_000_000_00n); // < $10000
    });

    it("should get USDC price via Aave oracle", async function () {
      const usdcPrice = await router.getAavePrice(USDC);
      console.log(`  USDC price (Aave): $${(Number(usdcPrice) / 1e8).toFixed(4)}`);

      // USDC should be ~$1 (within 1%)
      expect(usdcPrice).to.be.gt(99_000_000n); // > $0.99
      expect(usdcPrice).to.be.lt(101_000_000n); // < $1.01
    });

    it("should get multiple prices via Aave oracle", async function () {
      const prices = await router.getAavePrices([WETH, USDC]);
      console.log(`  Batch prices: WETH=$${(Number(prices[0]) / 1e8).toFixed(2)}, USDC=$${(Number(prices[1]) / 1e8).toFixed(4)}`);

      expect(prices.length).to.equal(2);
      expect(prices[0]).to.be.gt(100_000_000_00n); // WETH > $1000
      expect(prices[1]).to.be.gt(99_000_000n); // USDC ~$1
    });

    it("should get WETH price via Compound oracle", async function () {
      const wethPrice = await router.getCompoundPrice(USDC, WETH);
      console.log(`  WETH price (Compound): $${(Number(wethPrice) / 1e8).toFixed(2)}`);

      expect(wethPrice).to.be.gt(100_000_000_00n); // > $1000
      expect(wethPrice).to.be.lt(10_000_000_000_00n); // < $10000
    });

    it("should get Morpho oracle price (exchange rate)", async function () {
      const oraclePrice = await router.getMorphoOraclePrice(MORPHO_WSTETH_USDC_MARKET);
      console.log(`  Morpho oracle (wstETH/USDC): ${oraclePrice.toString()} (36 decimals)`);

      // This is the exchange rate, not USD price
      // 1 wstETH should be worth ~$3500 USDC, so rate should be around 3500 * 1e36 / 1e18 = 3500e18
      expect(oraclePrice).to.be.gt(0);
    });

    it("should calculate min buy amount for ADL", async function () {
      // Get current prices
      const wethPrice = await router.getAavePrice(WETH);
      const usdcPrice = await router.getAavePrice(USDC);

      // Selling 1 WETH for USDC with 1% slippage
      const sellAmount = ethers.parseEther("1");
      const minBuy = await router.calculateMinBuyAmount(
        sellAmount,
        100, // 1% slippage
        wethPrice,
        usdcPrice,
        18, // WETH decimals
        6, // USDC decimals
      );

      // Expected: ~$3000 USDC (varies with price) minus 1% slippage
      console.log(`  Min buy for 1 WETH: ${ethers.formatUnits(minBuy, 6)} USDC`);
      console.log(`  (At WETH=$${(Number(wethPrice) / 1e8).toFixed(2)}, 1% slippage)`);

      // Should be roughly WETH price in USDC (minus slippage)
      const expectedMin = ((Number(wethPrice) / Number(usdcPrice)) * 0.99).toFixed(0);
      expect(Number(ethers.formatUnits(minBuy, 6))).to.be.closeTo(Number(expectedMin), 50); // within $50
    });

    it("should calculate min buy amount for Morpho ADL (36 decimal oracle)", async function () {
      // Get Morpho oracle price (36 decimals scale, already accounts for token decimals)
      const morphoOraclePrice = await router.getMorphoOraclePrice(MORPHO_WSTETH_USDC_MARKET);

      // Selling 1 wstETH for USDC with 1% slippage
      const sellAmount = ethers.parseEther("1"); // 1 wstETH (18 decimals)
      const minBuy = await router.calculateMorphoMinBuyAmount(
        sellAmount,
        100, // 1% slippage
        morphoOraclePrice,
      );

      // Morpho oracle: loanAmount = collateralAmount * price / 1e36
      // The oracle price already accounts for decimal differences between tokens
      // So: 1e18 (wstETH) * price / 1e36 = USDC amount in 6 decimals

      console.log(`  Morpho oracle price: ${morphoOraclePrice.toString()}`);
      console.log(`  Min buy for 1 wstETH: ${ethers.formatUnits(minBuy, 6)} USDC`);

      // wstETH should be ~$3500-4000 USDC
      const minBuyNum = Number(ethers.formatUnits(minBuy, 6));
      console.log(`  (Expecting ~$3500 USDC minus 1% slippage)`);

      // Verify it's in a reasonable range
      expect(minBuyNum).to.be.gt(3000); // > $3000
      expect(minBuyNum).to.be.lt(5000); // < $5000
    });

    it("should handle USDC->WETH conversion (low to high decimals)", async function () {
      const wethPrice = await router.getAavePrice(WETH);
      const usdcPrice = await router.getAavePrice(USDC);

      // Selling 3000 USDC for WETH with 1% slippage
      const sellAmount = 3000n * 1_000_000n; // 3000 USDC (6 decimals)
      const minBuy = await router.calculateMinBuyAmount(
        sellAmount,
        100, // 1% slippage
        usdcPrice,
        wethPrice,
        6, // USDC decimals
        18, // WETH decimals
      );

      console.log(`  Min buy for 3000 USDC: ${ethers.formatEther(minBuy)} WETH`);
      console.log(`  (At USDC=$${(Number(usdcPrice) / 1e8).toFixed(4)}, WETH=$${(Number(wethPrice) / 1e8).toFixed(2)})`);

      // Should get roughly 1 WETH (minus slippage)
      const expectedWeth = (3000 * Number(usdcPrice) / Number(wethPrice)) * 0.99;
      expect(Number(ethers.formatEther(minBuy))).to.be.closeTo(expectedWeth, 0.1);
    });

    it("should handle WBTC->USDC conversion (8 to 6 decimals)", async function () {
      const WBTC = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"; // Arbitrum WBTC
      const wbtcPrice = await router.getAavePrice(WBTC);
      const usdcPrice = await router.getAavePrice(USDC);

      // Selling 0.1 WBTC for USDC with 1% slippage
      const sellAmount = 10_000_000n; // 0.1 WBTC (8 decimals)
      const minBuy = await router.calculateMinBuyAmount(
        sellAmount,
        100, // 1% slippage
        wbtcPrice,
        usdcPrice,
        8, // WBTC decimals
        6, // USDC decimals
      );

      console.log(`  Min buy for 0.1 WBTC: ${ethers.formatUnits(minBuy, 6)} USDC`);
      console.log(`  (At WBTC=$${(Number(wbtcPrice) / 1e8).toFixed(2)})`);

      // 0.1 BTC should be ~$10,000 USDC (varies with price)
      const expectedUsdc = (0.1 * Number(wbtcPrice) / Number(usdcPrice)) * 0.99;
      expect(Number(ethers.formatUnits(minBuy, 6))).to.be.closeTo(expectedUsdc, 500);
    });

    it("should convert USD prices to exchange rate", async function () {
      const wethPrice = await router.getAavePrice(WETH); // ~3028e8
      const usdcPrice = await router.getAavePrice(USDC); // ~1e8

      // Convert to 18-decimal exchange rate
      const exchangeRate = await router.usdPricesToExchangeRate(wethPrice, usdcPrice);

      console.log(`  WETH/USDC exchange rate: ${ethers.formatEther(exchangeRate)}`);

      // Exchange rate should be roughly WETH price / USDC price ≈ 3028
      const expectedRate = Number(wethPrice) / Number(usdcPrice);
      expect(Number(ethers.formatEther(exchangeRate))).to.be.closeTo(expectedRate, 10);
    });

    it("should calculate min buy directly from exchange rate", async function () {
      // Create a known exchange rate: 1 WETH = 3000 USDC
      const exchangeRate18 = ethers.parseEther("3000"); // 3000 with 18 decimals

      const sellAmount = ethers.parseEther("1"); // 1 WETH
      const minBuy = await router.calculateMinBuyFromRate(
        sellAmount,
        100, // 1% slippage
        exchangeRate18,
        18, // WETH decimals
        6, // USDC decimals
      );

      console.log(`  Min buy from rate (1 WETH @ 3000): ${ethers.formatUnits(minBuy, 6)} USDC`);

      // Should be 3000 * 0.99 = 2970 USDC
      expect(Number(ethers.formatUnits(minBuy, 6))).to.be.closeTo(2970, 1);
    });
  });

  describe("Summary", function () {
    it("should display final LTV comparison", async function () {
      console.log("\n=== KapanViewRouter LTV Summary ===");
      console.log("All queries via unified router interface\n");

      // Query all protocols
      const aaveLtv = await router.getAaveLtvBps(userAddress);
      const aaveLiq = await router.getAaveLiquidationLtvBps(userAddress);

      console.log("| Protocol | Current LTV | Liquidation LTV |");
      console.log("|----------|-------------|-----------------|");
      console.log(`| Aave V3  | ${aaveLtv} bps (${(Number(aaveLtv) / 100).toFixed(1)}%) | ${aaveLiq} bps (${(Number(aaveLiq) / 100).toFixed(1)}%) |`);

      console.log("\nRouter provides unified LTV queries for ADL triggers.");
    });
  });
});
