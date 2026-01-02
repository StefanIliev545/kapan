import { ethers } from "hardhat";

async function main() {
  const wethAddress = "0x4200000000000000000000000000000000000006";
  const targetAddress = "0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A"; // AaveBorrower
  
  // Try different storage slots for balanceOf mapping
  for (let slot = 0; slot <= 10; slot++) {
    const slotHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"],
        [targetAddress, slot]
      )
    );
    
    const value = await ethers.provider.getStorage(wethAddress, slotHash);
    console.log(`Slot ${slot}: ${value}`);
    
    if (value !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(`  -> Found non-zero at slot ${slot}`);
    }
  }
}

main().catch(console.error);
