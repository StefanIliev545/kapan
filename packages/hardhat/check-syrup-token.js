const { ethers } = require("hardhat");

const SYRUP_USDC = "0x41CA7586cC1311807B4605fBB748a3B8862b42b5";

// Basic ERC20 interface
const ERC20_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)"
];

// Check for proxy implementation
const PROXY_ABI = [
  "function implementation() external view returns (address)"
];

async function main() {
  const [signer] = await ethers.getSigners();

  console.log("=== syrupUSDC Token Analysis ===\n");

  const token = new ethers.Contract(SYRUP_USDC, ERC20_ABI, signer);
  
  console.log("Address:", SYRUP_USDC);
  console.log("Name:", await token.name());
  console.log("Symbol:", await token.symbol());
  console.log("Decimals:", await token.decimals());
  console.log("Total Supply:", Number(await token.totalSupply()) / 1e6);

  // Check code size to see if it's a contract
  const code = await ethers.provider.getCode(SYRUP_USDC);
  console.log("\nCode size:", code.length, "bytes");

  // Try to read bytecode selector signatures
  console.log("\nTrying different interfaces...");
  
  // Try ERC4626
  const vault4626 = new ethers.Contract(SYRUP_USDC, [
    "function asset() external view returns (address)",
    "function totalAssets() external view returns (uint256)",
    "function convertToAssets(uint256) external view returns (uint256)"
  ], signer);
  
  try {
    const asset = await vault4626.asset();
    console.log("ERC4626 asset():", asset);
  } catch {
    console.log("No ERC4626 asset() function");
  }

  // Try Maple-specific interface
  const maple = new ethers.Contract(SYRUP_USDC, [
    "function pool() external view returns (address)",
    "function underlying() external view returns (address)",
    "function totalUnderlying() external view returns (uint256)",
    "function exchangeRate() external view returns (uint256)"
  ], signer);

  try {
    const pool = await maple.pool();
    console.log("Maple pool():", pool);
  } catch {
    console.log("No Maple pool() function");
  }
  
  try {
    const underlying = await maple.underlying();
    console.log("Maple underlying():", underlying);
  } catch {
    console.log("No Maple underlying() function");
  }

  try {
    const rate = await maple.exchangeRate();
    console.log("Maple exchangeRate():", rate.toString());
  } catch {
    console.log("No Maple exchangeRate() function");
  }
}

main().catch(console.error);
