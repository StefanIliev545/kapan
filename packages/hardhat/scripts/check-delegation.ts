import { ethers } from "hardhat";

async function main() {
  // Aave V3 Variable Debt WETH on Base
  const vDebtWETH = '0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E';
  const user = '0xa9b108038567f76f55219c630bb0e590b748790d';
  const orderManager = '0xE4b28de3AA865540Bbc1C71892b6b6Af24929858';
  const kapanRouter = '0x3fC70cA4e3A4AA493bEB5F63c559ed3B5f94cF57'.toLowerCase();
  
  const debtToken = new ethers.Contract(vDebtWETH, [
    'function borrowAllowance(address fromUser, address toUser) external view returns (uint256)',
  ], ethers.provider);
  
  const allowanceToRouter = await debtToken.borrowAllowance(user, kapanRouter);
  const allowanceToManager = await debtToken.borrowAllowance(user, orderManager);
  
  console.log('User:', user);
  console.log('Borrow allowance to KapanRouter:', ethers.formatEther(allowanceToRouter));
  console.log('Borrow allowance to OrderManager:', ethers.formatEther(allowanceToManager));
}

main().catch(console.error);
