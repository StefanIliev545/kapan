import { ethers } from "hardhat";

async function main() {
  const FLASH_LOAN_ROUTER = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";
  const ERC3156_BORROWER = "0x47d71b4B3336AB2729436186C216955F3C27cD04";
  const SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  
  const routerCode = await ethers.provider.getCode(FLASH_LOAN_ROUTER);
  const borrowerCode = await ethers.provider.getCode(ERC3156_BORROWER);
  const settlementCode = await ethers.provider.getCode(SETTLEMENT);
  
  console.log("FlashLoanRouter code length:", routerCode.length);
  console.log("ERC3156Borrower code length:", borrowerCode.length);
  console.log("Settlement code length:", settlementCode.length);
  
  if (routerCode.length > 2) {
    console.log("\n✓ FlashLoanRouter is deployed");
  } else {
    console.log("\n✗ FlashLoanRouter NOT deployed");
  }
  
  if (borrowerCode.length > 2) {
    console.log("✓ ERC3156Borrower is deployed");
  } else {
    console.log("✗ ERC3156Borrower NOT deployed");
  }
}

main().catch(console.error);
