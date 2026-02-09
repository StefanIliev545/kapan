const { ethers } = require("hardhat");

async function main() {
  console.log("=== Simulating Watch-Tower Poll ===\n");

  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const MANAGER_ADDRESS = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const USER_ADDRESS = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const SALT = "0x824e63e433bef7c668a8f4d08f84bd036616dfe31c6fc003222a1f1fab7c5e97";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER_ADDRESS);
  const orderHash = await manager.userSaltToOrderHash(USER_ADDRESS, SALT);
  console.log("Order hash:", orderHash);

  // Get order to build staticInput
  const order = await manager.getOrder(orderHash);
  console.log("Order status:", order.status.toString());

  // Build the ConditionalOrderParams that watch-tower would use
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);

  const cowParams = {
    handler: MANAGER_ADDRESS,
    salt: await manager.orderSalts(orderHash),
    staticInput: staticInput
  };
  console.log("\nCoW params:");
  console.log("  handler:", cowParams.handler);
  console.log("  salt:", cowParams.salt);

  // Compute the CoW order hash (what ComposableCoW uses)
  const composableCow = await ethers.getContractAt([
    "function hash(tuple(address handler, bytes32 salt, bytes staticInput) params) pure returns (bytes32)",
    "function singleOrders(address owner, bytes32 singleOrderHash) view returns (bool)",
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ], COMPOSABLE_COW);

  const cowOrderHash = await composableCow.hash([cowParams.handler, cowParams.salt, cowParams.staticInput]);
  console.log("  cowOrderHash:", cowOrderHash);

  const isAuthed = await composableCow.singleOrders(MANAGER_ADDRESS, cowOrderHash);
  console.log("  isAuthed:", isAuthed);

  // Now try getTradeableOrderWithSignature - this is what watch-tower calls
  console.log("\n=== Calling getTradeableOrderWithSignature ===");
  try {
    const [tradeableOrder, signature] = await composableCow.getTradeableOrderWithSignature(
      MANAGER_ADDRESS, // owner
      [cowParams.handler, cowParams.salt, cowParams.staticInput], // params
      "0x", // offchainInput
      [] // proof (empty for single orders)
    );

    console.log("SUCCESS! Order returned:");
    console.log("  sellToken:", tradeableOrder.sellToken);
    console.log("  buyToken:", tradeableOrder.buyToken);
    console.log("  sellAmount:", ethers.formatUnits(tradeableOrder.sellAmount, 6));
    console.log("  buyAmount:", ethers.formatUnits(tradeableOrder.buyAmount, 6));
    console.log("  validTo:", new Date(Number(tradeableOrder.validTo) * 1000).toISOString());
    console.log("  appData:", tradeableOrder.appData);
    console.log("  signature length:", signature.length);
  } catch (e) {
    console.log("FAILED:", e.message);
    if (e.data) {
      console.log("Revert data:", e.data);
    }
  }
}

main().catch(console.error);
