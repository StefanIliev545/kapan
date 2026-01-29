const { ethers } = require("hardhat");

const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const SYRUP_USDC = "0x41CA7586cC1311807B4605fBB748a3B8862b42b5";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address)"
];

const POOL_ABI = [
  "function liquidity() external view returns (uint128)"
];

const fees = [100, 500, 3000, 10000];

async function main() {
  const [signer] = await ethers.getSigners();
  
  console.log("=== Liquidity Route Analysis ===\n");

  const factory = new ethers.Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, signer);
  
  console.log("--- USDT/USDC Pools ---");
  for (const fee of fees) {
    const pool = await factory.getPool(USDT, USDC, fee);
    if (pool !== ethers.ZeroAddress) {
      const poolContract = new ethers.Contract(pool, POOL_ABI, signer);
      const liquidity = await poolContract.liquidity();
      console.log("Fee " + (fee/10000) + "%: " + pool + " liquidity: " + liquidity.toString());
    }
  }
  
  console.log("\n--- syrupUSDC/USDC Pools ---");
  for (const fee of fees) {
    const pool = await factory.getPool(SYRUP_USDC, USDC, fee);
    if (pool !== ethers.ZeroAddress) {
      const poolContract = new ethers.Contract(pool, POOL_ABI, signer);
      const liquidity = await poolContract.liquidity();
      console.log("Fee " + (fee/10000) + "%: " + pool + " liquidity: " + liquidity.toString());
    } else {
      console.log("Fee " + (fee/10000) + "%: No pool");
    }
  }
  
  console.log("\n--- syrupUSDC/USDT Pools (direct) ---");
  for (const fee of fees) {
    const pool = await factory.getPool(SYRUP_USDC, USDT, fee);
    if (pool !== ethers.ZeroAddress) {
      const poolContract = new ethers.Contract(pool, POOL_ABI, signer);
      const liquidity = await poolContract.liquidity();
      console.log("Fee " + (fee/10000) + "%: " + pool + " liquidity: " + liquidity.toString());
    } else {
      console.log("Fee " + (fee/10000) + "%: No pool");
    }
  }
}

main().catch(console.error);
