import { expect } from "chai";
import { ethers, network, deployments } from "hardhat";
import {
  createProtocolInstruction,
  createRouterInstruction,
  encodeLendingInstruction,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeFlashLoan,
  FlashLoanProvider,
  LendingOp,
} from "./helpers/instructionHelpers";

/**
 * Morpho Blue Fork Tests
 *
 * Morpho Blue deployments:
 * - Ethereum Mainnet (1): 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
 * - Base (8453):          0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
 * - Arbitrum (42161):     0x6c247b1F6182318877311737BaC0844bAa518F5e
 *
 * To run:
 *   Arbitrum:  MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/MorphoBlue.fork.ts
 *   Ethereum:  MAINNET_FORKING_ENABLED=true FORK_CHAIN=ethereum npx hardhat test test/v2/MorphoBlue.fork.ts
 */

// ============ Morpho Blue Addresses by Chain ============
const MORPHO_BY_CHAIN: Record<number, string> = {
  1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",      // Ethereum Mainnet
  8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",   // Base
  42161: "0x6c247b1F6182318877311737BaC0844bAa518F5e",  // Arbitrum
  31337: "0x6c247b1F6182318877311737BaC0844bAa518F5e",  // Local (defaults to Arbitrum)
};

// ============ Real Market Params from Morpho API ============

// --- Arbitrum Markets ---
const ARB_MARKETS = {
  // wstETH/USDC - $15M supply
  wstETH_USDC: {
    key: "0x33e0c8ab132390822b07e5dc95033cf250c963153320b7ffca73220664da2ea0",
    loanToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",      // USDC
    collateralToken: "0x5979D7b546E38E414F7E9822514be443A4800529", // wstETH
    oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
    irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
    lltv: BigInt("860000000000000000"), // 86%
  },
  // WBTC/USDC - $5M supply
  WBTC_USDC: {
    key: "0xe6392ff19d10454b099d692b58c361ef93e31af34ed1ef78232e07c78fe99169",
    loanToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",     // USDC
    collateralToken: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", // WBTC
    oracle: "0x88193FcB705d29724A40Bb818eCAA47dD5F014d9",
    irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
    lltv: BigInt("860000000000000000"), // 86%
  },
};

// --- Ethereum Mainnet Markets ---
const ETH_MARKETS = {
  // wstETH/WETH - $122M supply, 96.5% LLTV
  wstETH_WETH: {
    key: "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e",
    loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",     // WETH
    collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
    oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    lltv: BigInt("965000000000000000"), // 96.5%
  },
  // wstETH/USDC - $73M supply, 86% LLTV
  wstETH_USDC: {
    key: "0xb323495f7e4148be5643a4ea4a8221eef163e4bccfdedc2a6f4696baacbc86cc",
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",     // USDC
    collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
    oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    lltv: BigInt("860000000000000000"), // 86%
  },
  // WBTC/USDC - $174M supply, 86% LLTV
  WBTC_USDC: {
    key: "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
    loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",     // USDC
    collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
    oracle: "0xDddd770BADd886dF3864029e4B377B5F6a2B6b83",
    irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    lltv: BigInt("860000000000000000"), // 86%
  },
};

// Whales for impersonation (for getting test tokens)
const ARB_WHALES = {
  USDC: "0x47c031236e19d024b42f8AE6780E44A573170703",
  WBTC: "0x489ee077994B6658eAfA855C308275EAd8097C4A",  // Aave aWBTC pool
  wstETH: "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf", // Lido wstETH bridge
};

// Fork configuration
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

