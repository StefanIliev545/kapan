/**
 * Simulate a CoW order with flash loans to debug why it's not filling
 *
 * Usage:
 *   FORK_CHAIN=arbitrum npx hardhat run scripts/simulate-order.ts
 *
 * Or with env vars:
 *   USER=0x... SALT=0x... FORK_CHAIN=arbitrum npx hardhat run scripts/simulate-order.ts
 *
 * Configure ORDER_CONFIG below or use environment variables
 */
import { ethers } from "hardhat";
import { formatUnits } from "ethers";

// ============ ORDER CONFIG ============
// Override with env vars: ORDER_USER, SALT, SELL_TOKEN, BUY_TOKEN, FLASH_AMOUNT, FLASH_LENDER
const ORDER_CONFIG = {
  // User wallet address
  user: process.env.ORDER_USER || "0xdedb4d230d8b1e9268fd46779a8028d5daaa8fa3",

  // Salt from appData
  salt: process.env.SALT || "0xf59a255b06965d8b2890ac1ca62d4dc99b155561a05ac5cf2c60fdbf37f04672",

  // Tokens (defaults for syrupUSDC/USDT on Arbitrum)
  sellToken: process.env.SELL_TOKEN || "0x41CA7586cC1311807B4605fBB748a3B8862b42b5",
  buyToken: process.env.BUY_TOKEN || "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  sellDecimals: parseInt(process.env.SELL_DECIMALS || "6"),
  buyDecimals: parseInt(process.env.BUY_DECIMALS || "6"),

  // Flash loan config from appData
  flashLoan: {
    amount: process.env.FLASH_AMOUNT || "223843617",
    token: process.env.FLASH_TOKEN || process.env.SELL_TOKEN || "0x41CA7586cC1311807B4605fBB748a3B8862b42b5",
    lender: process.env.FLASH_LENDER || "0x6c247b1F6182318877311737BaC0844bAa518F5e",
  },

  // Contract addresses (Arbitrum defaults)
  orderManager: process.env.ORDER_MANAGER || "0xEBe83a05f3622CE2B8933dAee4C81Db8a726ddab",
  cowAdapter: process.env.COW_ADAPTER || "0x86a79fe057FfF0f288aDbfDcc607243fa210bCA9",
};

// Common whale addresses by token (Arbitrum)
const WHALES: Record<string, string[]> = {
  // USDT
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": [
    "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
    "0x489ee077994B6658eAfA855C308275EAd8097C4A", // Aave
  ],
  // USDC
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": [
    "0x489ee077994B6658eAfA855C308275EAd8097C4A", // Aave
    "0x0B7a6B0AD7C3FE0dCE40D1c4a7b1E2b4c8A0dA1C",
  ],
};

