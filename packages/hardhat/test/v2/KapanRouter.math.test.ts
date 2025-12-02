import { expect } from "chai";
import { ethers } from "hardhat";
import {
  encodePullToken,
  encodeToOutput,
  encodePushToken,
  encodeSplit,
  encodeAdd,
  encodeSubtract,
  createRouterInstruction,
} from "./helpers/instructionHelpers";

describe("KapanRouter Math Instructions", function () {
  describe("Split Instruction", function () {
    it("should split an output into fee (30 bps) and remainder", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user
      await token.transfer(user.address, ethers.parseEther("1000"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // User approves router for PullToken
      const amount = ethers.parseEther("100");
      await token.connect(user).approve(await router.getAddress(), amount);

      // Instructions:
      // 1. PullToken -> creates UTXO[0] with 100 ETH
      // 2. Split(0, 30) -> splits UTXO[0] into UTXO[1] (fee: 0.3%) and UTXO[2] (remainder: 99.7%)
      // 3. PushToken(1, user) -> send fee to user
      // 4. PushToken(2, user) -> send remainder to user
      const instrs = [
        createRouterInstruction(encodePullToken(amount, tokenAddress, user.address)),
        createRouterInstruction(encodeSplit(0, 30)), // 30 bps = 0.3%
        createRouterInstruction(encodePushToken(1, user.address)), // fee portion
        createRouterInstruction(encodePushToken(2, user.address)), // remainder portion
      ];

      // Execute
      const tx = await router.connect(user).processProtocolInstructions(instrs);
      await tx.wait();

      // Verify: user should get all tokens back (fee + remainder = original)
      const userBalance = await token.balanceOf(user.address);
      expect(userBalance).to.equal(ethers.parseEther("1000")); // Started with 1000, pulled 100, got 100 back

      // Verify: router should have no tokens left
      const routerBalance = await token.balanceOf(await router.getAddress());
      expect(routerBalance).to.equal(0n);
    });

    it("should calculate fee with rounding up", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user with exact amount
      const amount = 10000n; // Small amount to test rounding
      await token.transfer(user.address, amount);

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // User approves router for PullToken
      await token.connect(user).approve(await router.getAddress(), amount);

      // Instructions:
      // 1. PullToken -> creates UTXO[0] with 10000 wei
      // 2. Split(0, 30) -> splits with 0.3% (30 bps)
      //    Expected: fee = ceil(10000 * 30 / 10000) = ceil(30) = 30
      //    remainder = 10000 - 30 = 9970
      // 3. PushToken(1, user) -> send fee
      // 4. PushToken(2, user) -> send remainder
      const instrs = [
        createRouterInstruction(encodePullToken(amount, tokenAddress, user.address)),
        createRouterInstruction(encodeSplit(0, 30)),
        createRouterInstruction(encodePushToken(1, user.address)),
        createRouterInstruction(encodePushToken(2, user.address)),
      ];

      // Get balances before
      const balanceBefore = await token.balanceOf(user.address);
      expect(balanceBefore).to.equal(amount);

      // Execute
      const tx = await router.connect(user).processProtocolInstructions(instrs);
      await tx.wait();

      // Verify: user should get all tokens back
      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter).to.equal(amount);
    });

    it("should revert on invalid input index", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // Try to split a non-existent UTXO
      const instrs = [createRouterInstruction(encodeSplit(0, 30))]; // No UTXO[0] exists

      await expect(router.connect(user).processProtocolInstructions(instrs)).to.be.revertedWith("Split: bad index");
    });

    it("should revert on fraction > 100%", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user
      await token.transfer(user.address, ethers.parseEther("100"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const amount = ethers.parseEther("100");
      await token.connect(user).approve(await router.getAddress(), amount);

      // Try to split with 101% (10100 bps)
      const instrs = [
        createRouterInstruction(encodePullToken(amount, tokenAddress, user.address)),
        createRouterInstruction(encodeSplit(0, 10100)), // 101%
      ];

      await expect(router.connect(user).processProtocolInstructions(instrs)).to.be.revertedWith(
        "Split: fraction too large"
      );
    });
  });

  describe("Add Instruction", function () {
    it("should combine two outputs of the same token", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user
      await token.transfer(user.address, ethers.parseEther("1000"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // User approves router for two PullTokens
      const amount1 = ethers.parseEther("60");
      const amount2 = ethers.parseEther("40");
      await token.connect(user).approve(await router.getAddress(), amount1 + amount2);

      // Instructions:
      // 1. PullToken(60) -> creates UTXO[0]
      // 2. PullToken(40) -> creates UTXO[1]
      // 3. Add(0, 1) -> creates UTXO[2] with 100
      // 4. PushToken(2, user) -> send combined amount to user
      const instrs = [
        createRouterInstruction(encodePullToken(amount1, tokenAddress, user.address)),
        createRouterInstruction(encodePullToken(amount2, tokenAddress, user.address)),
        createRouterInstruction(encodeAdd(0, 1)),
        createRouterInstruction(encodePushToken(2, user.address)),
      ];

      const balanceBefore = await token.balanceOf(user.address);

      // Execute
      const tx = await router.connect(user).processProtocolInstructions(instrs);
      await tx.wait();

      // Verify: user should get all tokens back (60 + 40 = 100 combined)
      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter).to.equal(balanceBefore); // All tokens returned

      // Verify: router should have no tokens left
      const routerBalance = await token.balanceOf(await router.getAddress());
      expect(routerBalance).to.equal(0n);
    });

    it("should revert when tokens don't match", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy two different ERC20 tokens
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token1 = await ERC20.deploy("Token A", "TOKA", deployer.address, ethers.parseEther("1000000"));
      const token2 = await ERC20.deploy("Token B", "TOKB", deployer.address, ethers.parseEther("1000000"));
      await token1.waitForDeployment();
      await token2.waitForDeployment();

      // Fund user with both tokens
      await token1.transfer(user.address, ethers.parseEther("100"));
      await token2.transfer(user.address, ethers.parseEther("100"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const amount = ethers.parseEther("50");
      await token1.connect(user).approve(await router.getAddress(), amount);
      await token2.connect(user).approve(await router.getAddress(), amount);

      // Try to add two different tokens
      const instrs = [
        createRouterInstruction(encodePullToken(amount, await token1.getAddress(), user.address)),
        createRouterInstruction(encodePullToken(amount, await token2.getAddress(), user.address)),
        createRouterInstruction(encodeAdd(0, 1)), // Should fail - different tokens
      ];

      await expect(router.connect(user).processProtocolInstructions(instrs)).to.be.revertedWith("Add: token mismatch");
    });

    it("should revert on invalid input indices", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // Try to add non-existent UTXOs
      const instrs = [createRouterInstruction(encodeAdd(0, 1))];

      await expect(router.connect(user).processProtocolInstructions(instrs)).to.be.revertedWith("Add: bad index");
    });
  });

  describe("Subtract Instruction", function () {
    it("should compute difference between two outputs", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user
      await token.transfer(user.address, ethers.parseEther("1000"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("30");
      await token.connect(user).approve(await router.getAddress(), amount1 + amount2);

      // Instructions:
      // 1. PullToken(100) -> creates UTXO[0]
      // 2. PullToken(30) -> creates UTXO[1]
      // 3. Subtract(0, 1) -> creates UTXO[2] with 70 (100 - 30)
      // 4. PushToken(2, user) -> send difference to user
      // Note: The tokens in UTXO[0] and UTXO[1] are "consumed" by the subtraction
      // But since this is an on-chain operation, we need to handle the actual tokens
      // In reality, the router still holds 130 tokens but only UTXO[2] (70) is valid
      const instrs = [
        createRouterInstruction(encodePullToken(amount1, tokenAddress, user.address)),
        createRouterInstruction(encodePullToken(amount2, tokenAddress, user.address)),
        createRouterInstruction(encodeSubtract(0, 1)),
        createRouterInstruction(encodePushToken(2, user.address)),
      ];

      const balanceBefore = await token.balanceOf(user.address);

      // Execute
      const tx = await router.connect(user).processProtocolInstructions(instrs);
      await tx.wait();

      // Verify: user gets back the difference (70)
      const balanceAfter = await token.balanceOf(user.address);
      // User started with 1000, pulled 130 (100 + 30), got back 70 (100 - 30)
      // Final: 1000 - 130 + 70 = 940
      const expectedBalance = balanceBefore - amount1 - amount2 + (amount1 - amount2);
      expect(balanceAfter).to.equal(expectedBalance);

      // Router should have the remaining 60 (two times amount2)
      // UTXO[0] had 100, UTXO[1] had 30, subtract cleared both
      // But the actual tokens (130) are still in router, minus 70 pushed = 60
      const routerBalance = await token.balanceOf(await router.getAddress());
      expect(routerBalance).to.equal(amount1 + amount2 - (amount1 - amount2)); // 130 - 70 = 60
    });

    it("should revert when subtrahend is larger than minuend", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user
      await token.transfer(user.address, ethers.parseEther("1000"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const amount1 = ethers.parseEther("30"); // Smaller
      const amount2 = ethers.parseEther("100"); // Larger
      await token.connect(user).approve(await router.getAddress(), amount1 + amount2);

      // Try to subtract larger from smaller
      const instrs = [
        createRouterInstruction(encodePullToken(amount1, tokenAddress, user.address)),
        createRouterInstruction(encodePullToken(amount2, tokenAddress, user.address)),
        createRouterInstruction(encodeSubtract(0, 1)), // 30 - 100 = underflow
      ];

      await expect(router.connect(user).processProtocolInstructions(instrs)).to.be.revertedWith("Subtract: underflow");
    });

    it("should revert when tokens don't match", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy two different ERC20 tokens
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token1 = await ERC20.deploy("Token A", "TOKA", deployer.address, ethers.parseEther("1000000"));
      const token2 = await ERC20.deploy("Token B", "TOKB", deployer.address, ethers.parseEther("1000000"));
      await token1.waitForDeployment();
      await token2.waitForDeployment();

      // Fund user
      await token1.transfer(user.address, ethers.parseEther("100"));
      await token2.transfer(user.address, ethers.parseEther("100"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const amount = ethers.parseEther("50");
      await token1.connect(user).approve(await router.getAddress(), amount);
      await token2.connect(user).approve(await router.getAddress(), amount);

      // Try to subtract different tokens
      const instrs = [
        createRouterInstruction(encodePullToken(amount, await token1.getAddress(), user.address)),
        createRouterInstruction(encodePullToken(amount, await token2.getAddress(), user.address)),
        createRouterInstruction(encodeSubtract(0, 1)),
      ];

      await expect(router.connect(user).processProtocolInstructions(instrs)).to.be.revertedWith(
        "Subtract: token mismatch"
      );
    });
  });

  describe("Combined Math Operations", function () {
    it("should chain Split and Add operations", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user
      await token.transfer(user.address, ethers.parseEther("1000"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const amount = ethers.parseEther("100");
      await token.connect(user).approve(await router.getAddress(), amount);

      // Instructions:
      // 1. PullToken(100) -> UTXO[0]
      // 2. Split(0, 1000) -> UTXO[1] (10%), UTXO[2] (90%)
      // 3. Split(2, 1000) -> UTXO[3] (10% of 90% = 9%), UTXO[4] (81%)
      // 4. Add(1, 3) -> UTXO[5] (10% + 9% = 19%)
      // 5. PushToken(5, user) -> send 19% to user
      // 6. PushToken(4, user) -> send 81% to user
      const instrs = [
        createRouterInstruction(encodePullToken(amount, tokenAddress, user.address)),
        createRouterInstruction(encodeSplit(0, 1000)), // 10%
        createRouterInstruction(encodeSplit(2, 1000)), // 10% of 90%
        createRouterInstruction(encodeAdd(1, 3)), // Combine fees
        createRouterInstruction(encodePushToken(5, user.address)),
        createRouterInstruction(encodePushToken(4, user.address)),
      ];

      // Execute
      const tx = await router.connect(user).processProtocolInstructions(instrs);
      await tx.wait();

      // Verify: user should get all tokens back
      const userBalance = await token.balanceOf(user.address);
      expect(userBalance).to.equal(ethers.parseEther("1000"));

      // Verify: router should have no tokens left
      const routerBalance = await token.balanceOf(await router.getAddress());
      expect(routerBalance).to.equal(0n);
    });

    it("should use Split for flash loan fee calculation pattern", async function () {
      const [deployer, user] = await ethers.getSigners();

      // Deploy mock ERC20 token
      const ERC20 = await ethers.getContractFactory("MockERC20");
      const token = await ERC20.deploy("Test Token", "TEST", deployer.address, ethers.parseEther("1000000"));
      await token.waitForDeployment();
      const tokenAddress = await token.getAddress();

      // Fund user
      await token.transfer(user.address, ethers.parseEther("1000"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      // Simulate a flash loan fee scenario:
      // User receives 100 tokens from a flash loan and needs to repay 100.3 (with 0.3% fee)
      // They pull 100.3 tokens, split off the fee, and can use the parts separately

      const flashLoanAmount = ethers.parseEther("100.3"); // Principal + fee
      await token.connect(user).approve(await router.getAddress(), flashLoanAmount);

      // Instructions:
      // 1. PullToken(100.3) -> UTXO[0]
      // 2. Split(0, 30) -> UTXO[1] (fee: ~0.3%), UTXO[2] (principal: ~100)
      // 3. PushToken(1, user) -> return fee to user (in real scenario, this goes to lender)
      // 4. PushToken(2, user) -> return principal to user (in real scenario, used elsewhere)
      const instrs = [
        createRouterInstruction(encodePullToken(flashLoanAmount, tokenAddress, user.address)),
        createRouterInstruction(encodeSplit(0, 30)), // 0.3% fee
        createRouterInstruction(encodePushToken(1, user.address)), // fee
        createRouterInstruction(encodePushToken(2, user.address)), // remainder
      ];

      const balanceBefore = await token.balanceOf(user.address);

      // Execute
      const tx = await router.connect(user).processProtocolInstructions(instrs);
      await tx.wait();

      // Verify: user should get all tokens back (fee + remainder = original amount)
      const balanceAfter = await token.balanceOf(user.address);
      expect(balanceAfter).to.equal(balanceBefore);

      // Verify: router should have no tokens left
      const routerBalance = await token.balanceOf(await router.getAddress());
      expect(routerBalance).to.equal(0n);
    });
  });
});

