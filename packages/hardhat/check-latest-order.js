const { ethers } = require("hardhat");

async function main() {
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const USER = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  // New salt from logs
  const SALT = "0x1fed157977824de26af4780ad52124eaa3788591aaca53bbad80372d1e7a0a25";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER);

  const orderHash = await manager.userSaltToOrderHash(USER, SALT);
  console.log("Order hash:", orderHash);

  const order = await manager.getOrder(orderHash);
  console.log("Status:", order.status.toString(), "(1=Active)");
  console.log("AppData hash:", order.params.appDataHash);

  // Verify appData hash matches what was registered
  const expectedHash = "0xd1c98f5e221a30bcd638a9f8d4442bb99fe079d59568bdb901c01bcf5ff9bf0e";
  console.log("Expected hash:", expectedHash);
  console.log("Match:", order.params.appDataHash.toLowerCase() === expectedHash.toLowerCase() ? "✅" : "❌");

  // Check trigger
  const trigger = await ethers.getContractAt("LtvTrigger", order.params.trigger);
  const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, USER);
  console.log("\nTrigger check:");
  console.log("  Should execute:", shouldExec);
  console.log("  Reason:", reason);

  // Check ComposableCoW authorization
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const composableCow = await ethers.getContractAt([
    "function singleOrders(address owner, bytes32 singleOrderHash) view returns (bool)",
    "function hash(tuple(address handler, bytes32 salt, bytes staticInput) params) pure returns (bytes32)"
  ], COMPOSABLE_COW);

  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
  const cowSalt = await manager.orderSalts(orderHash);
  const cowHash = await composableCow.hash([MANAGER, cowSalt, staticInput]);
  const isAuthed = await composableCow.singleOrders(MANAGER, cowHash);

  console.log("\nComposableCoW:");
  console.log("  Order hash:", cowHash);
  console.log("  Authorized:", isAuthed ? "✅" : "❌");

  console.log("\n=== Order should be picked up by watch-tower now ===");
}

main().catch(console.error);
