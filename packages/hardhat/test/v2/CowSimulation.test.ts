import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, Contract, Signer } from "ethers";

/**
 * Test that simulates the CoW Protocol watchtower simulation flow
 *
 * The watchtower simulation:
 * 1. Fetches orders from ComposableCoW
 * 2. Sets up balance overrides (simulating flash loan funds)
 * 3. Executes pre-interactions (hooks) via simulation
 * 4. Calls isValidSignature to verify the order
 *
 * For flash loan orders, the hooks include:
 * - fundOrder: Transfer flash-loaned tokens from CowAdapter to OrderManager
 * - executePreHook: Run pre-swap lending operations
 *
 * The key issue is that fundOrder expects tokens in CowAdapter, but
 * balance overrides might give tokens to OrderManager instead.
 */
describe("CoW Watchtower Simulation", function () {
  let owner: Signer;
  let user: Signer;
  let hooksTrampoline: Signer;
  let mockVaultRelayer: Signer;

  let router: Contract;
  let orderManager: Contract;
  let orderHandler: Contract;
  let mockComposableCoW: Contract;
  let mockSettlement: Contract;
  let cowAdapter: Contract;
  let mockFlashLoanRouter: Contract;

  let sellToken: Contract;
  let buyToken: Contract;

  const coder = AbiCoder.defaultAbiCoder();

  // Helper to encode empty instructions
  function encodeEmptyInstructions(): string {
    return coder.encode(["tuple(string protocolName, bytes data)[]"], [[]]);
  }

  beforeEach(async function () {
    [owner, user, hooksTrampoline, mockVaultRelayer] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20Decimals");
    sellToken = await MockToken.deploy("Mock USDC", "USDC", 6);
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

    // Set handler in manager
    await orderManager.setOrderHandler(await orderHandler.getAddress());

    // Deploy mock FlashLoanRouter
    const MockFlashLoanRouter = await ethers.getContractFactory("MockFlashLoanRouter");
    mockFlashLoanRouter = await MockFlashLoanRouter.deploy(await mockSettlement.getAddress());

    // Deploy CowAdapter
    const CowAdapter = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapter.deploy(
      await mockFlashLoanRouter.getAddress(),
      await owner.getAddress()
    );

    // Set up bidirectional link
    await orderManager.setCowAdapter(await cowAdapter.getAddress());
    await cowAdapter.setOrderManager(await orderManager.getAddress());

    // User sets up delegation
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);

    // Approve vault relayer to spend sellToken from OrderManager
    await orderManager.approveVaultRelayer(await sellToken.getAddress());
  });

  describe("Simulation Flow - Understanding the Problem", function () {
    let orderHash: string;
    let orderParams: any;

    beforeEach(async function () {
      const userAddr = await user.getAddress();

      orderParams = {
        user: userAddr,
        preInstructionsPerIteration: [encodeEmptyInstructions()],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await sellToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeEmptyInstructions()],
        completion: 2, // Iterations
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-appdata")),
        isFlashLoanOrder: true,  // Flash loan order
        isKindBuy: false,
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("simulation-test-salt"));

      // Create the order
      const tx = await orderManager.connect(user).createOrder(orderParams, salt, 0);
      const receipt = await tx.wait();
      const orderCreatedEvent = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      );
      orderHash = orderCreatedEvent.args[0];
    });

    it("should demonstrate why simulation fails without proper setup", async function () {
      // STEP 1: Watchtower simulation would set balance override on OrderManager
      // to simulate flash loan funds. Let's do the equivalent by minting tokens.
      const chunkSize = ethers.parseUnits("2000", 6);
      await sellToken.mint(await orderManager.getAddress(), chunkSize);

      // Verify OrderManager has the tokens (simulating balance override)
      const omBalance = await sellToken.balanceOf(await orderManager.getAddress());
      expect(omBalance).to.equal(chunkSize);

      // STEP 2: Watchtower would call pre-hooks via simulation
      // For flash loan orders, the first pre-hook is fundOrder
      // But fundOrder expects tokens in CowAdapter, not OrderManager!

      // This is the key problem: fundOrder will fail because CowAdapter has no tokens
      await expect(
        cowAdapter.fundOrder(
          orderHash,
          await sellToken.getAddress(),
          await orderManager.getAddress(),
          chunkSize
        )
      ).to.be.reverted; // ERC20: insufficient balance
    });

    it("should work when CowAdapter has tokens (like real flash loan)", async function () {
      const chunkSize = ethers.parseUnits("2000", 6);

      // Give CowAdapter the tokens (simulating flash loan receipt)
      await sellToken.mint(await cowAdapter.getAddress(), chunkSize);

      // fundOrder should work now
      await cowAdapter.fundOrder(
        orderHash,
        await sellToken.getAddress(),
        await orderManager.getAddress(),
        chunkSize
      );

      // Verify tokens moved to OrderManager
      const omBalance = await sellToken.balanceOf(await orderManager.getAddress());
      expect(omBalance).to.equal(chunkSize);

      // Now executePreHook should work
      await expect(
        orderManager.connect(hooksTrampoline).executePreHook(orderHash)
      ).to.not.be.reverted;
    });

    it("should show the full simulation flow with balance override on CowAdapter", async function () {
      const chunkSize = ethers.parseUnits("2000", 6);

      // CORRECT SETUP: Balance override should be on CowAdapter
      await sellToken.mint(await cowAdapter.getAddress(), chunkSize);

      // STEP 1: fundOrder (first pre-hook)
      // This sets _expectedOrderHash and transfers to OrderManager
      await cowAdapter.fundOrder(
        orderHash,
        await sellToken.getAddress(),
        await orderManager.getAddress(),
        chunkSize
      );

      // STEP 2: executePreHook (second pre-hook)
      // This runs pre-swap lending operations
      await orderManager.connect(hooksTrampoline).executePreHook(orderHash);

      // STEP 3: Signature validation would happen here
      // (In simulation, isValidSignature is called after pre-hooks)

      // At this point, the simulation would succeed
      // The key insight is that balance_override MUST be set on CowAdapter, not OrderManager
    });
  });

  describe("Non-Flash-Loan Orders (Legacy Mode)", function () {
    it("should work without fundOrder for non-flash-loan orders", async function () {
      const userAddr = await user.getAddress();

      const orderParams = {
        user: userAddr,
        preInstructionsPerIteration: [encodeEmptyInstructions()],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await sellToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeEmptyInstructions()],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-appdata")),
        isFlashLoanOrder: false,  // NOT a flash loan order
        isKindBuy: false,
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("non-flash-salt"));
      const chunkSize = ethers.parseUnits("2000", 6);

      // Create order with seed tokens
      await sellToken.connect(user).approve(await orderManager.getAddress(), chunkSize);
      await sellToken.mint(await user.getAddress(), chunkSize);

      const tx = await orderManager.connect(user).createOrder(orderParams, salt, chunkSize);
      const receipt = await tx.wait();
      const orderHash = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      ).args[0];

      // For non-flash-loan orders, executePreHook should work directly
      // No fundOrder or CowAdapter validation needed
      await expect(
        orderManager.connect(hooksTrampoline).executePreHook(orderHash)
      ).to.not.be.reverted;
    });
  });

  describe("Simulation Compatibility Options", function () {
    let orderHash: string;

    beforeEach(async function () {
      const userAddr = await user.getAddress();

      const orderParams = {
        user: userAddr,
        preInstructionsPerIteration: [encodeEmptyInstructions()],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await sellToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeEmptyInstructions()],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-appdata")),
        isFlashLoanOrder: true,
        isKindBuy: false,
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("compat-test-salt"));
      const tx = await orderManager.connect(user).createOrder(orderParams, salt, 0);
      const receipt = await tx.wait();
      orderHash = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      ).args[0];
    });

    it("OPTION A: Skip CowAdapter validation for orders with cowAdapter unset", async function () {
      // This test demonstrates that if cowAdapter is not set,
      // flash loan orders can't be validated at all

      // We have an order created in beforeEach
      expect(orderHash).to.not.equal(ethers.ZeroHash);

      // Deploy a new OrderManager without cowAdapter set
      const OrderManager = await ethers.getContractFactory("KapanOrderManager");
      const newOrderManager = await OrderManager.deploy(
        await owner.getAddress(),
        await router.getAddress(),
        await mockComposableCoW.getAddress(),
        await mockSettlement.getAddress(),
        await hooksTrampoline.getAddress()
      );
      await newOrderManager.setOrderHandler(await orderHandler.getAddress());

      // cowAdapter is not set (address(0))
      // For flash loan orders, the check is:
      // if (ctx.params.isFlashLoanOrder && address(cowAdapter) != address(0))
      // So if cowAdapter is address(0), the check is skipped!

      // This would allow simulation to work, but sacrifices security

      // Verify cowAdapter is not set
      expect(await newOrderManager.cowAdapter()).to.equal(ethers.ZeroAddress);
    });

    it("OPTION B: fundOrder should be called with balance override on CowAdapter", async function () {
      // The correct solution: balance_override in appData should target CowAdapter
      // Then fundOrder can transfer tokens to OrderManager

      const chunkSize = ethers.parseUnits("2000", 6);

      // Simulate balance override on CowAdapter (correct target)
      await sellToken.mint(await cowAdapter.getAddress(), chunkSize);

      // fundOrder works
      await cowAdapter.fundOrder(
        orderHash,
        await sellToken.getAddress(),
        await orderManager.getAddress(),
        chunkSize
      );

      // Pre-hook works
      await orderManager.connect(hooksTrampoline).executePreHook(orderHash);
    });

    it("OPTION C: Make fundOrder work without tokens (simulation-aware)", async function () {
      // This test demonstrates a potential fix: make fundOrder skip transfer
      // if caller has no tokens, but still set _expectedOrderHash

      // However, this is dangerous because it breaks the security model:
      // - fundOrder sets _expectedOrderHash
      // - onPreHook/onPostHook verify the hash
      // - But if fundOrder doesn't actually transfer, the order wouldn't work in production

      // So this option is NOT recommended
    });
  });

  describe("fundOrderBySalt - (user, salt) Lookup Pattern", function () {
    it("should work with fundOrderBySalt using (user, salt) lookup", async function () {
      const userAddr = await user.getAddress();
      const salt = ethers.keccak256(ethers.toUtf8Bytes("fundOrderBySalt-test"));
      const chunkSize = ethers.parseUnits("2000", 6);

      const orderParams = {
        user: userAddr,
        preInstructionsPerIteration: [encodeEmptyInstructions()],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await sellToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: chunkSize,
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeEmptyInstructions()],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-appdata")),
        isFlashLoanOrder: true,
        isKindBuy: false,
      };

      // Create order - this sets userSaltToOrderHash[user][salt]
      const tx = await orderManager.connect(user).createOrder(orderParams, salt, 0);
      const receipt = await tx.wait();
      const orderHash = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      ).args[0];

      // Give CowAdapter tokens (simulating flash loan via balance override)
      await sellToken.mint(await cowAdapter.getAddress(), chunkSize);

      // Call fundOrderBySalt - this uses (user, salt) to look up orderHash
      await cowAdapter.fundOrderBySalt(
        userAddr,
        salt,
        await sellToken.getAddress(),
        await orderManager.getAddress(),
        chunkSize
      );

      // Verify _expectedOrderHash was set correctly
      expect(await cowAdapter.getExpectedOrderHash()).to.equal(orderHash);

      // Verify tokens were transferred to OrderManager
      expect(await sellToken.balanceOf(await orderManager.getAddress())).to.equal(chunkSize);

      // Now executePreHook should work
      await expect(
        orderManager.connect(hooksTrampoline).executePreHook(orderHash)
      ).to.not.be.reverted;

      // Verify _preHookDone is true
      expect(await cowAdapter.isPreHookDone()).to.equal(true);
    });

    it("should revert fundOrderBySalt if order not created yet", async function () {
      const userAddr = await user.getAddress();
      const unknownSalt = ethers.keccak256(ethers.toUtf8Bytes("unknown-order"));
      const chunkSize = ethers.parseUnits("2000", 6);

      // Give CowAdapter tokens
      await sellToken.mint(await cowAdapter.getAddress(), chunkSize);

      // Try to call fundOrderBySalt with unknown salt - should fail
      await expect(
        cowAdapter.fundOrderBySalt(
          userAddr,
          unknownSalt,
          await sellToken.getAddress(),
          await orderManager.getAddress(),
          chunkSize
        )
      ).to.be.revertedWithCustomError(cowAdapter, "OrderNotFound");
    });

    it("should match orderHash from fundOrderBySalt with onPreHook expectation", async function () {
      const userAddr = await user.getAddress();
      const salt = ethers.keccak256(ethers.toUtf8Bytes("hash-match-test"));
      const chunkSize = ethers.parseUnits("2000", 6);

      const orderParams = {
        user: userAddr,
        preInstructionsPerIteration: [encodeEmptyInstructions()],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await sellToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: chunkSize,
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeEmptyInstructions()],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-appdata")),
        isFlashLoanOrder: true,
        isKindBuy: false,
      };

      // Create order
      const tx = await orderManager.connect(user).createOrder(orderParams, salt, 0);
      const receipt = await tx.wait();
      const orderHash = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      ).args[0];

      // Give CowAdapter tokens
      await sellToken.mint(await cowAdapter.getAddress(), chunkSize);

      // Call fundOrderBySalt
      await cowAdapter.fundOrderBySalt(
        userAddr,
        salt,
        await sellToken.getAddress(),
        await orderManager.getAddress(),
        chunkSize
      );

      // The expectedOrderHash from fundOrderBySalt should match
      // what OrderManager passes to onPreHook
      // This is verified by the fact that executePreHook succeeds:
      await expect(
        orderManager.connect(hooksTrampoline).executePreHook(orderHash)
      ).to.not.be.reverted;

      // If there was a mismatch, onPreHook would revert with OrderMismatch
    });
  });

  describe("Root Cause Analysis", function () {
    it("should identify the exact failure point in simulation", async function () {
      const userAddr = await user.getAddress();
      const chunkSize = ethers.parseUnits("2000", 6);

      const orderParams = {
        user: userAddr,
        preInstructionsPerIteration: [encodeEmptyInstructions()],
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await sellToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: chunkSize,
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsPerIteration: [encodeEmptyInstructions()],
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-appdata")),
        isFlashLoanOrder: true,
        isKindBuy: false,
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("root-cause-salt"));
      const tx = await orderManager.connect(user).createOrder(orderParams, salt, 0);
      const receipt = await tx.wait();
      const orderHash = receipt.logs.find(
        (log: any) => log.fragment?.name === "OrderCreated"
      ).args[0];

      console.log("\n=== Root Cause Analysis ===");
      console.log(`Order created: ${orderHash}\n`);

      // Scenario 1: Balance override on OrderManager (WRONG)
      console.log("Scenario 1: Balance override on OrderManager");
      console.log("- OrderManager has tokens: YES (balance override)");
      console.log("- CowAdapter has tokens: NO");
      console.log("- fundOrder will: FAIL (can't transfer from CowAdapter)");

      // Scenario 2: Balance override on CowAdapter (CORRECT)
      console.log("\nScenario 2: Balance override on CowAdapter");
      console.log("- OrderManager has tokens: NO (before fundOrder)");
      console.log("- CowAdapter has tokens: YES (balance override)");
      console.log("- fundOrder will: SUCCEED (transfers to OrderManager)");

      // Scenario 3: No balance override, no fundOrder hook (BROKEN)
      console.log("\nScenario 3: No balance override, no fundOrder hook");
      console.log("- Neither has tokens");
      console.log("- fundOrder: NOT CALLED");
      console.log("- executePreHook: FAILS (OrderMismatch - _expectedOrderHash not set)");

      console.log("\n=== Solution ===");
      console.log("The appData must include:");
      console.log("1. balance_override targeting CowAdapter address");
      console.log("2. fundOrder as first pre-hook");
      console.log("3. executePreHook as second pre-hook");
      console.log("\nIf either is missing or misconfigured, simulation will fail.\n");
    });
  });
});
