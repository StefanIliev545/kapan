import { ethers } from "hardhat";

async function main() {
  // Get the raw trigger data from the order
  const orderManager = await ethers.getContractAt(
    [
      "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      "function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
    ],
    "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a"
  );

  const orderHash = await orderManager.userSaltToOrderHash(
    "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3",
    "0x7183d477391f84bbc45ac6f446ad8f9b045c4c61b63cba4977e08ed2e6bd9f32"
  );

  const order = await orderManager.getOrder(orderHash);
  const triggerStaticData = order.params.triggerStaticData;
  const triggerAddress = order.params.trigger;

  console.log("Order hash:", orderHash);
  console.log("Trigger address:", triggerAddress);
  console.log("TriggerStaticData length:", (triggerStaticData.length - 2) / 2, "bytes");

  // Test on the DEPLOYED trigger using interface
  const deployedTrigger = await ethers.getContractAt(
    [
      "function decodeTriggerParams(bytes calldata staticData) view returns (tuple(bytes4 protocolId, bytes protocolContext, address sellToken, address buyToken, uint8 sellDecimals, uint8 buyDecimals, uint256 limitPrice, bool triggerAbovePrice, uint256 totalSellAmount, uint256 totalBuyAmount, uint8 numChunks, uint256 maxSlippageBps, bool isKindBuy))",
      "function isComplete(bytes calldata staticData, address owner, uint256 iterationCount) pure returns (bool)",
      "function calculateExecution(bytes calldata staticData, address owner, uint256 iterationCount) view returns (uint256 sellAmount, uint256 buyAmount)",
      "function triggerName() view returns (string memory)",
    ],
    triggerAddress
  );

  console.log("\n=== DEPLOYED TRIGGER ===");

  const name = await deployedTrigger.triggerName();
  console.log("Trigger name:", name);

  console.log("\nTrying decodeTriggerParams...");
  try {
    const decoded = await deployedTrigger.decodeTriggerParams(triggerStaticData);
    console.log("✅ Decode succeeded!");
    console.log("  protocolId:", decoded.protocolId);
    console.log("  sellToken:", decoded.sellToken);
    console.log("  buyToken:", decoded.buyToken);
    console.log("  sellDecimals:", decoded.sellDecimals.toString());
    console.log("  buyDecimals:", decoded.buyDecimals.toString());
    console.log("  limitPrice:", decoded.limitPrice.toString());
    console.log("  triggerAbovePrice:", decoded.triggerAbovePrice);
    console.log("  totalSellAmount:", decoded.totalSellAmount.toString());
    console.log("  totalBuyAmount:", decoded.totalBuyAmount.toString());
    console.log("  numChunks:", decoded.numChunks.toString());
    console.log("  maxSlippageBps:", decoded.maxSlippageBps.toString());
    console.log("  isKindBuy:", decoded.isKindBuy);
  } catch (e: any) {
    console.log("❌ Decode failed:", e.message);
    console.log("   Error data:", e.data || e.error?.data || "none");
  }

  console.log("\nTrying isComplete...");
  try {
    const isComplete = await deployedTrigger.isComplete(triggerStaticData, order.params.user, 0);
    console.log("✅ isComplete:", isComplete);
  } catch (e: any) {
    console.log("❌ isComplete failed:", e.message);
  }

  console.log("\nTrying calculateExecution...");
  try {
    const [sellAmount, buyAmount] = await deployedTrigger.calculateExecution(triggerStaticData, order.params.user, 0);
    console.log("✅ calculateExecution succeeded!");
    console.log("  sellAmount:", sellAmount.toString());
    console.log("  buyAmount:", buyAmount.toString());
  } catch (e: any) {
    console.log("❌ calculateExecution failed:", e.message);
  }
}

main().catch(console.error);
