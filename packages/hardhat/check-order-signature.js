const { ethers } = require("hardhat");

const MORPHO_ORACLE = "0x8ceD7944c38A635146F02b1305a4697761Fe6D7B";
const SYRUP_USDC = "0x41CA7586cC1311807B4605fBB748a3B8862b42b5";

const MORPHO_ORACLE_ABI = ["function price() external view returns (uint256)"];

// syrupUSDC is a Maple vault - check its exchange rate
const SYRUP_ABI = [
  "function convertToAssets(uint256 shares) external view returns (uint256)",
  "function totalAssets() external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function asset() external view returns (address)",
  "function decimals() external view returns (uint8)"
];

const ERC20_ABI = [
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("=== Checking Oracle & syrupUSDC NAV ===\n");

  // 1. Check Morpho Oracle
  const oracle = new ethers.Contract(MORPHO_ORACLE, MORPHO_ORACLE_ABI, signer);
  const oraclePrice = await oracle.price();
  const oraclePriceFloat = Number(oraclePrice) / 1e36;

  console.log("MORPHO ORACLE:");
  console.log("  Raw price:", oraclePrice.toString());
  console.log("  Price (36 dec):", oraclePriceFloat.toFixed(6));
  console.log("  Meaning: 1 syrupUSDC =", oraclePriceFloat.toFixed(6), "USDT");

  // 2. Check syrupUSDC vault exchange rate
  console.log("\nSYRUP USDC VAULT:");
  const syrup = new ethers.Contract(SYRUP_USDC, SYRUP_ABI, signer);

  try {
    const asset = await syrup.asset();
    console.log("  Underlying asset:", asset);

    const assetContract = new ethers.Contract(asset, ERC20_ABI, signer);
    const assetSymbol = await assetContract.symbol();
    console.log("  Asset symbol:", assetSymbol);

    // Check exchange rate: how many assets per 1 share?
    const oneShare = BigInt(1e6); // syrupUSDC has 6 decimals
    const assetsPerShare = await syrup.convertToAssets(oneShare);
    console.log("  1 syrupUSDC =", Number(assetsPerShare) / 1e6, assetSymbol, "(vault exchange rate)");

    // Total assets and supply
    const totalAssets = await syrup.totalAssets();
    const totalSupply = await syrup.totalSupply();
    const impliedRate = Number(totalAssets) / Number(totalSupply);
    console.log("  Total assets:", Number(totalAssets) / 1e6, assetSymbol);
    console.log("  Total supply:", Number(totalSupply) / 1e6, "syrupUSDC");
    console.log("  Implied rate:", impliedRate.toFixed(6), assetSymbol, "per syrupUSDC");

  } catch (e) {
    console.log("  Error reading vault:", e.message?.slice(0, 100));
  }

  // 3. Compare
  console.log("\n=== COMPARISON ===");
  console.log("Morpho Oracle says: 1 syrupUSDC =", oraclePriceFloat.toFixed(6), "USDT");
  console.log("(Check if this matches the vault's actual NAV above)");
}

main().catch(console.error);
