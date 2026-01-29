const { ethers } = require("hardhat");

async function main() {
  console.log("=== Verifying CoW Protocol Configuration ===\n");

  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";

  // Expected addresses (from CoW docs)
  const EXPECTED = {
    composableCoW: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74",
    settlement: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
    hooksTrampoline: "0x60Bf78233f48eC42eE3F101b9a05eC7878728006",
  };

  const manager = await ethers.getContractAt([
    "function composableCoW() view returns (address)",
    "function settlement() view returns (address)",
    "function hooksTrampoline() view returns (address)",
    "function router() view returns (address)",
  ], MANAGER);

  const composableCoW = await manager.composableCoW();
  const settlement = await manager.settlement();
  const hooksTrampoline = await manager.hooksTrampoline();
  const router = await manager.router();

  console.log("Manager:", MANAGER);
  console.log("");
  console.log("ComposableCoW:");
  console.log("  Deployed:", composableCoW);
  console.log("  Expected:", EXPECTED.composableCoW);
  console.log("  Match:", composableCoW.toLowerCase() === EXPECTED.composableCoW.toLowerCase() ? "✅" : "❌");
  console.log("");
  console.log("Settlement:");
  console.log("  Deployed:", settlement);
  console.log("  Expected:", EXPECTED.settlement);
  console.log("  Match:", settlement.toLowerCase() === EXPECTED.settlement.toLowerCase() ? "✅" : "❌");
  console.log("");
  console.log("HooksTrampoline:");
  console.log("  Deployed:", hooksTrampoline);
  console.log("  Expected:", EXPECTED.hooksTrampoline);
  console.log("  Match:", hooksTrampoline.toLowerCase() === EXPECTED.hooksTrampoline.toLowerCase() ? "✅" : "❌");
  console.log("");
  console.log("Router:", router);

  // Also check if manager is approved on router
  const routerContract = await ethers.getContractAt([
    "function approvedManagers(address) view returns (bool)"
  ], router);
  const isApproved = await routerContract.approvedManagers(MANAGER);
  console.log("Manager approved on router:", isApproved ? "✅" : "❌");

  // Check ComposableCoW extensible fallback handler setup
  console.log("\n=== ComposableCoW Verification ===");
  const cowContract = await ethers.getContractAt([
    "function domainSeparator() view returns (bytes32)"
  ], EXPECTED.composableCoW);

  try {
    const domainSep = await cowContract.domainSeparator();
    console.log("Domain separator:", domainSep);
  } catch (e) {
    console.log("Error getting domain separator:", e.message);
  }
}

main().catch(console.error);
