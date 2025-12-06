import { expect } from "chai";
import { ethers } from "hardhat";
import {
  createProtocolInstruction,
  encodeLendingInstruction,
  encodeToOutput,
  LendingOp,
} from "./helpers/instructionHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const EULER_PRICE_ORACLE = process.env.EULER_PRICE_ORACLE;
const EULER_VAULTS = process.env.EULER_VAULTS?.split(",").map((v) => v.trim()).filter(Boolean) || [];
const EULER_EVC = process.env.EULER_EVC;

/**
 * Fork-level authorization test to ensure router can surface Euler approvals.
 */
describe("Euler router authorization :fork", function () {
  this.timeout(180000);

  before(function () {
    if (!FORK) {
      this.skip();
    }
    if (!EULER_PRICE_ORACLE || !EULER_EVC || EULER_VAULTS.length === 0) {
      this.skip();
    }
  });

  it("surfaces EVC setup when borrowing after collateral deposit", async function () {
    const [deployer, user] = await ethers.getSigners();
    const EulerView = await ethers.getContractFactory("EulerGatewayView");
    const view = await EulerView.deploy(EULER_PRICE_ORACLE!, await deployer.getAddress());
    await view.waitForDeployment();
    await view.addEulerMarket(EULER_VAULTS[0]);
    const [, tokens] = await view.getAllEulerMarkets();
    const token = tokens[0];

    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    const Write = await ethers.getContractFactory("EulerGatewayWrite");
    const write = await Write.deploy(await router.getAddress(), EULER_EVC!, await deployer.getAddress());
    await write.waitForDeployment();
    await write.addEulerMarket(EULER_VAULTS[0]);
    await router.addGateway("euler", await write.getAddress());

    const instructions = [
      createProtocolInstruction("router", encodeToOutput(1n, token)),
      createProtocolInstruction(
        "euler",
        encodeLendingInstruction(LendingOp.DepositCollateral, token, await user.getAddress(), 1n, "0x", 0)
      ),
      createProtocolInstruction(
        "euler",
        encodeLendingInstruction(LendingOp.Borrow, token, await user.getAddress(), 1n, "0x", 999)
      ),
    ];

    const { data: authData } = await router.authorizeInstructions(instructions, await user.getAddress());
    // Expect at least one non-empty authorization call (EVC multicall)
    const hasAuth = authData.some((d) => d !== "0x");
    expect(hasAuth).to.equal(true);
  });
});
