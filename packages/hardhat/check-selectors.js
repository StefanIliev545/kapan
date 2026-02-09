const { ethers } = require("hardhat");

async function main() {
  // Check function selectors
  const iface = new ethers.Interface([
    "function executePreInstructions(address user, bytes32 orderHash)",
    "function executePostInstructions(address user, bytes32 orderHash)",
    "function executePreInstructionsBySalt(address user, bytes32 salt)",
    "function executePostInstructionsBySalt(address user, bytes32 salt)"
  ]);
  
  console.log("Function selectors:");
  console.log("executePreInstructions(address,bytes32):", iface.getFunction("executePreInstructions").selector);
  console.log("executePostInstructions(address,bytes32):", iface.getFunction("executePostInstructions").selector);
  console.log("executePreInstructionsBySalt(address,bytes32):", iface.getFunction("executePreInstructionsBySalt").selector);
  console.log("executePostInstructionsBySalt(address,bytes32):", iface.getFunction("executePostInstructionsBySalt").selector);
  
  console.log("\nFrom appData:");
  console.log("Pre-hook selector:  0x8009fb6a");
  console.log("Post-hook selector: 0x2fbff5a4");
}

main().catch(console.error);
