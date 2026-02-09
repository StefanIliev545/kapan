const { ethers } = require("hardhat");

async function main() {
  console.log("=== Checking AppData for New Order ===\n");

  const MANAGER_ADDRESS = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const USER_ADDRESS = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const SALT = "0x824e63e433bef7c668a8f4d08f84bd036616dfe31c6fc003222a1f1fab7c5e97";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER_ADDRESS);

  // Get order hash
  const orderHash = await manager.userSaltToOrderHash(USER_ADDRESS, SALT);
  console.log("Order hash:", orderHash);

  const order = await manager.getOrder(orderHash);
  console.log("AppData hash:", order.params.appDataHash);

  // Check what the appData should look like
  console.log("\n=== Expected AppData Structure ===");
  console.log("This is what the frontend should have registered:");

  const hooksTrampolineAddress = await manager.hooksTrampoline();
  console.log("HooksTrampoline:", hooksTrampolineAddress);

  // Encode the hook calls
  const iface = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt) external",
    "function executePostHookBySalt(address user, bytes32 salt) external",
  ]);

  const preHookCalldata = iface.encodeFunctionData("executePreHookBySalt", [USER_ADDRESS, SALT]);
  const postHookCalldata = iface.encodeFunctionData("executePostHookBySalt", [USER_ADDRESS, SALT]);

  console.log("\nExpected hooks:");
  console.log("Pre-hook target:", MANAGER_ADDRESS);
  console.log("Pre-hook calldata:", preHookCalldata);
  console.log("Post-hook target:", MANAGER_ADDRESS);
  console.log("Post-hook calldata:", postHookCalldata);

  // Check KapanCowAdapter
  console.log("\n=== Flash Loan Config ===");
  // From the order, sellToken is syrupUSDC
  console.log("Sell token (collateral):", order.params.sellToken);

  // Check if adapter is configured
  try {
    // The adapter should be at a known address - let me check the deployments
    const adapterAddress = "0x069C09160F11c2F26Faeca3ea91aa5ae639092a5"; // From arbitrum deployments
    const adapter = await ethers.getContractAt([
      "function orderManager() view returns (address)",
      "function hooksTrampoline() view returns (address)",
    ], adapterAddress);

    const adapterOrderManager = await adapter.orderManager();
    const adapterHooksTrampoline = await adapter.hooksTrampoline();
    console.log("\nKapanCowAdapter:", adapterAddress);
    console.log("  orderManager:", adapterOrderManager);
    console.log("  hooksTrampoline:", adapterHooksTrampoline);

    // Check if adapter is configured for the new ConditionalOrderManager
    if (adapterOrderManager.toLowerCase() !== MANAGER_ADDRESS.toLowerCase()) {
      console.log("\n⚠️  WARNING: KapanCowAdapter.orderManager != KapanConditionalOrderManager!");
      console.log("   Adapter expects:", adapterOrderManager);
      console.log("   New manager is:", MANAGER_ADDRESS);
      console.log("   This will cause fundOrderBySalt to fail!");
    }
  } catch (e) {
    console.log("Could not check adapter:", e.message);
  }

  // Get the trigger params to understand the full flow
  console.log("\n=== Order Flow Verification ===");
  const trigger = await ethers.getContractAt("LtvTrigger", order.params.trigger);
  const viewRouter = await trigger.viewRouter();
  console.log("LtvTrigger:", order.params.trigger);
  console.log("ViewRouter:", viewRouter);

  // Check if this is the new fixed ViewRouter
  const EXPECTED_NEW_VIEW_ROUTER = "0x161438800232d5DBFF4DA0ea77b151e1498b5f31"; // Old one
  if (viewRouter.toLowerCase() === EXPECTED_NEW_VIEW_ROUTER.toLowerCase()) {
    console.log("⚠️  This trigger uses the OLD ViewRouter with broken Morpho pricing!");
  }
}

main().catch(console.error);
