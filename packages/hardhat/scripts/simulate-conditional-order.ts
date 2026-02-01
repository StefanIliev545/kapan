/**
 * Simulate a CoW Conditional Order to verify it won't revert
 *
 * Usage:
 *   ORDER_HASH=0x... npx hardhat run scripts/simulate-conditional-order.ts --network localhost
 *
 * Or specify user+salt:
 *   USER=0x... SALT=0x... npx hardhat run scripts/simulate-conditional-order.ts --network localhost
 *
 * Prerequisites:
 *   - Start a fork: FORK_CHAIN=arbitrum yarn fork
 */
import { ethers } from "hardhat";
import { formatUnits } from "ethers";

// ============ CONFIG ============
const CONFIG = {
  // Order identification (use ORDER_HASH or ORDER_USER+SALT)
  orderHash: process.env.ORDER_HASH || "",
  user: process.env.ORDER_USER || "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3",
  salt: process.env.SALT || "0x8381e35e639f9bc218835171ee7313dc3bededeb4e5ec872bb4950927b7af94f",

  // Contract addresses (Arbitrum)
  conditionalOrderManager: "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a",
  cowAdapter: "0x86a79fe057FfF0f288aDbfDcc607243fa210bCA9",
  hooksTrampoline: "0x01DcB88678aedD0C4cC9552B20F4718550250574",
};

// Whale addresses for various tokens (Arbitrum)
const WHALES: Record<string, string[]> = {
  // WETH
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": [
    "0x489ee077994B6658eAfA855C308275EAd8097C4A", // Aave
    "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336", // GMX
  ],
  // WBTC
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": [
    "0x489ee077994B6658eAfA855C308275EAd8097C4A", // Aave
    "0x0dF5dfd95966753f01cb80E76dc20EA958238C46",
  ],
  // USDT
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": [
    "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
    "0x489ee077994B6658eAfA855C308275EAd8097C4A",
  ],
  // USDC
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": [
    "0x489ee077994B6658eAfA855C308275EAd8097C4A",
    "0x47c031236e19d024b42f8AE6780E44A573170703",
  ],
  // wstETH
  "0x5979d7b546e38e414f7e9822514be443a4800529": [
    "0x513c7e3a9c69ca3e22550ef58ac1c0088e918fff",
    "0x489ee077994B6658eAfA855C308275EAd8097C4A",
  ],
};

async function findWhaleWithBalance(tokenAddress: string, minBalance: bigint): Promise<string | null> {
  const token = await ethers.getContractAt("IERC20", tokenAddress);
  const whales = WHALES[tokenAddress.toLowerCase()] || [];

  for (const whale of whales) {
    try {
      const balance = await token.balanceOf(whale);
      if (balance >= minBalance) {
        console.log(`  Found whale ${whale} with ${formatUnits(balance, 18)} tokens`);
        return whale;
      }
    } catch {
      continue;
    }
  }

  // Try Aave as fallback for any token
  const aaveWhale = "0x489ee077994B6658eAfA855C308275EAd8097C4A";
  try {
    const balance = await token.balanceOf(aaveWhale);
    if (balance >= minBalance) {
      console.log(`  Found Aave whale with ${formatUnits(balance, 18)} tokens`);
      return aaveWhale;
    }
  } catch {
    // ignore
  }

  return null;
}

