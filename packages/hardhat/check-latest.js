const { ethers } = require("hardhat");

async function main() {
  const TX_HASH = "0x98e6f8aabaa276e74f1629600249ac22df9e2d4749c4abf564b6c82913e6a6f7";
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  const receipt = await ethers.provider.getTransactionReceipt(TX_HASH);
  console.log("Tx status:", receipt.status === 1 ? "✅ Success" : "❌ Failed");
  
  // Get new manager address from logs
  let managerAddress;
  let orderHash;
  
  for (const log of receipt.logs) {
    // OrderCreated event topic
    if (log.topics[0] === "0x0d7b86882845c929e022510097af482fe9d559b56b818bb2c8630eff4d3ed953") {
      managerAddress = log.address;
      orderHash = log.topics[1];
      console.log("\nNew Manager:", managerAddress);
      console.log("OrderHash:", orderHash);
    }
  }

  if (!managerAddress || !orderHash) {
    console.log("Could not find OrderCreated event");
    return;
  }

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", managerAddress);
  const cowSalt = await manager.orderSalts(orderHash);
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);

  console.log("cowSalt:", cowSalt);

  const composableCow = await ethers.getContractAt([
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ], COMPOSABLE_COW);

  try {
    const [gpv2Order, signature] = await composableCow.getTradeableOrderWithSignature(
      managerAddress,
      [managerAddress, cowSalt, staticInput],
      "0x",
      []
    );

    console.log("\n✅ getTradeableOrderWithSignature SUCCESS!");
    console.log("  sellToken:", gpv2Order.sellToken);
    console.log("  buyToken:", gpv2Order.buyToken);
    console.log("  sellAmount:", gpv2Order.sellAmount.toString());
    console.log("  buyAmount:", gpv2Order.buyAmount.toString());
    console.log("  validTo:", new Date(Number(gpv2Order.validTo) * 1000).toISOString());
    console.log("  signature length:", (signature.length - 2) / 2, "bytes");
    console.log("  first 20 bytes:", signature.slice(0, 42));

    // Submit to API
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
      from: managerAddress
    };

    console.log("\nSubmitting to CoW API...");
    const response = await fetch("https://api.cow.fi/arbitrum_one/api/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderPayload)
    });

    const result = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", result);

  } catch (e) {
    console.log("\n❌ FAILED:", e.message);
    if (e.data) {
      console.log("Error data:", e.data);
      // Try to decode
      const errors = [
        "error InvalidFallbackHandler()",
        "error SingleOrderNotAuthed()",
        "error PollTryNextBlock(string)",
        "error PollNever(string)"
      ];
      for (const err of errors) {
        const iface = new ethers.Interface([err]);
        const errName = err.match(/error (\w+)/)[1];
        if (iface.getError(errName).selector === e.data.slice(0, 10)) {
          console.log("Decoded error:", errName);
        }
      }
    }
  }
}

main().catch(console.error);
