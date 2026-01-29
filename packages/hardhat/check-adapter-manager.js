const { ethers } = require("hardhat");

async function main() {
  const ADAPTER_ADDRESS = "0x069C09160F11c2F26Faeca3ea91aa5ae639092a5";
  const OLD_ORDER_MANAGER = "0xaB81dA5dCAC286cea219C6874820e75A0801DBe9"; // From deployments
  const NEW_CONDITIONAL_MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";

  const adapter = await ethers.getContractAt([
    "function orderManager() view returns (address)",
  ], ADAPTER_ADDRESS);

  const orderManager = await adapter.orderManager();

  console.log("=== KapanCowAdapter Configuration ===");
  console.log("Adapter:", ADAPTER_ADDRESS);
  console.log("orderManager:", orderManager);

  console.log("\n=== Comparison ===");
  console.log("Old KapanOrderManager:", OLD_ORDER_MANAGER);
  console.log("New KapanConditionalOrderManager:", NEW_CONDITIONAL_MANAGER);

  if (orderManager.toLowerCase() === OLD_ORDER_MANAGER.toLowerCase()) {
    console.log("\n⚠️  PROBLEM: Adapter points to OLD KapanOrderManager!");
    console.log("   fundOrderBySalt() won't find orders on the new manager!");
    console.log("   SOLUTION: Call adapter.setOrderManager(NEW_CONDITIONAL_MANAGER)");
  } else if (orderManager.toLowerCase() === NEW_CONDITIONAL_MANAGER.toLowerCase()) {
    console.log("\n✅ Adapter points to NEW KapanConditionalOrderManager");
  } else {
    console.log("\n⚠️  Adapter points to UNKNOWN manager:", orderManager);
  }
}

main().catch(console.error);
