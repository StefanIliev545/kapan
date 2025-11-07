import { expect } from "chai";
import { ethers } from "hardhat";

describe("KapanRouter flashloan v3", function () {
  it("resumes runStack after Balancer v3 callback", async function () {
    const [deployer] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();

    const MockV3 = await ethers.getContractFactory("MockBalancerV3Vault");
    const v3 = await MockV3.deploy();
    await v3.waitForDeployment();
    await (await router.setBalancerV3(await v3.getAddress())).wait();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();
    await (await router.addGateway("mock", await mock.getAddress())).wait();

    // Build instructions: router FlashLoanV3, then two mock instructions
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const routerInstr = coder.encode([
      "tuple(uint256 amount,address token,address user,uint8 instructionType)"
    ], [[0n, ethers.ZeroAddress, await deployer.getAddress(), 1]]); // FlashLoanV3 = 1

    const i0 = { protocolName: "router", data: routerInstr };
    const i1 = { protocolName: "mock", data: coder.encode(["uint256"], [1n]) };
    const i2 = { protocolName: "mock", data: coder.encode(["uint256"], [2n]) };

    const tx = await router.processProtocolInstructions([i0, i1, i2]);
    const receipt = await tx.wait();

    const mockAddress = await mock.getAddress();
    const logs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());
    expect(logs.length).to.equal(2);
  });
});


