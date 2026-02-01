import { ethers } from "hardhat";

async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const salt = "0xcf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";

  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))"],
    manager
  );

  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  const orderCtx = await Manager.getOrder(orderHash);

  console.log("=== Production Order Details ===\n");
  console.log("Order hash:", orderHash);
  console.log("Status:", orderCtx.status.toString(), "(1=Active)");
  console.log("User:", orderCtx.params.user);
  console.log("SellToken:", orderCtx.params.sellToken);
  console.log("BuyToken:", orderCtx.params.buyToken);
  console.log("isKindBuy:", orderCtx.params.isKindBuy);
  console.log("sellTokenRefundAddress:", orderCtx.params.sellTokenRefundAddress);
  console.log("preInstructions length:", orderCtx.params.preInstructions.length);
  console.log("postInstructions length:", orderCtx.params.postInstructions.length);

  // Decode pre-instructions
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  console.log("\n--- Pre-Instructions ---");
  if (orderCtx.params.preInstructions.length > 66) {
    try {
      const decoded = abiCoder.decode(
        ["tuple(string protocolName, bytes data)[]"],
        orderCtx.params.preInstructions
      );
      console.log("Count:", decoded[0].length);
      for (let i = 0; i < decoded[0].length; i++) {
        const inst = decoded[0][i];
        console.log(`  [${i}] protocol: ${inst.protocolName}`);
        console.log(`      data: ${inst.data.slice(0, 100)}...`);
      }
    } catch (e) {
      console.log("Decode failed:", (e as Error).message);
    }
  } else {
    console.log("Empty (no pre-instructions)");
  }

  console.log("\n--- Post-Instructions ---");
  if (orderCtx.params.postInstructions.length > 66) {
    try {
      const decoded = abiCoder.decode(
        ["tuple(string protocolName, bytes data)[]"],
        orderCtx.params.postInstructions
      );
      console.log("Count:", decoded[0].length);
      for (let i = 0; i < decoded[0].length; i++) {
        const inst = decoded[0][i];
        console.log(`  [${i}] protocol: ${inst.protocolName}`);
        console.log(`      data: ${inst.data.slice(0, 100)}...`);
      }
    } catch (e) {
      console.log("Decode failed:", (e as Error).message);
    }
  } else {
    console.log("Empty (no post-instructions)");
  }

  // Decode trigger params
  console.log("\n--- Trigger Params ---");
  try {
    const Trigger = await ethers.getContractAt(
      ["function decodeTriggerParams(bytes calldata staticData) view returns (tuple(bytes4 protocolId, bytes protocolContext, address sellToken, address buyToken, uint8 sellDecimals, uint8 buyDecimals, uint256 limitPrice, bool triggerAbovePrice, uint256 totalSellAmount, uint256 totalBuyAmount, uint8 numChunks, uint256 maxSlippageBps, bool isKindBuy) params)"],
      orderCtx.params.trigger
    );
    const params = await Trigger.decodeTriggerParams(orderCtx.params.triggerStaticData);
    console.log("sellToken:", params.sellToken);
    console.log("buyToken:", params.buyToken);
    console.log("totalSellAmount:", ethers.formatUnits(params.totalSellAmount, params.sellDecimals));
    console.log("totalBuyAmount:", ethers.formatUnits(params.totalBuyAmount, params.buyDecimals));
    console.log("limitPrice:", params.limitPrice.toString());
    console.log("isKindBuy:", params.isKindBuy);
    console.log("maxSlippageBps:", params.maxSlippageBps.toString());
  } catch (e) {
    console.log("Failed:", (e as Error).message);
  }
}

main().catch(console.error);
