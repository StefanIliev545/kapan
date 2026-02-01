import { ethers, network } from "hardhat";

/**
 * Trace flash loan flow by testing each step individually
 */
async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const salt = "0xcf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";
  const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
  const flashLoanRouter = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";
  const settlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

  console.log("=== Trace Flash Loan Flow ===\n");

  const [deployer] = await ethers.getSigners();
  const USDC_Contract = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)"],
    USDC
  );

  // Step 1: Test that we can call flashLoanAndCallBack on the adapter
  console.log("--- Step 1: Test adapter.flashLoanAndCallBack ---");

  // We need to impersonate the FlashLoanRouter to call flashLoanAndCallBack
  await network.provider.send("hardhat_impersonateAccount", [flashLoanRouter]);
  await network.provider.send("hardhat_setBalance", [flashLoanRouter, "0x56BC75E2D63100000"]);
  const routerSigner = await ethers.getSigner(flashLoanRouter);

  const Adapter = await ethers.getContractAt(
    ["function flashLoanAndCallBack(address lender, address token, uint256 amount, bytes calldata callbackData) external"],
    adapter,
    routerSigner
  );

  // Build a simple callback data - just the settlement calldata that calls settle with no trades
  const Settlement = await ethers.getContractAt(
    ["function settle(address[] tokens, uint256[] clearingPrices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions)"],
    settlement
  );

  // Empty settlement (no trades, no hooks)
  const emptySettlementCalldata = Settlement.interface.encodeFunctionData("settle", [
    [USDC],
    [1n],
    [],
    [[], [], []]
  ]);

  console.log("Empty settlement calldata length:", emptySettlementCalldata.length);

  // The FlashLoanRouter passes the settlement bytes directly as callbackData
  // When borrowerCallBack is called, it uses this to call settle()

  try {
    console.log("\nAttempting adapter.flashLoanAndCallBack...");
    console.log("  Lender:", morpho);
    console.log("  Token:", USDC);
    console.log("  Amount: 100 USDC");

    await Adapter.flashLoanAndCallBack(
      morpho,
      USDC,
      100_000000n,
      emptySettlementCalldata, // This is what gets passed to borrowerCallBack
      { gasLimit: 5000000 }
    );

    console.log("✓ flashLoanAndCallBack succeeded!");
    console.log("  Adapter USDC after:", ethers.formatUnits(await USDC_Contract.balanceOf(adapter), 6));
  } catch (e) {
    console.log("✗ flashLoanAndCallBack FAILED!");
    console.log("  Error:", (e as Error).message?.slice(0, 500));
  }

  await network.provider.send("hardhat_stopImpersonatingAccount", [flashLoanRouter]);

  // Step 2: Test Morpho flash loan directly
  console.log("\n--- Step 2: Test Morpho flash loan directly ---");

  const Morpho = await ethers.getContractAt(
    ["function flashLoan(address token, uint256 assets, bytes calldata data) external"],
    morpho
  );

  // Impersonate the adapter to test if it can request a flash loan from Morpho
  await network.provider.send("hardhat_impersonateAccount", [adapter]);
  await network.provider.send("hardhat_setBalance", [adapter, "0x56BC75E2D63100000"]);
  const adapterSigner = await ethers.getSigner(adapter);

  console.log("Morpho USDC before:", ethers.formatUnits(await USDC_Contract.balanceOf(morpho), 6));
  console.log("Adapter USDC before:", ethers.formatUnits(await USDC_Contract.balanceOf(adapter), 6));

  try {
    // Note: This will fail because the adapter's onMorphoFlashLoan will fail
    // since _currentLender is not set (we're calling Morpho directly, not through the proper flow)
    console.log("\nAttempting Morpho.flashLoan...");
    await Morpho.connect(adapterSigner).flashLoan(
      USDC,
      100_000000n,
      ethers.toUtf8Bytes("test"), // arbitrary data
      { gasLimit: 5000000 }
    );
    console.log("✓ Morpho.flashLoan succeeded (unexpected)");
  } catch (e) {
    console.log("✗ Morpho.flashLoan FAILED (expected - _currentLender not set)");
    const errMsg = (e as Error).message || "";
    if (errMsg.includes("UnauthorizedCaller")) {
      console.log("  Error: UnauthorizedCaller - this is expected because _currentLender is not set");
    } else {
      console.log("  Error:", errMsg.slice(0, 300));
    }
  }

  await network.provider.send("hardhat_stopImpersonatingAccount", [adapter]);

  // Step 3: Check what functions the FlashLoanRouter actually has
  console.log("\n--- Step 3: Check FlashLoanRouter interface ---");

  const routerCode = await ethers.provider.getCode(flashLoanRouter);
  console.log("FlashLoanRouter code length:", routerCode.length);

  // Check for known function selectors
  const selectors = {
    "e7c438c9": "flashLoanAndSettle((uint256,address,address,address)[],bytes)",
    "3cd47d3f": "borrowerCallBack(bytes)",
    "d632fe9f": "settle(...)",
    "13d79a0b": "settle(full signature)",
  };

  console.log("Checking for function selectors in bytecode:");
  for (const [sel, name] of Object.entries(selectors)) {
    const found = routerCode.toLowerCase().includes(sel.toLowerCase());
    console.log(`  0x${sel} (${name}): ${found ? "FOUND" : "not found"}`);
  }

  // Step 4: Check if the adapter is pointing to the correct router
  console.log("\n--- Step 4: Verify adapter → router connection ---");

  const AdapterCheck = await ethers.getContractAt(
    ["function router() view returns (address)",
     "function getRouter() view returns (address)"],
    adapter
  );

  const adapterRouter = await AdapterCheck.router();
  const adapterGetRouter = await AdapterCheck.getRouter();
  console.log("adapter.router():", adapterRouter);
  console.log("adapter.getRouter():", adapterGetRouter);
  console.log("Expected FlashLoanRouter:", flashLoanRouter);
  console.log("Match:", adapterRouter.toLowerCase() === flashLoanRouter.toLowerCase() ? "✓" : "✗");

  // Step 5: Check the FlashLoanRouter's settlement contract
  console.log("\n--- Step 5: Verify router → settlement connection ---");

  const FlashLoanRouterCheck = await ethers.getContractAt(
    ["function settlementContract() view returns (address)"],
    flashLoanRouter
  );

  const routerSettlement = await FlashLoanRouterCheck.settlementContract();
  console.log("FlashLoanRouter.settlementContract():", routerSettlement);
  console.log("Expected Settlement:", settlement);
  console.log("Match:", routerSettlement.toLowerCase() === settlement.toLowerCase() ? "✓" : "✗");
}

main().catch(console.error);