describe("v2 MorphoBlue Gateway (fork)", function () {
  let chainId: number;
  let morphoAddress: string;

  before(function () {
    if (!FORK) {
      console.log("Skipping MorphoBlue fork tests: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }

    chainId = network.config.chainId || 31337;
    morphoAddress = MORPHO_BY_CHAIN[chainId];

    if (!morphoAddress) {
      console.log(`Skipping MorphoBlue tests: No Morpho Blue deployment for chain ${chainId}`);
      this.skip();
    }
  });

  describe("Gateway Deployment", function () {
    it("should deploy MorphoBlueGatewayWrite with correct Morpho address", async function () {
      const [deployer] = await ethers.getSigners();

      // Check Morpho Blue exists on fork
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") {
        console.log("Morpho Blue not deployed at expected address, skipping");
        this.skip();
      }

      // Deploy router first
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // Deploy MorphoBlue gateway
      const MorphoGateway = await ethers.getContractFactory("MorphoBlueGatewayWrite");
      const gateway = await MorphoGateway.deploy(
        await router.getAddress(),
        deployer.address,
        morphoAddress
      );
      await gateway.waitForDeployment();

      expect(await gateway.morpho()).to.equal(morphoAddress);
      console.log(`✓ Morpho Blue Gateway deployed at: ${await gateway.getAddress()}`);
      console.log(`  Using Morpho at: ${morphoAddress} (chain ${chainId})`);
    });

    it("should register wstETH/USDC market", async function () {
      const [deployer] = await ethers.getSigners();

      // Check Morpho exists
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // Deploy gateway
      const MorphoGateway = await ethers.getContractFactory("MorphoBlueGatewayWrite");
      const gateway = await MorphoGateway.deploy(
        await router.getAddress(),
        deployer.address,
        morphoAddress
      );
      await gateway.waitForDeployment();

      // Use market based on chain
      const market = chainId === 1 ? ETH_MARKETS.wstETH_USDC : ARB_MARKETS.wstETH_USDC;

      await gateway.registerMarket({
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      });

      const marketIds = await gateway.getAllMarketIds();
      expect(marketIds.length).to.equal(1);
      console.log(`✓ Registered market: wstETH/USDC`);
      console.log(`  Market ID: ${marketIds[0]}`);
      console.log(`  Expected:  ${market.key}`);
    });
  });

  describe("View Gateway", function () {
    it("should deploy and query market state", async function () {
      // Check Morpho exists
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      // Deploy view gateway
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      // Use market based on chain
      const market = chainId === 1 ? ETH_MARKETS.wstETH_USDC : ARB_MARKETS.wstETH_USDC;

      const marketParams = {
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };

      // Query market state
      const [totalSupply, totalBorrow, utilization] = await viewGateway.getMarketState(marketParams);

      console.log(`✓ Market State: wstETH/USDC`);
      console.log(`  Total Supply: ${ethers.formatUnits(totalSupply, 6)} USDC`);
      console.log(`  Total Borrow: ${ethers.formatUnits(totalBorrow, 6)} USDC`);
      console.log(`  Utilization:  ${(Number(utilization) / 1e16).toFixed(2)}%`);

      // Verify it's a real market with activity
      expect(totalSupply).to.be.gt(0);
    });

    it("should compute market ID correctly", async function () {
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      const market = chainId === 1 ? ETH_MARKETS.wstETH_USDC : ARB_MARKETS.wstETH_USDC;

      const marketParams = {
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };

      const computedId = await viewGateway.computeMarketId(marketParams);
      expect(computedId.toLowerCase()).to.equal(market.key.toLowerCase());
      console.log(`✓ Market ID verified: ${computedId}`);
    });

    it("should register markets and enumerate them", async function () {
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      // Register multiple markets
      const markets = chainId === 1
        ? [ETH_MARKETS.wstETH_USDC, ETH_MARKETS.WBTC_USDC]
        : [ARB_MARKETS.wstETH_USDC, ARB_MARKETS.WBTC_USDC];

      const marketParamsList = markets.map(m => ({
        loanToken: m.loanToken,
        collateralToken: m.collateralToken,
        oracle: m.oracle,
        irm: m.irm,
        lltv: m.lltv,
      }));

      await viewGateway.registerMarkets(marketParamsList);

      const registeredIds = await viewGateway.getRegisteredMarketIds();
      expect(registeredIds.length).to.equal(2);
      console.log(`✓ Registered ${registeredIds.length} markets`);

      // Verify market count
      const count = await viewGateway.registeredMarketCount();
      expect(count).to.equal(2);
    });

    it("should get oracle price", async function () {
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      const market = chainId === 1 ? ETH_MARKETS.wstETH_USDC : ARB_MARKETS.wstETH_USDC;
      const marketParams = {
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };

      const oraclePrice = await viewGateway.getOraclePrice(marketParams);
      console.log(`✓ Oracle price (collateral/loan, 36 decimals): ${oraclePrice}`);
      // wstETH/USDC should have a price reflecting ETH price in USDC terms
      expect(oraclePrice).to.be.gt(0);
    });

    it("should get borrow and supply APR", async function () {
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      const market = chainId === 1 ? ETH_MARKETS.wstETH_USDC : ARB_MARKETS.wstETH_USDC;
      const marketParams = {
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };

      const borrowApr = await viewGateway.getBorrowApr(marketParams);
      const supplyApr = await viewGateway.getSupplyApr(marketParams);

      console.log(`✓ Borrow APR: ${(Number(borrowApr) / 1e16).toFixed(2)}%`);
      console.log(`✓ Supply APR: ${(Number(supplyApr) / 1e16).toFixed(2)}%`);

      // APRs should be reasonable (< 100%)
      expect(borrowApr).to.be.lt(ethers.parseEther("1")); // < 100%
    });

    it("should get comprehensive market info", async function () {
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      const market = chainId === 1 ? ETH_MARKETS.wstETH_USDC : ARB_MARKETS.wstETH_USDC;
      const marketParams = {
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };

      const info = await viewGateway.getMarketInfo(marketParams);

      console.log(`✓ Market Info:`);
      console.log(`  Loan Token: ${info.loanSymbol} (${info.loanDecimals} decimals)`);
      console.log(`  Collateral Token: ${info.collateralSymbol} (${info.collateralDecimals} decimals)`);
      console.log(`  LLTV: ${(Number(info.lltv) / 1e16).toFixed(1)}%`);
      console.log(`  Total Supply: ${ethers.formatUnits(info.totalSupplyAssets, info.loanDecimals)}`);
      console.log(`  Total Borrow: ${ethers.formatUnits(info.totalBorrowAssets, info.loanDecimals)}`);
      console.log(`  Utilization: ${(Number(info.utilizationRate) / 1e16).toFixed(2)}%`);
      console.log(`  Borrow APR: ${(Number(info.borrowRate) / 1e16).toFixed(2)}%`);
      console.log(`  Supply APR: ${(Number(info.supplyRate) / 1e16).toFixed(2)}%`);

      expect(info.loanSymbol).to.equal("USDC");
      expect(info.totalSupplyAssets).to.be.gt(0);
    });

    it("should get all markets info after registration", async function () {
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      // Register markets
      const markets = chainId === 1
        ? [ETH_MARKETS.wstETH_USDC, ETH_MARKETS.WBTC_USDC]
        : [ARB_MARKETS.wstETH_USDC, ARB_MARKETS.WBTC_USDC];

      const marketParamsList = markets.map(m => ({
        loanToken: m.loanToken,
        collateralToken: m.collateralToken,
        oracle: m.oracle,
        irm: m.irm,
        lltv: m.lltv,
      }));

      await viewGateway.registerMarkets(marketParamsList);

      const allInfos = await viewGateway.getAllMarketsInfo();
      expect(allInfos.length).to.equal(2);

      console.log(`✓ Got info for ${allInfos.length} registered markets:`);
      for (const info of allInfos) {
        console.log(`  - ${info.collateralSymbol}/${info.loanSymbol}: ${(Number(info.utilizationRate) / 1e16).toFixed(2)}% util`);
      }
    });

    it("should get market configs", async function () {
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      const markets = chainId === 1
        ? [ETH_MARKETS.wstETH_USDC]
        : [ARB_MARKETS.wstETH_USDC];

      const marketParamsList = markets.map(m => ({
        loanToken: m.loanToken,
        collateralToken: m.collateralToken,
        oracle: m.oracle,
        irm: m.irm,
        lltv: m.lltv,
      }));

      const configs = await viewGateway.getMarketConfigs(marketParamsList);
      expect(configs.length).to.equal(1);
      expect(configs[0].isActive).to.be.true;
      expect(configs[0].lltv).to.equal(markets[0].lltv);
      console.log(`✓ Market config: LLTV ${(Number(configs[0].lltv) / 1e16).toFixed(1)}%, active: ${configs[0].isActive}`);
    });
  });

  describe("Instruction Encoding", function () {
    it("should encode MarketParams as context", async function () {
      const market = chainId === 1 ? ETH_MARKETS.wstETH_USDC : ARB_MARKETS.wstETH_USDC;

      const encoded = encodeMarketParamsContext(
        market.loanToken,
        market.collateralToken,
        market.oracle,
        market.irm,
        market.lltv
      );

      console.log(`✓ Encoded context (${encoded.length} bytes)`);
      expect(encoded.length).to.equal(322); // 0x + 5 * 64 hex chars

      // Verify decoding works
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["address", "address", "address", "address", "uint256"],
        encoded
      );
      expect(decoded[0].toLowerCase()).to.equal(market.loanToken.toLowerCase());
      expect(decoded[1].toLowerCase()).to.equal(market.collateralToken.toLowerCase());
    });
  });

  describe("Full Flow: Deposit → Borrow → Repay → Withdraw", function () {
    it("should execute complete lending cycle on WBTC/USDC market", async function () {
      this.timeout(120000); // 2 min timeout for full flow

      const [deployer] = await ethers.getSigners();

      // Check Morpho exists
      const morphoCode = await ethers.provider.getCode(morphoAddress);
      if (morphoCode === "0x") {
        console.log("Morpho Blue not deployed, skipping");
        this.skip();
      }

      // Use WBTC/USDC market (has reliable liquidity)
      const market = chainId === 1 ? ETH_MARKETS.WBTC_USDC : ARB_MARKETS.WBTC_USDC;

      console.log("\n=== Morpho Blue Full Flow Test ===");
      console.log(`Market: WBTC/USDC (${chainId === 1 ? "Ethereum" : "Arbitrum"})`);
      console.log(`Morpho: ${morphoAddress}`);

      // ============ Setup ============

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();
      const routerAddress = await router.getAddress();
      console.log(`\n1. Router deployed: ${routerAddress}`);

      // Deploy gateway
      const MorphoGateway = await ethers.getContractFactory("MorphoBlueGatewayWrite");
      const gateway = await MorphoGateway.deploy(routerAddress, deployer.address, morphoAddress);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      console.log(`2. Gateway deployed: ${gatewayAddress}`);

      // Register gateway with router
      await router.addGateway("morpho-blue", gatewayAddress);
      console.log(`3. Gateway registered as "morpho-blue"`);

      // Register market
      await gateway.registerMarket({
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      });
      console.log(`4. Market registered: wstETH/USDC`);

      // ============ Get Test Tokens via Impersonation ============

      // Impersonate a WBTC whale (Aave pool on Arbitrum)
      const wbtcWhale = ARB_WHALES.WBTC;
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [wbtcWhale],
      });
      await network.provider.send("hardhat_setBalance", [wbtcWhale, "0x56BC75E2D63100000"]); // 100 ETH

      const whale = await ethers.getSigner(wbtcWhale);
      const wbtc = await ethers.getContractAt("IERC20", market.collateralToken);
      const usdc = await ethers.getContractAt("IERC20", market.loanToken);

      // Check whale balance (WBTC has 8 decimals)
      const whaleBalance = await wbtc.balanceOf(wbtcWhale);
      console.log(`\n5. Whale WBTC balance: ${ethers.formatUnits(whaleBalance, 8)} WBTC`);

      if (whaleBalance < BigInt(1e6)) { // 0.01 WBTC
        console.log("Whale has insufficient WBTC, skipping test");
        this.skip();
      }

      // Transfer WBTC to deployer (our test user)
      // 0.01 WBTC ≈ $1000 collateral
      const collateralAmount = BigInt(1e6); // 0.01 WBTC (8 decimals)
      await wbtc.connect(whale).transfer(deployer.address, collateralAmount);
      console.log(`6. Transferred ${ethers.formatUnits(collateralAmount, 8)} WBTC to test user`);

      // Stop impersonation
      await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [wbtcWhale],
      });

      // ============ Authorize Gateway on Morpho ============

      const morpho = await ethers.getContractAt("IMorphoBlue", morphoAddress);
      await morpho.connect(deployer).setAuthorization(gatewayAddress, true);
      console.log(`7. Authorized gateway on Morpho`);

      // ============ Step 1: Deposit Collateral ============

      console.log("\n--- Step 1: Deposit Collateral ---");
      const userWBTCBefore = await wbtc.balanceOf(deployer.address);
      console.log(`User WBTC before: ${ethers.formatUnits(userWBTCBefore, 8)}`);

      // Approve router to pull WBTC
      await wbtc.connect(deployer).approve(routerAddress, collateralAmount);

      // Build deposit instruction using PullToken + Approve + Deposit pattern
      const depositContext = encodeMarketParamsContext(
        market.loanToken,
        market.collateralToken,
        market.oracle,
        market.irm,
        market.lltv
      );

      // UTXO[0]: PullToken WBTC from user
      // UTXO[1]: Approve (empty - gateway approval)
      // Deposit uses UTXO[0]
      const depositInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, market.collateralToken, deployer.address)),
        createRouterInstruction(encodeApprove(0, "morpho-blue")),
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(
            LendingOp.DepositCollateral,
            market.collateralToken,
            deployer.address,
            0n, // amount from input
            depositContext,
            0   // input index 0 (PullToken output)
          )
        ),
      ];

      await router.connect(deployer).processProtocolInstructions(depositInstrs);

      const userWBTCAfterDeposit = await wbtc.balanceOf(deployer.address);
      console.log(`User WBTC after deposit: ${ethers.formatUnits(userWBTCAfterDeposit, 8)}`);
      expect(userWBTCAfterDeposit).to.equal(userWBTCBefore - collateralAmount);
      console.log("✓ Deposit successful!");

      // ============ Step 2: Borrow ============

      console.log("\n--- Step 2: Borrow USDC ---");
      const userUSDCBefore = await usdc.balanceOf(deployer.address);
      console.log(`User USDC before: ${ethers.formatUnits(userUSDCBefore, 6)}`);

      // Borrow ~$500 USDC (safe amount given collateral - 0.01 WBTC ≈ $1000, 86% LTV = $860 max)
      const borrowAmount = BigInt(500 * 1e6); // 500 USDC

      // Borrow produces UTXO[0], then push to user
      const borrowInstrs = [
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(
            LendingOp.Borrow,
            market.loanToken,
            deployer.address,
            borrowAmount,
            depositContext,
            999 // no input needed
          )
        ),
        createRouterInstruction(encodePushToken(0, deployer.address)), // Push borrowed USDC to user
      ];

      await router.connect(deployer).processProtocolInstructions(borrowInstrs);

      const userUSDCAfterBorrow = await usdc.balanceOf(deployer.address);
      console.log(`User USDC after borrow: ${ethers.formatUnits(userUSDCAfterBorrow, 6)}`);
      expect(userUSDCAfterBorrow).to.equal(borrowAmount);
      console.log("✓ Borrow successful!");

      // ============ Step 3: Repay ============

      console.log("\n--- Step 3: Repay USDC ---");

      // Use GetBorrowBalance to query exact debt (including any micro-interest/rounding)
      // Flow:
      // UTXO[0]: GetBorrowBalance -> exact debt amount (rounded UP)
      // UTXO[1]: PullToken (pull user's USDC)
      // UTXO[2]: Approve (empty)
      // UTXO[3]: Repay using UTXO[0] as input (exact debt) -> refund
      // Then push any refund back to user

      // GetBorrowBalance rounds UP to ensure full repayment. User may need a tiny buffer.
      // Fund user with 1 USDC extra from a whale
      const USDC_WHALE = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
      await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      const repayBuffer = BigInt(10e6); // 10 USDC buffer for interest + rounding
      await usdc.connect(usdcWhale).transfer(deployer.address, repayBuffer);

      // User now has borrowAmount + buffer USDC, approve it all
      const repayApproval = borrowAmount + repayBuffer;
      await usdc.connect(deployer).approve(routerAddress, repayApproval);

      const repayInstrs = [
        // Query exact debt -> UTXO[0]
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(
            LendingOp.GetBorrowBalance,
            market.loanToken,
            deployer.address,
            0n,
            depositContext,
            999
          )
        ),
        // Pull user's USDC (borrowed amount + buffer for rounding) -> UTXO[1]
        createRouterInstruction(encodePullToken(repayApproval, market.loanToken, deployer.address)),
        // Approve gateway for UTXO[1] -> UTXO[2] (empty)
        createRouterInstruction(encodeApprove(1, "morpho-blue")),
        // Repay using exact debt from UTXO[0] -> UTXO[3] (refund if any)
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(
            LendingOp.Repay,
            market.loanToken,
            deployer.address,
            0n, // amount from input
            depositContext,
            0   // input index 0 (GetBorrowBalance output = exact debt)
          )
        ),
        // Push any refund back to user
        createRouterInstruction(encodePushToken(3, deployer.address)),
      ];

      await router.connect(deployer).processProtocolInstructions(repayInstrs);

      const userUSDCAfterRepay = await usdc.balanceOf(deployer.address);
      console.log(`User USDC after repay: ${ethers.formatUnits(userUSDCAfterRepay, 6)} USDC (refund if any)`);
      console.log("✓ Repay successful!");

      // Debug: Check remaining debt after repay
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      const marketParams = {
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };
      const remainingDebt = await viewGateway.getBorrowBalance(marketParams, deployer.address);
      const remainingCollat = await viewGateway.getCollateralBalance(marketParams, deployer.address);
      console.log(`DEBUG: Remaining debt after repay: ${ethers.formatUnits(remainingDebt, 6)} USDC`);
      console.log(`DEBUG: Remaining collateral: ${ethers.formatUnits(remainingCollat, 8)} WBTC`);

      // Direct position query from Morpho
      const morphoContract = await ethers.getContractAt("IMorphoBlue", morphoAddress);
      const marketId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "address", "address", "uint256"],
          [market.loanToken, market.collateralToken, market.oracle, market.irm, market.lltv]
        )
      );
      const position = await morphoContract.position(marketId, deployer.address);
      console.log(`DEBUG: Raw position - supplyShares: ${position.supplyShares}, borrowShares: ${position.borrowShares}, collateral: ${position.collateral}`);

      // ============ Step 4: Withdraw Collateral ============

      console.log("\n--- Step 4: Withdraw Collateral ---");

      // Use GetSupplyBalance to query exact collateral balance, then withdraw using that UTXO
      // This handles any micro-rounding issues in Morpho's share-based accounting
      // UTXO[0]: GetSupplyBalance -> exact collateral
      // UTXO[1]: WithdrawCollateral using UTXO[0] -> WBTC
      // Then push to user
      const withdrawInstrs = [
        // Query exact collateral balance -> UTXO[0]
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(
            LendingOp.GetSupplyBalance,
            market.collateralToken,
            deployer.address,
            0n,
            depositContext,
            999 // no input
          )
        ),
        // Withdraw using exact balance from UTXO[0] -> UTXO[1]
        createProtocolInstruction(
          "morpho-blue",
          encodeLendingInstruction(
            LendingOp.WithdrawCollateral,
            market.collateralToken,
            deployer.address,
            0n,
            depositContext,
            0 // input index 0 (GetSupplyBalance output)
          )
        ),
        createRouterInstruction(encodePushToken(1, deployer.address)), // Push withdrawn WBTC to user
      ];

      await router.connect(deployer).processProtocolInstructions(withdrawInstrs);

      const userWBTCFinal = await wbtc.balanceOf(deployer.address);
      console.log(`User WBTC final: ${ethers.formatUnits(userWBTCFinal, 8)}`);
      // Should have received close to full collateral back (minus any dust from share rounding)
      expect(userWBTCFinal).to.be.gte((collateralAmount * 99n) / 100n);
      console.log("✓ Withdraw successful!");

      // ============ Summary ============

      console.log("\n=== Full Flow Complete ===");
      console.log(`Collateral deposited: ${ethers.formatUnits(collateralAmount, 8)} WBTC`);
      console.log(`Borrowed: ${ethers.formatUnits(borrowAmount, 6)} USDC`);
      console.log(`Repaid: exact debt via GetBorrowBalance`);
      console.log(`Collateral withdrawn: ${ethers.formatUnits(userWBTCFinal, 8)} WBTC`);
      console.log("✓ All operations completed successfully!");
    });
  });

  describe("Refinance: Aave → Morpho Blue", function () {
    // Constants for Arbitrum
    const AAVE_POOL_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
    const BALANCER_VAULT3 = "0xbA1333333333a1BA1108E8412f11850A5C319bA9";
    const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
    const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
    const WETH_WHALE = BALANCER_VAULT3;

    it("should refinance a WETH/USDC position from Aave to Morpho Blue", async function () {
      this.timeout(300000);

      // Check we're on Arbitrum fork (31337 is hardhat local, but we're forking Arbitrum)
      const chainId = Number((await ethers.provider.getNetwork()).chainId);
      if (chainId !== 42161 && chainId !== 31337) {
        console.log(`Skipping: Arbitrum only (got chain ${chainId})`);
        this.skip();
      }

      // Use Arbitrum Morpho address (works for both 42161 and 31337 fork)
      const morphoAddress = MORPHO_BY_CHAIN[42161];
      if (!morphoAddress) {
        console.log("Skipping: No Morpho Blue address for Arbitrum");
        this.skip();
      }

      // Use wstETH/USDC market (has good liquidity on Arbitrum)
      const market = ARB_MARKETS.wstETH_USDC;
      const wstETH = "0x5979D7b546E38E414F7E9822514be443A4800529";

      console.log("\n=== Refinance: Aave → Morpho Blue ===");
      console.log(`Market: wstETH/USDC (Arbitrum)`);

      const [deployer] = await ethers.getSigners();
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });
      const userAddress = user.address;

      // Setup tokens
      const wstEth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", wstETH);
      const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);

      // ============ Phase 1: Deploy Infrastructure ============
      console.log("\n--- Phase 1: Deploy Infrastructure ---");

      // Deploy Router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();
      const routerAddress = await router.getAddress();
      await router.setBalancerV3(BALANCER_VAULT3);
      console.log(`1. Router deployed: ${routerAddress}`);

      // Deploy Aave Gateway
      const AaveFactory = await ethers.getContractFactory("AaveGatewayWrite");
      const aaveGateway = await AaveFactory.deploy(routerAddress, AAVE_POOL_PROVIDER, 0);
      await router.addGateway("aave", await aaveGateway.getAddress());
      console.log(`2. Aave Gateway: ${await aaveGateway.getAddress()}`);

      // Deploy Morpho Blue Gateway
      const MorphoFactory = await ethers.getContractFactory("MorphoBlueGatewayWrite");
      const morphoGateway = await MorphoFactory.deploy(routerAddress, deployer.address, morphoAddress);
      await morphoGateway.waitForDeployment();
      const morphoGatewayAddress = await morphoGateway.getAddress();
      await router.addGateway("morpho-blue", morphoGatewayAddress);
      console.log(`3. Morpho Gateway: ${morphoGatewayAddress}`);

      // Register market
      await morphoGateway.registerMarket({
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      });
      console.log(`4. Market registered`);

      // ============ Phase 2: Setup Aave Position ============
      console.log("\n--- Phase 2: Setup Aave Position ---");

      // Fund user with wstETH using known whale
      const wstETH_WHALE = ARB_WHALES.wstETH;
      await network.provider.send("hardhat_setBalance", [wstETH_WHALE, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [wstETH_WHALE] });
      const wstEthWhale = await ethers.getSigner(wstETH_WHALE);
      
      const collateralAmount = ethers.parseEther("1"); // 1 wstETH
      await wstEth.connect(wstEthWhale).transfer(userAddress, collateralAmount);
      console.log(`Funded user with ${ethers.formatEther(collateralAmount)} wstETH`);

      // Deposit to Aave and borrow USDC
      await wstEth.connect(user).approve(routerAddress, collateralAmount);

      const borrowAmount = BigInt(500 * 1e6); // 500 USDC
      // UTXO Flow:
      // 0: PullToken -> wstETH
      // 1: Approve -> empty
      // (DepositCollateral produces 0 outputs)
      // 2: Borrow -> USDC
      const setupInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, wstETH, userAddress)),
        createRouterInstruction(encodeApprove(0, "aave")),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.DepositCollateral, wstETH, userAddress, 0n, "0x", 0)),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Borrow, USDC, userAddress, borrowAmount, "0x", 999)),
        createRouterInstruction(encodePushToken(2, userAddress)), // Push borrowed USDC (index 2)
      ];

      // Authorize Aave
      const [setupTargets, setupData] = await router.authorizeInstructions(setupInstrs, userAddress);
      for (let i = 0; i < setupTargets.length; i++) {
        if (setupTargets[i] !== ethers.ZeroAddress && setupData[i] !== "0x") {
          await user.sendTransaction({ to: setupTargets[i], data: setupData[i] });
        }
      }

      await router.connect(user).processProtocolInstructions(setupInstrs);
      console.log(`✓ Aave position created: ${ethers.formatEther(collateralAmount)} wstETH collateral, ${ethers.formatUnits(borrowAmount, 6)} USDC debt`);

      // ============ Phase 3: Refinance to Morpho Blue ============
      console.log("\n--- Phase 3: Refinance to Morpho Blue ---");

      const morphoContext = encodeMarketParamsContext(
        market.loanToken,
        market.collateralToken,
        market.oracle,
        market.irm,
        market.lltv
      );

      /**
       * UTXO Flow:
       * 0: Aave.GetBorrowBalance(USDC) -> exact debt
       * 1: FlashLoan(Balancer, Input=0) -> [repayAmount]
       * 2: Approve(Aave, UTXO[1])
       * 3: Aave.Repay(USDC, Input=0) -> refund
       * 4: Aave.GetSupplyBalance(wstETH) -> exact collateral
       * 5: Aave.WithdrawCollateral(wstETH, Input=4) -> collateral
       * 6: Approve(Morpho, UTXO[5])
       * 7: Morpho.DepositCollateral(wstETH, Input=4)
       * 8: Morpho.Borrow(USDC, Input=1) -> borrowed USDC to repay flash loan
       */
      const refinanceInstrs = [
        // Query Aave debt
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetBorrowBalance, USDC, userAddress, 0n, "0x", 999)),
        // Flash loan exact debt
        createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV3, 0)),
        // Approve Aave for repay
        createRouterInstruction(encodeApprove(1, "aave")),
        // Repay Aave debt
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, "0x", 0)),
        // Query Aave collateral
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetSupplyBalance, wstETH, userAddress, 0n, "0x", 999)),
        // Withdraw collateral from Aave
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.WithdrawCollateral, wstETH, userAddress, 0n, "0x", 4)),
        // Approve Morpho for deposit
        createRouterInstruction(encodeApprove(5, "morpho-blue")),
        // Deposit collateral to Morpho
        createProtocolInstruction("morpho-blue", encodeLendingInstruction(LendingOp.DepositCollateral, wstETH, userAddress, 0n, morphoContext, 4)),
        // Borrow from Morpho to repay flash loan
        createProtocolInstruction("morpho-blue", encodeLendingInstruction(LendingOp.Borrow, USDC, userAddress, 0n, morphoContext, 1)),
      ];

      // Authorize both protocols
      const [refTargets, refData] = await router.authorizeInstructions(refinanceInstrs, userAddress);
      let authCount = 0;
      for (let i = 0; i < refTargets.length; i++) {
        if (refTargets[i] !== ethers.ZeroAddress && refData[i] !== "0x") {
          console.log(`Authorizing: ${refTargets[i]}`);
          await user.sendTransaction({ to: refTargets[i], data: refData[i] });
          authCount++;
        }
      }
      console.log(`✓ Sent ${authCount} authorization transactions`);

      // Authorize Morpho gateway to act on behalf of user (if not already done via authorizeInstructions)
      const morpho = await ethers.getContractAt("IMorphoBlue", morphoAddress);
      const isAlreadyAuthorized = await morpho.isAuthorized(userAddress, morphoGatewayAddress);
      if (!isAlreadyAuthorized) {
        await morpho.connect(user).setAuthorization(morphoGatewayAddress, true);
        console.log(`✓ Authorized Morpho gateway`);
      } else {
        console.log(`✓ Morpho gateway already authorized`);
      }

      // Execute refinance
      const tx = await router.connect(user).processProtocolInstructions(refinanceInstrs);
      const receipt = await tx.wait();
      console.log(`✓ Refinance executed! Gas: ${receipt.gasUsed}`);

      // ============ Phase 4: Verify ============
      console.log("\n--- Phase 4: Verify Positions ---");

      // Check Aave position (should be ~0)
      const poolProvider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
        AAVE_POOL_PROVIDER
      );
      const aaveDataProvider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol:IPoolDataProvider",
        await poolProvider.getPoolDataProvider()
      );
      const aaveData = await aaveDataProvider.getUserReserveData(wstETH, userAddress);
      const aaveCollateral = aaveData[0];
      const aaveUsdcData = await aaveDataProvider.getUserReserveData(USDC, userAddress);
      const aaveDebt = aaveUsdcData[1] + aaveUsdcData[2]; // variable + stable

      console.log(`Aave wstETH: ${ethers.formatEther(aaveCollateral)} (should be ~0)`);
      console.log(`Aave USDC debt: ${ethers.formatUnits(aaveDebt, 6)} (should be ~0)`);

      // Check Morpho position
      const ViewGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
      const viewGateway = await ViewGateway.deploy(morphoAddress, deployer.address);
      await viewGateway.waitForDeployment();

      const marketParams = {
        loanToken: market.loanToken,
        collateralToken: market.collateralToken,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };
      const morphoCollateral = await viewGateway.getCollateralBalance(marketParams, userAddress);
      const morphoDebt = await viewGateway.getBorrowBalance(marketParams, userAddress);

      console.log(`Morpho wstETH: ${ethers.formatEther(morphoCollateral)} (should be ~${ethers.formatEther(collateralAmount)})`);
      console.log(`Morpho USDC debt: ${ethers.formatUnits(morphoDebt, 6)} (should be ~${ethers.formatUnits(borrowAmount, 6)})`);

      // Assertions
      expect(aaveCollateral).to.be.lt(ethers.parseEther("0.001")); // Dust
      expect(aaveDebt).to.be.lt(BigInt(1e6)); // Less than 1 USDC
      expect(morphoCollateral).to.be.closeTo(collateralAmount, ethers.parseEther("0.01"));
      expect(morphoDebt).to.be.gte(borrowAmount);

      console.log("\n✓ Refinance successful: Aave → Morpho Blue!");
    });
  });
});

// ============ Helper Functions ============

/**
 * Encode MarketParams for use in LendingInstruction context
 */
export function encodeMarketParamsContext(
  loanToken: string,
  collateralToken: string,
  oracle: string,
  irm: string,
  lltv: bigint
): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "address", "address", "uint256"],
    [loanToken, collateralToken, oracle, irm, lltv]
  );
}

/**
 * Create a Morpho Blue lending instruction
 */
export function createMorphoInstruction(
  op: LendingOp,
  market: {
    loanToken: string;
    collateralToken: string;
    oracle: string;
    irm: string;
    lltv: bigint;
  },
  user: string,
  amount: bigint,
  inputIndex: number = 999
) {
  const context = encodeMarketParamsContext(
    market.loanToken,
    market.collateralToken,
    market.oracle,
    market.irm,
    market.lltv
  );

  // Token field: use collateral token for collateral ops, loan token for borrow/repay
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

// Export markets for use in other test files
export { ARB_MARKETS, ETH_MARKETS, MORPHO_BY_CHAIN, ARB_WHALES };
