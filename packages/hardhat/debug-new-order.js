const { ethers } = require("hardhat");

async function main() {
  console.log("=== Debugging New Conditional Order ===\n");

  // Addresses from the tx
  const MANAGER_ADDRESS = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const TRIGGER_ADDRESS = "0xb266589955722bede6bcca09bd4aa63ba6c8bda2";
  const USER_ADDRESS = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3"; // tx sender
  const SALT = "0x824e63e433bef7c668a8f4d08f84bd036616dfe31c6fc003222a1f1fab7c5e97";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER_ADDRESS);
  const trigger = await ethers.getContractAt("LtvTrigger", TRIGGER_ADDRESS);

  // Get the order hash from the manager using salt lookup
  const orderHash = await manager.userSaltToOrderHash(USER_ADDRESS, SALT);
  console.log("Order hash:", orderHash);

  if (orderHash === ethers.ZeroHash) {
    // Try to find from user orders
    console.log("\nTrying to find order from user orders...");
    const userOrders = await manager.getUserOrders(USER_ADDRESS);
    console.log("User orders:", userOrders);
    if (userOrders.length > 0) {
      const latestOrder = userOrders[userOrders.length - 1];
      console.log("Using latest order:", latestOrder);
      await debugOrder(manager, trigger, latestOrder);
    }
  } else {
    await debugOrder(manager, trigger, orderHash);
  }
}

async function debugOrder(manager, trigger, orderHash) {
  console.log("\n=== Order Details ===");
  const order = await manager.getOrder(orderHash);
  console.log("Status:", order.status.toString(), "(0=None, 1=Active, 2=Completed, 3=Cancelled)");
  console.log("User:", order.params.user);
  console.log("Trigger:", order.params.trigger);
  console.log("Sell token:", order.params.sellToken);
  console.log("Buy token:", order.params.buyToken);
  console.log("AppData hash:", order.params.appDataHash);
  console.log("Iteration count:", order.iterationCount.toString());
  console.log("Created at:", new Date(Number(order.createdAt) * 1000).toISOString());

  // Check trigger
  console.log("\n=== Trigger Check ===");
  const user = order.params.user;

  try {
    const [shouldExec, reason] = await trigger.shouldExecute(order.params.triggerStaticData, user);
    console.log("Should execute:", shouldExec);
    console.log("Reason:", reason);
  } catch (e) {
    console.log("shouldExecute error:", e.message);
  }

  try {
    const [sellAmount, minBuyAmount] = await trigger.calculateExecution(order.params.triggerStaticData, user);
    console.log("Sell amount:", ethers.formatUnits(sellAmount, 6));
    console.log("Min buy amount:", ethers.formatUnits(minBuyAmount, 6));
    console.log("Ratio (minBuy/sell):", (Number(minBuyAmount) / Number(sellAmount)).toFixed(4));

    if (minBuyAmount > sellAmount) {
      console.log("⚠️  WARNING: minBuy > sell - this is impossible to fill!");
    }
  } catch (e) {
    console.log("calculateExecution error:", e.message);
  }

  // Check if trigger says complete
  try {
    const isComplete = await trigger.isComplete(order.params.triggerStaticData, user, order.iterationCount);
    console.log("Is complete:", isComplete);
  } catch (e) {
    console.log("isComplete error:", e.message);
  }

  // Try to get tradeable order
  console.log("\n=== getTradeableOrder Check ===");
  try {
    const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
    const tradeableOrder = await manager.getTradeableOrder(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash,
      staticInput,
      "0x"
    );
    console.log("Tradeable order returned successfully:");
    console.log("  Sell token:", tradeableOrder.sellToken);
    console.log("  Buy token:", tradeableOrder.buyToken);
    console.log("  Sell amount:", ethers.formatUnits(tradeableOrder.sellAmount, 6));
    console.log("  Buy amount:", ethers.formatUnits(tradeableOrder.buyAmount, 6));
    console.log("  Valid to:", new Date(Number(tradeableOrder.validTo) * 1000).toISOString());
    console.log("  Receiver:", tradeableOrder.receiver);
  } catch (e) {
    console.log("getTradeableOrder reverted:", e.message);
    // Try to decode the revert reason
    if (e.data) {
      console.log("Revert data:", e.data);
    }
  }

  // Check ComposableCoW authorization
  console.log("\n=== ComposableCoW Authorization ===");
  const composableCow = await ethers.getContractAt([
    "function singleOrders(address owner, bytes32 singleOrderHash) view returns (bool)",
    "function hash(tuple(address handler, bytes32 salt, bytes staticInput) params) pure returns (bytes32)"
  ], "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74");

  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
  const cowParams = {
    handler: manager.target,
    salt: await manager.orderSalts(orderHash),
    staticInput: staticInput
  };

  const cowOrderHash = await composableCow.hash([cowParams.handler, cowParams.salt, cowParams.staticInput]);
  console.log("ComposableCoW order hash:", cowOrderHash);

  const isAuthed = await composableCow.singleOrders(manager.target, cowOrderHash);
  console.log("Is authorized in ComposableCoW:", isAuthed);
}

main().catch(console.error);
