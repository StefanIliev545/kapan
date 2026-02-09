/**
 * Check order state on Arbitrum mainnet (no fork required)
 *
 * Usage:
 *   npx hardhat run scripts/check-order.ts --network arbitrum
 */
import { ethers } from "hardhat";
import { formatUnits } from "ethers";

// ============ ORDER CONFIG ============
const ORDER_CONFIG = {
  user: process.env.ORDER_USER || "0xdedb4d230d8b1e9268fd46779a8028d5daaa8fa3",
  salt: process.env.SALT || "0x31abf2ca4c4c142ea4d2c3b6b55fc35dec6b895387cb20ad2de604438375b68d",
  sellDecimals: 6,
  buyDecimals: 6,
  orderManager: "0xEBe83a05f3622CE2B8933dAee4C81Db8a726ddab",
};

async function main() {
  console.log("\n========================================");
  console.log("   Order State Check");
  console.log("========================================\n");

  const config = ORDER_CONFIG;
  console.log("Config:");
  console.log("  User:", config.user);
  console.log("  Salt:", config.salt);

  // Get contracts
  const orderManager = await ethers.getContractAt(
    [
      "function orders(bytes32) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      "function ordersBySalt(address user, bytes32 salt) view returns (bytes32)",
    ],
    config.orderManager
  );

  // Check order exists
  console.log("\nStep 1: Checking order state...");
  const orderHash = await orderManager.ordersBySalt(config.user, config.salt);
  console.log("  Order hash:", orderHash);

  if (orderHash === ethers.ZeroHash) {
    console.log("  ⚠️ Order not found (may have already filled or never created)");
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
  console.log("  MaxIterations:", order.params.maxIterations.toString());

  // Check trigger
  console.log("\nStep 2: Checking trigger...");
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

  const [calcSellAmount, calcMinBuyAmount] = await trigger.calculateExecution(order.params.triggerStaticData, order.params.user);
  console.log("  Calculated sell:", formatUnits(calcSellAmount, config.sellDecimals));
  console.log("  Calculated minBuy:", formatUnits(calcMinBuyAmount, config.buyDecimals));

  console.log("\n========================================");
  console.log("   Check Complete");
  console.log("========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
