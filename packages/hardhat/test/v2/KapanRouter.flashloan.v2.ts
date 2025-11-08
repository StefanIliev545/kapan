import { expect } from "chai";
import { ethers } from "hardhat";
import { encodeToOutput, encodeFlashLoan, FlashLoanProvider, encodeLendingInstruction, LendingOp, createProtocolInstruction } from "./helpers/instructionHelpers";

describe("KapanRouter flashloan v2", function () {
  it("resumes runStack after Balancer v2 callback", async function () {
    const [deployer] = await ethers.getSigners();

    // Deploy mock ERC20 token (like approve test does)
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const token = await ERC20.deploy("Test Token", "TEST", deployer.address, 1000000n * 10n ** 18n);
    await token.waitForDeployment();
    const testToken = await token.getAddress();

    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();

    const MockV2 = await ethers.getContractFactory("MockBalancerV2Provider");
    const v2 = await MockV2.deploy();
    await v2.waitForDeployment();
    await (await router.setBalancerV2(await v2.getAddress())).wait();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();
    await (await router.addGateway("mock", await mock.getAddress())).wait();

    // Fund the mock provider with tokens so it can "flash loan" them
    const testAmount = 1000n * 10n ** 18n;
    const fee = (testAmount * 9n) / 10000n; // 0.09% fee
    const repayment = testAmount + fee;
    await token.transfer(await v2.getAddress(), testAmount * 2n); // Give provider enough to flash loan
    // Also fund router with fee amount so it can repay (it will receive principal from flash loan)
    await token.transfer(await router.getAddress(), fee);

    // Build instructions:
    // 1. ToOutput: create UTXO with amount and token for flash loan
    // 2. FlashLoan: use the UTXO from step 1
    // 3. Two mock instructions to verify stack resumes
    // Use Deposit op (doesn't require authorization) with proper LendingInstruction format
    
    const i0 = { protocolName: "router", data: encodeToOutput(testAmount, testToken) };
    const i1 = { protocolName: "router", data: encodeFlashLoan(FlashLoanProvider.BalancerV2, 0) }; // Use UTXO index 0
    // Use Deposit op (doesn't require authorization) - these are just test instructions to verify stack resumes
    const i2 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, testToken, deployer.address, 1n, "0x", 999));
    const i3 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, testToken, deployer.address, 2n, "0x", 999));

    const tx = await router.processProtocolInstructions([i0, i1, i2, i3]);
    const receipt = await tx.wait();

    const mockAddress = await mock.getAddress();
    const logs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());
    expect(logs.length).to.equal(2);
  });
});


