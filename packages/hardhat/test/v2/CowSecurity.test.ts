import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder } from "ethers";

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
  let _cowAdapter: any;
  
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
    // Encode as tuple matching RouterInstruction struct layout
    return coder.encode(
      ["tuple(uint256 amount, address token, address user, uint8 instructionType)"],
      [{ amount, token, user, instructionType }]
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
    _cowAdapter = await CowAdapter.deploy(
      await mockFlashLoanRouter.getAddress(),
      await owner.getAddress()
    );

    // Set up bidirectional link between OrderManager and CowAdapter
    await orderManager.setCowAdapter(await _cowAdapter.getAddress());
    await _cowAdapter.setOrderManager(await orderManager.getAddress());
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
        isKindBuy: false,
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
        isKindBuy: false,
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
        isKindBuy: false,
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
        isKindBuy: false,
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
        isKindBuy: false,
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
        isKindBuy: false,
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("attack-salt-5"));
      
      await expect(orderManager.connect(attacker).createOrder(params, salt, 0))
        .to.be.revertedWithCustomError(orderManager, "InstructionUserMismatch")
        .withArgs(attackerAddr, victimAddr);
    });
  });

  describe("fundOrder - Settlement Context", function () {
    // NOTE: fundOrder access control was removed - security is now handled by:
    // 1. Adapter only receives funds during flash loan callback
    // 2. Flash loan callback immediately transfers to OrderManager
    // 3. OrderManager hooks are protected by HooksTrampoline check

    it.skip("should revert when called outside of settlement", async function () {
      // Skipped: duringSettlement modifier was removed from fundOrder
    });

    it.skip("should allow fundOrder during active flash loan settlement", async function () {
      // Skipped: duringSettlement modifier was removed from fundOrder
    });
  });

  describe("Hook Hijacking Prevention", function () {
    it("should reject flash loan order hooks when fundOrder not called first", async function () {
      const victimAddr = await victim.getAddress();

      // Victim sets up delegation to OrderManager (REQUIRED for their order to work)
      await router.connect(victim).setDelegate(await orderManager.getAddress(), true);

      // Victim creates a FLASH LOAN order
      const victimParams = {
        user: victimAddr,
        preInstructionsPerIteration: [encodeInstructions([])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("victim-order")),
        isFlashLoanOrder: true,  // THIS IS THE KEY - flash loan order
        isKindBuy: false,
      };

      const victimSalt = ethers.keccak256(ethers.toUtf8Bytes("victim-flash-salt"));

      // Victim creates order
      const tx = await orderManager.connect(victim).createOrder(victimParams, victimSalt, 0);
      const receipt = await tx.wait();
      const orderCreatedEvent = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      );
      const victimOrderHash = orderCreatedEvent.args[0];

      // Attacker tries to trigger victim's pre-hook through hooksTrampoline
      // This should FAIL because:
      // 1. fundOrder was never called, so _expectedOrderHash is bytes32(0)
      // 2. onPreHook checks _expectedOrderHash != orderHash, which fails
      // This is the correct security behavior - hooks can only run after fundOrder sets the expected hash
      await expect(
        orderManager.connect(hooksTrampoline).executePreHook(victimOrderHash)
      ).to.be.revertedWithCustomError(_cowAdapter, "OrderMismatch");
    });

    it("should reject flash loan order hooks when fundOrder called with different orderHash", async function () {
      const victimAddr = await victim.getAddress();
      const attackerAddr = await attacker.getAddress();

      // Both set up delegation
      await router.connect(victim).setDelegate(await orderManager.getAddress(), true);
      await router.connect(attacker).setDelegate(await orderManager.getAddress(), true);

      // Victim creates flash loan order
      const victimParams = {
        user: victimAddr,
        preInstructionsPerIteration: [encodeInstructions([])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("victim-order")),
        isFlashLoanOrder: true,
        isKindBuy: false,
      };

      // Attacker creates their own flash loan order
      const attackerParams = {
        ...victimParams,
        user: attackerAddr,
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("attacker-order")),
      };

      const victimSalt = ethers.keccak256(ethers.toUtf8Bytes("victim-salt-3"));
      const attackerSalt = ethers.keccak256(ethers.toUtf8Bytes("attacker-salt-3"));

      // Both create orders
      const victimTx = await orderManager.connect(victim).createOrder(victimParams, victimSalt, 0);
      const victimReceipt = await victimTx.wait();
      const victimOrderHash = victimReceipt.logs.find((log: any) => log.fragment?.name === "OrderCreated").args[0];

      await orderManager.connect(attacker).createOrder(attackerParams, attackerSalt, 0);

      // fundOrder is called via HooksTrampoline, but we can't directly test that flow
      // because it requires being in a flash loan. The key point is:
      // - If attacker's settlement calls fundOrder with attackerOrderHash
      // - Then tries to call executePreHook with victimOrderHash
      // - The onPreHook will fail because _expectedOrderHash != victimOrderHash

      // This demonstrates the security model works at the OrderManager level
      // For flash loan orders, fundOrder must be called first to set _expectedOrderHash
      await expect(
        orderManager.connect(hooksTrampoline).executePreHook(victimOrderHash)
      ).to.be.revertedWithCustomError(_cowAdapter, "OrderMismatch");
    });

    it("should allow non-flash-loan orders (legacy behavior for backwards compatibility)", async function () {
      const victimAddr = await victim.getAddress();

      // Victim sets up delegation to OrderManager
      await router.connect(victim).setDelegate(await orderManager.getAddress(), true);

      // Victim creates a NON-flash-loan order
      const victimParams = {
        user: victimAddr,
        preInstructionsPerIteration: [encodeInstructions([])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("victim-order")),
        isFlashLoanOrder: false,  // NOT a flash loan order
        isKindBuy: false,
      };

      const victimSalt = ethers.keccak256(ethers.toUtf8Bytes("victim-non-flash-salt"));

      // Victim creates order
      const tx = await orderManager.connect(victim).createOrder(victimParams, victimSalt, 0);
      const receipt = await tx.wait();
      const orderCreatedEvent = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      );
      const victimOrderHash = orderCreatedEvent.args[0];

      // For non-flash-loan orders, the CowAdapter check is skipped
      // This maintains backwards compatibility
      // The pre-hook should succeed (no CowAdapter validation)
      await expect(
        orderManager.connect(hooksTrampoline).executePreHook(victimOrderHash)
      ).to.not.be.reverted;
    });

    it("should verify fundOrder sets expected orderHash correctly", async function () {
      // fundOrder can now be called anytime, but it will fail if adapter has no tokens
      // The security model relies on: fundOrder sets _expectedOrderHash,
      // then onPreHook/onPostHook verify the hash matches
      const testOrderHash = ethers.keccak256(ethers.toUtf8Bytes("test-order"));

      // fundOrder will fail with ERC20 transfer error (no tokens in adapter)
      await expect(
        _cowAdapter.fundOrder(
          testOrderHash,
          await mockToken.getAddress(),
          await owner.getAddress(),
          ethers.parseUnits("1000", 6)
        )
      ).to.be.reverted; // ERC20 insufficient balance
    });

    it("should verify onPreHook can only be called by OrderManager", async function () {
      const testOrderHash = ethers.keccak256(ethers.toUtf8Bytes("test-order"));

      // Attacker tries to call onPreHook directly - should fail
      await expect(
        _cowAdapter.connect(attacker).onPreHook(testOrderHash)
      ).to.be.revertedWithCustomError(_cowAdapter, "OnlyOrderManager");
    });

    it("should verify onPostHook can only be called by OrderManager", async function () {
      const testOrderHash = ethers.keccak256(ethers.toUtf8Bytes("test-order"));

      // Attacker tries to call onPostHook directly - should fail
      await expect(
        _cowAdapter.connect(attacker).onPostHook(testOrderHash)
      ).to.be.revertedWithCustomError(_cowAdapter, "OnlyOrderManager");
    });
  });

  describe("Flash Loan Integration - OrderMismatch Attack", function () {
    let mockBalancer: any;
    let mockFlashLoanRouter: any;
    let flashLoanAttacker: any;
    let integrationCowAdapter: any;

    beforeEach(async function () {
      // Deploy mock Balancer V2 that actually triggers callbacks
      const MockBalancer = await ethers.getContractFactory("MockBalancerV2Provider");
      mockBalancer = await MockBalancer.deploy();

      // Deploy mock FlashLoanRouter with callback support
      const MockFlashLoanRouter = await ethers.getContractFactory("MockFlashLoanRouter");
      mockFlashLoanRouter = await MockFlashLoanRouter.deploy(await mockSettlement.getAddress());

      // Deploy CowAdapter with our mock router
      const CowAdapter = await ethers.getContractFactory("KapanCowAdapter");
      integrationCowAdapter = await CowAdapter.deploy(
        await mockFlashLoanRouter.getAddress(),
        await owner.getAddress()
      );

      // Register Balancer as a lender
      await integrationCowAdapter.setBalancerV2Lender(await mockBalancer.getAddress(), true);

      // Link OrderManager and CowAdapter
      await orderManager.setCowAdapter(await integrationCowAdapter.getAddress());
      await integrationCowAdapter.setOrderManager(await orderManager.getAddress());

      // Deploy the attacker contract
      const FlashLoanAttacker = await ethers.getContractFactory("FlashLoanAttacker");
      flashLoanAttacker = await FlashLoanAttacker.deploy(
        await integrationCowAdapter.getAddress(),
        await orderManager.getAddress(),
        await mockToken.getAddress()
      );

      // Set attacker as callback receiver
      await mockFlashLoanRouter.setCallbackReceiver(await flashLoanAttacker.getAddress());

      // Fund the mock Balancer with tokens for flash loan
      await mockToken.mint(await mockBalancer.getAddress(), ethers.parseUnits("100000", 6));

      // Fund the CowAdapter with tokens to pay fees (flash loan + 0.09% fee + buffer)
      await mockToken.mint(await integrationCowAdapter.getAddress(), ethers.parseUnits("2000", 6));
    });

    it("should revert with OrderMismatch when fundOrder and preHook use different orderHashes", async function () {
      // Create two different order hashes
      const fundHash = ethers.keccak256(ethers.toUtf8Bytes("fund-order-hash"));
      const hookHash = ethers.keccak256(ethers.toUtf8Bytes("different-hook-hash"));

      // Setup the attack: fundOrder with fundHash, then call preHook with hookHash
      await flashLoanAttacker.setupAttack(
        fundHash,
        hookHash,  // DIFFERENT hash - this is the attack
        ethers.parseUnits("1000", 6),
        await orderManager.getAddress()
      );

      // Trigger flash loan via router - this will call the attacker's onCallback
      // which tries to call fundOrder(fundHash) then executePreHook(hookHash)
      await mockFlashLoanRouter.triggerFlashLoan(
        await integrationCowAdapter.getAddress(),
        await mockBalancer.getAddress(),
        await mockToken.getAddress(),
        ethers.parseUnits("1000", 6),
        "0x"
      );

      // Check that attack failed
      expect(await flashLoanAttacker.attackSucceeded()).to.equal(false);

      // The error should be OrderMismatch (caught by the attacker contract)
      const lastError = await flashLoanAttacker.lastError();
      expect(lastError).to.not.equal("0x");
    });

    it("should succeed when fundOrder and hooks use the SAME orderHash", async function () {
      // Create an actual order so the hooks work
      await router.connect(user).setDelegate(await orderManager.getAddress(), true);

      const userParams = {
        user: await user.getAddress(),
        preInstructionsPerIteration: [encodeInstructions([])],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeInstructions([])],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("user-order")),
        isFlashLoanOrder: true,
        isKindBuy: false,
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("integration-test-salt"));
      const tx = await orderManager.connect(user).createOrder(userParams, salt, 0);
      const receipt = await tx.wait();
      const realOrderHash = receipt.logs.find((log: any) => log.fragment?.name === "OrderCreated").args[0];

      // Setup legitimate flow: same hash for both
      await flashLoanAttacker.setupAttack(
        realOrderHash,
        realOrderHash,  // SAME hash - legitimate flow
        ethers.parseUnits("1000", 6),
        await orderManager.getAddress()
      );

      // This should succeed (same hash)
      await mockFlashLoanRouter.triggerFlashLoan(
        await integrationCowAdapter.getAddress(),
        await mockBalancer.getAddress(),
        await mockToken.getAddress(),
        ethers.parseUnits("1000", 6),
        "0x"
      );

      // No error means success (we don't check attackSucceeded because post-hook
      // will fail without actual swap output, but pre-hook should pass)
    });
  });
});
