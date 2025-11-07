import { expect } from "chai";
import { ethers } from "hardhat";

describe("KapanRouter transient instruction stack", function () {
  it("processes all instructions via transient stack in order", async function () {
    const [deployer] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();

    await (await router.addGateway("mock", await mock.getAddress())).wait();

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const payloads = [1n, 2n, 3n].map((n) => coder.encode(["uint256"], [n]));
    const instructions = payloads.map((data) => ({ protocolName: "mock", data }));

    const tx = await router.processProtocolInstructions(instructions);
    const receipt = await tx.wait();

    const mockAddress = await mock.getAddress();
    const logs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());

    const decoded = logs.map((log: any) => {
      const parsed = mock.interface.parseLog(log);
      return parsed?.args?.[0] as string;
    });

    expect(decoded.length).to.equal(payloads.length);
    // Should process in original order: 1,2,3
    for (let i = 0; i < payloads.length; i++) {
      expect(decoded[i]).to.equal(payloads[i]);
    }
  });
});


