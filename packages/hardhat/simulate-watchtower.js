const { ethers } = require("hardhat");

async function main() {
  console.log("=== Simulating Watch-Tower Poll ===\n");

  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const USER = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const SALT = "0x1fed157977824de26af4780ad52124eaa3788591aaca53bbad80372d1e7a0a25";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER);
  const orderHash = await manager.userSaltToOrderHash(USER, SALT);

  // Build params exactly as watch-tower would
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
  const cowSalt = await manager.orderSalts(orderHash);

  const params = {
    handler: MANAGER,
    salt: cowSalt,
    staticInput: staticInput
  };

  console.log("Params for getTradeableOrderWithSignature:");
  console.log("  owner:", MANAGER);
  console.log("  handler:", params.handler);
  console.log("  salt:", params.salt);
  console.log("  staticInput:", params.staticInput);
  console.log("  offchainInput: 0x");
  console.log("  proof: []");

  const composableCow = await ethers.getContractAt([
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ], COMPOSABLE_COW);

  try {
    const [order, signature] = await composableCow.getTradeableOrderWithSignature(
      MANAGER,
      [params.handler, params.salt, params.staticInput],
      "0x",
      []
    );

    console.log("\n✅ SUCCESS - Order returned:");
    console.log("  sellToken:", order.sellToken);
    console.log("  buyToken:", order.buyToken);
    console.log("  receiver:", order.receiver);
    console.log("  sellAmount:", order.sellAmount.toString());
    console.log("  buyAmount:", order.buyAmount.toString());
    console.log("  validTo:", order.validTo.toString(), "(" + new Date(Number(order.validTo) * 1000).toISOString() + ")");
    console.log("  appData:", order.appData);
    console.log("  feeAmount:", order.feeAmount.toString());
    console.log("  kind:", order.kind);
    console.log("  partiallyFillable:", order.partiallyFillable);
    console.log("  signature length:", signature.length);

    // Check if validTo is in the future
    const now = Math.floor(Date.now() / 1000);
    if (Number(order.validTo) < now) {
      console.log("\n⚠️  WARNING: validTo is in the past! Order has expired.");
    } else {
      console.log("\n✅ Order is still valid for", Number(order.validTo) - now, "seconds");
    }

  } catch (e) {
    console.log("\n❌ FAILED:", e.message);
    if (e.data) {
      console.log("Revert data:", e.data);
      // Try to decode custom error
      try {
        const iface = new ethers.Interface([
          "error OrderNotValid(string)",
          "error PollTryNextBlock(string)",
          "error PollTryAtEpoch(uint256,string)",
          "error PollTryAtBlock(uint256,string)",
          "error SingleOrderNotAuthed()"
        ]);
        const decoded = iface.parseError(e.data);
        console.log("Decoded error:", decoded.name, decoded.args);
      } catch {
        console.log("Could not decode error");
      }
    }
  }
}

main().catch(console.error);
