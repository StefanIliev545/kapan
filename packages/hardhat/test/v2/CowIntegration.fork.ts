import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder } from "ethers";
import {
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeToOutput,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
  LendingOp,
} from "./helpers/instructionHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// Arbitrum addresses
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC_WHALE = "0x489ee077994B6658eAfA855C308275EAd8097C4A"; // Aave Pool - has more USDC
const WETH_WHALE = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"; // Balancer vault
const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";

const coder = AbiCoder.defaultAbiCoder();

describe("CoW Protocol Integration (Fork)", function () {
  before(function () {
    if (!FORK) {
      this.skip();
    }
  });

  let owner: any;
  let user: any;
  let hooksTrampoline: any;
  let mockVaultRelayer: any;

  let router: any;
  let aaveGateway: any;
  let orderManager: any;
  let orderHandler: any;
  let mockComposableCoW: any;
  let mockSettlement: any;

  let usdc: any;
  let weth: any;

  beforeEach(async function () {
    [owner, hooksTrampoline, mockVaultRelayer] = await ethers.getSigners();

    // Create a fresh user wallet
    user = ethers.Wallet.createRandom().connect(ethers.provider);

    // Get token contracts
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

    // Fund user with ETH for gas
    await network.provider.send("hardhat_setBalance", [
      await user.getAddress(),
      "0x56BC75E2D63100000", // 100 ETH
    ]);

    // Impersonate whales and fund user
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_WHALE],
    });
    await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);
    
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [WETH_WHALE],
    });
    await network.provider.send("hardhat_setBalance", [WETH_WHALE, "0x56BC75E2D63100000"]);

    const usdcWhale = await ethers.getSigner(USDC_WHALE);
    const wethWhale = await ethers.getSigner(WETH_WHALE);

    // Fund user with tokens (use smaller amounts to avoid whale exhaustion)
    await usdc.connect(usdcWhale).transfer(await user.getAddress(), ethers.parseUnits("2000", 6));
    await weth.connect(wethWhale).transfer(await user.getAddress(), ethers.parseEther("3"));

    // Deploy mock settlement
    const MockSettlement = await ethers.getContractFactory("MockGPv2Settlement");
    mockSettlement = await MockSettlement.deploy(await mockVaultRelayer.getAddress());

    // Deploy mock ComposableCoW
    const MockComposableCoW = await ethers.getContractFactory("MockComposableCoW");
    mockComposableCoW = await MockComposableCoW.deploy();

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    router = await Router.deploy(await owner.getAddress());

    // Deploy Aave gateway
    const AaveGateway = await ethers.getContractFactory("AaveGatewayWrite");
    aaveGateway = await AaveGateway.deploy(await router.getAddress(), AAVE_POOL_ADDRESSES_PROVIDER, 0);

    // Add gateway to router
    await router.addGateway("aave", await aaveGateway.getAddress());

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

    // Setup
    await orderManager.setOrderHandler(await orderHandler.getAddress());
    await router.setApprovedManager(await orderManager.getAddress(), true);
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);
  });

  describe("Order Creation with Real Aave", function () {
    it("should create an order with Aave borrow pre-instructions", async function () {
      const userAddr = await user.getAddress();

      // First, user needs to deposit collateral to Aave
      // This is a prerequisite for borrowing
      const depositAmount = ethers.parseEther("2"); // 2 WETH
      
      // Approve router to pull WETH
      await weth.connect(user).approve(await router.getAddress(), depositAmount);
      
      // Get aToken address for approval
      const aaveDataProvider = await ethers.getContractAt(
        ["function getReserveTokensAddresses(address) view returns (address, address, address)"],
        "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654" // Aave PoolDataProvider on Arbitrum
      );
      const [aWeth, , vDebtUsdc] = await aaveDataProvider.getReserveTokensAddresses(WETH);
      const [, , vDebtWeth] = await aaveDataProvider.getReserveTokensAddresses(WETH);

      // Deposit WETH to Aave
      const depositInstructions = [
        createRouterInstruction(encodePullToken(depositAmount, WETH, userAddr)),
        createRouterInstruction(encodeApprove(0, "aave")),
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.Deposit, WETH, userAddr, depositAmount, "0x", 999)
        ),
      ];

      await router.connect(user).processProtocolInstructions(depositInstructions);

      // Verify deposit
      const aWethContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aWeth);
      const aWethBalance = await aWethContract.balanceOf(userAddr);
      console.log(`User aWETH balance after deposit: ${ethers.formatEther(aWethBalance)}`);
      expect(aWethBalance).to.be.gt(0);

      // Now approve credit delegation for borrowing USDC
      const vDebtUsdcContract = await ethers.getContractAt(
        ["function approveDelegation(address, uint256) external"],
        vDebtUsdc
      );
      await vDebtUsdcContract.connect(user).approveDelegation(
        await aaveGateway.getAddress(),
        ethers.MaxUint256
      );

      // Create pre-instructions for borrowing
      const borrowAmount = ethers.parseUnits("1000", 6); // 1000 USDC
      const preInstructions = [
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.Borrow, USDC, userAddr, borrowAmount, "0x", 999)
        ),
        createRouterInstruction(encodePushToken(0, await orderManager.getAddress())),
      ];

      // Create post-instructions for depositing (these would receive swap output)
      const postInstructions = [
        createRouterInstruction(encodePullToken(0n, WETH, await orderManager.getAddress())), // Amount set by post-hook
        createRouterInstruction(encodeApprove(0, "aave")),
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.Deposit, WETH, userAddr, 0n, "0x", 0) // Amount from input
        ),
      ];

      // Create order params
      const params = {
        user: userAddr,
        preInstructionsData: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [preInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))]
        ),
        preTotalAmount: borrowAmount,
        sellToken: USDC,
        buyToken: WETH,
        chunkSize: ethers.parseUnits("500", 6), // 500 USDC per chunk
        minBuyPerChunk: ethers.parseEther("0.15"), // Expect at least 0.15 WETH per 500 USDC
        postInstructionsData: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))]
        ),
        completion: 2, // Iterations
        targetValue: 2, // 2 chunks
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-app-data")),
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("test-salt"));

      // Create order
      const tx = await orderManager.connect(user).createOrder(params, salt);
      const receipt = await tx.wait();

      // Extract orderHash from event
      const event = receipt?.logs.find((log: any) => {
        try {
          return orderManager.interface.parseLog(log)?.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      expect(event).to.not.be.undefined;

      const parsed = orderManager.interface.parseLog(event);
      const orderHash = parsed?.args[0];
      console.log(`Order created with hash: ${orderHash}`);

      // Verify order was registered
      expect(await mockComposableCoW.getCreatedOrdersCount()).to.equal(1);

      // Get tradeable order from handler
      const staticInput = coder.encode(["bytes32"], [orderHash]);
      const order = await orderHandler.getTradeableOrder(
        await orderManager.getAddress(),
        await owner.getAddress(),
        ethers.ZeroHash,
        staticInput,
        "0x"
      );

      console.log(`Generated order:`);
      console.log(`  sellToken: ${order.sellToken}`);
      console.log(`  buyToken: ${order.buyToken}`);
      console.log(`  sellAmount: ${ethers.formatUnits(order.sellAmount, 6)} USDC`);
      console.log(`  buyAmount: ${ethers.formatEther(order.buyAmount)} WETH`);

      expect(order.sellToken).to.equal(USDC);
      expect(order.buyToken).to.equal(WETH);
      expect(order.sellAmount).to.equal(ethers.parseUnits("500", 6)); // chunkSize
      expect(order.buyAmount).to.equal(ethers.parseEther("0.15")); // minBuyPerChunk
    });
  });

  describe("Delegation Flow", function () {
    it("should allow manager to execute on behalf of user via delegation", async function () {
      const userAddr = await user.getAddress();
      const managerAddr = await orderManager.getAddress();

      // Verify delegation is set up correctly
      expect(await router.approvedManagers(managerAddr)).to.equal(true);
      expect(await router.userDelegates(userAddr, managerAddr)).to.equal(true);

      // The isAuthorizedFor function is public, but we can't call it directly
      // because it checks msg.sender. Instead we verify the mappings.
      console.log(`Manager ${managerAddr} is approved: ${await router.approvedManagers(managerAddr)}`);
      console.log(`User ${userAddr} delegated to manager: ${await router.userDelegates(userAddr, managerAddr)}`);
    });
  });

  describe("Handler Order Generation", function () {
    let orderHash: string;

    beforeEach(async function () {
      const userAddr = await user.getAddress();

      const params = {
        user: userAddr,
        preInstructionsData: "0x",
        preTotalAmount: ethers.parseUnits("1000", 6),
        sellToken: USDC,
        buyToken: WETH,
        chunkSize: ethers.parseUnits("200", 6),
        minBuyPerChunk: ethers.parseEther("0.05"),
        postInstructionsData: "0x",
        completion: 2, // Iterations
        targetValue: 5, // 5 chunks
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test")),
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("unique"));
      const tx = await orderManager.connect(user).createOrder(params, salt);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return orderManager.interface.parseLog(log)?.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      const parsed = orderManager.interface.parseLog(event);
      orderHash = parsed?.args[0];
    });

    it("should correctly calculate chunk progress", async function () {
      const [executed, total, iterations] = await orderHandler.getProgress(orderHash);

      expect(executed).to.equal(0);
      expect(total).to.equal(ethers.parseUnits("1000", 6));
      expect(iterations).to.equal(0);
    });

    it("should generate valid order for first chunk", async function () {
      const staticInput = coder.encode(["bytes32"], [orderHash]);

      const order = await orderHandler.getTradeableOrder(
        await orderManager.getAddress(),
        await owner.getAddress(),
        ethers.ZeroHash,
        staticInput,
        "0x"
      );

      expect(order.sellAmount).to.equal(ethers.parseUnits("200", 6));
      expect(order.buyAmount).to.equal(ethers.parseEther("0.05"));
      expect(order.receiver).to.equal(await orderManager.getAddress());
    });

    it("should return correct chunk params", async function () {
      const [sellAmount, minBuyAmount, isComplete] = await orderHandler.getChunkParams(orderHash);

      expect(sellAmount).to.equal(ethers.parseUnits("200", 6));
      expect(minBuyAmount).to.equal(ethers.parseEther("0.05"));
      expect(isComplete).to.equal(false);
    });
  });

  describe("Full Leverage-Up Flow Simulation", function () {
    /**
     * This test simulates a complete 2-chunk leverage-up flow:
     * 1. User has WETH collateral in Aave
     * 2. Pre-hook: Borrow USDC, send to OrderManager
     * 3. Simulated CoW swap: USDC → WETH
     * 4. Post-hook: Deposit WETH back to Aave
     * 5. Repeat for chunk 2
     * 6. Verify order completion
     */

    let orderHash: string;
    let userAddr: string;
    let aWethContract: any;
    let vDebtUsdcContract: any;
    let wethWhale: any;

    const CHUNK_SIZE = ethers.parseUnits("500", 6); // 500 USDC per chunk
    const SWAP_OUTPUT = ethers.parseEther("0.17"); // ~0.17 WETH per 500 USDC

    beforeEach(async function () {
      userAddr = await user.getAddress();

      // Get Aave data provider for token addresses
      const aaveDataProvider = await ethers.getContractAt(
        ["function getReserveTokensAddresses(address) view returns (address, address, address)"],
        "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654"
      );
      const [aWeth] = await aaveDataProvider.getReserveTokensAddresses(WETH);
      const [, , vDebtUsdc] = await aaveDataProvider.getReserveTokensAddresses(USDC);

      aWethContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aWeth);
      vDebtUsdcContract = await ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)", "function approveDelegation(address, uint256) external"],
        vDebtUsdc
      );

      // Get WETH whale signer for simulating swap output
      wethWhale = await ethers.getSigner(WETH_WHALE);

      // Step 1: User deposits 2 WETH as collateral to Aave
      const depositAmount = ethers.parseEther("2");
      await weth.connect(user).approve(await router.getAddress(), depositAmount);

      const depositInstructions = [
        createRouterInstruction(encodePullToken(depositAmount, WETH, userAddr)),
        createRouterInstruction(encodeApprove(0, "aave")),
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.Deposit, WETH, userAddr, depositAmount, "0x", 999)
        ),
      ];
      await router.connect(user).processProtocolInstructions(depositInstructions);

      const initialAWeth = await aWethContract.balanceOf(userAddr);
      console.log(`Initial aWETH balance: ${ethers.formatEther(initialAWeth)}`);

      // Step 2: User approves credit delegation for USDC borrowing
      await vDebtUsdcContract.connect(user).approveDelegation(
        await aaveGateway.getAddress(),
        ethers.MaxUint256
      );

      // Step 3: Create CoW order with pre/post instructions
      // Pre-instructions: Borrow USDC (amount comes from prepended ToOutput at index 0)
      //   - The hook prepends ToOutput(chunkSize, USDC) at index 0
      //   - Borrow instruction reads from index 0
      //   - PushToken sends borrowed USDC to OrderManager
      const preInstructions = [
        // Borrow USDC - uses input from index 0 (prepended ToOutput with chunkSize)
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.Borrow, USDC, userAddr, 0n, "0x", 0) // amount from index 0
        ),
        // Push borrowed USDC to OrderManager (borrow produces output at index 1 after ToOutput)
        createRouterInstruction(encodePushToken(1, await orderManager.getAddress())),
      ];

      // Post-instructions: Deposit WETH (amount comes from prepended ToOutput at index 0)
      //   - The hook prepends ToOutput(receivedAmount, WETH) at index 0
      //   - Router already has the WETH (transferred by executePostHook)
      //   - Approve aave gateway to spend from index 0
      //   - Deposit WETH to Aave
      const postInstructions = [
        // Approve aave gateway to spend WETH from index 0 (prepended ToOutput)
        createRouterInstruction(encodeApprove(0, "aave")),
        // Deposit WETH to Aave - uses input from index 0
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.Deposit, WETH, userAddr, 0n, "0x", 0) // amount from index 0
        ),
      ];

      const params = {
        user: userAddr,
        preInstructionsData: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [preInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))]
        ),
        preTotalAmount: ethers.parseUnits("1000", 6), // Total 1000 USDC
        sellToken: USDC,
        buyToken: WETH,
        chunkSize: CHUNK_SIZE,
        minBuyPerChunk: ethers.parseEther("0.15"),
        postInstructionsData: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))]
        ),
        completion: 2, // Iterations
        targetValue: 2, // 2 chunks to complete
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("leverage-up")),
      };

      const salt = ethers.keccak256(ethers.toUtf8Bytes("full-flow-test"));
      const tx = await orderManager.connect(user).createOrder(params, salt);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: any) => {
        try {
          return orderManager.interface.parseLog(log)?.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      const parsed = orderManager.interface.parseLog(event);
      orderHash = parsed?.args[0];
      console.log(`Order created with hash: ${orderHash}`);
    });

    it("should execute full 2-chunk leverage-up flow", async function () {
      const orderManagerAddr = await orderManager.getAddress();
      const vaultRelayerAddr = await mockVaultRelayer.getAddress();

      // ============ CHUNK 1 ============
      console.log("\n=== CHUNK 1 ===");

      // 1a) Execute pre-hook (HooksTrampoline calls this)
      console.log("Executing pre-hook...");
      await orderManager.connect(hooksTrampoline).executePreHook(orderHash, 0);

      // Verify: OrderManager now has USDC (borrowed from Aave)
      const usdcAfterPreHook1 = await usdc.balanceOf(orderManagerAddr);
      console.log(`OrderManager USDC after pre-hook: ${ethers.formatUnits(usdcAfterPreHook1, 6)}`);
      expect(usdcAfterPreHook1).to.equal(CHUNK_SIZE);

      // Verify: User has USDC debt
      const userDebt1 = await vDebtUsdcContract.balanceOf(userAddr);
      console.log(`User USDC debt after pre-hook: ${ethers.formatUnits(userDebt1, 6)}`);
      expect(userDebt1).to.be.gte(CHUNK_SIZE);

      // 1b) Simulate VaultRelayer pulling USDC from OrderManager
      console.log("Simulating VaultRelayer pull...");
      await usdc.connect(mockVaultRelayer).transferFrom(
        orderManagerAddr,
        vaultRelayerAddr,
        CHUNK_SIZE
      );

      // Verify: OrderManager no longer has USDC
      expect(await usdc.balanceOf(orderManagerAddr)).to.equal(0);

      // 1c) Simulate swap output - transfer WETH to OrderManager
      console.log("Simulating swap output...");
      await weth.connect(wethWhale).transfer(orderManagerAddr, SWAP_OUTPUT);

      // Verify: OrderManager has WETH
      expect(await weth.balanceOf(orderManagerAddr)).to.equal(SWAP_OUTPUT);

      // 1d) Execute post-hook (HooksTrampoline calls this)
      console.log("Executing post-hook...");
      await orderManager.connect(hooksTrampoline).executePostHook(orderHash);

      // Verify: OrderManager no longer has WETH (deposited to Aave)
      expect(await weth.balanceOf(orderManagerAddr)).to.equal(0);

      // Verify: Order progress updated
      let order = await orderManager.getOrder(orderHash);
      console.log(`Order after chunk 1: iterations=${order.iterationCount}, status=${order.status}`);
      expect(order.iterationCount).to.equal(1);
      expect(order.status).to.equal(1); // Active

      // ============ CHUNK 2 ============
      console.log("\n=== CHUNK 2 ===");

      // 2a) Execute pre-hook
      console.log("Executing pre-hook...");
      await orderManager.connect(hooksTrampoline).executePreHook(orderHash, 1);

      const usdcAfterPreHook2 = await usdc.balanceOf(orderManagerAddr);
      console.log(`OrderManager USDC after pre-hook: ${ethers.formatUnits(usdcAfterPreHook2, 6)}`);
      expect(usdcAfterPreHook2).to.equal(CHUNK_SIZE);

      // 2b) Simulate VaultRelayer pulling USDC
      console.log("Simulating VaultRelayer pull...");
      await usdc.connect(mockVaultRelayer).transferFrom(
        orderManagerAddr,
        vaultRelayerAddr,
        CHUNK_SIZE
      );

      // 2c) Simulate swap output
      console.log("Simulating swap output...");
      await weth.connect(wethWhale).transfer(orderManagerAddr, SWAP_OUTPUT);

      // 2d) Execute post-hook
      console.log("Executing post-hook...");
      await orderManager.connect(hooksTrampoline).executePostHook(orderHash);

      // Verify: Order is now COMPLETED
      order = await orderManager.getOrder(orderHash);
      console.log(`Order after chunk 2: iterations=${order.iterationCount}, status=${order.status}`);
      expect(order.iterationCount).to.equal(2);
      expect(order.status).to.equal(2); // Completed

      // ============ FINAL VERIFICATION ============
      console.log("\n=== FINAL STATE ===");

      // User's final aWETH balance (should be ~2.34 WETH: 2 initial + 0.17*2 from swaps)
      const finalAWeth = await aWethContract.balanceOf(userAddr);
      console.log(`Final aWETH balance: ${ethers.formatEther(finalAWeth)}`);
      expect(finalAWeth).to.be.gt(ethers.parseEther("2.3")); // At least 2.3 WETH

      // User's final USDC debt (should be ~1000 USDC: 500*2 borrowed)
      const finalDebt = await vDebtUsdcContract.balanceOf(userAddr);
      console.log(`Final USDC debt: ${ethers.formatUnits(finalDebt, 6)}`);
      expect(finalDebt).to.be.gte(ethers.parseUnits("1000", 6));

      // Verify order is complete via public function
      expect(await orderManager.isOrderComplete(orderHash)).to.equal(true);
    });

    it("should not allow non-HooksTrampoline to execute hooks", async function () {
      // Try to execute pre-hook from non-authorized address
      await expect(
        orderManager.connect(user).executePreHook(orderHash, 0)
      ).to.be.revertedWithCustomError(orderManager, "NotHooksTrampoline");

      await expect(
        orderManager.connect(owner).executePostHook(orderHash)
      ).to.be.revertedWithCustomError(orderManager, "NotHooksTrampoline");
    });

    it("should allow user to cancel order before completion", async function () {
      // Execute one chunk first
      await orderManager.connect(hooksTrampoline).executePreHook(orderHash, 0);
      await usdc.connect(mockVaultRelayer).transferFrom(
        await orderManager.getAddress(),
        await mockVaultRelayer.getAddress(),
        CHUNK_SIZE
      );
      await weth.connect(wethWhale).transfer(await orderManager.getAddress(), SWAP_OUTPUT);
      await orderManager.connect(hooksTrampoline).executePostHook(orderHash);

      // Verify order is still active
      let order = await orderManager.getOrder(orderHash);
      expect(order.status).to.equal(1); // Active

      // Cancel the order
      await orderManager.connect(user).cancelOrder(orderHash);

      // Verify order is cancelled
      order = await orderManager.getOrder(orderHash);
      expect(order.status).to.equal(3); // Cancelled
      expect(order.iterationCount).to.equal(1); // One chunk was completed
    });
  });
});
