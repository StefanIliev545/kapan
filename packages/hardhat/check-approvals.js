const { ethers } = require("hardhat");

async function main() {
  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const VAULT_RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
  const SELL_TOKEN = "0x41CA7586cC1311807B4605fBB748a3B8862b42b5"; // syrupUSDC

  const token = await ethers.getContractAt("IERC20", SELL_TOKEN);

  const allowance = await token.allowance(MANAGER, VAULT_RELAYER);
  const balance = await token.balanceOf(MANAGER);

  console.log("=== VaultRelayer Approval Check ===");
  console.log("OrderManager:", MANAGER);
  console.log("VaultRelayer:", VAULT_RELAYER);
  console.log("Sell Token:", SELL_TOKEN);
  console.log("");
  console.log("Allowance to VaultRelayer:", ethers.formatUnits(allowance, 6));
  console.log("Manager balance:", ethers.formatUnits(balance, 6));

  if (allowance === 0n) {
    console.log("\n⚠️ No allowance! VaultRelayer can't pull tokens.");
    console.log("For flash loan orders, approval should happen in pre-hook.");
  }
}

main().catch(console.error);
