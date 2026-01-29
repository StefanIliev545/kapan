const { ethers } = require("hardhat");

const MORPHO_ORACLE = "0x8ceD7944c38A635146F02b1305a4697761Fe6D7B";

// Common oracle interface functions
const ORACLE_ABI = [
  "function price() external view returns (uint256)",
  // Chainlink oracle adapter functions
  "function BASE_FEED_1() external view returns (address)",
  "function BASE_FEED_2() external view returns (address)",
  "function QUOTE_FEED_1() external view returns (address)",
  "function QUOTE_FEED_2() external view returns (address)",
  "function VAULT() external view returns (address)",
  "function BASE_VAULT() external view returns (address)",
  "function QUOTE_VAULT() external view returns (address)",
  "function VAULT_CONVERSION_SAMPLE() external view returns (uint256)",
  "function SCALE_FACTOR() external view returns (uint256)"
];

const CHAINLINK_ABI = [
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
  "function description() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("=== Morpho Oracle Deep Dive ===\n");
  console.log("Oracle address:", MORPHO_ORACLE);

  const oracle = new ethers.Contract(MORPHO_ORACLE, ORACLE_ABI, signer);
  
  // Get current price
  const price = await oracle.price();
  console.log("\nCurrent price (raw):", price.toString());
  console.log("Price (36 decimals):", Number(price) / 1e36);

  // Try to read oracle configuration
  console.log("\n--- Oracle Configuration ---");
  
  const tryRead = async (name, fn) => {
    try {
      const value = await fn();
      console.log(`${name}:`, value.toString ? value.toString() : value);
      return value;
    } catch {
      console.log(`${name}: not available`);
      return null;
    }
  };

  const baseFeed1 = await tryRead("BASE_FEED_1", () => oracle.BASE_FEED_1());
  const baseFeed2 = await tryRead("BASE_FEED_2", () => oracle.BASE_FEED_2());
  const quoteFeed1 = await tryRead("QUOTE_FEED_1", () => oracle.QUOTE_FEED_1());
  const quoteFeed2 = await tryRead("QUOTE_FEED_2", () => oracle.QUOTE_FEED_2());
  const vault = await tryRead("VAULT", () => oracle.VAULT());
  const baseVault = await tryRead("BASE_VAULT", () => oracle.BASE_VAULT());
  const quoteVault = await tryRead("QUOTE_VAULT", () => oracle.QUOTE_VAULT());
  await tryRead("VAULT_CONVERSION_SAMPLE", () => oracle.VAULT_CONVERSION_SAMPLE());
  await tryRead("SCALE_FACTOR", () => oracle.SCALE_FACTOR());

  // If there's a vault, check its conversion rate
  if (vault && vault !== ethers.ZeroAddress) {
    console.log("\n--- Vault Details ---");
    const vaultContract = new ethers.Contract(vault, [
      "function convertToAssets(uint256) external view returns (uint256)",
      "function asset() external view returns (address)"
    ], signer);
    
    try {
      const assetsPer1e6 = await vaultContract.convertToAssets(BigInt(1e6));
      console.log("Vault conversion: 1e6 shares =", assetsPer1e6.toString(), "assets");
    } catch (e) {
      console.log("Vault conversion failed:", e.message?.slice(0, 50));
    }
  }

  // Check chainlink feeds if available
  const feeds = [
    { name: "BASE_FEED_1", addr: baseFeed1 },
    { name: "BASE_FEED_2", addr: baseFeed2 },
    { name: "QUOTE_FEED_1", addr: quoteFeed1 },
    { name: "QUOTE_FEED_2", addr: quoteFeed2 }
  ];

  for (const feed of feeds) {
    if (feed.addr && feed.addr !== ethers.ZeroAddress && feed.addr !== "0x0000000000000000000000000000000000000000") {
      console.log(`\n--- ${feed.name} Details ---`);
      const feedContract = new ethers.Contract(feed.addr, CHAINLINK_ABI, signer);
      try {
        const desc = await feedContract.description();
        const dec = await feedContract.decimals();
        const [,answer,,,] = await feedContract.latestRoundData();
        console.log("Description:", desc);
        console.log("Decimals:", dec.toString());
        console.log("Latest answer:", answer.toString());
        console.log("Answer normalized:", Number(answer) / (10 ** Number(dec)));
      } catch (e) {
        console.log("Feed read failed:", e.message?.slice(0, 80));
      }
    }
  }
}

main().catch(console.error);
