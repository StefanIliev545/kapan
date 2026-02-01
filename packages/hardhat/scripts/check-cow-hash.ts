import { ethers } from "hardhat";

async function main() {
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const handler = "0xB3FBB014a668B2FD6887F78B3011F18C5bfB7E14";
  const composableCow = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const salt = "0x479f178892c5a46e3ed67778a782f390dfc5abb5c8959574e206f3f5765b8155";

  console.log("=== Checking ComposableCoW Order Hash ===\n");

  // Get order hash from manager
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)"],
    manager
  );
  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  console.log("Kapan orderHash:", orderHash);

  // Get ComposableCoW's hash of our params
  const ComposableCoW = await ethers.getContractAt(
    ["function hash(tuple(address handler, bytes32 salt, bytes staticData) params) view returns (bytes32)",
     "function singleOrders(address owner, bytes32 ctx) view returns (bool)"],
    composableCow
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const staticData = abiCoder.encode(["bytes32"], [orderHash]);

  // This is what Manager passes to composableCoW.create()
  const cowParams = {
    handler: handler,
    salt: salt,
    staticData: staticData
  };

  console.log("\nComposableCoW params:");
  console.log("  handler:", cowParams.handler);
  console.log("  salt:", cowParams.salt);
  console.log("  staticData:", cowParams.staticData);

  // Get the hash that ComposableCoW uses
  const cowHash = await ComposableCoW.hash(cowParams);
  console.log("\nComposableCoW hash (ctx):", cowHash);

  // Check if registered with this hash
  const isRegistered = await ComposableCoW.singleOrders(manager, cowHash);
  console.log("Is registered (singleOrders[manager][cowHash]):", isRegistered);

  // Also check if there's an event we can look at
  console.log("\n--- Checking order creation events ---");

  // Get the Manager contract to check its events
  const managerContract = new ethers.Contract(
    manager,
    ["event ConditionalOrderCreated(bytes32 indexed orderHash, address indexed user, address trigger, address sellToken, address buyToken)"],
    ethers.provider
  );

  // Get recent events
  const filter = managerContract.filters.ConditionalOrderCreated(orderHash);
  const events = await managerContract.queryFilter(filter, -10000); // Last 10k blocks

  if (events.length > 0) {
    console.log("Found", events.length, "creation event(s)");
    for (const e of events) {
      console.log("  Block:", e.blockNumber, "TxHash:", e.transactionHash?.slice(0, 20) + "...");
    }
  } else {
    console.log("No creation events found (might be older than 10k blocks)");
  }
}

main().catch(console.error);
