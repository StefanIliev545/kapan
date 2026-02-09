/**
 * Simulate a CoW order with flash loans to debug filling issues
 *
 * Usage:
 *   FORK_CHAIN=arbitrum npx hardhat test test/v2/simulate-order.fork.ts
 *
 * Update ORDER_CONFIG with values from CoW Explorer
 */
import { ethers } from "hardhat";
import { expect } from "chai";
import { formatUnits } from "ethers";

// ============ ORDER CONFIG - Update from CoW Explorer ============
const ORDER_CONFIG = {
  // User wallet address
  user: "0xdedb4d230d8b1e9268fd46779a8028d5daaa8fa3",

  // Salt from appData (the filled order)
  salt: "0x31abf2ca4c4c142ea4d2c3b6b55fc35dec6b895387cb20ad2de604438375b68d",

  // Tokens
  sellToken: "0x41CA7586cC1311807B4605fBB748a3B8862b42b5", // syrupUSDC
  buyToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
  sellDecimals: 6,
  buyDecimals: 6,

  // Flash loan config from appData
  flashLoan: {
    amount: "223843617", // 223.84 syrupUSDC
    token: "0x41CA7586cC1311807B4605fBB748a3B8862b42b5",
    lender: "0x6c247b1F6182318877311737BaC0844bAa518F5e", // Morpho vault
  },

  // Contract addresses (Arbitrum)
  orderManager: "0xEBe83a05f3622CE2B8933dAee4C81Db8a726ddab",
  cowAdapter: "0x86a79fe057FfF0f288aDbfDcc607243fa210bCA9",
};

