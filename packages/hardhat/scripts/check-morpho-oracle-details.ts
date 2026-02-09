import { ethers } from "hardhat";

async function main() {
  // Morpho oracle for WBTC/USDC market
  const oracleAddress = "0x88193FcB705d29724A40Bb818eCAA47dD5F014d9";

  console.log("=== Morpho Oracle Details ===\n");
  console.log("Oracle address:", oracleAddress);

  // Common oracle interface methods
  const oracle = await ethers.getContractAt(
    ["function price() view returns (uint256)",
     "function QUOTE_CURRENCY() view returns (address)",
     "function BASE_CURRENCY() view returns (address)",
     "function baseFeed1() view returns (address)",
     "function baseFeed2() view returns (address)",
     "function quoteFeed1() view returns (address)",
     "function quoteFeed2() view returns (address)",
     "function VAULT() view returns (address)",
     "function VAULT_CONVERSION_SAMPLE() view returns (uint256)",
     "function SCALE_FACTOR() view returns (uint256)"],
    oracleAddress
  );

  // Get price
  const price = await oracle.price();
  console.log("Current price:", price.toString());
  console.log("Price / 1e36:", (Number(price) / 1e36).toFixed(8));

  // Derive BTC price (scale is 10^(36 + 6 - 8) = 10^34 for WBTC/USDC)
  const btcPrice = Number(price) / 1e34;
  console.log("Implied BTC price (USDC):", btcPrice.toFixed(2));

  // Try to get oracle sources
  try {
    const quoteCurrency = await oracle.QUOTE_CURRENCY();
    console.log("\nQUOTE_CURRENCY:", quoteCurrency);
  } catch { console.log("No QUOTE_CURRENCY method"); }

  try {
    const baseCurrency = await oracle.BASE_CURRENCY();
    console.log("BASE_CURRENCY:", baseCurrency);
  } catch { console.log("No BASE_CURRENCY method"); }

  try {
    const baseFeed1 = await oracle.baseFeed1();
    console.log("baseFeed1:", baseFeed1);
  } catch { console.log("No baseFeed1"); }

  try {
    const baseFeed2 = await oracle.baseFeed2();
    console.log("baseFeed2:", baseFeed2);
  } catch { console.log("No baseFeed2"); }

  try {
    const quoteFeed1 = await oracle.quoteFeed1();
    console.log("quoteFeed1:", quoteFeed1);
  } catch { console.log("No quoteFeed1"); }

  try {
    const quoteFeed2 = await oracle.quoteFeed2();
    console.log("quoteFeed2:", quoteFeed2);
  } catch { console.log("No quoteFeed2"); }

  try {
    const vault = await oracle.VAULT();
    console.log("VAULT:", vault);
  } catch { console.log("No VAULT"); }

  try {
    const scaleFactor = await oracle.SCALE_FACTOR();
    console.log("SCALE_FACTOR:", scaleFactor.toString());
  } catch { console.log("No SCALE_FACTOR"); }

  // Compare with Chainlink BTC/USD
  console.log("\n=== Chainlink Comparison ===");
  // Chainlink BTC/USD on Arbitrum
  const btcUsdFeed = "0x6ce185860a4963106506C203335A2910A51d1Cb2";
  const chainlink = await ethers.getContractAt(
    ["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"],
    btcUsdFeed
  );

  const [, chainlinkPrice, , updatedAt] = await chainlink.latestRoundData();
  console.log("Chainlink BTC/USD:", Number(chainlinkPrice) / 1e8, "USD");
  console.log("Last updated:", new Date(Number(updatedAt) * 1000).toISOString());

  // Calculate discrepancy
  const morphoPrice = btcPrice;
  const clPrice = Number(chainlinkPrice) / 1e8;
  const discrepancy = ((clPrice - morphoPrice) / clPrice) * 100;
  console.log("\nPrice discrepancy:", discrepancy.toFixed(2) + "%");
  console.log("Morpho oracle is", discrepancy > 0 ? "LOWER" : "HIGHER", "than Chainlink");
}

main().catch(console.error);
