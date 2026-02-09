const { ethers } = require("hardhat");

async function main() {
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const ORDER_HASH = "0x1ab3c9222b76ecd22e07ae76b4786a5a9826a6200fe96e091447c380b856d867";

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

  console.log("Order for API submission:");
  console.log(JSON.stringify({
    sellToken: gpv2Order.sellToken,
    buyToken: gpv2Order.buyToken,
    receiver: gpv2Order.receiver,
    sellAmount: gpv2Order.sellAmount.toString(),
    buyAmount: gpv2Order.buyAmount.toString(),
    validTo: Number(gpv2Order.validTo),
    appData: gpv2Order.appData,
    feeAmount: gpv2Order.feeAmount.toString(),
    kind: gpv2Order.kind === "0xf3b277728b3fee749481eb3e0b3b48980dbbab78658fc419025cb16eee346775" ? "sell" : "buy",
    partiallyFillable: gpv2Order.partiallyFillable,
    sellTokenBalance: gpv2Order.sellTokenBalance === "0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9" ? "erc20" : "external",
    buyTokenBalance: gpv2Order.buyTokenBalance === "0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9" ? "erc20" : "external",
    signingScheme: "eip1271",
    signature: signature,
    from: MANAGER
  }, null, 2));

  // Try submitting to CoW API
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

  console.log("\n\nSubmitting to CoW API...");
  const response = await fetch("https://api.cow.fi/arbitrum/api/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload)
  });

  const result = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", result);
}

main().catch(console.error);