async function findWhaleWithBalance(token: string, amount: bigint): Promise<string | null> {
  const tokenContract = await ethers.getContractAt("IERC20", token);
  const whales = WHALES[token.toLowerCase()] || [];

  for (const whale of whales) {
    try {
      const balance = await tokenContract.balanceOf(whale);
      if (balance >= amount) {
        return whale;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  console.log("\n========================================");
  console.log("   CoW Order Simulation");
  console.log("========================================\n");

  const config = ORDER_CONFIG;
  console.log("Config:");
  console.log("  User:", config.user);
  console.log("  Salt:", config.salt);
  console.log("  SellToken:", config.sellToken);
  console.log("  BuyToken:", config.buyToken);
  console.log("  FlashLoan:", config.flashLoan.amount, "from", config.flashLoan.lender);
  console.log("");

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
    [
      "function fundOrderWithBalance(address caller, bytes32 salt, address token, address receiver)",
    ],
    config.cowAdapter
  );

  // Step 1: Check order exists
  console.log("Step 1: Checking order state...");
  const orderHash = await orderManager.ordersBySalt(config.user, config.salt);
  console.log("  Order hash:", orderHash);

  if (orderHash === ethers.ZeroHash) {
    console.log("  ❌ Order not found! Check user and salt.");
    return;
  }

  const order = await orderManager.orders(orderHash);
  const statusStr = order.status === 1n ? "(Active)" : order.status === 0n ? "(None)" : "(Completed/Cancelled)";
  console.log("  Status:", order.status.toString(), statusStr);
  console.log("  User:", order.params.user);
  console.log("  Trigger:", order.params.trigger);
  console.log("  SellToken:", order.params.sellToken);
  console.log("  BuyToken:", order.params.buyToken);
  console.log("  IterationCount:", order.iterationCount.toString());
  console.log("  ✅ Order found\n");

  // Step 2: Check trigger
  console.log("Step 2: Checking trigger...");
  const trigger = await ethers.getContractAt(
    [
      "function shouldExecute(bytes calldata staticData, address owner) view returns (bool, string memory)",
      "function calculateExecution(bytes calldata staticData, address owner) view returns (uint256 sellAmount, uint256 minBuyAmount)",
      "function triggerName() view returns (string memory)",
    ],
    order.params.trigger
  );

  const triggerName = await trigger.triggerName();
  console.log("  Trigger name:", triggerName);

  const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, order.params.user);
  console.log("  Should execute:", shouldExec);
  console.log("  Reason:", reason);

  if (!shouldExec) {
    console.log("  ⚠️ Trigger says should NOT execute. Order won't fill until condition is met.\n");
  } else {
    console.log("  ✅ Trigger condition met\n");
  }

  const [calcSellAmount, calcMinBuyAmount] = await trigger.calculateExecution(order.params.triggerStaticData, order.params.user);
  console.log("  Calculated sell:", formatUnits(calcSellAmount, config.sellDecimals));
  console.log("  Calculated minBuy:", formatUnits(calcMinBuyAmount, config.buyDecimals));

  // Step 3: Setup impersonation
  console.log("\nStep 3: Setting up simulation...");
  const hooksTrampoline = await orderManager.hooksTrampoline();
  console.log("  HooksTrampoline:", hooksTrampoline);

  await ethers.provider.send("hardhat_impersonateAccount", [hooksTrampoline]);
  await ethers.provider.send("hardhat_setBalance", [hooksTrampoline, "0x56BC75E2D63100000"]);
  const trampolineSigner = await ethers.getSigner(hooksTrampoline);

  // Step 4: Simulate flash loan arrival
  console.log("\nStep 4: Simulating flash loan...");
  const flashLoanToken = await ethers.getContractAt("IERC20", config.flashLoan.token);
  const flashAmount = BigInt(config.flashLoan.amount);
  console.log("  Flash loan amount:", formatUnits(flashAmount, config.sellDecimals));

  // Transfer from lender to adapter (simulating flash loan)
  const lenderBalance = await flashLoanToken.balanceOf(config.flashLoan.lender);
  console.log("  Lender balance:", formatUnits(lenderBalance, config.sellDecimals));

  if (lenderBalance >= flashAmount) {
    await ethers.provider.send("hardhat_impersonateAccount", [config.flashLoan.lender]);
    await ethers.provider.send("hardhat_setBalance", [config.flashLoan.lender, "0x56BC75E2D63100000"]);
    const lenderSigner = await ethers.getSigner(config.flashLoan.lender);

    await flashLoanToken.connect(lenderSigner).transfer(config.cowAdapter, flashAmount);
    console.log("  ✅ Transferred flash loan to adapter");
  } else {
    console.log("  ❌ Lender doesn't have enough balance for flash loan");
    return;
  }

  // Step 5: Execute pre-hook 1 (fundOrderWithBalance)
  console.log("\nStep 5: Executing pre-hook 1 (fundOrderWithBalance)...");
  try {
    await cowAdapter.connect(trampolineSigner).fundOrderWithBalance(
      hooksTrampoline,
      config.salt,
      config.flashLoan.token,
      config.orderManager,
      { gasLimit: 500000 }
    );
    console.log("  ✅ fundOrderWithBalance succeeded");

    const managerBalance = await flashLoanToken.balanceOf(config.orderManager);
    console.log("  OrderManager balance:", formatUnits(managerBalance, config.sellDecimals));
  } catch (e: any) {
    console.log("  ❌ fundOrderWithBalance FAILED!");
    console.log("  Error:", e.message);
    return;
  }

  // Step 6: Execute pre-hook 2 (executePreHookBySalt)
  console.log("\nStep 6: Executing pre-hook 2 (executePreHookBySalt)...");
  try {
    const tx = await orderManager.connect(trampolineSigner).executePreHookBySalt(
      config.user,
      config.salt,
      { gasLimit: 1000000 }
    );
    const receipt = await tx.wait();
    console.log("  ✅ executePreHookBySalt succeeded");
    console.log("  Gas used:", receipt?.gasUsed.toString());

    const cachedSell = await orderManager.cachedSellAmount(orderHash);
    const cachedBuy = await orderManager.cachedBuyAmount(orderHash);
    console.log("  Cached sell amount:", formatUnits(cachedSell, config.sellDecimals));
    console.log("  Cached buy amount:", formatUnits(cachedBuy, config.buyDecimals));
  } catch (e: any) {
    console.log("  ❌ executePreHookBySalt FAILED!");
    console.log("  Error:", e.message);
    return;
  }

  // Step 7: Simulate swap
  console.log("\nStep 7: Simulating swap...");
  const buyToken = await ethers.getContractAt("IERC20", config.buyToken);
  const buyAmount = calcMinBuyAmount; // Use trigger's calculated amount

  const whale = await findWhaleWithBalance(config.buyToken, buyAmount);
  if (whale) {
    await ethers.provider.send("hardhat_impersonateAccount", [whale]);
    await ethers.provider.send("hardhat_setBalance", [whale, "0x56BC75E2D63100000"]);
    const whaleSigner = await ethers.getSigner(whale);

    await buyToken.connect(whaleSigner).transfer(config.orderManager, buyAmount);
    console.log("  ✅ Simulated swap -", formatUnits(buyAmount, config.buyDecimals), "to OrderManager");
  } else {
    // Try direct mint simulation
    console.log("  ⚠️ No whale found, trying lender as source...");
    const lenderBuyBalance = await buyToken.balanceOf(config.flashLoan.lender);
    if (lenderBuyBalance >= buyAmount) {
      const lenderSigner = await ethers.getSigner(config.flashLoan.lender);
      await buyToken.connect(lenderSigner).transfer(config.orderManager, buyAmount);
      console.log("  ✅ Simulated swap from lender");
    } else {
      console.log("  ❌ Could not simulate swap - no source found");
      return;
    }
  }

  // Step 8: Execute post-hook
  console.log("\nStep 8: Executing post-hook (executePostHookBySalt)...");
  try {
    const tx = await orderManager.connect(trampolineSigner).executePostHookBySalt(
      config.user,
      config.salt,
      { gasLimit: 2000000 }
    );
    const receipt = await tx.wait();
    console.log("  ✅ executePostHookBySalt succeeded");
    console.log("  Gas used:", receipt?.gasUsed.toString());
  } catch (e: any) {
    console.log("  ❌ executePostHookBySalt FAILED!");
    console.log("  Error:", e.message);

    // Try to decode error
    try {
      const iface = new ethers.Interface([
        "error InstructionFailed(uint256 index, string reason)",
        "error Unauthorized()",
        "error OrderNotActive()",
      ]);
      const decoded = iface.parseError(e.data);
      if (decoded) {
        console.log("  Decoded error:", decoded.name, decoded.args);
      }
    } catch {
      // Ignore
    }
    return;
  }

  console.log("\n========================================");
  console.log("   ✅ SIMULATION COMPLETE - Order CAN fill!");
  console.log("========================================");
  console.log("\nIf order still not filling, check solver logs or CoW explorer for errors.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
