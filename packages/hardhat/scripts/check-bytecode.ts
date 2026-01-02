import { ethers, network } from "hardhat";

async function main() {
  // Force real Base RPC
  const provider = new ethers.JsonRpcProvider("https://base-mainnet.g.alchemy.com/v2/WwB3Y-BmMbpR-5nIl-zWBD0TxQbW0T_O");
  
  const code = await provider.getCode("0xeD5B2e95A7021b4DA7657104Ddce5BE759a728b5");
  console.log("Code length:", code.length);
  console.log("Has setMorphoLender sig (e1a3503b)?", code.includes("e1a3503b"));
  console.log("Has setAaveLender sig?", code.includes("a1bc9e70")); // Guessing the sig
}

main().catch(console.error);
