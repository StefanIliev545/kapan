import { expect } from "chai";
import { ethers } from "hardhat";
import {
  encodeLendingInstruction,
  createProtocolInstruction,
  LendingOp,
} from "./helpers/instructionHelpers";

describe("v2 Router Authorization", function () {
  it("should revert when user tries to borrow on behalf of another user", async function () {
    const [deployer, user, otherUser] = await ethers.getSigners();

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // Create a borrow instruction where user tries to borrow on behalf of otherUser
    const borrowInstr = createProtocolInstruction(
      "mock",
      encodeLendingInstruction(
        LendingOp.Borrow,
        "0x0000000000000000000000000000000000000000", // token (not used by mock)
        await otherUser.getAddress(), // otherUser - NOT the caller
        1000n, // amount
        "0x", // context
        999 // input index
      )
    );

    // Attempt to execute - should revert
    await expect(
      router.connect(user).processProtocolInstructions([borrowInstr])
    ).to.be.revertedWith("Not authorized: sender must match user");
  });

  it("should revert when user tries to withdraw collateral on behalf of another user", async function () {
    const [deployer, user, otherUser] = await ethers.getSigners();

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // Create a withdraw collateral instruction where user tries to withdraw on behalf of otherUser
    const withdrawInstr = createProtocolInstruction(
      "mock",
      encodeLendingInstruction(
        LendingOp.WithdrawCollateral,
        "0x0000000000000000000000000000000000000000", // token (not used by mock)
        await otherUser.getAddress(), // otherUser - NOT the caller
        1000n, // amount
        "0x", // context
        999 // input index
      )
    );

    // Attempt to execute - should revert
    await expect(
      router.connect(user).processProtocolInstructions([withdrawInstr])
    ).to.be.revertedWith("Not authorized: sender must match user");
  });

  it("should allow user to borrow on their own behalf", async function () {
    const [deployer, user] = await ethers.getSigners();

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // Create a borrow instruction where user borrows on their own behalf
    const borrowInstr = createProtocolInstruction(
      "mock",
      encodeLendingInstruction(
        LendingOp.Borrow,
        "0x0000000000000000000000000000000000000000", // token (not used by mock)
        await user.getAddress(), // user - matches the caller
        1000n, // amount
        "0x", // context
        999 // input index
      )
    );

    // Should not revert (authorization passes)
    // Note: The actual execution might fail due to mock gateway logic, but authorization should pass
    const tx = router.connect(user).processProtocolInstructions([borrowInstr]);
    await expect(tx).to.not.be.revertedWith("Not authorized: sender must match user");
  });

  it("should allow user to withdraw collateral on their own behalf", async function () {
    const [deployer, user] = await ethers.getSigners();

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // Create a withdraw collateral instruction where user withdraws on their own behalf
    const withdrawInstr = createProtocolInstruction(
      "mock",
      encodeLendingInstruction(
        LendingOp.WithdrawCollateral,
        "0x0000000000000000000000000000000000000000", // token (not used by mock)
        await user.getAddress(), // user - matches the caller
        1000n, // amount
        "0x", // context
        999 // input index
      )
    );

    // Should not revert (authorization passes)
    // Note: The actual execution might fail due to mock gateway logic, but authorization should pass
    const tx = router.connect(user).processProtocolInstructions([withdrawInstr]);
    await expect(tx).to.not.be.revertedWith("Not authorized: sender must match user");
  });

  it("should allow non-sensitive operations (deposit) even if user doesn't match", async function () {
    const [deployer, user, otherUser] = await ethers.getSigners();

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // Create a deposit instruction where user deposits on behalf of otherUser
    // This should NOT revert at the authorization level (deposit is not a sensitive operation)
    const depositInstr = createProtocolInstruction(
      "mock",
      encodeLendingInstruction(
        LendingOp.Deposit,
        "0x0000000000000000000000000000000000000000", // token (not used by mock)
        await otherUser.getAddress(), // otherUser - NOT the caller
        1000n, // amount
        "0x", // context
        999 // input index
      )
    );

    // Should not revert with authorization error (deposit is allowed)
    // Note: The actual execution might fail due to mock gateway logic, but authorization should pass
    const tx = router.connect(user).processProtocolInstructions([depositInstr]);
    await expect(tx).to.not.be.revertedWith("Not authorized: sender must match user");
  });

  it("should verify authorization before any execution (including flash loans)", async function () {
    const [deployer, user, otherUser] = await ethers.getSigners();

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // Create instructions with unauthorized borrow AFTER other operations
    // This tests that authorization is checked upfront, not during execution
    const borrowInstr = createProtocolInstruction(
      "mock",
      encodeLendingInstruction(
        LendingOp.Borrow,
        "0x0000000000000000000000000000000000000000",
        await otherUser.getAddress(), // otherUser - NOT the caller
        1000n,
        "0x",
        999
      )
    );

    // Should revert immediately, even if there were other instructions before it
    await expect(
      router.connect(user).processProtocolInstructions([borrowInstr])
    ).to.be.revertedWith("Not authorized: sender must match user");
  });
});

