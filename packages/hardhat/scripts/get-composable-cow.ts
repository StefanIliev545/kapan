import { ethers } from "hardhat";

async function main() {
  const manager = await ethers.getContractAt(
    ["function composableCoW() view returns (address)"],
    "0x72Ee97f652D871F05532E8a08dEDD1d05016f592"
  );
  const composableCow = await manager.composableCoW();
  console.log("ComposableCoW:", composableCow);
}

main().catch(console.error);
