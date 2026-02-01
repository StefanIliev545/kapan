import { ethers } from "hardhat";

async function main() {
  const orderManager = await ethers.getContractAt(
    [
      "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
      "function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
    ],
    "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a"
  );

  const orderHash = await orderManager.userSaltToOrderHash(
    "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3",
    "0x7183d477391f84bbc45ac6f446ad8f9b045c4c61b63cba4977e08ed2e6bd9f32"
  );
  
  const order = await orderManager.getOrder(orderHash);
  const data = order.params.triggerStaticData;
  
  console.log("Full triggerStaticData length:", (data.length - 2) / 2, "bytes");
  
  // Show first 15 words
  console.log("\n=== Word-by-word (first 15 words) ===");
  const words: string[] = [];
  for (let i = 2; i < data.length; i += 64) {
    const wordIndex = (i - 2) / 64;
    const word = data.slice(i, i + 64);
    if (word.length === 64) {
      words.push("0x" + word);
      if (wordIndex < 15) {
        console.log("Word " + wordIndex + ": 0x" + word);
      }
    }
  }
  
  console.log("\n=== Interpretation ===");
  console.log("protocolId (bytes4):", words[0]?.slice(0, 10));
  console.log("protocolContext offset:", parseInt(words[1] || "0", 16));
  console.log("sellToken:", "0x" + (words[2]?.slice(26) || ""));
  console.log("buyToken:", "0x" + (words[3]?.slice(26) || ""));
  console.log("sellDecimals:", parseInt(words[4] || "0", 16));
  console.log("buyDecimals:", parseInt(words[5] || "0", 16));
  console.log("limitPrice:", BigInt(words[6] || "0").toString());
  console.log("triggerAbovePrice:", parseInt(words[7] || "0", 16) !== 0);
  console.log("totalSellAmount:", BigInt(words[8] || "0").toString());
  console.log("totalBuyAmount:", BigInt(words[9] || "0").toString());
  console.log("numChunks:", parseInt(words[10] || "0", 16));
  console.log("maxSlippageBps:", BigInt(words[11] || "0").toString());
  console.log("isKindBuy:", parseInt(words[12] || "0", 16) !== 0);
  
  // Check protocolContext at offset
  const offset = parseInt(words[1] || "0", 16);
  const contextStartWord = offset / 32;
  console.log("\nprotocolContext at word", contextStartWord);
  if (words[contextStartWord]) {
    const contextLength = parseInt(words[contextStartWord], 16);
    console.log("protocolContext length:", contextLength, "bytes");
  }
}

main().catch(console.error);
