const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

async function main() {
  console.log("=== Debugging isValidSignature ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const settlement = await ethers.getContractAt(["function domainSeparator() view returns (bytes32)"], COW_SETTLEMENT);
  const composableCoW = await ethers.getContractAt([
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance), bytes)"
  ], COMPOSABLE_COW);

  // Get order details
  const salt = await manager.orderSalts(ORDER_HASH);
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);

  console.log("Order Hash:", ORDER_HASH);
  console.log("Salt:", salt);
  console.log("StaticInput:", staticInput);

  // Get tradeable order from manager
  const tradeableOrder = await manager.getTradeableOrder(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroHash,
    staticInput,
    "0x"
  );

  console.log("\nTradeable order from manager:");
  console.log("  sellToken:", tradeableOrder.sellToken);
  console.log("  buyToken:", tradeableOrder.buyToken);
  console.log("  receiver:", tradeableOrder.receiver);
  console.log("  sellAmount:", tradeableOrder.sellAmount.toString());
  console.log("  buyAmount:", tradeableOrder.buyAmount.toString());
  console.log("  validTo:", tradeableOrder.validTo.toString());

  // Build ConditionalOrderParams
  const conditionalOrderParams = {
    handler: CONDITIONAL_ORDER_MANAGER,
    salt: salt,
    staticData: staticInput,
  };

  // Test composableCoW.getTradeableOrderWithSignature
  console.log("\n=== Testing composableCoW.getTradeableOrderWithSignature ===");
  try {
    const [expectedOrder, sig] = await composableCoW.getTradeableOrderWithSignature(
      CONDITIONAL_ORDER_MANAGER,
      conditionalOrderParams,
      "0x",
      []
    );
    console.log("Success! Expected order from ComposableCoW:");
    console.log("  sellToken:", expectedOrder.sellToken);
    console.log("  buyToken:", expectedOrder.buyToken);
    console.log("  receiver:", expectedOrder.receiver);
    console.log("  sellAmount:", expectedOrder.sellAmount.toString());
    console.log("  buyAmount:", expectedOrder.buyAmount.toString());
    console.log("  validTo:", expectedOrder.validTo.toString());
    console.log("  Signature:", sig);

    // Compare orders
    console.log("\n=== Order comparison ===");
    console.log("sellToken match:", expectedOrder.sellToken === tradeableOrder.sellToken);
    console.log("buyToken match:", expectedOrder.buyToken === tradeableOrder.buyToken);
    console.log("receiver match:", expectedOrder.receiver === tradeableOrder.receiver);
    console.log("sellAmount match:", expectedOrder.sellAmount.toString() === tradeableOrder.sellAmount.toString());
    console.log("buyAmount match:", expectedOrder.buyAmount.toString() === tradeableOrder.buyAmount.toString());
    console.log("validTo match:", expectedOrder.validTo.toString() === tradeableOrder.validTo.toString());
    console.log("appData match:", expectedOrder.appData === tradeableOrder.appData);
    console.log("feeAmount match:", expectedOrder.feeAmount.toString() === tradeableOrder.feeAmount.toString());
    console.log("kind match:", expectedOrder.kind === tradeableOrder.kind);
    console.log("partiallyFillable match:", expectedOrder.partiallyFillable === tradeableOrder.partiallyFillable);
    console.log("sellTokenBalance match:", expectedOrder.sellTokenBalance === tradeableOrder.sellTokenBalance);
    console.log("buyTokenBalance match:", expectedOrder.buyTokenBalance === tradeableOrder.buyTokenBalance);
  } catch (e) {
    console.log("Failed:", e.message);
  }

  // Compute order digest using GPv2Order.hash pattern
  const domainSeparator = await settlement.domainSeparator();
  console.log("\nDomain separator:", domainSeparator);

  const ORDER_TYPE_HASH = ethers.keccak256(ethers.toUtf8Bytes(
    "Order(address sellToken,address buyToken,address receiver,uint256 sellAmount,uint256 buyAmount,uint32 validTo,bytes32 appData,uint256 feeAmount,string kind,bool partiallyFillable,string sellTokenBalance,string buyTokenBalance)"
  ));

  const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "address", "uint256", "uint256", "uint32", "bytes32", "uint256", "bytes32", "bool", "bytes32", "bytes32"],
    [
      ORDER_TYPE_HASH,
      tradeableOrder.sellToken,
      tradeableOrder.buyToken,
      tradeableOrder.receiver,
      tradeableOrder.sellAmount,
      tradeableOrder.buyAmount,
      tradeableOrder.validTo,
      tradeableOrder.appData,
      tradeableOrder.feeAmount,
      tradeableOrder.kind,
      tradeableOrder.partiallyFillable,
      tradeableOrder.sellTokenBalance,
      tradeableOrder.buyTokenBalance,
    ]
  ));

  const orderDigest = ethers.keccak256(ethers.concat([
    "0x1901",
    domainSeparator,
    structHash,
  ]));

  console.log("Computed order digest:", orderDigest);

  // Build signature
  const gpv2Order = [
    tradeableOrder.sellToken,
    tradeableOrder.buyToken,
    tradeableOrder.receiver,
    tradeableOrder.sellAmount,
    tradeableOrder.buyAmount,
    tradeableOrder.validTo,
    tradeableOrder.appData,
    tradeableOrder.feeAmount,
    tradeableOrder.kind,
    tradeableOrder.partiallyFillable,
    tradeableOrder.sellTokenBalance,
    tradeableOrder.buyTokenBalance,
  ];

  const payload = [
    [conditionalOrderParams.handler, conditionalOrderParams.salt, conditionalOrderParams.staticData],
    "0x",
    [],
  ];

  const signature = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance)",
      "tuple(tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof)",
    ],
    [gpv2Order, payload]
  );

  // Test isValidSignature
  console.log("\n=== Testing isValidSignature ===");
  console.log("Hash:", orderDigest);
  console.log("Signature length:", signature.length);

  try {
    const result = await manager.isValidSignature(orderDigest, signature);
    console.log("Result:", result);
    if (result === "0x1626ba7e") {
      console.log("SUCCESS! Signature is valid!");
    } else {
      console.log("FAILED! Unexpected return value:", result);
      // Debug values
      if (result === "0xffffff01") console.log("Reason: hash mismatch in contract");
      if (result === "0xffffff02") console.log("Reason: order mismatch");
      if (result === "0xffffff03") console.log("Reason: ComposableCoW call failed");
    }
  } catch (e) {
    console.log("isValidSignature call failed:", e.message);

    // Try to get more details
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }

  // Also test debugOrderMatch
  console.log("\n=== Testing debugOrderMatch ===");
  try {
    const matchResult = await manager.debugOrderMatch(
      gpv2Order,
      [
        tradeableOrder.sellToken,
        tradeableOrder.buyToken,
        tradeableOrder.receiver,
        tradeableOrder.sellAmount,
        tradeableOrder.buyAmount,
        tradeableOrder.validTo,
        tradeableOrder.appData,
        tradeableOrder.feeAmount,
        tradeableOrder.kind,
        tradeableOrder.partiallyFillable,
        tradeableOrder.sellTokenBalance,
        tradeableOrder.buyTokenBalance,
      ]
    );
    console.log("debugOrderMatch result:", matchResult);
  } catch (e) {
    console.log("debugOrderMatch failed:", e.message);
  }
}

main().catch(console.error);
