import { ethers } from "hardhat";

async function main() {
  // From the user's order
  const preHook1Calldata = "0x94eb5e6a000000000000000000000000dedb4d230d8b1e9268fd46779a8028d5daaa8fa3cf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f000000000000000000000000af88d065e77c8cc2239327c5edb3a432268e583100000000000000000000000072ee97f652d871f05532e8a08dedd1d05016f592";
  const preHook2Calldata = "0x8009fb6a000000000000000000000000dedb4d230d8b1e9268fd46779a8028d5daaa8fa3cf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";
  const postHookCalldata = "0x2fbff5a4000000000000000000000000dedb4d230d8b1e9268fd46779a8028d5daaa8fa3cf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";

  console.log("=== Decoding Hook Calldata ===\n");

  // Extract function selectors
  const preHook1Selector = preHook1Calldata.slice(0, 10);
  const preHook2Selector = preHook2Calldata.slice(0, 10);
  const postHookSelector = postHookCalldata.slice(0, 10);

  console.log("Pre-hook #1 selector:", preHook1Selector);
  console.log("Pre-hook #2 selector:", preHook2Selector);
  console.log("Post-hook selector:", postHookSelector);

  // Check against known functions
  const knownFunctions: Record<string, string> = {
    "0x94eb5e6a": "fundOrderWithBalance(address,bytes32,address,address)",
    "0x8009fb6a": "executePreHookBySalt(address,bytes32)",
    "0x2fbff5a4": "executePostHookBySalt(address,bytes32)",
    "0xe00e9af0": "fundOrderBySalt(address,bytes32,address,address,uint256)",
    "0x12424e3f": "executePreHook(bytes32)",
    "0x4ee9dc1b": "executePostHook(bytes32)",
  };

  console.log("\n--- Decoded Functions ---");
  console.log("Pre-hook #1:", knownFunctions[preHook1Selector] || "UNKNOWN");
  console.log("Pre-hook #2:", knownFunctions[preHook2Selector] || "UNKNOWN");
  console.log("Post-hook:", knownFunctions[postHookSelector] || "UNKNOWN");

  // Decode parameters
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  console.log("\n--- Pre-hook #1 Parameters ---");
  try {
    const params = abiCoder.decode(
      ["address", "bytes32", "address", "address"],
      "0x" + preHook1Calldata.slice(10)
    );
    console.log("  user:", params[0]);
    console.log("  salt:", params[1]);
    console.log("  token:", params[2]);
    console.log("  recipient:", params[3]);
  } catch {
    console.log("  Failed to decode");
  }

  console.log("\n--- Pre-hook #2 Parameters ---");
  try {
    const params = abiCoder.decode(
      ["address", "bytes32"],
      "0x" + preHook2Calldata.slice(10)
    );
    console.log("  user:", params[0]);
    console.log("  salt:", params[1]);
  } catch {
    console.log("  Failed to decode");
  }

  console.log("\n--- Post-hook Parameters ---");
  try {
    const params = abiCoder.decode(
      ["address", "bytes32"],
      "0x" + postHookCalldata.slice(10)
    );
    console.log("  user:", params[0]);
    console.log("  salt:", params[1]);
  } catch {
    console.log("  Failed to decode");
  }

  // Check if these functions exist on the contracts
  console.log("\n--- Verifying Functions Exist ---");

  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";

  // Check adapter
  const adapterCode = await ethers.provider.getCode(adapter);
  const hasPreHook1 = adapterCode.toLowerCase().includes(preHook1Selector.slice(2).toLowerCase());
  console.log("Adapter has fundOrderWithBalance:", hasPreHook1 ? "✓" : "✗");

  // Check manager for pre-hook and post-hook
  const managerCode = await ethers.provider.getCode(manager);
  const hasPreHook2 = managerCode.toLowerCase().includes(preHook2Selector.slice(2).toLowerCase());
  const hasPostHook = managerCode.toLowerCase().includes(postHookSelector.slice(2).toLowerCase());
  console.log("Manager has executePreHookBySalt:", hasPreHook2 ? "✓" : "✗");
  console.log("Manager has executePostHookBySalt:", hasPostHook ? "✓" : "✗");

  // Now let's compare with old manager
  console.log("\n--- Comparing with OLD Manager ---");
  const oldManager = "0xcd6D34D3d4C3636b59AB4B611BBF5D1f2102D886";

  // Check what functions the old manager has
  const oldManagerCode = await ethers.provider.getCode(oldManager);
  const oldHasPreHook = oldManagerCode.toLowerCase().includes("12424e3f"); // executePreHook(bytes32)
  const oldHasPostHook = oldManagerCode.toLowerCase().includes("4ee9dc1b"); // executePostHook(bytes32)
  const oldHasBySalt = oldManagerCode.toLowerCase().includes("8009fb6a"); // executePreHookBySalt

  console.log("OLD Manager has executePreHook(bytes32):", oldHasPreHook ? "✓" : "✗");
  console.log("OLD Manager has executePostHook(bytes32):", oldHasPostHook ? "✓" : "✗");
  console.log("OLD Manager has executePreHookBySalt:", oldHasBySalt ? "✓" : "✗");
}

main().catch(console.error);
