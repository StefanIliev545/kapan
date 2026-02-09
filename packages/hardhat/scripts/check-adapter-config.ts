import { ethers } from "hardhat";

async function main() {
  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
  const flashLoanRouter = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";

  console.log("=== Checking KapanCowAdapter Configuration ===\n");

  const Adapter = await ethers.getContractAt(
    ["function router() view returns (address)",
     "function settlementContract() view returns (address)",
     "function allowedLenders(address) view returns (bool)",
     "function lenderTypes(address) view returns (uint8)"],
    adapter
  );

  const router = await Adapter.router();
  const settlement = await Adapter.settlementContract();
  const morphoAllowed = await Adapter.allowedLenders(morpho);
  const morphoType = await Adapter.lenderTypes(morpho);

  console.log("Adapter configuration:");
  console.log("  Router (FlashLoanRouter):", router);
  console.log("  Expected router:         ", flashLoanRouter);
  console.log("  Router matches:", router.toLowerCase() === flashLoanRouter.toLowerCase() ? "✓" : "✗ MISMATCH!");
  console.log("");
  console.log("  Settlement:", settlement);
  console.log("");
  console.log("Morpho lender configuration:");
  console.log("  Morpho address:", morpho);
  console.log("  Is allowed:", morphoAllowed ? "✓" : "✗ NOT ALLOWED!");
  console.log("  Lender type:", morphoType, "(2 = Morpho)");

  // Check if adapter can receive flash loan callback
  console.log("\n=== Testing Flash Loan Flow Simulation ===");

  // Get FlashLoanRouter interface
  const Router = await ethers.getContractAt(
    ["function settlementContract() view returns (address)"],
    router
  );

  const routerSettlement = await Router.settlementContract();
  console.log("FlashLoanRouter's settlement:", routerSettlement);

  // Check if the order's appData flashloan metadata matches expected format
  console.log("\n=== Order AppData Flash Loan Metadata ===");
  console.log("Expected for solver to use FlashLoanRouter:");
  console.log("  liquidityProvider (lender):", morpho);
  console.log("  protocolAdapter (borrower):", adapter);
  console.log("  receiver:", adapter, "(funds go here first)");
  console.log("");
  console.log("The solver should call:");
  console.log("  FlashLoanRouter.flashLoanAndSettle(...)");
  console.log("NOT the standard:");
  console.log("  Settlement.settle(...)");
}

main().catch(console.error);
