const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";

async function main() {
  console.log("=== Constructing Proper EIP-1271 Signature ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const settlement = await ethers.getContractAt(["function domainSeparator() view returns (bytes32)"], COW_SETTLEMENT);

  // Get order details
  const order = await manager.getOrder(ORDER_HASH);
  const salt = await manager.orderSalts(ORDER_HASH);

  // Get tradeable order
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);
  const tradeableOrder = await manager.getTradeableOrder(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroHash,
    staticInput,
    "0x"
  );

  console.log("Tradeable Order from contract:");
  console.log("  sellToken:", tradeableOrder.sellToken);
  console.log("  buyToken:", tradeableOrder.buyToken);
  console.log("  receiver:", tradeableOrder.receiver);
  console.log("  sellAmount:", tradeableOrder.sellAmount.toString());
  console.log("  buyAmount:", tradeableOrder.buyAmount.toString());
  console.log("  validTo:", tradeableOrder.validTo.toString());
  console.log("  appData:", tradeableOrder.appData);
  console.log("  feeAmount:", tradeableOrder.feeAmount.toString());
  console.log("  kind:", tradeableOrder.kind);
  console.log("  partiallyFillable:", tradeableOrder.partiallyFillable);

  // Build ConditionalOrderParams (what ComposableCoW uses)
  const conditionalOrderParams = {
    handler: CONDITIONAL_ORDER_MANAGER,
    salt: salt,
    staticData: staticInput,
  };

  // Build PayloadStruct for signature
  // struct PayloadStruct {
  //   ConditionalOrderParams params;
  //   bytes offchainInput;
  //   bytes32[] proof;
  // }
  const payload = {
    params: conditionalOrderParams,
    offchainInput: "0x",
    proof: [],
  };

  // Build GPv2Order.Data struct
  const gpv2Order = {
    sellToken: tradeableOrder.sellToken,
    buyToken: tradeableOrder.buyToken,
    receiver: tradeableOrder.receiver,
    sellAmount: tradeableOrder.sellAmount,
    buyAmount: tradeableOrder.buyAmount,
    validTo: tradeableOrder.validTo,
    appData: tradeableOrder.appData,
    feeAmount: tradeableOrder.feeAmount,
    kind: tradeableOrder.kind,
    partiallyFillable: tradeableOrder.partiallyFillable,
    sellTokenBalance: tradeableOrder.sellTokenBalance,
    buyTokenBalance: tradeableOrder.buyTokenBalance,
  };

  // Encode the signature as (GPv2Order.Data, PayloadStruct)
  const signature = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance)",
      "tuple(tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof)",
    ],
    [
      [
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
        gpv2Order.buyTokenBalance,
      ],
      [
        [payload.params.handler, payload.params.salt, payload.params.staticData],
        payload.offchainInput,
        payload.proof,
      ],
    ]
  );

  console.log("\nConstructed signature length:", signature.length);

  // Compute the order hash locally
  const domainSeparator = await settlement.domainSeparator();
  console.log("Domain separator:", domainSeparator);

  // GPv2Order type hash
  const ORDER_TYPE_HASH = ethers.keccak256(ethers.toUtf8Bytes(
    "Order(address sellToken,address buyToken,address receiver,uint256 sellAmount,uint256 buyAmount,uint32 validTo,bytes32 appData,uint256 feeAmount,bytes32 kind,bool partiallyFillable,bytes32 sellTokenBalance,bytes32 buyTokenBalance)"
  ));

  const structHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "address", "uint256", "uint256", "uint32", "bytes32", "uint256", "bytes32", "bool", "bytes32", "bytes32"],
    [
      ORDER_TYPE_HASH,
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
      gpv2Order.buyTokenBalance,
    ]
  ));

  const orderDigest = ethers.keccak256(ethers.concat([
    "0x1901",
    domainSeparator,
    structHash,
  ]));

  console.log("Locally computed order digest:", orderDigest);

  // Test isValidSignature locally
  console.log("\n=== Testing isValidSignature locally ===");
  try {
    const result = await manager.isValidSignature(orderDigest, signature);
    console.log("isValidSignature result:", result);
    console.log("Expected magic value: 0x1626ba7e");
    if (result === "0x1626ba7e") {
      console.log("✅ Signature is VALID!");
    } else {
      console.log("❌ Signature is INVALID! (returned", result, ")");
    }
  } catch (e) {
    console.log("isValidSignature failed:", e.message);
  }

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

  // Build API order with proper signature
  const apiOrder = {
    sellToken: tradeableOrder.sellToken,
    buyToken: tradeableOrder.buyToken,
    receiver: tradeableOrder.receiver,
    sellAmount: tradeableOrder.sellAmount.toString(),
    buyAmount: tradeableOrder.buyAmount.toString(),
    validTo: Number(tradeableOrder.validTo),
    appData: order.params.appDataHash,
    feeAmount: "0",
    kind: kindStr,
    partiallyFillable: tradeableOrder.partiallyFillable,
    sellTokenBalance: sellTokenBalanceStr,
    buyTokenBalance: buyTokenBalanceStr,
    signingScheme: "eip1271",
    signature: signature,
    from: CONDITIONAL_ORDER_MANAGER,
  };

  console.log("\n=== Submitting to CoW API with proper signature ===");

  try {
    const response = await fetch(`${COW_API}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiOrder),
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status}`);

    try {
      const json = JSON.parse(responseText);
      console.log(`Response: ${JSON.stringify(json, null, 2)}`);
    } catch {
      console.log(`Response: ${responseText}`);
    }

    if (response.ok) {
      console.log("\n✅ Order submitted successfully!");
    } else {
      console.log("\n❌ Order submission failed");
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main().catch(console.error);
