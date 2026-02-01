import { ethers } from "hardhat";

async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const salt = "0x479f178892c5a46e3ed67778a782f390dfc5abb5c8959574e206f3f5765b8155";

  // Check if order exists
  const Manager = await ethers.getContractAt(
    ["function orderSalts(address user, uint256 index) view returns (bytes32)",
     "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
     "function getUserOrders(address user) view returns (bytes32[])",
     "function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function orderHandler() view returns (address)"],
    manager
  );

  console.log("Checking order for user:", user);
  console.log("Manager address:", manager);

  try {
    const handler = await Manager.orderHandler();
    console.log("Handler address:", handler);
  } catch (e) {
    console.log("Could not get handler:", (e as Error).message);
  }

  const orderHashes = await Manager.getUserOrders(user);
  console.log("User's order count:", orderHashes.length);

  if (orderHashes.length > 0) {
    console.log("User's order hashes:");
    for (const h of orderHashes) {
      console.log("  -", h);
    }
  }

  // Check all orders to find active ones
  console.log("\nChecking each order:");
  for (const h of orderHashes) {
    try {
      const [params, status] = await Manager.getOrder(h);
      const statusStr = Number(status) === 1 ? "Active" : Number(status) === 2 ? "Completed" : Number(status) === 3 ? "Cancelled" : `Unknown(${status})`;

      if (Number(status) === 1) {
        console.log(`\n[ACTIVE] Order ${h.slice(0, 10)}...`);
        console.log("  sellToken:", params.sellToken);
        console.log("  buyToken:", params.buyToken);
        console.log("  trigger:", params.trigger);
        console.log("  isKindBuy:", params.isKindBuy);
        console.log("  maxIterations:", params.maxIterations.toString());
      } else {
        console.log(`  ${h.slice(0, 10)}... - ${statusStr}`);
      }
    } catch (e) {
      console.log(`  ${h.slice(0, 10)}... - Error: ${(e as Error).message?.slice(0, 50)}`);
    }
  }

  // Look up order by (user, salt) using the contract's mapping
  console.log("\n--- Looking up order by (user, salt) ---");
  console.log("Salt:", salt);

  try {
    const orderHash = await Manager.userSaltToOrderHash(user, salt);
    console.log("Order hash from userSaltToOrderHash:", orderHash);

    if (orderHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      const orderContext = await Manager.getOrder(orderHash);
      console.log("\nOrder found!");
      console.log("  Status:", orderContext.status, Number(orderContext.status) === 1 ? "(Active)" : Number(orderContext.status) === 2 ? "(Completed)" : Number(orderContext.status) === 3 ? "(Cancelled)" : "(None)");
      console.log("  user:", orderContext.params.user);
      console.log("  sellToken:", orderContext.params.sellToken);
      console.log("  buyToken:", orderContext.params.buyToken);
      console.log("  trigger:", orderContext.params.trigger);
      console.log("  isKindBuy:", orderContext.params.isKindBuy);
      console.log("  maxIterations:", orderContext.params.maxIterations.toString());
      console.log("  iterationCount:", orderContext.iterationCount.toString());
    } else {
      console.log("No order found for this salt");
    }
  } catch (e) {
    console.log("Error looking up order:", (e as Error).message?.slice(0, 200));
  }
}

main().catch(console.error);
