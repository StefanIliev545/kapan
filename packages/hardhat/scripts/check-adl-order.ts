import { ethers } from "hardhat";

async function main() {
  // ADL order details from user
  // Order ID: 0x5f7835438f96499e08d61d89b89dd412b04f048279039054cf02f6d0765bc2e572ee97f652d871f05532e8a08dedd1d05016f592697fb068
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  // Salt from hooks calldata
  const salt = "0xb528c0dda8259f51313a1c86c7e69cc44121d637049602294b1b8562cd5918c5";

  // Also try the order hash directly
  const orderHashDirect = "0x5f7835438f96499e08d61d89b89dd412b04f048279039054cf02f6d0765bc2e5";

  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))"],
    manager
  );

  let orderHash = await Manager.userSaltToOrderHash(user, salt);
  console.log("Order hash from salt:", orderHash);

  // If salt lookup fails, try direct order hash
  if (orderHash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    orderHash = orderHashDirect;
    console.log("Using direct order hash:", orderHash);
  }

  const orderCtx = await Manager.getOrder(orderHash);

  console.log("Order hash:", orderHash);
  console.log("Trigger:", orderCtx.params.trigger);
  console.log("SellToken:", orderCtx.params.sellToken);
  console.log("BuyToken:", orderCtx.params.buyToken);

  // Decode trigger params
  const Trigger = await ethers.getContractAt(
    ["function decodeTriggerParams(bytes calldata staticData) view returns (tuple(bytes4 protocolId, bytes protocolContext, uint256 triggerLtvBps, uint256 targetLtvBps, address collateralToken, address debtToken, uint8 collateralDecimals, uint8 debtDecimals, uint256 maxSlippageBps, uint8 numChunks) params)",
     "function calculateExecution(bytes calldata staticData, address owner, uint256 iterationCount) view returns (uint256 sellAmount, uint256 minBuyAmount)"],
    orderCtx.params.trigger
  );

  const params = await Trigger.decodeTriggerParams(orderCtx.params.triggerStaticData);
  console.log("\n=== Trigger Params ===");
  console.log("protocolId:", params.protocolId);
  console.log("collateralToken:", params.collateralToken);
  console.log("debtToken:", params.debtToken);
  console.log("collateralDecimals:", params.collateralDecimals);
  console.log("debtDecimals:", params.debtDecimals);
  console.log("triggerLtvBps:", params.triggerLtvBps.toString());
  console.log("targetLtvBps:", params.targetLtvBps.toString());
  console.log("maxSlippageBps:", params.maxSlippageBps.toString());
  console.log("numChunks:", params.numChunks);

  // Calculate execution
  const [sellAmount, minBuyAmount] = await Trigger.calculateExecution(orderCtx.params.triggerStaticData, user, 0);
  console.log("\n=== Calculated Amounts ===");
  console.log("sellAmount (raw):", sellAmount.toString());
  console.log("sellAmount (WBTC):", ethers.formatUnits(sellAmount, params.collateralDecimals));
  console.log("minBuyAmount (raw):", minBuyAmount.toString());
  console.log("minBuyAmount (USDT):", ethers.formatUnits(minBuyAmount, params.debtDecimals));

  // Expected price
  if (sellAmount > 0n && minBuyAmount > 0n) {
    const pricePerBtc = (minBuyAmount * BigInt(10 ** params.collateralDecimals)) / sellAmount;
    console.log("\nImplied BTC price:", ethers.formatUnits(pricePerBtc, params.debtDecimals), "USDT");
  }
}

main().catch(console.error);
