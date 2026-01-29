const { ethers } = require("hardhat");

async function main() {
  console.log("=== Manual Order Submission Debug ===\n");

  const COMPOSABLE_COW = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const MANAGER_ADDRESS = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const USER_ADDRESS = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const SALT = "0x824e63e433bef7c668a8f4d08f84bd036616dfe31c6fc003222a1f1fab7c5e97";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", MANAGER_ADDRESS);
  const orderHash = await manager.userSaltToOrderHash(USER_ADDRESS, SALT);

  // Get the tradeable order and signature from ComposableCoW
  const composableCow = await ethers.getContractAt([
    "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"
  ], COMPOSABLE_COW);

  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
  const cowSalt = await manager.orderSalts(orderHash);

  const [order, signature] = await composableCow.getTradeableOrderWithSignature(
    MANAGER_ADDRESS,
    [MANAGER_ADDRESS, cowSalt, staticInput],
    "0x",
    []
  );

  console.log("Order from ComposableCoW:");
  console.log("  sellToken:", order.sellToken);
  console.log("  buyToken:", order.buyToken);
  console.log("  receiver:", order.receiver);
  console.log("  sellAmount:", order.sellAmount.toString());
  console.log("  buyAmount:", order.buyAmount.toString());
  console.log("  validTo:", order.validTo);
  console.log("  appData:", order.appData);
  console.log("  feeAmount:", order.feeAmount.toString());
  console.log("  kind:", order.kind);
  console.log("  partiallyFillable:", order.partiallyFillable);

  // Build the API request body
  const apiOrder = {
    sellToken: order.sellToken,
    buyToken: order.buyToken,
    receiver: order.receiver,
    sellAmount: order.sellAmount.toString(),
    buyAmount: order.buyAmount.toString(),
    validTo: Number(order.validTo),
    appData: order.appData,
    feeAmount: order.feeAmount.toString(),
    kind: order.kind === "0xf3b277728b3fee749481eb3e0b3b48980dbbab78658fc419025cb16eee346775" ? "sell" : "buy",
    partiallyFillable: order.partiallyFillable,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
    signingScheme: "eip1271",
    signature: signature,
    from: MANAGER_ADDRESS,
  };

  console.log("\n=== API Request Body ===");
  console.log(JSON.stringify(apiOrder, null, 2));

  // Submit to CoW API
  console.log("\n=== Submitting to CoW API ===");
  try {
    const response = await fetch("https://api.cow.fi/arbitrum/api/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiOrder),
    });

    const responseText = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", responseText);
  } catch (e) {
    console.log("Fetch error:", e.message);
  }
}

main().catch(console.error);
