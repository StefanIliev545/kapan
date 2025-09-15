import { expect } from "chai";
import { ethers } from "hardhat";
import { RouterGateway } from "../typechain-types";

describe.skip("RouterGateway", function () {
  let routerGateway: RouterGateway;
  let owner: any;
  let user: any;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy RouterGateway with zero addresses for Balancer vaults since we're not testing those
    routerGateway = await ethers.deployContract(
      "contracts/RouterGateway.sol:RouterGateway",
      [ethers.ZeroAddress, ethers.ZeroAddress, await owner.getAddress()]
    ) as RouterGateway;
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