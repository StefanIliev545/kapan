const { ethers } = require("hardhat");
async function main() {
  const adapter = await ethers.getContractAt([
    "function orderManager() view returns (address)"
  ], "0xf397EE44a9c40a2EF77cBbA6B628f86940fb4BeF");
  const orderManager = await adapter.orderManager();
  console.log("KapanCowAdapter.orderManager:", orderManager);
  
  const orderManagerDeployment = require("../deployments/arbitrum/KapanOrderManager.json");
  console.log("KapanOrderManager deployed at:", orderManagerDeployment.address);
  
  const conditionalDeployment = require("../deployments/arbitrum/KapanConditionalOrderManager.json");
  console.log("KapanConditionalOrderManager deployed at:", conditionalDeployment.address);
  
  console.log("");
  if (orderManager.toLowerCase() !== conditionalDeployment.address.toLowerCase()) {
    console.log("⚠️  MISMATCH: adapter.orderManager points to KapanOrderManager, NOT KapanConditionalOrderManager!");
  } else {
    console.log("✓ Configured correctly for KapanConditionalOrderManager");
  }
}
main().catch(e => { console.error(e); process.exit(1); });
