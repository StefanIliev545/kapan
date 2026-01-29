const { ethers } = require("hardhat");
async function main() {
  const selector = "0x2c7ca6d7";
  const errors = [
    "error InterfaceNotSupported()",
    "error InvalidFallbackHandler()",
    "error ProofNotAuthed()",
    "error InvalidHandler()",
    "error NoInterface()"
  ];
  for (const err of errors) {
    const iface = new ethers.Interface([err]);
    const name = err.match(/error (\w+)/)[1];
    if (iface.getError(name).selector === selector) {
      console.log("Match:", err);
    }
  }
}
main();
