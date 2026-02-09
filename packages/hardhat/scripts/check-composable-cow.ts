import { ethers } from "hardhat";

async function main() {
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const handler = "0xB3FBB014a668B2FD6887F78B3011F18C5bfB7E14";
  const composableCow = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const salt = "0x479f178892c5a46e3ed67778a782f390dfc5abb5c8959574e206f3f5765b8155";

  console.log("=== Checking ComposableCoW Registration ===\n");

  // Get order hash
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function orderSalts(bytes32 orderHash) view returns (bytes32)"],
    manager
  );
  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  console.log("Order hash:", orderHash);

  // Get the salt stored for this order
  const storedSalt = await Manager.orderSalts(orderHash);
  console.log("Stored salt:", storedSalt);

  // Check ComposableCoW
  const ComposableCoW = await ethers.getContractAt(
    ["function singleOrders(address owner, bytes32 ctx) view returns (bool)",
     "function cabinet(address owner, bytes32 ctx) view returns (bytes32)",
     "function domainSeparator() view returns (bytes32)"],
    composableCow
  );

  // The ctx for single orders is H(handler || salt || staticInput)
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const staticInput = abiCoder.encode(["bytes32"], [orderHash]);

  // Calculate ctx = keccak256(abi.encode(handler, salt, staticInput))
  const encoded = abiCoder.encode(
    ["address", "bytes32", "bytes"],
    [handler, storedSalt, staticInput]
  );
  const ctx = ethers.keccak256(encoded);
  console.log("\nCalculated ctx:", ctx);

  // Check if order is registered
  const isRegistered = await ComposableCoW.singleOrders(manager, ctx);
  console.log("Is registered in singleOrders:", isRegistered);

  // Also try the simple approach - check cabinet
  const cabinetValue = await ComposableCoW.cabinet(manager, ctx);
  console.log("Cabinet value:", cabinetValue);

  // Get domain separator for reference
  const domainSep = await ComposableCoW.domainSeparator();
  console.log("Domain separator:", domainSep);

  // Try a few ctx variations
  console.log("\n--- Trying ctx variations ---");

  // Maybe ctx is just the orderHash?
  const isRegOrderHash = await ComposableCoW.singleOrders(manager, orderHash);
  console.log("singleOrders(manager, orderHash):", isRegOrderHash);

  // Maybe ctx is the salt?
  const isRegSalt = await ComposableCoW.singleOrders(manager, storedSalt);
  console.log("singleOrders(manager, storedSalt):", isRegSalt);
}

main().catch(console.error);
