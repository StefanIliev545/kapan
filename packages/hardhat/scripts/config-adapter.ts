import { ethers } from "hardhat";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  
  const adapter = await ethers.getContractAt("KapanCowAdapter", "0xeD5B2e95A7021b4DA7657104Ddce5BE759a728b5");
  const owner = await adapter.owner();
  console.log("Owner:", owner);
  console.log("Is signer the owner?", signer.address.toLowerCase() === owner.toLowerCase());
  
  // Try a static call first to see error
  try {
    await adapter.setMorphoLender.staticCall("0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", true);
    console.log("Static call succeeded!");
  } catch (e: any) {
    console.log("Static call failed:", e.message);
  }
  
  // Estimate gas
  try {
    const gas = await adapter.setMorphoLender.estimateGas("0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", true);
    console.log("Estimated gas:", gas.toString());
  } catch (e: any) {
    console.log("Gas estimation failed:", e.message);
  }
}

main().catch(console.error);
