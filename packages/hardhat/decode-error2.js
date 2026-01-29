const { ethers } = require("hardhat");

async function main() {
  const errorData = "0x79ac63cd";
  
  // More errors including from ComposableCoW
  const errors = [
    "error InterfaceNotSupported()",
    "error InvalidHandler()",
    "error InvalidFallbackHandler()",
    "error ProofNotAuthed()",
    "error OrderNotAuthed()",
    "error NoInterface()"
  ];
  
  for (const err of errors) {
    const iface = new ethers.Interface([err]);
    const errName = err.match(/error (\w+)/)[1];
    const selector = iface.getError(errName).selector;
    console.log(`${err}: ${selector}`);
    if (selector === errorData.slice(0, 10)) {
      console.log("  ✅ MATCH!");
    }
  }

  // Try brute force some common error names
  const commonNames = [
    "NotAuthorized", "Unauthorized", "InvalidSignature", "NotHandler", 
    "InvalidOwner", "NoOrder", "OrderNotActive", "HandlerNotSet"
  ];
  for (const name of commonNames) {
    try {
      const iface = new ethers.Interface([`error ${name}()`]);
      const selector = iface.getError(name).selector;
      console.log(`error ${name}(): ${selector}`);
      if (selector === errorData.slice(0, 10)) {
        console.log("  ✅ MATCH!");
      }
    } catch {}
  }
}

main().catch(console.error);
