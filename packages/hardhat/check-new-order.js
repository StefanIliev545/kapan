const { ethers } = require("hardhat");

async function main() {
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const ORDER_HASH = "0x1ab3c9222b76ecd22e07ae76b4786a5a9826a6200fe96e091447c380b856d867";
  const USER = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER);
  
  // Get order details
  const order = await manager.getOrder(ORDER_HASH);
  console.log("Order Status:", order.status.toString(), "(1=Active)");
  console.log("AppData Hash:", order.params.appDataHash);
  
  // Check trigger
  const trigger = await ethers.getContractAt("LtvTrigger", order.params.trigger);
  const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, USER);
  console.log("\nTrigger:", shouldExec ? "✅ Should execute" : "❌ Not triggered");
  console.log("Reason:", reason);
  
  // Check ComposableCoW
  const cowSalt = await manager.orderSalts(ORDER_HASH);
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);
  
  const composableCow = await ethers.getContractAt([
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ], COMPOSABLE_COW);

  try {
    const [gpv2Order, signature] = await composableCow.getTradeableOrderWithSignature(
      MANAGER,
      [MANAGER, cowSalt, staticInput],
      "0x",
      []
    );
    console.log("\n✅ Watch-tower simulation SUCCESS:");
    console.log("  sellToken:", gpv2Order.sellToken);
    console.log("  buyToken:", gpv2Order.buyToken);
    console.log("  sellAmount:", gpv2Order.sellAmount.toString());
    console.log("  buyAmount:", gpv2Order.buyAmount.toString());
    console.log("  validTo:", gpv2Order.validTo.toString(), "(" + new Date(Number(gpv2Order.validTo) * 1000).toISOString() + ")");
    console.log("  appData:", gpv2Order.appData);
    
    const now = Math.floor(Date.now() / 1000);
    console.log("\n  Time remaining:", Number(gpv2Order.validTo) - now, "seconds");
  } catch (e) {
    console.log("\n❌ Watch-tower simulation FAILED:", e.message);
  }
}

main().catch(console.error);
