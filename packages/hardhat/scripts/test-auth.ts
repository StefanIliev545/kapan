import { ethers } from "hardhat";

async function main() {
  const userAddress = "0xa9b108038567f76f55219c630bb0e590b748790d";
  const aaveGatewayAddress = "0x82fB028FC78acedF7809AD25Ac932D732b85b511";
  const kapanRouterAddress = "0x2302643bf7ceea3F7180547F90d5eA5a917e2b99";
  const vDebtWETH = "0x24e6e0795b3c7c71D965fCc4f371803d1c1DcA1E";
  
  const debtToken = new ethers.Contract(vDebtWETH, [
    "function borrowAllowance(address fromUser, address toUser) external view returns (uint256)",
  ], ethers.provider);
  
  console.log("Checking WETH borrow delegation on Aave V3:");
  
  const toGateway = await debtToken.borrowAllowance(userAddress, aaveGatewayAddress);
  console.log("  User -> AaveGateway:", toGateway > 0n ? "YES (MAX)" : "NO");
  
  const toRouter = await debtToken.borrowAllowance(userAddress, kapanRouterAddress);
  console.log("  User -> KapanRouter:", toRouter > 0n ? "YES" : "NO");
  
  // The gateway borrows on behalf of user - check if gateway has approval
  // Actually, the delegation is from USER to the gateway that will call pool.borrow(user)
  console.log("\nDelegation amount to gateway:", ethers.formatEther(toGateway));
}

main().catch(console.error);
