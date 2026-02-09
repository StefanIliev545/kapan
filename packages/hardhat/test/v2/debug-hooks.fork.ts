/**
 * Debug script to simulate CoW hooks and find where they fail
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/debug-hooks.fork.ts
 */
import { ethers } from "hardhat";

describe("Debug Hooks", function () {
  // Order from CoW explorer
  const ORDER_HASH = "0xeaf56f8abd7d0be5808dc820b644f0ad6fe72224e06bdc8fd5569877be4a45f4";
  const ORDER_MANAGER = "0xEBe83a05f3622CE2B8933dAee4C81Db8a726ddab";
  const HOOKS_TRAMPOLINE = "0xdedb4d230d8b1e9268fd46779a8028d5daaa8fa3"; // From calldata

  it("should check order state", async () => {
    const orderManager = await ethers.getContractAt(
      [
        "function orders(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
        "function hooksTrampoline() view returns (address)",
        "function cachedSellAmount(bytes32) view returns (uint256)",
        "function cachedBuyAmount(bytes32) view returns (uint256)",
        "function preHookExecutedForIteration(bytes32) view returns (uint256)",
      ],
      ORDER_MANAGER
    );

    console.log("\n=== Order Manager State ===");

    const trampoline = await orderManager.hooksTrampoline();
    console.log("HooksTrampoline:", trampoline);

    try {
      const order = await orderManager.orders(ORDER_HASH);
      console.log("\nOrder found!");
      console.log("  Status:", order.status);
      console.log("  User:", order.params.user);
      console.log("  Trigger:", order.params.trigger);
      console.log("  SellToken:", order.params.sellToken);
      console.log("  BuyToken:", order.params.buyToken);
      console.log("  IterationCount:", order.iterationCount.toString());
      console.log("  MaxIterations:", order.params.maxIterations.toString());

      const cachedSell = await orderManager.cachedSellAmount(ORDER_HASH);
      const cachedBuy = await orderManager.cachedBuyAmount(ORDER_HASH);
      const preHookExecuted = await orderManager.preHookExecutedForIteration(ORDER_HASH);

      console.log("\nCached amounts:");
      console.log("  CachedSellAmount:", cachedSell.toString());
      console.log("  CachedBuyAmount:", cachedBuy.toString());
      console.log("  PreHookExecutedForIteration:", preHookExecuted.toString());
    } catch (e: any) {
      console.log("Order not found or error:", e.message);
    }
  });

  it("should simulate pre-hook execution", async () => {
    // Impersonate hooks trampoline
    await ethers.provider.send("hardhat_impersonateAccount", [HOOKS_TRAMPOLINE]);
    await ethers.provider.send("hardhat_setBalance", [HOOKS_TRAMPOLINE, "0x56BC75E2D63100000"]);
    const trampolineSigner = await ethers.getSigner(HOOKS_TRAMPOLINE);

    const orderManager = await ethers.getContractAt(
      [
        "function executePreHook(bytes32 orderHash)",
        "function orders(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      ],
      ORDER_MANAGER
    );

    console.log("\n=== Simulating Pre-Hook ===");

    try {
      // First check if order exists
      const order = await orderManager.orders(ORDER_HASH);
      if (order.status === 0) {
        console.log("Order status is 0 (not active), skipping simulation");
        return;
      }

      // Try to call pre-hook
      const tx = await orderManager.connect(trampolineSigner).executePreHook(ORDER_HASH, {
        gasLimit: 5000000,
      });
      const receipt = await tx.wait();
      console.log("Pre-hook succeeded! Gas used:", receipt?.gasUsed.toString());
    } catch (e: any) {
      console.log("Pre-hook FAILED!");
      console.log("Error:", e.message);
      if (e.data) {
        console.log("Error data:", e.data);
      }
    }
  });

  it("should check trigger calculation", async () => {
    const orderManager = await ethers.getContractAt(
      [
        "function orders(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      ],
      ORDER_MANAGER
    );

    try {
      const order = await orderManager.orders(ORDER_HASH);
      if (order.status === 0) {
        console.log("Order not found");
        return;
      }

      const trigger = await ethers.getContractAt(
        [
          "function shouldExecute(bytes calldata staticData, address owner) view returns (bool, string memory)",
          "function calculateExecution(bytes calldata staticData, address owner) view returns (uint256 sellAmount, uint256 minBuyAmount)",
          "function triggerName() view returns (string memory)",
        ],
        order.params.trigger
      );

      console.log("\n=== Trigger Check ===");
      console.log("Trigger address:", order.params.trigger);
      console.log("Trigger name:", await trigger.triggerName());

      const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, order.params.user);
      console.log("Should execute:", shouldExec);
      console.log("Reason:", reason);

      const [sellAmount, minBuyAmount] = await trigger.calculateExecution(order.params.triggerStaticData, order.params.user);
      console.log("Calculated sell amount:", ethers.formatUnits(sellAmount, 6), "(assuming 6 decimals)");
      console.log("Calculated min buy amount:", ethers.formatUnits(minBuyAmount, 6), "(assuming 6 decimals)");
    } catch (e: any) {
      console.log("Trigger check failed:", e.message);
    }
  });
});