describe("Simulate Order", function () {
  before(function () {
    // Use FORK_CHAIN env var since network.config.chainId doesn't reflect fork
    if (process.env.FORK_CHAIN !== "arbitrum") {
      console.log("Skipping - requires Arbitrum fork (FORK_CHAIN=arbitrum)");
      this.skip();
    }
  });

  it("should simulate full order execution", async function () {
    this.timeout(120000);
    const config = ORDER_CONFIG;

    console.log("\n========================================");
    console.log("   CoW Order Simulation");
    console.log("========================================\n");
    console.log("Config:");
    console.log("  User:", config.user);
    console.log("  Salt:", config.salt);
    console.log("  FlashLoan:", formatUnits(config.flashLoan.amount, config.sellDecimals));

    // Get contracts
    const orderManager = await ethers.getContractAt(
      [
        "function orders(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
        "function ordersBySalt(address user, bytes32 salt) view returns (bytes32)",
        "function hooksTrampoline() view returns (address)",
        "function executePreHookBySalt(address user, bytes32 salt)",
        "function executePostHookBySalt(address user, bytes32 salt)",
        "function cachedSellAmount(bytes32) view returns (uint256)",
        "function cachedBuyAmount(bytes32) view returns (uint256)",
      ],
      config.orderManager
    );

    const cowAdapter = await ethers.getContractAt(
      ["function fundOrderWithBalance(address caller, bytes32 salt, address token, address receiver)"],
      config.cowAdapter
    );

    // Step 1: Check order exists
    console.log("\nStep 1: Checking order...");
    const orderHash = await orderManager.ordersBySalt(config.user, config.salt);
    console.log("  Order hash:", orderHash);

    if (orderHash === ethers.ZeroHash) {
      console.log("  ⚠️ Order not found (may have already filled)");
      return;
    }

    const order = await orderManager.orders(orderHash);
    console.log("  Status:", order.status.toString(), order.status === 1n ? "(Active)" : "(Filled/Cancelled)");
    console.log("  User:", order.params.user);
    console.log("  Trigger:", order.params.trigger);

    // Step 2: Check trigger
    console.log("\nStep 2: Checking trigger...");
    const trigger = await ethers.getContractAt(
      [
        "function shouldExecute(bytes calldata staticData, address owner) view returns (bool, string memory)",
        "function calculateExecution(bytes calldata staticData, address owner) view returns (uint256 sellAmount, uint256 minBuyAmount)",
        "function triggerName() view returns (string memory)",
      ],
      order.params.trigger
    );

    const triggerName = await trigger.triggerName();
    console.log("  Trigger:", triggerName);

    const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, order.params.user);
    console.log("  Should execute:", shouldExec, "-", reason);

    const [sellAmount, minBuyAmount] = await trigger.calculateExecution(order.params.triggerStaticData, order.params.user);
    console.log("  Sell amount:", formatUnits(sellAmount, config.sellDecimals));
    console.log("  Min buy:", formatUnits(minBuyAmount, config.buyDecimals));

    if (order.status !== 1n) {
      console.log("\n  Order not active, skipping simulation");
      return;
    }

    // Step 3: Setup impersonation
    console.log("\nStep 3: Setting up...");
    const hooksTrampoline = await orderManager.hooksTrampoline();
    console.log("  HooksTrampoline:", hooksTrampoline);

    await ethers.provider.send("hardhat_impersonateAccount", [hooksTrampoline]);
    await ethers.provider.send("hardhat_setBalance", [hooksTrampoline, "0x56BC75E2D63100000"]);
    const trampolineSigner = await ethers.getSigner(hooksTrampoline);

    // Step 4: Simulate flash loan
    console.log("\nStep 4: Flash loan...");
    const flashToken = await ethers.getContractAt("IERC20", config.flashLoan.token);
    const flashAmount = BigInt(config.flashLoan.amount);

    await ethers.provider.send("hardhat_impersonateAccount", [config.flashLoan.lender]);
    await ethers.provider.send("hardhat_setBalance", [config.flashLoan.lender, "0x56BC75E2D63100000"]);
    const lenderSigner = await ethers.getSigner(config.flashLoan.lender);

    const lenderBalance = await flashToken.balanceOf(config.flashLoan.lender);
    console.log("  Lender balance:", formatUnits(lenderBalance, config.sellDecimals));
    expect(lenderBalance).to.be.gte(flashAmount);

    await flashToken.connect(lenderSigner).transfer(config.cowAdapter, flashAmount);
    console.log("  ✅ Flash loan transferred");

    // Step 5: Pre-hook 1 - fundOrderWithBalance
    console.log("\nStep 5: Pre-hook 1 (fundOrderWithBalance)...");
    await cowAdapter.connect(trampolineSigner).fundOrderWithBalance(
      hooksTrampoline,
      config.salt,
      config.flashLoan.token,
      config.orderManager
    );
    console.log("  ✅ Tokens moved to OrderManager");

    // Step 6: Pre-hook 2 - executePreHookBySalt
    console.log("\nStep 6: Pre-hook 2 (executePreHookBySalt)...");
    const preHookTx = await orderManager.connect(trampolineSigner).executePreHookBySalt(
      config.user,
      config.salt,
      { gasLimit: 1500000 }
    );
    const preHookReceipt = await preHookTx.wait();
    console.log("  ✅ Pre-hook executed, gas:", preHookReceipt?.gasUsed.toString());

    const cachedSell = await orderManager.cachedSellAmount(orderHash);
    const cachedBuy = await orderManager.cachedBuyAmount(orderHash);
    console.log("  Cached sell:", formatUnits(cachedSell, config.sellDecimals));
    console.log("  Cached buy:", formatUnits(cachedBuy, config.buyDecimals));

    // Step 7: Simulate swap (cheat: transfer buy tokens)
    console.log("\nStep 7: Simulating swap...");
    const buyToken = await ethers.getContractAt("IERC20", config.buyToken);

    // Find USDT source
    const usdtWhale = "0x489ee077994B6658eAfA855C308275EAd8097C4A"; // Aave pool
    await ethers.provider.send("hardhat_impersonateAccount", [usdtWhale]);
    await ethers.provider.send("hardhat_setBalance", [usdtWhale, "0x56BC75E2D63100000"]);
    const whaleSigner = await ethers.getSigner(usdtWhale);

    await buyToken.connect(whaleSigner).transfer(config.orderManager, minBuyAmount);
    console.log("  ✅ Swap simulated:", formatUnits(minBuyAmount, config.buyDecimals), "USDT");

    // Step 8: Post-hook
    console.log("\nStep 8: Post-hook (executePostHookBySalt)...");
    const postHookTx = await orderManager.connect(trampolineSigner).executePostHookBySalt(
      config.user,
      config.salt,
      { gasLimit: 2500000 }
    );
    const postHookReceipt = await postHookTx.wait();
    console.log("  ✅ Post-hook executed, gas:", postHookReceipt?.gasUsed.toString());

    console.log("\n========================================");
    console.log("   ✅ SIMULATION PASSED");
    console.log("========================================");
  });
});
