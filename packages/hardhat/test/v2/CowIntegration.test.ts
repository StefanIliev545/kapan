import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, ZeroAddress } from "ethers";

describe("CoW Protocol Integration", function () {
  let owner: any;
  let user: any;
  let hooksTrampoline: any;
  
  let router: any;
  let orderManager: any;
  let orderHandler: any;
  let mockComposableCoW: any;
  let mockSettlement: any;
  let mockVaultRelayer: any;
  
  let mockToken: any;
  let buyToken: any;
  
  const coder = AbiCoder.defaultAbiCoder();

  beforeEach(async function () {
    [owner, user, hooksTrampoline, mockVaultRelayer] = await ethers.getSigners();
    
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
    
    // Setup: Approve manager as delegate in router
    await router.setApprovedManager(await orderManager.getAddress(), true);
    
    // Setup: User approves manager as delegate
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);
  });

  describe("Router Delegation", function () {
    it("should allow owner to set approved managers", async function () {
      const managerAddr = await orderManager.getAddress();
      expect(await router.approvedManagers(managerAddr)).to.equal(true);
    });

    it("should allow users to set delegates", async function () {
      const userAddr = await user.getAddress();
      const managerAddr = await orderManager.getAddress();
      expect(await router.userDelegates(userAddr, managerAddr)).to.equal(true);
    });

    it("should correctly check authorization", async function () {
      const userAddr = await user.getAddress();
      const managerAddr = await orderManager.getAddress();
      
      // Manager should be authorized for user
      // Note: This check would need to be called from the manager's context
      // For now, we verify the mappings are set correctly
      expect(await router.approvedManagers(managerAddr)).to.equal(true);
      expect(await router.userDelegates(userAddr, managerAddr)).to.equal(true);
    });

    it("should emit events on approval changes", async function () {
      const newManager = ethers.Wallet.createRandom().address;
      
      await expect(router.setApprovedManager(newManager, true))
        .to.emit(router, "ManagerApprovalChanged")
        .withArgs(newManager, true);
      
      await expect(router.connect(user).setDelegate(newManager, true))
        .to.emit(router, "DelegateApprovalChanged")
        .withArgs(await user.getAddress(), newManager, true);
    });
  });

  describe("Order Manager", function () {
    it("should have correct initial state", async function () {
      expect(await orderManager.router()).to.equal(await router.getAddress());
      expect(await orderManager.composableCoW()).to.equal(await mockComposableCoW.getAddress());
      expect(await orderManager.settlement()).to.equal(await mockSettlement.getAddress());
      expect(await orderManager.hooksTrampoline()).to.equal(await hooksTrampoline.getAddress());
      expect(await orderManager.orderHandler()).to.equal(await orderHandler.getAddress());
    });

    it("should create an order", async function () {
      const params = {
        user: await user.getAddress(),
        preInstructionsData: "0x",
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsData: "0x",
        completion: 2, // Iterations
        targetValue: 5, // 5 iterations
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-app-data"))
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("unique-salt"));
      
      await expect(orderManager.connect(user).createOrder(params, salt, 0))
        .to.emit(orderManager, "OrderCreated");
      
      // Verify order was registered with ComposableCoW
      expect(await mockComposableCoW.getCreatedOrdersCount()).to.equal(1);
    });

    it("should reject order creation from non-user", async function () {
      const params = {
        user: await user.getAddress(),
        preInstructionsData: "0x",
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsData: "0x",
        completion: 2,
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-app-data"))
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("unique-salt"));
      
      // Owner tries to create order for user - should fail
      await expect(orderManager.connect(owner).createOrder(params, salt, 0))
        .to.be.revertedWithCustomError(orderManager, "Unauthorized");
    });
  });

  describe("Order Handler", function () {
    let orderHash: string;
    
    beforeEach(async function () {
      const params = {
        user: await user.getAddress(),
        preInstructionsData: "0x",
        preTotalAmount: ethers.parseUnits("10000", 6),
        sellToken: await mockToken.getAddress(),
        buyToken: await buyToken.getAddress(),
        chunkSize: ethers.parseUnits("2000", 6),
        minBuyPerChunk: ethers.parseEther("0.5"),
        postInstructionsData: "0x",
        completion: 2, // Iterations
        targetValue: 5,
        minHealthFactor: ethers.parseEther("1.1"),
        appDataHash: ethers.keccak256(ethers.toUtf8Bytes("test-app-data"))
      };
      
      const salt = ethers.keccak256(ethers.toUtf8Bytes("unique-salt"));
      
      const tx = await orderManager.connect(user).createOrder(params, salt, 0);
      const receipt = await tx.wait();
      
      // Extract orderHash from event
      const event = receipt?.logs.find((log: any) => {
        try {
          return orderManager.interface.parseLog(log)?.name === "OrderCreated";
        } catch {
          return false;
        }
      });
      
      if (event) {
        const parsed = orderManager.interface.parseLog(event);
        orderHash = parsed?.args[0];
      }
    });

    it("should generate a tradeable order", async function () {
      const staticInput = coder.encode(["bytes32"], [orderHash]);
      
      const order = await orderHandler.getTradeableOrder(
        await orderManager.getAddress(),
        await owner.getAddress(),
        ethers.ZeroHash,
        staticInput,
        "0x"
      );
      
      expect(order.sellToken).to.equal(await mockToken.getAddress());
      expect(order.buyToken).to.equal(await buyToken.getAddress());
      expect(order.sellAmount).to.equal(ethers.parseUnits("2000", 6)); // chunkSize
      expect(order.buyAmount).to.equal(ethers.parseEther("0.5")); // minBuyPerChunk
      expect(order.receiver).to.equal(await orderManager.getAddress());
    });

    it("should return chunk params", async function () {
      const [sellAmount, minBuyAmount, isComplete] = await orderHandler.getChunkParams(orderHash);
      
      expect(sellAmount).to.equal(ethers.parseUnits("2000", 6));
      expect(minBuyAmount).to.equal(ethers.parseEther("0.5"));
      expect(isComplete).to.equal(false);
    });

    it("should return progress", async function () {
      const [executed, total, iterations] = await orderHandler.getProgress(orderHash);
      
      expect(executed).to.equal(0);
      expect(total).to.equal(ethers.parseUnits("10000", 6));
      expect(iterations).to.equal(0);
    });

    it("should return deterministic validTo (same order hash on multiple polls)", async function () {
      const staticInput = coder.encode(["bytes32"], [orderHash]);
      
      // First poll
      const order1 = await orderHandler.getTradeableOrder(
        await orderManager.getAddress(),
        await owner.getAddress(),
        ethers.ZeroHash,
        staticInput,
        "0x"
      );
      
      // Simulate time passing (5 minutes) - still within same chunk window
      await ethers.provider.send("evm_increaseTime", [5 * 60]);
      await ethers.provider.send("evm_mine", []);
      
      // Second poll - should return SAME validTo
      const order2 = await orderHandler.getTradeableOrder(
        await orderManager.getAddress(),
        await owner.getAddress(),
        ethers.ZeroHash,
        staticInput,
        "0x"
      );
      
      // validTo should be identical (deterministic)
      expect(order1.validTo).to.equal(order2.validTo);
      
      // All other fields should also match
      expect(order1.sellAmount).to.equal(order2.sellAmount);
      expect(order1.buyAmount).to.equal(order2.buyAmount);
      expect(order1.sellToken).to.equal(order2.sellToken);
      expect(order1.buyToken).to.equal(order2.buyToken);
    });

    it("should extend validTo to current window if chunk window expires", async function () {
      const staticInput = coder.encode(["bytes32"], [orderHash]);
      
      // Get initial order
      const order1 = await orderHandler.getTradeableOrder(
        await orderManager.getAddress(),
        await owner.getAddress(),
        ethers.ZeroHash,
        staticInput,
        "0x"
      );
      
      // Simulate time passing beyond first chunk window (35 minutes)
      await ethers.provider.send("evm_increaseTime", [35 * 60]);
      await ethers.provider.send("evm_mine", []);
      
      // Poll again - validTo should extend to current window (not be expired)
      const order2 = await orderHandler.getTradeableOrder(
        await orderManager.getAddress(),
        await owner.getAddress(),
        ethers.ZeroHash,
        staticInput,
        "0x"
      );
      
      // validTo should be different (extended to new window)
      expect(order2.validTo).to.be.greaterThan(order1.validTo);
      
      // But sell/buy amounts should still be the same (same chunk)
      expect(order1.sellAmount).to.equal(order2.sellAmount);
    });
  });
});
