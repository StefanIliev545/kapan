import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  
  const aavePool = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  const weth = "0x4200000000000000000000000000000000000006";
  const borrower = "0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A";
  const flashLoanRouter = "0x9da8b48441583a2b93e2ef8213aad0ec0b392c69";
  const amount = ethers.parseEther("0.001539172580407967");
  
  // Impersonate solver and add to authenticator
  const authenticator = "0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE";
  const authManager = "0xA03be496e67Ec29bC62F01a428683D7F9c204930";
  
  await ethers.provider.send("hardhat_impersonateAccount", [authManager]);
  const managerSigner = await ethers.getSigner(authManager);
  await signer.sendTransaction({ to: authManager, value: ethers.parseEther("0.1") });
  
  const auth = new ethers.Contract(authenticator, [
    "function addSolver(address solver) external",
  ], managerSigner);
  await auth.addSolver(await signer.getAddress());
  console.log("Added solver:", await signer.getAddress());
  
  // Try flashLoanAndSettle with empty settlement
  const router = new ethers.Contract(flashLoanRouter, [
    "function flashLoanAndSettle((uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
  ], signer);
  
  // Minimal settle calldata (will fail but let's see where)
  const settlement = new ethers.Contract("0x9008D19f58AAbD9eD0D60971565AA8510560ab41", [
    "function settle(address[] calldata tokens, uint256[] calldata clearingPrices, (uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] memory trades, (address target, uint256 value, bytes callData)[][] calldata interactions) external",
  ], signer);
  
  const settleCalldata = settlement.interface.encodeFunctionData("settle", [
    [], [], [], [[], [], []]
  ]);
  console.log("Empty settle calldata:", settleCalldata.slice(0, 100));
  
  const loans = [{
    amount: amount,
    borrower: borrower,
    lender: aavePool,
    token: weth,
  }];
  
  console.log("\nCalling flashLoanAndSettle with empty settlement...");
  try {
    const tx = await router.flashLoanAndSettle(loans, settleCalldata, { gasLimit: 1000000 });
    const receipt = await tx.wait();
    console.log("Success! Gas:", receipt?.gasUsed?.toString());
  } catch (e: any) {
    console.log("Failed:", e.message?.slice(0, 500));
  }
}

main().catch(console.error);
