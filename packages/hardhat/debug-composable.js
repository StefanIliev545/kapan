const { ethers } = require("hardhat");

const TX_HASH = "0x692a8afa2c6e3274b228c3ea426967672226072f4a8eb9c1cd6eab2e100eb4d4";
const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

async function main() {
  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const composableCoW = await ethers.getContractAt([
    "function singleOrders(address owner, bytes32 singleOrderHash) view returns (bool)",
    "function cabinet(address owner, bytes32 ctx) view returns (bytes32)",
  ], COMPOSABLE_COW);

  // Get the order details
  const order = await manager.getOrder(ORDER_HASH);
  const salt = await manager.orderSalts(ORDER_HASH);

  console.log("Order status:", order.status.toString(), "(1=Active)");
  console.log("Salt:", salt);

  // Check if the order is registered as a single order on ComposableCoW
  const params = {
    handler: CONDITIONAL_ORDER_MANAGER,
    salt: salt,
    staticData: ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH])
  };

  const singleOrderHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address handler, bytes32 salt, bytes staticData)"],
      [[params.handler, params.salt, params.staticData]]
    )
  );

  console.log("Computed single order hash:", singleOrderHash);

  // Check if registered
  const isRegistered = await composableCoW.singleOrders(CONDITIONAL_ORDER_MANAGER, singleOrderHash);
  console.log("Registered in ComposableCoW.singleOrders:", isRegistered);

  // Check cabinet
  const cabinetValue = await composableCoW.cabinet(CONDITIONAL_ORDER_MANAGER, singleOrderHash);
  console.log("Cabinet value:", cabinetValue);

  // Check the ComposableCoW event from the transaction
  const receipt = await ethers.provider.getTransactionReceipt(TX_HASH);

  const composableCoWIface = new ethers.Interface([
    "event ConditionalOrderCreated(address indexed owner, tuple(address handler, bytes32 salt, bytes staticData) params)"
  ]);

  console.log("\nLogs from ComposableCoW:");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === COMPOSABLE_COW.toLowerCase()) {
      try {
        const parsed = composableCoWIface.parseLog(log);
        console.log("Event:", parsed.name);
        console.log("  Owner:", parsed.args.owner);
        console.log("  Handler:", parsed.args.params.handler);
        console.log("  Salt:", parsed.args.params.salt);
        console.log("  StaticData:", parsed.args.params.staticData);
      } catch {
        console.log("Unknown event from ComposableCoW:", log.topics[0]);
      }
    }
  }
}

main().catch(console.error);
