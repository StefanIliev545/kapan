const { ethers } = require("hardhat");

async function main() {
  const MANAGER = "0x11Dd4DFeeC160B40e22c311D895A41474F8Bba74";
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const ORDER_HASH = "0xb4c046c040e21f377dd89eb550f7c247d32eb2445653bd1575db00c807b3b2af";

  console.log("Manager:", MANAGER);
  console.log("OrderHash:", ORDER_HASH);

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER);
  const cowSalt = await manager.orderSalts(ORDER_HASH);
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);

  console.log("\nCoW params:");
  console.log("  cowSalt:", cowSalt);

  // Try getTradeableOrderWithSignature
  const composableCow = await ethers.getContractAt([
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ], COMPOSABLE_COW);

  try {
    const [gpv2Order, signature] = await composableCow.getTradeableOrderWithSignature(
      MANAGER,
      [MANAGER, cowSalt, staticInput],
      "0x",
      []
    );

    console.log("\n✅ getTradeableOrderWithSignature SUCCESS:");
    console.log("  sellAmount:", gpv2Order.sellAmount.toString());
    console.log("  buyAmount:", gpv2Order.buyAmount.toString());
    console.log("  validTo:", gpv2Order.validTo.toString(), "(" + new Date(Number(gpv2Order.validTo) * 1000).toISOString() + ")");
    console.log("  appData:", gpv2Order.appData);
    console.log("  signature length:", (signature.length - 2) / 2, "bytes");
    
    // Check signature format - should NOT have 65-byte prefix now
    console.log("\n  First 66 chars of signature:", signature.slice(0, 66));
    
    // Try submitting to API
    const fetch = (await import('node-fetch')).default;
    
    const orderPayload = {
      sellToken: gpv2Order.sellToken,
      buyToken: gpv2Order.buyToken,
      receiver: gpv2Order.receiver,
      sellAmount: gpv2Order.sellAmount.toString(),
      buyAmount: gpv2Order.buyAmount.toString(),
      validTo: Number(gpv2Order.validTo),
      appData: gpv2Order.appData,
      feeAmount: "0",
      kind: "sell",
      partiallyFillable: false,
      sellTokenBalance: "erc20",
      buyTokenBalance: "erc20",
      signingScheme: "eip1271",
      signature: signature,
      from: MANAGER
    };

    console.log("\nSubmitting to CoW API...");
    const response = await fetch("https://api.cow.fi/arbitrum_one/api/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload)
    });

    const result = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", result.substring(0, 500));

  } catch (e) {
    console.log("\n❌ getTradeableOrderWithSignature FAILED:", e.message);
    if (e.data) console.log("Error data:", e.data);
  }
}

main().catch(console.error);
