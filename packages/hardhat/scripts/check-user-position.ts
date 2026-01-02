import { ethers } from "hardhat";

async function main() {
  // Aave V3 Pool on Base
  const aavePool = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
  const user = '0xa9b108038567f76f55219c630bb0e590b748790d';
  
  const pool = new ethers.Contract(aavePool, [
    'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  ], ethers.provider);
  
  const data = await pool.getUserAccountData(user);
  
  console.log('User:', user);
  console.log('Total Collateral (USD base units):', data.totalCollateralBase.toString());
  console.log('Total Debt (USD base units):', data.totalDebtBase.toString());
  console.log('Available Borrows (USD base units):', data.availableBorrowsBase.toString());
  console.log('Health Factor:', ethers.formatEther(data.healthFactor));
}

main().catch(console.error);
