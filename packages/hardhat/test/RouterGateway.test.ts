import { expect } from "chai";
import { ethers } from "hardhat";
import { RouterGateway, MockGateway, ERC20PresetMinterPauser } from "../typechain-types";

describe("RouterGateway", function () {
  let routerGateway: RouterGateway;
  let owner: any;
  let user: any;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy RouterGateway with zero addresses for Balancer vaults since we're not testing those
    routerGateway = await ethers.deployContract("RouterGateway", [
      ethers.ZeroAddress,  // balancerV3Vault
      ethers.ZeroAddress,  // balancerV2Vault
      await owner.getAddress()
    ]) as RouterGateway;
  });

  describe("Gateway Management", function () {
    it("should allow owner to add a gateway", async function () {
      const mockGatewayAddress = "0x" + "1".repeat(40); // Create a fake address
      await routerGateway.addGateway("testProtocol", mockGatewayAddress);
      
      const registeredAddress = await routerGateway.gateways("testProtocol");
      expect(registeredAddress).to.equal(mockGatewayAddress);
    });

    it("should not allow non-owner to add a gateway", async function () {
      const mockGatewayAddress = "0x" + "1".repeat(40);
      await expect(
        routerGateway.connect(user).addGateway("testProtocol", mockGatewayAddress)
      ).to.be.revertedWithCustomError(routerGateway, "OwnableUnauthorizedAccount");
    });
  });

  describe("Protocol Instructions", function () {
    it("should cap oversized deposits and repays and support withdraw_all", async function () {
      const mockGateway = (await ethers.deployContract("MockGateway")) as MockGateway;
      await routerGateway.addGateway("mock", await mockGateway.getAddress());

      const token = (await ethers.deployContract("ERC20PresetMinterPauser", ["Test", "TST"])) as ERC20PresetMinterPauser;

      // Deposit with amount larger than balance
      await token.mint(await owner.getAddress(), 500);
      await token.approve(await routerGateway.getAddress(), 1000);
      await routerGateway.processProtocolInstructions([
        { protocolName: "mock", instructions: [ { instructionType: 0, basic: { token: await token.getAddress(), amount: 1000, user: await owner.getAddress() }, context: "0x" } ] }
      ]);
      expect(await mockGateway.lastAmount()).to.equal(500);

      // Repay all debt with limited balance
      await mockGateway.setMockDebt(1000);
      await token.mint(await owner.getAddress(), 300);
      await token.approve(await routerGateway.getAddress(), 300);
      await routerGateway.processProtocolInstructions([
        { protocolName: "mock", instructions: [ { instructionType: 3, basic: { token: await token.getAddress(), amount: ethers.MaxUint256, user: await owner.getAddress() }, context: "0x" } ] }
      ]);
      expect(await mockGateway.lastAmount()).to.equal(300);

      // Withdraw all available balance
      await mockGateway.setMockBalance(1000);
      await routerGateway.processProtocolInstructions([
        { protocolName: "mock", instructions: [ { instructionType: 1, basic: { token: await token.getAddress(), amount: ethers.MaxUint256, user: await owner.getAddress() }, context: "0x" } ] }
      ]);
      expect(await mockGateway.lastAmount()).to.equal(1000);
    });
  });

  describe("Flash Loan Protection", function () {
    it("should not allow direct flash loan callbacks", async function () {
      const tokens: any[] = [];
      const amounts: any[] = [];
      const feeAmounts: any[] = [];
      const userData = "0x";

      await expect(
        routerGateway.receiveFlashLoan(tokens, amounts, feeAmounts, userData)
      ).to.be.revertedWith("Flash loan not enabled");
    });
  });
}); 