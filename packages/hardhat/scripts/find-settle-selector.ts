import { ethers } from "hardhat";

async function main() {
  // Get the Settlement contract and find the settle() selector
  const settlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";

  const Settlement = await ethers.getContractAt(
    ["function settle(address[] tokens, uint256[] clearingPrices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions)"],
    settlement
  );

  console.log("Settlement contract functions:");
  for (const frag of Settlement.interface.fragments) {
    if (frag.type === "function") {
      console.log(`  ${frag.format("full")}`);
      console.log(`    Selector: ${Settlement.interface.getFunction(frag.name)?.selector}`);
    }
  }

  // Also try different settle() signature variations
  const signatures = [
    "settle(address[],uint256[],(uint256,uint256,address,uint256,uint256,uint32,bytes32,uint256,uint256,uint256,bytes)[],(address,uint256,bytes)[][3])",
    "settle(address[] tokens, uint256[] clearingPrices, (uint256,uint256,address,uint256,uint256,uint32,bytes32,uint256,uint256,uint256,bytes)[] trades, (address,uint256,bytes)[][3] interactions)",
  ];

  console.log("\nPossible settle() selectors:");
  for (const sig of signatures) {
    try {
      const selector = ethers.id(sig).slice(0, 10);
      console.log(`  ${sig.slice(0, 50)}...: ${selector}`);
    } catch {
      console.log(`  Failed to hash: ${sig.slice(0, 50)}...`);
    }
  }

  // Check the FlashLoanRouter bytecode for any 4-byte sequences that might be the expected selector
  const flashLoanRouter = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";
  const code = await ethers.provider.getCode(flashLoanRouter);

  // Look for the ICowSettlement interface in the bytecode
  // The selector should be encoded as a constant somewhere
  console.log("\nLooking for selector constants in FlashLoanRouter bytecode...");

  // Common 4-byte patterns that might be settle() related
  const patterns = [
    "13d79a0b", // settle() common variant
    "d632fe9f", // what we calculated
  ];

  for (const p of patterns) {
    if (code.toLowerCase().includes(p)) {
      console.log(`  0x${p}: FOUND in bytecode`);
    }
  }
}

main().catch(console.error);
