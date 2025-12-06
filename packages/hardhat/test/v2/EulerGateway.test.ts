import { expect } from "chai";
import { ethers } from "hardhat";
import { encodeLendingInstruction, LendingOp } from "./helpers/instructionHelpers";

const MAX_UINT = ethers.MaxUint256;

describe("Euler gateway authorization and outputs", () => {
  async function deployFixture() {
    const [router, user] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const asset = await MockERC20.deploy("Mock Token", "MTKN");
    await asset.waitForDeployment();
    await asset.mint(await router.getAddress(), ethers.parseEther("1000"));
    await asset.mint(await user.getAddress(), ethers.parseEther("1000"));

    const MockEVC = await ethers.getContractFactory("MockEVC");
    const evc = await MockEVC.deploy();
    await evc.waitForDeployment();

    const decimals = await asset.decimals();
    const MockEulerVault = await ethers.getContractFactory("MockEulerVault");
    const vault = await MockEulerVault.deploy(await asset.getAddress(), await evc.getAddress(), decimals);
    await vault.waitForDeployment();

    const EulerGatewayWrite = await ethers.getContractFactory("EulerGatewayWrite");
    const writeGateway = await EulerGatewayWrite.deploy(await router.getAddress(), await evc.getAddress(), await router.getAddress());
    await writeGateway.waitForDeployment();
    await writeGateway.addEulerMarket(await vault.getAddress());

    const EulerGatewayView = await ethers.getContractFactory("EulerGatewayView");
    const oracle = await (await ethers.getContractFactory("MockEulerPriceOracle")).deploy();
    await oracle.waitForDeployment();
    await oracle.setPrice(await asset.getAddress(), ethers.parseUnits("1", 8));
    const viewGateway = await EulerGatewayView.deploy(await oracle.getAddress(), await router.getAddress());
    await viewGateway.waitForDeployment();
    await viewGateway.addEulerMarket(await vault.getAddress());

    // Seed user position
    await asset.connect(user).approve(await vault.getAddress(), ethers.parseEther("200"));
    await vault.connect(user).deposit(ethers.parseEther("200"), await user.getAddress());

    return { router, user, asset, evc, vault, writeGateway, viewGateway };
  }

  it("authorizes withdraws with clamped outputs and matching execution", async () => {
    const { user, asset, vault, writeGateway } = await deployFixture();
    const withdrawAmount = ethers.parseEther("500"); // greater than balance to trigger clamp

    const instr = {
      op: LendingOp.WithdrawCollateral,
      token: await asset.getAddress(),
      user: await user.getAddress(),
      amount: withdrawAmount,
      context: "0x",
      input: { index: 999 },
    };

    const { targets, produced } = await writeGateway.authorize([instr], await user.getAddress(), []);

    expect(produced).to.have.length(1);
    const expectedMax = await vault.maxWithdraw(await user.getAddress());
    expect(produced[0].amount).to.equal(expectedMax);

    // Perform the approval suggested by authorize
    if (targets[0] !== ethers.ZeroAddress) {
      await vault.connect(user).approve(await writeGateway.getAddress(), MAX_UINT);
    }

    const outputs = await writeGateway
      .connect(user)
      .processLendingInstruction.staticCall(
        [],
        encodeLendingInstruction(instr.op, instr.token, instr.user, instr.amount, instr.context, instr.input.index)
      );

    expect(outputs.length).to.equal(1);
    expect(outputs[0].amount).to.equal(produced[0].amount);
  });

  it("produces borrow outputs matching execution and encodes EVC setup", async () => {
    const { router, user, asset, writeGateway } = await deployFixture();
    const borrowAmount = ethers.parseEther("50");

    const depositInstr = {
      op: LendingOp.DepositCollateral,
      token: await asset.getAddress(),
      user: await user.getAddress(),
      amount: ethers.parseEther("10"),
      context: "0x",
      input: { index: 999 },
    };

    const borrowInstr = {
      op: LendingOp.Borrow,
      token: await asset.getAddress(),
      user: await user.getAddress(),
      amount: borrowAmount,
      context: "0x",
      input: { index: 999 },
    };

    const { targets, data, produced } = await writeGateway.authorize([depositInstr, borrowInstr], await router.getAddress(), []);

    const evcAddress = await writeGateway.evc();
    expect(produced[0].amount).to.equal(borrowAmount);
    expect(targets[1]).to.equal(evcAddress);
    expect(data[1]).to.not.equal("0x");

    const outputs = await writeGateway
      .connect(user)
      .processLendingInstruction.staticCall(
        [],
        encodeLendingInstruction(borrowInstr.op, borrowInstr.token, borrowInstr.user, borrowInstr.amount, borrowInstr.context, borrowInstr.input.index)
      );

    expect(outputs[0].amount).to.equal(borrowAmount);
  });

  it("buffers balance outputs to match router expectations", async () => {
    const { user, asset, writeGateway, viewGateway } = await deployFixture();

    const supplyInstr = {
      op: LendingOp.GetSupplyBalance,
      token: await asset.getAddress(),
      user: await user.getAddress(),
      amount: 0n,
      context: "0x",
      input: { index: 999 },
    };

    const borrowInstr = {
      op: LendingOp.GetBorrowBalance,
      token: await asset.getAddress(),
      user: await user.getAddress(),
      amount: 0n,
      context: "0x",
      input: { index: 999 },
    };

    const { produced: producedSupply } = await writeGateway.authorize([supplyInstr], await user.getAddress(), []);
    const { produced: producedBorrow } = await writeGateway.authorize([borrowInstr], await user.getAddress(), []);

    const supplyOutputs = await writeGateway
      .connect(user)
      .processLendingInstruction.staticCall(
        [],
        encodeLendingInstruction(supplyInstr.op, supplyInstr.token, supplyInstr.user, supplyInstr.amount, supplyInstr.context, supplyInstr.input.index)
      );

    const borrowOutputs = await writeGateway
      .connect(user)
      .processLendingInstruction.staticCall(
        [],
        encodeLendingInstruction(borrowInstr.op, borrowInstr.token, borrowInstr.user, borrowInstr.amount, borrowInstr.context, borrowInstr.input.index)
      );

    expect(producedSupply[0].amount).to.be.greaterThanOrEqual(supplyOutputs[0].amount);
    expect(producedBorrow[0].amount).to.be.greaterThanOrEqual(borrowOutputs[0].amount);

    const viewInfo = await viewGateway.getAllTokensInfo(await user.getAddress());
    expect(viewInfo[0].balance).to.equal(supplyOutputs[0].amount);
  });

  it("returns zero produced outputs for exact repays", async () => {
    const { router, user, asset, vault, writeGateway } = await deployFixture();

    // borrow first to create debt
    await writeGateway.connect(user).borrow(await asset.getAddress(), await user.getAddress(), ethers.parseEther("25"));

    const repayInstr = {
      op: LendingOp.Repay,
      token: await asset.getAddress(),
      user: await user.getAddress(),
      amount: ethers.parseEther("25"),
      context: "0x",
      input: { index: 999 },
    };

    const { produced } = await writeGateway.authorize([repayInstr], await router.getAddress(), []);
    expect(produced[0].amount).to.equal(0);

    await asset.connect(user).approve(await writeGateway.getAddress(), ethers.parseEther("25"));
    const outputs = await writeGateway
      .connect(router)
      .processLendingInstruction(
        [],
        encodeLendingInstruction(repayInstr.op, repayInstr.token, repayInstr.user, repayInstr.amount, repayInstr.context, repayInstr.input.index)
      );

    expect(outputs[0].amount).to.equal(0);
    expect(await vault.debt(await user.getAddress())).to.equal(0);
  });
});
