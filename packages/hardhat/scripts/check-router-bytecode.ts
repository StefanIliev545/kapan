import { ethers } from "hardhat";

async function main() {
  const flashLoanRouter = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";

  // Get bytecode
  const code = await ethers.provider.getCode(flashLoanRouter);
  console.log("FlashLoanRouter code length:", code.length);

  // Check for function selectors in the bytecode
  const selectors = {
    "0xe7c438c9": "flashLoanAndSettle((uint256,address,address,address)[],bytes)",
    "0x37af047a": "flashLoanAndSettle(tuple(...)[],...)",
    "0xd632fe9f": "settle()",
  };

  console.log("\nChecking selectors in bytecode:");
  for (const [sel, name] of Object.entries(selectors)) {
    const found = code.toLowerCase().includes(sel.slice(2).toLowerCase());
    console.log(`  ${sel} (${name}): ${found ? "FOUND" : "not found"}`);
  }

  // Try calling flashLoanAndSettle with empty data to see error
  console.log("\n--- Testing empty call ---");
  try {
    const FlashLoanRouter = await ethers.getContractAt(
      ["function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external"],
      flashLoanRouter
    );

    // Empty settlement - should definitely fail
    await FlashLoanRouter.flashLoanAndSettle.staticCall([], "0x");
    console.log("Empty call succeeded (unexpected)");
  } catch (e: unknown) {
    const err = e as Error & { reason?: string };
    console.log("Empty call error:", err.reason || err.message?.slice(0, 200));
  }

  // Try calling with valid settle selector
  console.log("\n--- Testing with settle() selector only ---");
  try {
    const FlashLoanRouter = await ethers.getContractAt(
      ["function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external"],
      flashLoanRouter
    );

    // Just the settle selector
    await FlashLoanRouter.flashLoanAndSettle.staticCall([], "0xd632fe9f");
    console.log("Selector-only call succeeded (unexpected)");
  } catch (e: unknown) {
    const err = e as Error & { reason?: string };
    console.log("Selector-only error:", err.reason || err.message?.slice(0, 200));
  }
}

main().catch(console.error);
