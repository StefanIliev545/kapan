import { ethers } from "hardhat";

async function main() {
  const router = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";

  // Try different ABI signatures
  const signatures = [
    "flashLoanAndSettle((uint256,address,address,address)[],bytes)",
    "flashLoanAndSettle(tuple(uint256,address,address,address)[],bytes)",
    "flashLoanAndSettle(tuple(uint256 amount,address borrower,address lender,address token)[],bytes)",
  ];

  console.log("Checking function selectors:");
  for (const sig of signatures) {
    const selector = ethers.id(sig).slice(0, 10);
    console.log(`  ${sig}:`, selector);
  }

  // Try calling the router with different approaches
  const Router = await ethers.getContractAt(
    ["function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement)"],
    router
  );

  console.log("\nRouter interface:");
  console.log("  Functions:", Router.interface.fragments.map(f => f.format("full")));
}

main().catch(console.error);
