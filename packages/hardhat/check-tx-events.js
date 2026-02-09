const { ethers } = require("hardhat");

async function main() {
  const tx = await ethers.provider.getTransactionReceipt("0x230c48047b79f717009ac09a52dfa84faa55db7d2133bd249e695f7de1dff913");
  console.log("=== Transaction Events ===");
  console.log("Block:", tx.blockNumber);
  console.log("Status:", tx.status === 1 ? "Success" : "Failed");
  console.log("Logs count:", tx.logs.length);

  // ComposableCoW ConditionalOrderCreated event signature
  const CONDITIONAL_ORDER_CREATED = ethers.id("ConditionalOrderCreated(address,(address,bytes32,bytes))");
  console.log("\nLooking for ConditionalOrderCreated event...");
  console.log("Expected topic:", CONDITIONAL_ORDER_CREATED);

  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74".toLowerCase();

  for (const log of tx.logs) {
    console.log("\nLog from:", log.address);
    console.log("  Topic0:", log.topics[0]);
    if (log.address.toLowerCase() === COMPOSABLE_COW) {
      console.log("  ✅ Event from ComposableCoW!");
    }
  }

  // Also decode the events from KapanConditionalOrderManager
  const manager = await ethers.getContractAt("KapanConditionalOrderManager", "0x34cf47E892e8CF68EcAcE7268407952904289B43");
  const iface = manager.interface;

  console.log("\n=== Decoded Manager Events ===");
  for (const log of tx.logs) {
    if (log.address.toLowerCase() === "0x34cf47E892e8CF68EcAcE7268407952904289B43".toLowerCase()) {
      try {
        const decoded = iface.parseLog({ topics: log.topics, data: log.data });
        console.log("\nEvent:", decoded.name);
        console.log("  Args:", decoded.args);
      } catch {
        console.log("\nUnknown event from manager");
      }
    }
  }
}

main().catch(console.error);
