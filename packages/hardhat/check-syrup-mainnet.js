const { ethers } = require("hardhat");

// syrupUSDC on Arbitrum
const SYRUP_USDC_ARB = "0x41CA7586cC1311807B4605fBB748a3B8862b42b5";
// The Chainlink feed for syrupUSDC/USDC
const CHAINLINK_SYRUP_USDC = "0xF8722c901675C4F2F7824E256B8A6477b2c105FB";

const CHAINLINK_ABI = [
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
  "function description() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function aggregator() external view returns (address)",
  "function latestTimestamp() external view returns (uint256)",
  "function latestAnswer() external view returns (int256)"
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("=== Chainlink syrupUSDC/USDC Feed Analysis ===\n");

  const feed = new ethers.Contract(CHAINLINK_SYRUP_USDC, CHAINLINK_ABI, signer);
  
  const [roundId, answer, startedAt, updatedAt] = await feed.latestRoundData();
  const decimals = await feed.decimals();
  const desc = await feed.description();
  
  console.log("Feed:", desc);
  console.log("Answer:", answer.toString());
  console.log("Decimals:", decimals.toString());
  console.log("Rate:", Number(answer) / (10 ** Number(decimals)));
  console.log("Last updated:", new Date(Number(updatedAt) * 1000).toISOString());
  console.log("Updated (ago):", Math.floor((Date.now()/1000 - Number(updatedAt)) / 60), "minutes");
  
  // Try to get aggregator
  try {
    const aggregator = await feed.aggregator();
    console.log("Aggregator:", aggregator);
  } catch {
    console.log("No aggregator function");
  }
}

main().catch(console.error);
