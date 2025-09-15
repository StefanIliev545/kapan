import { expect } from "chai";
import { ethers } from "hardhat";

describe("RouterGateway", function () {
  let routerGateway: any;
  let owner: any;
  let user: any;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    routerGateway = await ethers.deployContract(
      "contracts/v2/RouterGateway.sol:RouterGateway",
      [await owner.getAddress()]
    );
  });

  describe("Gateway Management", function () {
    it("should allow owner to add a gateway", async function () {
      const mockGatewayAddress = "0x" + "1".repeat(40);
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
});
