import { expect } from "chai";
import { ethers, network } from "hardhat";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const EULER_PRICE_ORACLE = process.env.EULER_PRICE_ORACLE;
const EULER_VAULTS = process.env.EULER_VAULTS?.split(",").map((v) => v.trim()).filter(Boolean) || [];

/**
 * Fork smoke test to prove Euler markets can be enumerated on a live network.
 */
describe("Euler gateway markets :fork", function () {
  this.timeout(120000);

  before(function () {
    if (!FORK) {
      this.skip();
    }
    if (!EULER_PRICE_ORACLE || EULER_VAULTS.length === 0) {
      this.skip();
    }
  });

  it("lists configured Euler vaults with underlying metadata", async function () {
    const [deployer] = await ethers.getSigners();

    const View = await ethers.getContractFactory("EulerGatewayView");
    const view = await View.deploy(EULER_PRICE_ORACLE!, await deployer.getAddress());
    await view.waitForDeployment();

    for (const vault of EULER_VAULTS) {
      await view.addEulerMarket(vault);
    }

    const [vaults, tokens, symbols, decimals, prices] = await view.getAllEulerMarkets();
    expect(vaults.length).to.be.greaterThan(0);
    expect(vaults.length).to.equal(tokens.length);
    expect(symbols.length).to.equal(vaults.length);
    expect(decimals.length).to.equal(vaults.length);
    expect(prices.length).to.equal(vaults.length);

    vaults.forEach((vault, idx) => {
      expect(vault).to.not.equal(ethers.ZeroAddress);
      expect(tokens[idx]).to.not.equal(ethers.ZeroAddress);
      expect(decimals[idx]).to.be.greaterThan(0);
    });
  });
});