async function main() {
  console.log("\n========================================");
  console.log("   Conditional Order Simulation");
  console.log("========================================\n");

  // Get manager contract
  const manager = await ethers.getContractAt(
    [
      "function getOrder(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      "function userSaltToOrderHash(address,bytes32) view returns (bytes32)",
      "function hooksTrampoline() view returns (address)",
      "function router() view returns (address)",
      "function executePreHookBySalt(address,bytes32)",
      "function executePostHookBySalt(address,bytes32)",
      "function cachedSellAmount(bytes32) view returns (uint256)",
      "function cachedBuyAmount(bytes32) view returns (uint256)",
      "function preHookExecutedForIteration(bytes32) view returns (uint256)",
    ],
    CONFIG.conditionalOrderManager
  );

  // Step 1: Find order
  console.log("Step 1: Finding order...");
  let orderHash = CONFIG.orderHash;

  if (!orderHash) {
    // Look up by user + salt - use getAddress to ensure checksum
    const userAddr = ethers.getAddress(CONFIG.user);
    orderHash = await manager.userSaltToOrderHash(userAddr, CONFIG.salt);
    console.log(`  Looking up order for user=${userAddr}, salt=${CONFIG.salt}`);
  }

  console.log(`  Order hash: ${orderHash}`);

  if (orderHash === ethers.ZeroHash) {
    console.log("  ❌ Order not found!");
    return;
  }

  const order = await manager.getOrder(orderHash);
  const statusMap: Record<number, string> = { 0: "None", 1: "Active", 2: "Completed", 3: "Cancelled" };
  console.log(`  Status: ${order.status} (${statusMap[Number(order.status)] || "Unknown"})`);
  console.log(`  User: ${order.params.user}`);
  console.log(`  Trigger: ${order.params.trigger}`);
  console.log(`  SellToken: ${order.params.sellToken}`);
  console.log(`  BuyToken: ${order.params.buyToken}`);
  console.log(`  IterationCount: ${order.iterationCount}`);
  console.log(`  MaxIterations: ${order.params.maxIterations}`);
  console.log(`  SellTokenRefundAddress: ${order.params.sellTokenRefundAddress}`);

  if (order.status !== 1n) {
    console.log("  ❌ Order is not Active!");
    return;
  }
  console.log("  ✅ Order found and active\n");

  // Step 2: Check trigger
  console.log("Step 2: Checking trigger...");
  const trigger = await ethers.getContractAt(
    [
      "function shouldExecute(bytes,address) view returns (bool,string)",
      "function calculateExecution(bytes,address,uint256) view returns (uint256,uint256)",
      "function isComplete(bytes,address,uint256) view returns (bool)",
    ],
    order.params.trigger
  );

  const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, order.params.user);
  console.log(`  shouldExecute: ${shouldExec}`);
  console.log(`  Reason: ${reason}`);

  const [sellAmount, minBuyAmount] = await trigger.calculateExecution(
    order.params.triggerStaticData,
    order.params.user,
    order.iterationCount
  );

  // Detect token decimals
  const sellToken = await ethers.getContractAt("IERC20Metadata", order.params.sellToken);
  const buyToken = await ethers.getContractAt("IERC20Metadata", order.params.buyToken);
  const sellDecimals = await sellToken.decimals();
  const buyDecimals = await buyToken.decimals();
  const sellSymbol = await sellToken.symbol();
  const buySymbol = await buyToken.symbol();

  console.log(`  Sell amount: ${formatUnits(sellAmount, sellDecimals)} ${sellSymbol}`);
  console.log(`  Min buy amount: ${formatUnits(minBuyAmount, buyDecimals)} ${buySymbol}`);

  if (!shouldExec) {
    console.log("  ⚠️ Trigger says should NOT execute. Continuing anyway for testing...\n");
  } else {
    console.log("  ✅ Trigger condition met\n");
  }

  // Step 3: Setup impersonation
  console.log("Step 3: Setting up simulation...");
  const hooksTrampoline = await manager.hooksTrampoline();
  console.log(`  HooksTrampoline: ${hooksTrampoline}`);

  await ethers.provider.send("hardhat_impersonateAccount", [hooksTrampoline]);
  await ethers.provider.send("hardhat_setBalance", [hooksTrampoline, "0x56BC75E2D63100000"]);
  const trampolineSigner = await ethers.getSigner(hooksTrampoline);
  console.log("  ✅ Impersonated hooksTrampoline\n");

  // Step 4: Check pre-state
  console.log("Step 4: Checking pre-state...");
  const managerSellBefore = await sellToken.balanceOf(CONFIG.conditionalOrderManager);
  const managerBuyBefore = await buyToken.balanceOf(CONFIG.conditionalOrderManager);
  const adapterSellBefore = await sellToken.balanceOf(CONFIG.cowAdapter);
  console.log(`  Manager ${sellSymbol} balance: ${formatUnits(managerSellBefore, sellDecimals)}`);
  console.log(`  Manager ${buySymbol} balance: ${formatUnits(managerBuyBefore, buyDecimals)}`);
  console.log(`  Adapter ${sellSymbol} balance: ${formatUnits(adapterSellBefore, sellDecimals)}`);
  console.log("");

  // Step 4.5: Decode instructions to understand what they do
  console.log("\nStep 4.5: Decoding instructions...");

  console.log("  Pre-instructions:");
  if (order.params.preInstructions.length > 2) {
    try {
      const preInstructions = ethers.AbiCoder.defaultAbiCoder().decode(
        ["tuple(string protocolName, bytes data)[]"],
        order.params.preInstructions
      )[0];
      console.log(`    Count: ${preInstructions.length}`);
      for (let i = 0; i < preInstructions.length; i++) {
        console.log(`    [${i}] Protocol: ${preInstructions[i].protocolName}`);
      }
    } catch (e: any) {
      console.log(`    Could not decode: ${e.message}`);
    }
  } else {
    console.log("    Empty (length=" + order.params.preInstructions.length + ")");
  }

  console.log("  Post-instructions:");
  if (order.params.postInstructions.length > 2) {
    try {
      const postInstructions = ethers.AbiCoder.defaultAbiCoder().decode(
        ["tuple(string protocolName, bytes data)[]"],
        order.params.postInstructions
      )[0];
      console.log(`    Count: ${postInstructions.length}`);
      for (let i = 0; i < postInstructions.length; i++) {
        console.log(`    [${i}] Protocol: ${postInstructions[i].protocolName}`);
      }
    } catch (e: any) {
      console.log(`    Could not decode: ${e.message}`);
    }
  } else {
    console.log("    Empty (length=" + order.params.postInstructions.length + ")");
  }
  console.log("");

  // Step 5: Execute pre-hook
  console.log("Step 5: Executing pre-hook (executePreHookBySalt)...");
  const userAddr = ethers.getAddress(order.params.user);
  const saltBytes32 = CONFIG.salt;

  // First check if router is authorized for user
  const routerAddress = await manager.router();
  console.log(`  Router: ${routerAddress}`);

  // Morpho Blue on Arbitrum
  const morphoBlueAddress = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
  const morphoBlue = await ethers.getContractAt(
    ["function isAuthorized(address authorizer, address authorized) view returns (bool)"],
    morphoBlueAddress
  );
  const isRouterAuthorized = await morphoBlue.isAuthorized(order.params.user, routerAddress);
  console.log(`  Router authorized on Morpho Blue for user: ${isRouterAuthorized}`);

  if (!isRouterAuthorized) {
    console.log("  ⚠️ Router not authorized - will fail. Simulating authorization...");
    // Impersonate user and authorize
    await ethers.provider.send("hardhat_impersonateAccount", [order.params.user]);
    await ethers.provider.send("hardhat_setBalance", [order.params.user, "0x56BC75E2D63100000"]);
    const userSigner = await ethers.getSigner(order.params.user);
    const morphoBlueWithUser = await ethers.getContractAt(
      ["function setAuthorization(address authorized, bool newIsAuthorized)"],
      morphoBlueAddress,
      userSigner
    );
    await morphoBlueWithUser.setAuthorization(routerAddress, true);
    console.log("  ✅ Simulated router authorization");
  }

  // Try static call first to get better error message
  try {
    await manager.connect(trampolineSigner).executePreHookBySalt.staticCall(
      userAddr,
      saltBytes32,
      { gasLimit: 2000000 }
    );
    console.log("  Static call passed, executing transaction...");
  } catch (staticErr: any) {
    console.log("  ⚠️ Static call failed:", staticErr.message?.slice(0, 300));
    if (staticErr.data && typeof staticErr.data === 'string') {
      console.log(`  Revert data: ${staticErr.data.slice(0, 200)}`);
      // Try to decode common errors
      const iface = new ethers.Interface([
        "error Unauthorized()",
        "error NotAuthorizedOnProtocol(string protocol)",
        "error InsufficientBalance(address token, uint256 required, uint256 available)",
      ]);
      try {
        const decoded = iface.parseError(staticErr.data);
        if (decoded) {
          console.log(`  Decoded error: ${decoded.name} ${JSON.stringify(decoded.args)}`);
        }
      } catch {
        // ignore decode error
      }
    }
    // Continue to try the actual transaction to get more info
  }

  try {
    const tx = await manager.connect(trampolineSigner).executePreHookBySalt(
      userAddr,
      saltBytes32,
      { gasLimit: 2000000 }
    );
    const receipt = await tx.wait();
    console.log(`  ✅ Pre-hook succeeded! Gas used: ${receipt?.gasUsed}`);

    const cachedSell = await manager.cachedSellAmount(orderHash);
    const cachedBuy = await manager.cachedBuyAmount(orderHash);
    console.log(`  Cached sell: ${formatUnits(cachedSell, sellDecimals)} ${sellSymbol}`);
    console.log(`  Cached buy: ${formatUnits(cachedBuy, buyDecimals)} ${buySymbol}`);

    // Check balances after pre-hook
    const managerSellAfterPre = await sellToken.balanceOf(CONFIG.conditionalOrderManager);
    console.log(`  Manager ${sellSymbol} after pre-hook: ${formatUnits(managerSellAfterPre, sellDecimals)}`);
  } catch (e: any) {
    console.log("  ❌ Pre-hook FAILED!");
    console.log(`  Error: ${e.message?.slice(0, 500)}`);
    if (e.data && typeof e.data === 'string') {
      console.log(`  Revert data: ${e.data.slice(0, 200)}`);
    }
    // Try to get more error info
    if (e.error?.data) {
      console.log(`  Inner error data: ${e.error.data}`);
    }
    return;
  }
  console.log("");

  // Step 6: Simulate the swap (fund manager with buyToken)
  console.log("Step 6: Simulating swap (transferring buyToken to manager)...");

  // Find a whale with enough buyToken
  const whale = await findWhaleWithBalance(order.params.buyToken, minBuyAmount);
  if (!whale) {
    console.log(`  ❌ Could not find whale with enough ${buySymbol}`);
    console.log(`  Need: ${formatUnits(minBuyAmount, buyDecimals)} ${buySymbol}`);
    return;
  }

  await ethers.provider.send("hardhat_impersonateAccount", [whale]);
  await ethers.provider.send("hardhat_setBalance", [whale, "0x56BC75E2D63100000"]);
  const whaleSigner = await ethers.getSigner(whale);

  // Transfer buyToken to manager (simulating swap result)
  await buyToken.connect(whaleSigner).transfer(CONFIG.conditionalOrderManager, minBuyAmount);
  console.log(`  ✅ Transferred ${formatUnits(minBuyAmount, buyDecimals)} ${buySymbol} to manager`);

  // Also need to simulate that sellToken was taken (reduce manager balance)
  // The settlement would have pulled sellToken from manager
  const managerSellCurrent = await sellToken.balanceOf(CONFIG.conditionalOrderManager);
  console.log(`  Manager ${sellSymbol} balance (will be consumed by swap): ${formatUnits(managerSellCurrent, sellDecimals)}`);
  console.log("");

  // Step 7: Execute post-hook
  console.log("Step 7: Executing post-hook (executePostHookBySalt)...");
  try {
    const tx = await manager.connect(trampolineSigner).executePostHookBySalt(
      userAddr,
      saltBytes32,
      { gasLimit: 3000000 }
    );
    const receipt = await tx.wait();
    console.log(`  ✅ Post-hook succeeded! Gas used: ${receipt?.gasUsed}`);

    // Parse events
    for (const log of receipt?.logs || []) {
      if (log.address.toLowerCase() === CONFIG.conditionalOrderManager.toLowerCase()) {
        try {
          const iface = new ethers.Interface([
            "event TriggerExecuted(bytes32 indexed orderHash, uint256 iteration, uint256 sellAmount, uint256 buyAmount)",
            "event PostHookExecuted(bytes32 indexed orderHash, uint256 iteration, uint256 receivedAmount)",
            "event ConditionalOrderCompleted(bytes32 indexed orderHash, address indexed user, uint256 iterations)",
          ]);
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed) {
            console.log(`  Event: ${parsed.name}`);
            if (parsed.name === "TriggerExecuted") {
              console.log(`    Iteration: ${parsed.args.iteration}`);
              console.log(`    Sell: ${formatUnits(parsed.args.sellAmount, sellDecimals)} ${sellSymbol}`);
              console.log(`    Buy: ${formatUnits(parsed.args.buyAmount, buyDecimals)} ${buySymbol}`);
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (e: any) {
    console.log("  ❌ Post-hook FAILED!");
    console.log(`  Error: ${e.message?.slice(0, 500)}`);
    if (e.data) {
      console.log(`  Revert data: ${e.data.slice(0, 200)}`);
      // Try to decode common errors
      try {
        const iface = new ethers.Interface([
          "error NoTokensReceived()",
          "error PreHookNotExecuted()",
          "error InvalidOrderState()",
        ]);
        const decoded = iface.parseError(e.data);
        if (decoded) {
          console.log(`  Decoded error: ${decoded.name}`);
        }
      } catch {
        // ignore
      }
    }
    return;
  }
  console.log("");

  // Step 8: Check final state
  console.log("Step 8: Checking final state...");
  const orderAfter = await manager.getOrder(orderHash);
  console.log(`  Order status: ${orderAfter.status} (${statusMap[Number(orderAfter.status)] || "Unknown"})`);
  console.log(`  Iteration count: ${orderAfter.iterationCount}`);

  const managerSellAfter = await sellToken.balanceOf(CONFIG.conditionalOrderManager);
  const managerBuyAfter = await buyToken.balanceOf(CONFIG.conditionalOrderManager);
  const adapterSellAfter = await sellToken.balanceOf(CONFIG.cowAdapter);

  console.log(`  Manager ${sellSymbol} balance: ${formatUnits(managerSellAfter, sellDecimals)}`);
  console.log(`  Manager ${buySymbol} balance: ${formatUnits(managerBuyAfter, buyDecimals)}`);
  console.log(`  Adapter ${sellSymbol} balance: ${formatUnits(adapterSellAfter, sellDecimals)}`);

  console.log("\n========================================");
  console.log("   ✅ SIMULATION COMPLETE - Order CAN execute!");
  console.log("========================================");
  console.log("\nIf order still not filling, the issue is with:");
  console.log("  - Solver competition/liquidity");
  console.log("  - Price slippage (minBuyAmount too high)");
  console.log("  - Watchtower propagation delay");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
