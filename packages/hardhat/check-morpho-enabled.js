const { ethers } = require("hardhat");

const ADAPTER = "0x86a79fe057FfF0f288aDbfDcc607243fa210bCA9";
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

async function main() {
  const adapter = await ethers.getContractAt(
    ["function approvedMorphoLenders(address) external view returns (bool)"],
    ADAPTER
  );
  
  const isEnabled = await adapter.approvedMorphoLenders(MORPHO_BLUE);
  
  console.log("KapanCowAdapter:", ADAPTER);
  console.log("Morpho Blue:", MORPHO_BLUE);
  console.log("Morpho enabled as lender:", isEnabled);
}

main().catch(console.error);
