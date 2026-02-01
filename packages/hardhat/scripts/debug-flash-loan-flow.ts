import { ethers, network } from "hardhat";

/**
 * Debug script to trace the flash loan flow step by step
 */
async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const salt = "0xcf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";
  const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
  const flashLoanRouter = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";
  const settlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  const hooksTrampoline = "0x60Bf78233f48eC42eE3F101b9a05eC7878728006";
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

  console.log("=== Debug Flash Loan Flow ===\n");

  const [deployer] = await ethers.getSigners();
  const USDC_Contract = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)",
     "function transfer(address to, uint256 amount) returns (bool)"],
    USDC
  );

  // Test 1: Can HooksTrampoline call the production adapter?
  console.log("--- Test 1: HooksTrampoline → Adapter ---");

  // Fund adapter with some USDC to test the transfer
  const usdcWhale = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";
  await network.provider.send("hardhat_impersonateAccount", [usdcWhale]);
  await network.provider.send("hardhat_setBalance", [usdcWhale, "0x56BC75E2D63100000"]);
  const whaleSigner = await ethers.getSigner(usdcWhale);

  await USDC_Contract.connect(whaleSigner).transfer(adapter, 100_000000n);
  const adapterBalBefore = await USDC_Contract.balanceOf(adapter);
  console.log("Funded adapter with 100 USDC. Balance:", ethers.formatUnits(adapterBalBefore, 6));

  // Impersonate Settlement to call HooksTrampoline
  await network.provider.send("hardhat_impersonateAccount", [settlement]);
  await network.provider.send("hardhat_setBalance", [settlement, "0x56BC75E2D63100000"]);
  const settlementSigner = await ethers.getSigner(settlement);

  const HooksTrampoline = await ethers.getContractAt(
    ["function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks)"],
    hooksTrampoline,
    settlementSigner
  );

  const ADAPTER_IFACE = new ethers.Interface([
    "function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient)"
  ]);

  const fundCalldata = ADAPTER_IFACE.encodeFunctionData("fundOrderWithBalance", [
    user, salt, USDC, manager
  ]);

  try {
    await HooksTrampoline.execute([{
      target: adapter,
      callData: fundCalldata,
      gasLimit: 500000n
    }]);
    const adapterBalAfter = await USDC_Contract.balanceOf(adapter);
    const managerBal = await USDC_Contract.balanceOf(manager);
    console.log("✓ HooksTrampoline.execute succeeded!");
    console.log("  Adapter USDC after:", ethers.formatUnits(adapterBalAfter, 6));
    console.log("  Manager USDC after:", ethers.formatUnits(managerBal, 6));
  } catch (e) {
    console.log("✗ HooksTrampoline.execute FAILED:", (e as Error).message);
  }

  await network.provider.send("hardhat_stopImpersonatingAccount", [settlement]);
  await network.provider.send("hardhat_stopImpersonatingAccount", [usdcWhale]);

  // Test 2: Does the FlashLoanRouter call adapter.flashLoanAndCallBack correctly?
  console.log("\n--- Test 2: FlashLoanRouter → Adapter ---");

  // Check adapter's configuration
  const Adapter = await ethers.getContractAt(
    ["function allowedLenders(address) view returns (bool)",
     "function lenderTypes(address) view returns (uint8)",
     "function router() view returns (address)",
     "function settlementContract() view returns (address)"],
    adapter
  );

  const morphoAllowed = await Adapter.allowedLenders(morpho);
  const morphoType = await Adapter.lenderTypes(morpho);
  const adapterRouter = await Adapter.router();
  const adapterSettlement = await Adapter.settlementContract();

  console.log("Adapter config:");
  console.log("  Morpho allowed:", morphoAllowed);
  console.log("  Morpho type:", morphoType.toString(), "(2=Morpho)");
  console.log("  Router:", adapterRouter);
  console.log("  Settlement:", adapterSettlement);
  console.log("  Expected router:", flashLoanRouter);
  console.log("  Expected settlement:", settlement);

  if (adapterRouter.toLowerCase() !== flashLoanRouter.toLowerCase()) {
    console.log("\n⚠️ MISMATCH: Adapter router doesn't match FlashLoanRouter!");
  }
  if (adapterSettlement.toLowerCase() !== settlement.toLowerCase()) {
    console.log("\n⚠️ MISMATCH: Adapter settlement doesn't match Settlement contract!");
  }

  // Test 3: Can the FlashLoanRouter actually trigger the adapter?
  console.log("\n--- Test 3: Test borrowerCallBack flow ---");

  // Check what the FlashLoanRouter expects
  const FlashLoanRouter = await ethers.getContractAt(
    ["function settlementContract() view returns (address)"],
    flashLoanRouter
  );

  const routerSettlement = await FlashLoanRouter.settlementContract();
  console.log("FlashLoanRouter.settlementContract():", routerSettlement);
  console.log("Expected:", settlement);

  if (routerSettlement.toLowerCase() !== settlement.toLowerCase()) {
    console.log("\n⚠️ MISMATCH: FlashLoanRouter settlement doesn't match!");
  }

  // Test 4: Check if the adapter's onMorphoFlashLoan can be called
  console.log("\n--- Test 4: Test Morpho flash loan callback ---");

  // Impersonate Morpho to simulate what happens during a flash loan
  await network.provider.send("hardhat_impersonateAccount", [morpho]);
  await network.provider.send("hardhat_setBalance", [morpho, "0x56BC75E2D63100000"]);
  await ethers.getSigner(morpho); // Just to verify impersonation works

  // First, we need to set the adapter's _currentLender to morpho
  // This normally happens in flashLoanAndCallBack, which is called by the router
  // Since we can't directly set the private variable, we need to trace through the actual flow

  console.log("Note: Cannot directly test onMorphoFlashLoan without going through the full flow");
  console.log("The adapter sets _currentLender in flashLoanAndCallBack before calling Morpho");

  await network.provider.send("hardhat_stopImpersonatingAccount", [morpho]);

  // Test 5: Verify the full flow with a minimal settlement
  console.log("\n--- Test 5: Minimal flashLoanAndSettle test ---");

  // Build a minimal settlement that just does the pre-hooks (no trade)
  const Settlement = await ethers.getContractAt(
    ["function settle(address[] tokens, uint256[] clearingPrices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions)"],
    settlement
  );

  const HOOKS_IFACE = new ethers.Interface([
    "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks)"
  ]);

  // Build a pre-hook that just calls fundOrderWithBalance
  const preHook = HOOKS_IFACE.encodeFunctionData("execute", [[
    { target: adapter, callData: fundCalldata, gasLimit: 500000n }
  ]]);

  // Empty settlement with just pre-hook (no trades)
  const emptySettlementCalldata = Settlement.interface.encodeFunctionData("settle", [
    [USDC], // tokens
    [1n],   // clearing prices
    [],     // no trades
    [[{ target: hooksTrampoline, value: 0n, callData: preHook }], [], []] // just pre-hook
  ]);

  console.log("Settlement calldata length:", emptySettlementCalldata.length);
  console.log("Settlement selector:", emptySettlementCalldata.slice(0, 10));

  // Try calling flashLoanAndSettle with the minimal settlement
  const FlashLoanRouterFull = await ethers.getContractAt(
    ["function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external"],
    flashLoanRouter
  );

  // Become a solver
  const authenticator = "0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE";
  const Authenticator = await ethers.getContractAt(
    ["function addSolver(address solver)", "function manager() view returns (address)"],
    authenticator
  );
  const authManager = await Authenticator.manager();
  await network.provider.send("hardhat_impersonateAccount", [authManager]);
  await network.provider.send("hardhat_setBalance", [authManager, "0x56BC75E2D63100000"]);
  const authSigner = await ethers.getSigner(authManager);
  await Authenticator.connect(authSigner).addSolver(await deployer.getAddress());
  await network.provider.send("hardhat_stopImpersonatingAccount", [authManager]);

  const loans = [{
    amount: 100_000000n, // 100 USDC
    borrower: adapter,
    lender: morpho,
    token: USDC
  }];

  console.log("\nCalling flashLoanAndSettle with minimal settlement (no trades)...");
  try {
    const tx = await FlashLoanRouterFull.connect(deployer).flashLoanAndSettle(
      loans,
      emptySettlementCalldata,
      { gasLimit: 5000000 }
    );
    const receipt = await tx.wait();
    console.log("✓ Minimal flashLoanAndSettle succeeded!");
    console.log("  Gas used:", receipt?.gasUsed.toString());

    // Check balances
    const adapterBal = await USDC_Contract.balanceOf(adapter);
    const managerBal = await USDC_Contract.balanceOf(manager);
    console.log("  Adapter USDC:", ethers.formatUnits(adapterBal, 6));
    console.log("  Manager USDC:", ethers.formatUnits(managerBal, 6));
  } catch (e) {
    console.log("✗ Minimal flashLoanAndSettle FAILED!");
    console.log("  Error:", (e as Error).message?.slice(0, 300));
  }
}

main().catch(console.error);
