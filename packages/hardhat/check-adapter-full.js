const { ethers } = require("hardhat");

async function main() {
  const ADAPTER_ADDRESS = "0x069C09160F11c2F26Faeca3ea91aa5ae639092a5";

  const adapter = await ethers.getContractAt([
    "function orderManager() view returns (address)",
    "function conditionalOrderManager() view returns (address)",
  ], ADAPTER_ADDRESS);

  console.log("=== KapanCowAdapter Config ===");
  console.log("orderManager:", await adapter.orderManager());

  try {
    console.log("conditionalOrderManager:", await adapter.conditionalOrderManager());
  } catch {
    console.log("conditionalOrderManager: NOT FOUND (function doesn't exist)");
  }
}

main().catch(console.error);
