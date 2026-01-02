import { ethers } from "hardhat";

async function main() {
  const aavePool = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  const weth = "0x4200000000000000000000000000000000000006";
  const borrower = "0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A";
  const amount = ethers.parseEther("0.001539172580407967");
  
  const pool = new ethers.Contract(aavePool, [
    "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external",
    "function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128)",
  ], ethers.provider);
  
  // Get flash loan premium
  const premium = await pool.FLASHLOAN_PREMIUM_TOTAL();
  console.log("Flash loan premium (bps):", premium.toString());
  
  // Calculate fee
  const fee = (amount * BigInt(premium)) / 10000n;
  console.log("Flash loan amount:", ethers.formatEther(amount));
  console.log("Expected fee:", ethers.formatEther(fee));
  console.log("Total to repay:", ethers.formatEther(amount + fee));
}

main().catch(console.error);
