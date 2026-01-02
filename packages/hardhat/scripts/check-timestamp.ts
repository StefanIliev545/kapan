import { ethers } from "hardhat";

async function main() {
  const block = await ethers.provider.getBlock("latest");
  console.log("Block number:", block?.number);
  console.log("Block timestamp:", block?.timestamp);
  console.log("Block time:", new Date((block?.timestamp || 0) * 1000).toISOString());
  
  // Order validTo
  const validTo = 1767310762;
  console.log("\nOrder validTo:", validTo);
  console.log("Order expires:", new Date(validTo * 1000).toISOString());
  
  console.log("\nTime diff:", validTo - (block?.timestamp || 0), "seconds");
  console.log("Order valid:", (block?.timestamp || 0) < validTo);
}

main().catch(console.error);
