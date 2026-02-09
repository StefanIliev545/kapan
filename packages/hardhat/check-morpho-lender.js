const { ethers } = require("hardhat");

async function main() {
  const adapter = await ethers.getContractAt([
    "function allowedLenders(address) view returns (bool)",
    "function lenderTypes(address) view returns (uint8)"
  ], "0x069C09160F11c2F26Faeca3ea91aa5ae639092a5");

  const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

  console.log("Morpho Blue:", morpho);
  console.log("Allowed:", await adapter.allowedLenders(morpho));
  console.log("Type:", await adapter.lenderTypes(morpho), "(0=Unknown, 1=Aave, 2=Morpho, 3=BalancerV2, 4=BalancerV3)");
}

main().catch(console.error);
