const { ethers } = require("hardhat");
async function main() {
  const txHash = "0xcb7e8725667f8bcf504fd968fe77c736c70b6c7d8b62286372d887d21dee9e3e";
  
  const tx = await ethers.provider.getTransaction(txHash);
  const receipt = await ethers.provider.getTransactionReceipt(txHash);
  
  console.log("=== Transaction ===");
  console.log("From:", tx.from);
  console.log("To:", tx.to);
  console.log("Value:", tx.value.toString());
  
  console.log("\n=== Receipt ===");
  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "REVERTED");
  console.log("Gas used:", receipt.gasUsed.toString());
  console.log("Logs:", receipt.logs.length);
  
  console.log("\n=== Events ===");
  for (const log of receipt.logs) {
    console.log("\nContract:", log.address);
    console.log("Topics:", log.topics.length);
    for (let i = 0; i < log.topics.length; i++) {
      console.log("  [" + i + "]:", log.topics[i]);
    }
    const dataPreview = log.data ? log.data.substring(0, 130) : "0x";
    console.log("Data:", dataPreview + (log.data && log.data.length > 130 ? "..." : ""));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
