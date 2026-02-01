import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * Test that ViewRouter.getCollateralPrice returns correct values for Morpho
 */
describe("ViewRouter Morpho Price Fix", function () {
  // Skip if not Arbitrum fork (localhost inherits chain from fork)
  before(async function () {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    if (chainId !== 42161n && chainId !== 31337n) {
      console.log("Skipping - chainId:", chainId);
      this.skip();
    }
  });

  it("should return correct collateral price for WBTC/USDC Morpho market", async function () {
    this.timeout(120000);

    const WBTC = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f";
    const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
    const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

    const [deployer] = await ethers.getSigners();

    // Deploy fresh ViewRouter
    const ViewRouter = await ethers.getContractFactory("KapanViewRouter");
    const viewRouter = await ViewRouter.deploy(await deployer.getAddress());
    await viewRouter.waitForDeployment();

    // Deploy MorphoBlueGatewayView
    const MorphoGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
    const morphoGateway = await MorphoGateway.deploy(morpho, await deployer.getAddress());
    await morphoGateway.waitForDeployment();

    // Set gateway in ViewRouter
    await viewRouter.setGateway("morpho-blue", await morphoGateway.getAddress());

    // Find WBTC/USDC market
    const Morpho = await ethers.getContractAt(
      ["function idToMarketParams(bytes32 id) view returns (address, address, address, address, uint256)"],
      morpho
    );

    // Get registered market IDs
    const marketIds = await morphoGateway.getRegisteredMarketIds();
    let wbtcMarketParams: any;
    let wbtcMarketId: string = "";

    for (const marketId of marketIds) {
      const params = await Morpho.idToMarketParams(marketId);
      if (params[1].toLowerCase() === WBTC.toLowerCase() &&
          params[0].toLowerCase() === USDC.toLowerCase()) {
        wbtcMarketParams = {
          loanToken: params[0],
          collateralToken: params[1],
          oracle: params[2],
          irm: params[3],
          lltv: params[4]
        };
        wbtcMarketId = marketId;
        break;
      }
    }

    if (!wbtcMarketParams) {
      // Register the market manually if not found
      const knownMarketId = "0xe6392ff19d10454b099d692b58c361ef93e31af34ed1ef78232e07c78fe99169";
      const params = await Morpho.idToMarketParams(knownMarketId);
      wbtcMarketParams = {
        loanToken: params[0],
        collateralToken: params[1],
        oracle: params[2],
        irm: params[3],
        lltv: params[4]
      };
      wbtcMarketId = knownMarketId;
    }

    console.log("WBTC Market ID:", wbtcMarketId);
    console.log("Loan Token:", wbtcMarketParams.loanToken);
    console.log("Collateral Token:", wbtcMarketParams.collateralToken);

    // Get oracle price directly
    const Oracle = await ethers.getContractAt(
      ["function price() view returns (uint256)"],
      wbtcMarketParams.oracle
    );
    const oraclePrice = await Oracle.price();
    console.log("Oracle price (raw):", oraclePrice.toString());

    // Calculate expected BTC price
    // For WBTC(8)/USDC(6): Oracle scale = 10^(36 + 6 - 8) = 10^34
    const expectedBtcPrice = Number(oraclePrice) / 1e34;
    console.log("Expected BTC price (USDC):", expectedBtcPrice.toFixed(2));

    // Encode market params for context
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const context = abiCoder.encode(
      ["tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"],
      [wbtcMarketParams]
    );

    // Get collateral price from ViewRouter
    const MORPHO_BLUE = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10) as `0x${string}`;
    const collateralPrice = await viewRouter.getCollateralPrice(MORPHO_BLUE, WBTC, context);
    console.log("ViewRouter collateralPrice (raw):", collateralPrice.toString());
    console.log("ViewRouter collateralPrice (8 dec):", Number(collateralPrice) / 1e8);

    // The collateral price should be the BTC price in 8 decimals
    // Expected: ~77000 * 1e8 = 7.7e12
    const priceIn8Dec = Number(collateralPrice) / 1e8;
    console.log("Price comparison:");
    console.log("  Expected BTC price:", expectedBtcPrice.toFixed(2));
    console.log("  ViewRouter price:", priceIn8Dec.toFixed(2));

    // They should be within 1% of each other
    const priceDiff = Math.abs(expectedBtcPrice - priceIn8Dec) / expectedBtcPrice;
    console.log("  Difference:", (priceDiff * 100).toFixed(4) + "%");

    expect(priceDiff).to.be.lessThan(0.01, "Price should be within 1% of oracle price");
  });

  it("should return correct collateral price for wstETH/USDC Morpho market", async function () {
    this.timeout(120000);

    const wstETH = "0x5979D7b546E38E414F7E9822514be443A4800529"; // 18 decimals
    const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

    const [deployer] = await ethers.getSigners();

    // Deploy fresh ViewRouter
    const ViewRouter = await ethers.getContractFactory("KapanViewRouter");
    const viewRouter = await ViewRouter.deploy(await deployer.getAddress());
    await viewRouter.waitForDeployment();

    // Deploy MorphoBlueGatewayView
    const MorphoGateway = await ethers.getContractFactory("MorphoBlueGatewayView");
    const morphoGateway = await MorphoGateway.deploy(morpho, await deployer.getAddress());
    await morphoGateway.waitForDeployment();

    // Set gateway in ViewRouter
    await viewRouter.setGateway("morpho-blue", await morphoGateway.getAddress());

    // Find wstETH/USDC market from registered markets
    const Morpho = await ethers.getContractAt(
      ["function idToMarketParams(bytes32 id) view returns (address, address, address, address, uint256)"],
      morpho
    );

    const marketIds = await morphoGateway.getRegisteredMarketIds();
    let wstEthMarketParams: any;

    for (const marketId of marketIds) {
      const params = await Morpho.idToMarketParams(marketId);
      if (params[1].toLowerCase() === wstETH.toLowerCase()) {
        wstEthMarketParams = {
          loanToken: params[0],
          collateralToken: params[1],
          oracle: params[2],
          irm: params[3],
          lltv: params[4]
        };
        break;
      }
    }

    if (!wstEthMarketParams) {
      console.log("No wstETH market found, skipping");
      this.skip();
      return;
    }

    console.log("wstETH Market found");
    console.log("Loan Token (USDC):", wstEthMarketParams.loanToken);
    console.log("Collateral Token (wstETH):", wstEthMarketParams.collateralToken);

    // Get oracle price directly
    const Oracle = await ethers.getContractAt(
      ["function price() view returns (uint256)"],
      wstEthMarketParams.oracle
    );
    const oraclePrice = await Oracle.price();
    console.log("Oracle price (raw):", oraclePrice.toString());

    // Calculate expected wstETH price
    // For wstETH(18)/USDC(6): Oracle scale = 10^(36 + 6 - 18) = 10^24
    const expectedWstEthPrice = Number(oraclePrice) / 1e24;
    console.log("Expected wstETH price (USDC):", expectedWstEthPrice.toFixed(2));

    // Encode market params for context
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const context = abiCoder.encode(
      ["tuple(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"],
      [wstEthMarketParams]
    );

    // Get collateral price from ViewRouter
    const MORPHO_BLUE = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10) as `0x${string}`;
    const collateralPrice = await viewRouter.getCollateralPrice(MORPHO_BLUE, wstETH, context);
    console.log("ViewRouter collateralPrice (raw):", collateralPrice.toString());
    console.log("ViewRouter collateralPrice (8 dec):", Number(collateralPrice) / 1e8);

    const priceIn8Dec = Number(collateralPrice) / 1e8;
    console.log("Price comparison:");
    console.log("  Expected wstETH price:", expectedWstEthPrice.toFixed(2));
    console.log("  ViewRouter price:", priceIn8Dec.toFixed(2));

    const priceDiff = Math.abs(expectedWstEthPrice - priceIn8Dec) / expectedWstEthPrice;
    console.log("  Difference:", (priceDiff * 100).toFixed(4) + "%");

    expect(priceDiff).to.be.lessThan(0.01, "Price should be within 1% of oracle price");
  });
});
