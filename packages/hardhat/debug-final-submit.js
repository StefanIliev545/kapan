const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";
const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";

async function main() {
  console.log("=== Final Order Submission Test ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  // Get order and trigger params
  const order = await manager.getOrder(ORDER_HASH);
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);

  // Get tradeable order
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);
  const tradeableOrder = await manager.getTradeableOrder(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroHash,
    staticInput,
    "0x"
  );

  console.log("Tradeable Order:");
  console.log("  Sell:", ethers.formatUnits(tradeableOrder.sellAmount, triggerParams.collateralDecimals), "steakUSDC");
  console.log("  Buy:", ethers.formatUnits(tradeableOrder.buyAmount, triggerParams.debtDecimals), "USDT");
  console.log("  Receiver:", tradeableOrder.receiver);
  console.log("  AppData:", tradeableOrder.appData);

  // Map enums
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

  // Build API order
  const apiOrder = {
    sellToken: tradeableOrder.sellToken,
    buyToken: tradeableOrder.buyToken,
    receiver: tradeableOrder.receiver,
    sellAmount: tradeableOrder.sellAmount.toString(),
    buyAmount: tradeableOrder.buyAmount.toString(),
    validTo: Number(tradeableOrder.validTo),
    appData: order.params.appDataHash, // Use stored hash
    feeAmount: "0",
    kind: kindStr,
    partiallyFillable: tradeableOrder.partiallyFillable,
    sellTokenBalance: sellTokenBalanceStr,
    buyTokenBalance: buyTokenBalanceStr,
    signingScheme: "eip1271",
    signature: staticInput, // orderHash encoded
    from: CONDITIONAL_ORDER_MANAGER,
  };

  console.log("\nAPI Order:");
  console.log(JSON.stringify(apiOrder, null, 2));

  console.log("\n=== Submitting to CoW API ===");

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

      // If signature error, let's debug further
      if (responseText.includes("InvalidEip1271Signature")) {
        console.log("\n=== Debugging EIP-1271 Signature ===");

        // The API computed this order hash - let's verify locally
        const apiComputedHash = responseText.match(/0x[a-fA-F0-9]{64}/)?.[0];
        if (apiComputedHash) {
          console.log("API computed order hash:", apiComputedHash);

          // Try calling isValidSignature locally
          try {
            const result = await manager.isValidSignature(apiComputedHash, staticInput);
            console.log("isValidSignature result:", result);
          } catch (e) {
            console.log("isValidSignature call failed:", e.message);
          }
        }
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main().catch(console.error);
