import { expect } from "chai";
import { ethers } from "hardhat";
import { encodeLendingInstruction, LendingOp } from "./helpers/instructionHelpers";

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
    const userAddress = await deployer.getAddress();
    // Use dummy token but real user address for authorization, vary amount to track order
    const payloads = [1n, 2n, 3n].map((n) =>
      encodeLendingInstruction(LendingOp.Deposit, "0x0000000000000000000000000000000000000000", userAddress, n, "0x", 999)
    );
    const instructions = payloads.map((data) => ({ protocolName: "mock", data }));

    const tx = await router.processProtocolInstructions(instructions);
    const receipt = await tx.wait();

    const mockAddress = await mock.getAddress();
    const logs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());

    const decoded = logs.map((log: any) => {
      const parsed = mock.interface.parseLog(log);
      // MockGateway emits Instruction(bytes data)
      // We need to decode the data as LendingInstruction
      const data = parsed?.args?.[0];
      const lendingInstr = ethers.AbiCoder.defaultAbiCoder().decode(
        ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
        data
      );
      return lendingInstr[0].amount;
    });

    expect(decoded.length).to.equal(payloads.length);
    // Should process in original order: 1,2,3
    for (let i = 0; i < payloads.length; i++) {
      expect(decoded[i]).to.equal(BigInt(i + 1));
    }
  });
});


