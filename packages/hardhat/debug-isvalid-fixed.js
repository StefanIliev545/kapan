const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";

async function main() {
  console.log("=== Debugging isValidSignature with CORRECT PayloadStruct order ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const settlement = await ethers.getContractAt(["function domainSeparator() view returns (bytes32)"], COW_SETTLEMENT);

  // Get order details
  const salt = await manager.orderSalts(ORDER_HASH);
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);

  console.log("Order Hash:", ORDER_HASH);
  console.log("Salt:", salt);

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
  console.log("  appData:", tradeableOrder.appData);

  // Build ConditionalOrderParams
  const conditionalOrderParams = {
    handler: CONDITIONAL_ORDER_MANAGER,
    salt: salt,
    staticData: staticInput,
  };

  // Compute order digest
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

  // Build GPv2Order tuple
  const gpv2OrderTuple = [
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

  // CORRECTED: PayloadStruct field order is:
  // 1. bytes32[] proof
  // 2. ConditionalOrderParams params
  // 3. bytes offchainInput
  const payloadTuple = [
    [],  // proof (empty for single orders)
    [conditionalOrderParams.handler, conditionalOrderParams.salt, conditionalOrderParams.staticData],  // params
    "0x",  // offchainInput
  ];

  // Build signature with CORRECT field order
  const signature = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance)",
      "tuple(bytes32[] proof, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput)",
    ],
    [gpv2OrderTuple, payloadTuple]
  );

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
      if (result === "0xffffff01") console.log("Reason: hash mismatch in contract");
      if (result === "0xffffff02") console.log("Reason: order mismatch");
      if (result === "0xffffff03") console.log("Reason: ComposableCoW call failed");
    }
  } catch (e) {
    console.log("isValidSignature call failed:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }

  // If signature verification succeeded, submit to API
  console.log("\n=== Submitting to CoW API ===");

  // Map enums for API
  const kindBuy = ethers.keccak256(ethers.toUtf8Bytes("buy"));
  const kindStr = tradeableOrder.kind === kindBuy ? "buy" : "sell";

  const balanceInternal = ethers.keccak256(ethers.toUtf8Bytes("internal"));
  const balanceExternal = ethers.keccak256(ethers.toUtf8Bytes("external"));

  let sellTokenBalanceStr = "erc20";
  if (tradeableOrder.sellTokenBalance === balanceInternal) sellTokenBalanceStr = "internal";
  else if (tradeableOrder.sellTokenBalance === balanceExternal) sellTokenBalanceStr = "external";

  let buyTokenBalanceStr = "erc20";
  if (tradeableOrder.buyTokenBalance === balanceInternal) buyTokenBalanceStr = "internal";
  else if (tradeableOrder.buyTokenBalance === balanceExternal) buyTokenBalanceStr = "external";

  const apiOrder = {
    sellToken: tradeableOrder.sellToken,
    buyToken: tradeableOrder.buyToken,
    receiver: tradeableOrder.receiver,
    sellAmount: tradeableOrder.sellAmount.toString(),
    buyAmount: tradeableOrder.buyAmount.toString(),
    validTo: Number(tradeableOrder.validTo),
    appData: tradeableOrder.appData,
    feeAmount: "0",
    kind: kindStr,
    partiallyFillable: tradeableOrder.partiallyFillable,
    sellTokenBalance: sellTokenBalanceStr,
    buyTokenBalance: buyTokenBalanceStr,
    signingScheme: "eip1271",
    signature: signature,
    from: CONDITIONAL_ORDER_MANAGER,
  };

  console.log("\nAPI Order:");
  console.log(JSON.stringify(apiOrder, null, 2));

  try {
    const response = await fetch(`${COW_API}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiOrder),
    });

    const responseText = await response.text();
    console.log(`\nStatus: ${response.status}`);

    try {
      const json = JSON.parse(responseText);
      console.log(`Response: ${JSON.stringify(json, null, 2)}`);
    } catch {
      console.log(`Response: ${responseText}`);
    }

    if (response.ok) {
      console.log("\nOrder submitted successfully!");
    } else {
      console.log("\nOrder submission failed");
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main().catch(console.error);
