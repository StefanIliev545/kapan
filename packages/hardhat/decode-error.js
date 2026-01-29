const { ethers } = require("hardhat");

async function main() {
  const errorData = "0x79ac63cd";
  
  // Common CoW errors
  const errors = [
    "error SingleOrderNotAuthed()",
    "error PollTryNextBlock(string)",
    "error PollNever(string)",
    "error OrderNotValid(string)",
    "error PollTryAtEpoch(uint256,string)",
    "error PollTryAtBlock(uint256,string)"
  ];
  
  for (const err of errors) {
    const iface = new ethers.Interface([err]);
    const selector = iface.getError(err.match(/error (\w+)/)[1]).selector;
    console.log(`${err}: ${selector}`);
    if (selector === errorData.slice(0, 10)) {
      console.log("  ✅ MATCH!");
    }
  }
}

main().catch(console.error);
