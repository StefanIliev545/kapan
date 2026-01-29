const { ethers } = require("hardhat");

async function main() {
  // From the browser logs
  const preHook1 = "0x8e1f9b07000000000000000000000000dedb4d230d8b1e9268fd46779a8028d5daaa8fa37fb9500edd470124185c5f7fe19589a01001d0fe14e060edb168e9d1c927705c00000000000000000000000041ca7586cc1311807b4605fbb748a3b8862b42b500000000000000000000000034cf47e892e8cf68ecace7268407952904289b43000000000000000000000000000000000000000000000000000000001e86ab0a";
  const preHook2 = "0x8009fb6a000000000000000000000000dedb4d230d8b1e9268fd46779a8028d5daaa8fa37fb9500edd470124185c5f7fe19589a01001d0fe14e060edb168e9d1c927705c";
  const postHook = "0x2fbff5a4000000000000000000000000dedb4d230d8b1e9268fd46779a8028d5daaa8fa37fb9500edd470124185c5f7fe19589a01001d0fe14e060edb168e9d1c927705c";
  
  // Expected values from tx
  const USER_SALT = "0x7fb9500edd470124185c5f7fe19589a01001d0fe14e060edb168e9d1c927705c";
  const ORDER_HASH = "0x1ab3c9222b76ecd22e07ae76b4786a5a9826a6200fe96e091447c380b856d867";
  
  console.log("=== Decoding AppData Hook Calldata ===\n");
  console.log("User Salt (from createOrder):", USER_SALT);
  console.log("Order Hash (from OrderCreated event):", ORDER_HASH);
  
  // Decode pre-hook 1: fundOrderBySalt(address user, bytes32 salt, address token, address recipient, uint256 amount)
  const adapterIface = new ethers.Interface([
    "function fundOrderBySalt(address user, bytes32 salt, address token, address recipient, uint256 amount)"
  ]);
  
  console.log("\n--- Pre-hook 1 (fundOrderBySalt on Adapter) ---");
  try {
    const decoded1 = adapterIface.decodeFunctionData("fundOrderBySalt", preHook1);
    console.log("user:", decoded1[0]);
    console.log("salt:", decoded1[1]);
    console.log("token:", decoded1[2]);
    console.log("recipient:", decoded1[3]);
    console.log("amount:", decoded1[4].toString());
    console.log("Salt matches USER_SALT:", decoded1[1].toLowerCase() === USER_SALT.toLowerCase() ? "✅" : "❌");
  } catch (e) {
    console.log("Failed to decode:", e.message);
  }
  
  // Decode pre-hook 2: executePreInstructions(address user, bytes32 orderHash)
  const managerIface = new ethers.Interface([
    "function executePreInstructions(address user, bytes32 orderHash)",
    "function executePostInstructions(address user, bytes32 orderHash)"
  ]);
  
  console.log("\n--- Pre-hook 2 (executePreInstructions on Manager) ---");
  try {
    const decoded2 = managerIface.decodeFunctionData("executePreInstructions", preHook2);
    console.log("user:", decoded2[0]);
    console.log("orderHash param:", decoded2[1]);
    console.log("Matches USER_SALT:", decoded2[1].toLowerCase() === USER_SALT.toLowerCase() ? "✅ (WRONG!)" : "❌");
    console.log("Matches ORDER_HASH:", decoded2[1].toLowerCase() === ORDER_HASH.toLowerCase() ? "✅" : "❌ (SHOULD MATCH!)");
  } catch (e) {
    console.log("Failed to decode:", e.message);
  }
  
  console.log("\n--- Post-hook (executePostInstructions on Manager) ---");
  try {
    const decoded3 = managerIface.decodeFunctionData("executePostInstructions", postHook);
    console.log("user:", decoded3[0]);
    console.log("orderHash param:", decoded3[1]);
    console.log("Matches USER_SALT:", decoded3[1].toLowerCase() === USER_SALT.toLowerCase() ? "✅ (WRONG!)" : "❌");
    console.log("Matches ORDER_HASH:", decoded3[1].toLowerCase() === ORDER_HASH.toLowerCase() ? "✅" : "❌ (SHOULD MATCH!)");
  } catch (e) {
    console.log("Failed to decode:", e.message);
  }
  
  console.log("\n=== ISSUE IDENTIFIED ===");
  console.log("The hooks are using USER_SALT instead of ORDER_HASH!");
  console.log("executePreInstructions and executePostInstructions need the ORDER_HASH,");
  console.log("but the appData was built BEFORE createOrder returned the orderHash.");
}

main().catch(console.error);
