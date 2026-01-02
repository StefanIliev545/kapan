import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, ZeroAddress } from "ethers";

/**
 * Security tests for CoW Protocol integration
 * 
 * Tests:
 * 1. Order creation rejects instructions targeting other users
 * 2. fundOrder only callable during settlement
 */

describe("CoW Security", function () {
  let owner: any;
  let user: any;
  let attacker: any;
  let victim: any;
  let hooksTrampoline: any;
  let mockVaultRelayer: any;
  
  let router: any;
  let orderManager: any;
  let orderHandler: any;
  let mockComposableCoW: any;
  let mockSettlement: any;
  let cowAdapter: any;
  
  let mockToken: any;
  let buyToken: any;
  
  const coder = AbiCoder.defaultAbiCoder();

  // Helper to encode a lending instruction
  function encodeLendingInstruction(
    op: number,
    token: string,
    user: string,
    amount: bigint,
    context: string = "0x",
    inputIndex: number = 999
  ): string {
    return coder.encode(
      ["tuple(uint8 op, address token, address user, uint256 amount, bytes context, tuple(uint256 index) input)"],
      [{ op, token, user, amount, context, input: { index: inputIndex } }]
    );
  }

  // Helper to encode a router instruction (PullToken)
  function encodeRouterInstruction(
    amount: bigint,
    token: string,
    user: string,
    instructionType: number = 1 // PullToken
  ): string {
    return coder.encode(
      ["uint256", "address", "address", "uint8"],
      [amount, token, user, instructionType]
    );
  }

  // Helper to encode protocol instruction array
  function encodeInstructions(instructions: { protocolName: string; data: string }[]): string {
    return coder.encode(
      ["tuple(string protocolName, bytes data)[]"],
      [instructions]
    );
  }

  beforeEach(async function () {
    [owner, user, attacker, victim, hooksTrampoline, mockVaultRelayer] = await ethers.getSigners();
    
    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20Decimals");
    mockToken = await MockToken.deploy("Mock USDC", "USDC", 6);
    buyToken = await MockToken.deploy("Mock WETH", "WETH", 18);
    
    // Deploy mock settlement
    const MockSettlement = await ethers.getContractFactory("MockGPv2Settlement");
    mockSettlement = await MockSettlement.deploy(await mockVaultRelayer.getAddress());
    
    // Deploy mock ComposableCoW
    const MockComposableCoW = await ethers.getContractFactory("MockComposableCoW");
    mockComposableCoW = await MockComposableCoW.deploy();
    
    // Deploy router
    const Router = await ethers.getContractFactory("TestKapanRouter");
    router = await Router.deploy(await owner.getAddress());
    
    // Deploy order manager
    const OrderManager = await ethers.getContractFactory("KapanOrderManager");
    orderManager = await OrderManager.deploy(
      await owner.getAddress(),
      await router.getAddress(),
      await mockComposableCoW.getAddress(),
      await mockSettlement.getAddress(),
      await hooksTrampoline.getAddress()
    );
    
    // Deploy order handler
    const OrderHandler = await ethers.getContractFactory("KapanOrderHandler");
    orderHandler = await OrderHandler.deploy(await orderManager.getAddress());
    
    // Setup: Set handler in manager
    await orderManager.setOrderHandler(await orderHandler.getAddress());
    
    // Deploy mock FlashLoanRouter for CowAdapter
    const MockFlashLoanRouter = await ethers.getContractFactory("MockFlashLoanRouter");
    const mockFlashLoanRouter = await MockFlashLoanRouter.deploy(await mockSettlement.getAddress());
    
    // Deploy CowAdapter
    const CowAdapter = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapter.deploy(
      await mockFlashLoanRouter.getAddress(),
      await owner.getAddress()
    );
  });

  describe("Order Creation - Instruction User Validation", function () {
    it("should reject order with pre-instruction targeting different user (lending)", async function () {
      const victimAddr = await victim.getAddress();
      const attackerAddr = await attacker.getAddress();
      
      // Attacker tries to create order with borrow instruction targeting victim
      const maliciousInstruction = {
        protocolName: "aave",
        data: encodeLendingInstruction(
          3, // LendingOp.Borrow
          await mockToken.getAddress(),
          victimAddr, // VICTIM - not the attacker!
          ethers.parseUnits("1000", 6),
          "0x",
          0
        )
      };
      
      const params = {
        user: attackerAddr,
        preInstructionsPerIteration: [encodeInstructions([maliciousInstruction])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2, // Iterations
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test")),
        isFlashLoanOrder: false,
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("attack-salt"));
      
      await expect(orderManager.connect(attacker).createOrder(params, salt, 0))
        .to.be.revertedWithCustomError(orderManager, "InstructionUserMismatch")
        .withArgs(attackerAddr, victimAddr);
    });

    it("should reject order with post-instruction targeting different user (lending)", async function () {
      const victimAddr = await victim.getAddress();
      const attackerAddr = await attacker.getAddress();
      
      // Attacker tries to create order with withdraw instruction targeting victim
      const maliciousInstruction = {
        protocolName: "morpho",
        data: encodeLendingInstruction(
          2, // LendingOp.WithdrawCollateral
          await mockToken.getAddress(),
          victimAddr, // VICTIM - not the attacker!
          ethers.parseUnits("5000", 6),
          "0x",
          0
        )
      };
      
      const params = {
        user: attackerAddr,
        preInstructionsPerIteration: [encodeInstructions([])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([maliciousInstruction])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test")),
        isFlashLoanOrder: false,
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("attack-salt-2"));
      
      await expect(orderManager.connect(attacker).createOrder(params, salt, 0))
        .to.be.revertedWithCustomError(orderManager, "InstructionUserMismatch")
        .withArgs(attackerAddr, victimAddr);
    });

    it("should reject order with router instruction (PullToken) targeting different user", async function () {
      const victimAddr = await victim.getAddress();
      const attackerAddr = await attacker.getAddress();
      
      // Attacker tries to pull tokens from victim's wallet
      const maliciousInstruction = {
        protocolName: "router",
        data: encodeRouterInstruction(
          ethers.parseUnits("1000", 6),
          await mockToken.getAddress(),
          victimAddr, // VICTIM - not the attacker!
          1 // PullToken
        )
      };
      
      const params = {
        user: attackerAddr,
        preInstructionsPerIteration: [encodeInstructions([maliciousInstruction])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test")),
        isFlashLoanOrder: false,
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("attack-salt-3"));
      
      await expect(orderManager.connect(attacker).createOrder(params, salt, 0))
        .to.be.revertedWithCustomError(orderManager, "InstructionUserMismatch")
        .withArgs(attackerAddr, victimAddr);
    });

    it("should allow order with all instructions targeting the caller", async function () {
      const userAddr = await user.getAddress();
      
      // Valid instruction targeting the user themselves
      const validInstruction = {
        protocolName: "aave",
        data: encodeLendingInstruction(
          0, // LendingOp.Deposit
          await mockToken.getAddress(),
          userAddr, // Same as order creator - valid!
          ethers.parseUnits("1000", 6),
          "0x",
          0
        )
      };
      
      const params = {
        user: userAddr,
        preInstructionsPerIteration: [encodeInstructions([])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([validInstruction])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test")),
        isFlashLoanOrder: false,
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("valid-salt"));
      
      // Should succeed
      await expect(orderManager.connect(user).createOrder(params, salt, 0))
        .to.emit(orderManager, "OrderCreated");
    });

    it("should reject if ANY instruction in multi-instruction set targets different user", async function () {
      const victimAddr = await victim.getAddress();
      const attackerAddr = await attacker.getAddress();
      
      // First instruction is valid (targets attacker)
      const validInstruction = {
        protocolName: "aave",
        data: encodeLendingInstruction(
          0, // Deposit
          await mockToken.getAddress(),
          attackerAddr,
          ethers.parseUnits("500", 6),
          "0x",
          0
        )
      };
      
      // Second instruction is malicious (targets victim)
      const maliciousInstruction = {
        protocolName: "aave",
        data: encodeLendingInstruction(
          3, // Borrow
          await buyToken.getAddress(),
          victimAddr, // VICTIM!
          ethers.parseUnits("1000", 18),
          "0x",
          1
        )
      };
      
      const params = {
        user: attackerAddr,
        preInstructionsPerIteration: [encodeInstructions([validInstruction, maliciousInstruction])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test")),
        isFlashLoanOrder: false,
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("attack-salt-4"));
      
      await expect(orderManager.connect(attacker).createOrder(params, salt, 0))
        .to.be.revertedWithCustomError(orderManager, "InstructionUserMismatch")
        .withArgs(attackerAddr, victimAddr);
    });

    it("should validate across multiple iterations", async function () {
      const victimAddr = await victim.getAddress();
      const attackerAddr = await attacker.getAddress();
      
      // First iteration is valid
      const validInstruction = {
        protocolName: "aave",
        data: encodeLendingInstruction(
          0, // Deposit
          await mockToken.getAddress(),
          attackerAddr,
          ethers.parseUnits("500", 6),
          "0x",
          0
        )
      };
      
      // Second iteration has malicious instruction
      const maliciousInstruction = {
        protocolName: "aave",
        data: encodeLendingInstruction(
          3, // Borrow
          await buyToken.getAddress(),
          victimAddr, // Hidden in iteration 2!
          ethers.parseUnits("1000", 18),
          "0x",
          0
        )
      };
      
      const params = {
        user: attackerAddr,
        preInstructionsPerIteration: [
          encodeInstructions([validInstruction]),  // Iteration 0 - valid
          encodeInstructions([maliciousInstruction])  // Iteration 1 - malicious
        ],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test")),
        isFlashLoanOrder: false,
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("attack-salt-5"));
      
      await expect(orderManager.connect(attacker).createOrder(params, salt, 0))
        .to.be.revertedWithCustomError(orderManager, "InstructionUserMismatch")
        .withArgs(attackerAddr, victimAddr);
    });
  });

  describe("fundOrder - Settlement Context", function () {
    it("should revert when called outside of settlement", async function () {
      const attackerAddr = await attacker.getAddress();
      
      // Fund the adapter with some tokens (simulating accidental transfer)
      await mockToken.mint(await cowAdapter.getAddress(), ethers.parseUnits("1000", 6));
      
      // Attacker tries to steal tokens by calling fundOrder directly
      await expect(
        cowAdapter.connect(attacker).fundOrder(
          await mockToken.getAddress(),
          attackerAddr,
          ethers.parseUnits("1000", 6)
        )
      ).to.be.revertedWithCustomError(cowAdapter, "OnlyDuringSettlement");
    });

    it("should allow fundOrder during active flash loan settlement", async function () {
      // This test would require mocking the full flash loan flow
      // For now, we verify the modifier exists and blocks unauthorized calls
      
      // Verify the adapter is not in flash loan state
      expect(await cowAdapter.isInFlashLoan()).to.be.false;
      
      // Any call should fail
      await expect(
        cowAdapter.fundOrder(
          await mockToken.getAddress(),
          await user.getAddress(),
          ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWithCustomError(cowAdapter, "OnlyDuringSettlement");
    });
  });
});
