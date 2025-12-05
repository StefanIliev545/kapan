import { expect } from "chai";
import { ethers } from "hardhat";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const EULER_PRICE_ORACLE = process.env.EULER_PRICE_ORACLE;
const EULER_VAULTS = process.env.EULER_VAULTS?.split(",").map((v) => v.trim()).filter(Boolean) || [];
const AAVE_ADDRESSES_PROVIDER = process.env.AAVE_ADDRESSES_PROVIDER;
const AAVE_UI_DATA_PROVIDER = process.env.AAVE_UI_DATA_PROVIDER;

describe("Euler/Aave market intersection :fork", function () {
  this.timeout(180000);

  before(function () {
    if (!FORK) {
      this.skip();
    }
    if (!EULER_PRICE_ORACLE || EULER_VAULTS.length === 0 || !AAVE_ADDRESSES_PROVIDER || !AAVE_UI_DATA_PROVIDER) {
      this.skip();
    }
  });

  it("finds at least one overlapping underlying", async function () {
    const [deployer] = await ethers.getSigners();

    const EulerView = await ethers.getContractFactory("EulerGatewayView");
    const eulerView = await EulerView.deploy(EULER_PRICE_ORACLE!, await deployer.getAddress());
    await eulerView.waitForDeployment();
    for (const vault of EULER_VAULTS) {
      await eulerView.addEulerMarket(vault);
    }
    const eulerTokens = await eulerView.getAllTokensInfo(await deployer.getAddress());
    const eulerUnderlyings = eulerTokens.map((t) => t.token.toLowerCase());

    const AaveView = await ethers.getContractFactory("AaveGatewayView");
    const aaveView = await AaveView.deploy(AAVE_ADDRESSES_PROVIDER!, AAVE_UI_DATA_PROVIDER!);
    await aaveView.waitForDeployment();
    const aaveTokens = await aaveView.getAllTokensInfo(await deployer.getAddress());
    const aaveUnderlyings = aaveTokens.map((t) => t.token.toLowerCase());

    const overlap = aaveUnderlyings.filter((token) => eulerUnderlyings.includes(token));
    expect(overlap.length).to.be.greaterThan(0);
  });
});
