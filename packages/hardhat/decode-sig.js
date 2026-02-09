const { ethers } = require("hardhat");

async function main() {
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const ORDER_HASH = "0x1ab3c9222b76ecd22e07ae76b4786a5a9826a6200fe96e091447c380b856d867";
  const SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER);
  const cowSalt = await manager.orderSalts(ORDER_HASH);
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);

  const composableCow = await ethers.getContractAt([
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ], COMPOSABLE_COW);

  const [gpv2Order, signature] = await composableCow.getTradeableOrderWithSignature(
    MANAGER,
    [MANAGER, cowSalt, staticInput],
    "0x",
    []
  );

  console.log("Signature hex:", signature);
  console.log("Signature length:", (signature.length - 2) / 2, "bytes\n");

  // Try to decode as (GPv2Order.Data, PayloadStruct)
  // PayloadStruct = { params: { handler, salt, staticInput }, offchainInput, proof }
  const decoder = new ethers.AbiCoder();
  
  try {
    const decoded = decoder.decode(
      [
        "tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance)",
        "tuple(tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof)"
      ],
      signature
    );

    const embeddedOrder = decoded[0];
    const payload = decoded[1];

    console.log("=== Embedded Order in Signature ===");
    console.log("sellToken:", embeddedOrder.sellToken);
    console.log("buyToken:", embeddedOrder.buyToken);
    console.log("receiver:", embeddedOrder.receiver);
    console.log("sellAmount:", embeddedOrder.sellAmount.toString());
    console.log("buyAmount:", embeddedOrder.buyAmount.toString());
    console.log("validTo:", embeddedOrder.validTo.toString());
    console.log("appData:", embeddedOrder.appData);
    console.log("feeAmount:", embeddedOrder.feeAmount.toString());
    console.log("kind:", embeddedOrder.kind);
    console.log("partiallyFillable:", embeddedOrder.partiallyFillable);
    console.log("sellTokenBalance:", embeddedOrder.sellTokenBalance);
    console.log("buyTokenBalance:", embeddedOrder.buyTokenBalance);

    console.log("\n=== Payload ===");
    console.log("handler:", payload.params.handler);
    console.log("salt:", payload.params.salt);
    console.log("staticInput:", payload.params.staticInput);

    // Compare with returned order
    console.log("\n=== Comparison (returned vs embedded) ===");
    console.log("sellAmount: returned=" + gpv2Order.sellAmount.toString() + " embedded=" + embeddedOrder.sellAmount.toString() + " match=" + (gpv2Order.sellAmount.toString() === embeddedOrder.sellAmount.toString()));
    console.log("buyAmount: returned=" + gpv2Order.buyAmount.toString() + " embedded=" + embeddedOrder.buyAmount.toString() + " match=" + (gpv2Order.buyAmount.toString() === embeddedOrder.buyAmount.toString()));
    console.log("validTo: returned=" + gpv2Order.validTo.toString() + " embedded=" + embeddedOrder.validTo.toString() + " match=" + (gpv2Order.validTo.toString() === embeddedOrder.validTo.toString()));

  } catch (e) {
    console.log("Failed to decode as standard format:", e.message);
    
    // Try different formats
    console.log("\nFirst 32 bytes:", signature.slice(0, 66));
    console.log("Next 32 bytes:", "0x" + signature.slice(66, 130));
    console.log("Next 32 bytes:", "0x" + signature.slice(130, 194));
  }
}

main().catch(console.error);
