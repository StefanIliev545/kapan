const { ethers } = require("hardhat");

async function main() {
  const TX_HASH = "0x18959a5d1eb6d1edb6c0ca6904e78ee91360cbd845dbbeaba416018c4324a926";
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";

  const receipt = await ethers.provider.getTransactionReceipt(TX_HASH);
  console.log("Tx status:", receipt.status === 1 ? "✅ Success" : "❌ Failed");
  console.log("Logs count:", receipt.logs.length);
  
  for (let i = 0; i < receipt.logs.length; i++) {
    const log = receipt.logs[i];
    console.log(`\nLog ${i}:`);
    console.log("  address:", log.address);
    console.log("  topics[0]:", log.topics[0]);
    if (log.topics[1]) console.log("  topics[1]:", log.topics[1]);
    if (log.topics[2]) console.log("  topics[2]:", log.topics[2]);
  }
}

main().catch(console.error);
