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

  console.log("=== Order from getTradeableOrderWithSignature ===");
  console.log("sellToken:", gpv2Order.sellToken);
  console.log("buyToken:", gpv2Order.buyToken);
  console.log("receiver:", gpv2Order.receiver);
  console.log("sellAmount:", gpv2Order.sellAmount.toString());
  console.log("buyAmount:", gpv2Order.buyAmount.toString());
  console.log("validTo:", gpv2Order.validTo.toString());
  console.log("appData:", gpv2Order.appData);
  console.log("feeAmount:", gpv2Order.feeAmount.toString());
  console.log("kind:", gpv2Order.kind);
  console.log("partiallyFillable:", gpv2Order.partiallyFillable);
  
  // Get domain separator
  const settlement = await ethers.getContractAt(["function domainSeparator() view returns (bytes32)"], SETTLEMENT);
  const domainSep = await settlement.domainSeparator();
  console.log("\nDomain separator:", domainSep);

  // Compute order hash from returned order
  const orderTypeHash = ethers.keccak256(ethers.toUtf8Bytes(
    "Order(address sellToken,address buyToken,address receiver,uint256 sellAmount,uint256 buyAmount,uint32 validTo,bytes32 appData,uint256 feeAmount,bytes32 kind,bool partiallyFillable,bytes32 sellTokenBalance,bytes32 buyTokenBalance)"
  ));
  console.log("Order type hash:", orderTypeHash);

  const orderStruct = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "address", "uint256", "uint256", "uint32", "bytes32", "uint256", "bytes32", "bool", "bytes32", "bytes32"],
    [
      orderTypeHash,
      gpv2Order.sellToken,
      gpv2Order.buyToken,
      gpv2Order.receiver,
      gpv2Order.sellAmount,
      gpv2Order.buyAmount,
      gpv2Order.validTo,
      gpv2Order.appData,
      gpv2Order.feeAmount,
      gpv2Order.kind,
      gpv2Order.partiallyFillable,
      gpv2Order.sellTokenBalance,
      gpv2Order.buyTokenBalance
    ]
  );
  const orderStructHash = ethers.keccak256(orderStruct);
  console.log("Order struct hash:", orderStructHash);

  // Compute final hash with domain separator (EIP-712)
  const finalHash = ethers.keccak256(ethers.concat([
    "0x1901",
    domainSep,
    orderStructHash
  ]));
  console.log("\nComputed order hash:", finalHash);
  console.log("API computed hash:   0x6e7c38e3326fdf848a15532ad78a4c0308536591faa5cdb364a24ca9b17ef194");

  // Now decode the signature to see embedded order
  console.log("\n=== Decoding signature ===");
  console.log("Signature length:", signature.length);
  
  // ComposableCoW signature format: abi.encode(GPv2Order.Data, PayloadStruct)
  // PayloadStruct: { params: ConditionalOrderParams, offchainInput: bytes, proof: bytes32[] }
}

main().catch(console.error);
