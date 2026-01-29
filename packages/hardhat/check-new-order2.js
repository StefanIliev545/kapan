const { ethers } = require("hardhat");

async function main() {
  const TX_HASH = "0x18959a5d1eb6d1edb6c0ca6904e78ee91360cbd845dbbeaba416018c4324a926";
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  // Get tx receipt
  const receipt = await ethers.provider.getTransactionReceipt(TX_HASH);
  console.log("Tx status:", receipt.status === 1 ? "✅ Success" : "❌ Failed");
  
  // Find OrderCreated event
  const managerIface = new ethers.Interface([
    "event OrderCreated(bytes32 indexed orderHash, address indexed user, address trigger, address sellToken, address buyToken)"
  ]);
  
  let orderHash;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === MANAGER.toLowerCase()) {
      try {
        const decoded = managerIface.parseLog({ topics: log.topics, data: log.data });
        if (decoded && decoded.name === "OrderCreated") {
          orderHash = decoded.args.orderHash;
          console.log("\nOrderCreated event:");
          console.log("  orderHash:", orderHash);
          console.log("  user:", decoded.args.user);
          console.log("  sellToken:", decoded.args.sellToken);
          console.log("  buyToken:", decoded.args.buyToken);
        }
      } catch {}
    }
  }

  if (!orderHash) {
    console.log("No OrderCreated event found!");
    return;
  }

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER);
  const cowSalt = await manager.orderSalts(orderHash);
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);

  console.log("\nCoW params:");
  console.log("  cowSalt:", cowSalt);
  console.log("  staticInput:", staticInput);

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
    console.log("  validTo:", gpv2Order.validTo.toString());
    console.log("  signature length:", signature.length);
    
    // Check signature format - should NOT have 65-byte prefix now
    console.log("\n  First 10 bytes of signature:", signature.slice(0, 22));
    
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
  }
}

main().catch(console.error);
