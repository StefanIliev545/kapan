import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  
  const adapter = await ethers.getContractAt("KapanCowAdapter", "0xeD5B2e95A7021b4DA7657104Ddce5BE759a728b5");
  console.log("Owner:", await adapter.owner());
  console.log("Is Morpho allowed:", await adapter.allowedLenders("0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"));
  console.log("Is Aave allowed:", await adapter.allowedLenders("0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"));
}

main().catch(console.error);
