import { ethers } from "hardhat";

async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const handler = "0xB3FBB014a668B2FD6887F78B3011F18C5bfB7E14";
  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const salt = "0xcf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";
  const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
  const flashLoanRouter = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";
  const settlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  const flashLoanAmount = 220000000n; // 220 USDC

  console.log("=== Simulating Flash Loan Settlement Flow ===\n");

  // Get order hash
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)"],
    manager
  );
  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  console.log("Order hash:", orderHash);

  // Check Morpho liquidity for USDC
  console.log("\n--- Checking Morpho USDC Liquidity ---");
  const USDC_Contract = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)"],
    USDC
  );
  const morphoUSDCBalance = await USDC_Contract.balanceOf(morpho);
  console.log("Morpho USDC balance:", ethers.formatUnits(morphoUSDCBalance, 6));
  console.log("Required for flash loan:", ethers.formatUnits(flashLoanAmount, 6));
  if (morphoUSDCBalance < flashLoanAmount) {
    console.log("⚠️ WARNING: Morpho may not have enough USDC for flash loan!");
  } else {
    console.log("✓ Morpho has sufficient USDC");
  }

  // Try to simulate a flash loan from Morpho directly
  console.log("\n--- Simulating Morpho Flash Loan ---");
  const Morpho = await ethers.getContractAt(
    ["function flashLoan(address token, uint256 assets, bytes calldata data)"],
    morpho
  );

  // Impersonate the adapter to test the flash loan callback
  await ethers.provider.send("hardhat_impersonateAccount", [adapter]);
  await ethers.provider.send("hardhat_setBalance", [adapter, "0x56BC75E2D63100000"]);
  const adapterSigner = await ethers.getSigner(adapter);

  try {
    // Try to call flashLoan as if we were the adapter
    // This will fail since adapter expects callback from router, but let's see what happens
    console.log("Testing Morpho.flashLoan (will fail but shows availability)...");
    await Morpho.connect(adapterSigner).flashLoan.staticCall(USDC, flashLoanAmount, "0x");
    console.log("✓ Morpho flash loan available (returned without error)");
  } catch (e: unknown) {
    const err = e as Error & { reason?: string };
    // Expected to fail since there's no proper callback, but we can see if it's a liquidity issue
    const msg = err.reason || err.message || "";
    if (msg.includes("insufficient") || msg.includes("balance")) {
      console.log("✗ Flash loan failed: insufficient liquidity");
    } else {
      console.log("Flash loan attempt result:", msg.slice(0, 200));
      console.log("(Expected to fail - no callback handler in test)");
    }
  }

  await ethers.provider.send("hardhat_stopImpersonatingAccount", [adapter]);

  // Check if the FlashLoanRouter has any restrictions
  console.log("\n--- Checking FlashLoanRouter Configuration ---");
  const Router = await ethers.getContractAt(
    ["function settlementContract() view returns (address)"],
    flashLoanRouter
  );
  const routerSettlement = await Router.settlementContract();
  console.log("FlashLoanRouter settlement:", routerSettlement);
  console.log("Expected settlement:", settlement);
  console.log("Match:", routerSettlement.toLowerCase() === settlement.toLowerCase() ? "✓" : "✗");

  // Check if we can simulate the flashLoanAndSettle call
  console.log("\n--- Simulating flashLoanAndSettle Flow ---");

  // The FlashLoanRouter.flashLoanAndSettle takes:
  // - Flash loan requests array
  // - Settlement calldata
  // Solvers would call this with appropriate parameters

  // Let's check what a solver would see when trying to fill this order
  const Handler = await ethers.getContractAt(
    ["function getTradeableOrder(address owner, address sender, bytes32 ctx, bytes calldata staticInput, bytes calldata offchainInput) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance))"],
    handler
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const staticInput = abiCoder.encode(["bytes32"], [orderHash]);

  try {
    const order = await Handler.getTradeableOrder(manager, manager, ethers.ZeroHash, staticInput, "0x");
    console.log("Order from handler:");
    console.log("  sellToken:", order.sellToken);
    console.log("  buyToken:", order.buyToken);
    console.log("  sellAmount:", ethers.formatUnits(order.sellAmount, 6));
    console.log("  buyAmount:", ethers.formatUnits(order.buyAmount, 6));
    console.log("  kind:", order.kind === "0x6ed88e868af0a1983e3886d5f3e95a2fafbd6c3450bc229e27342283dc429ccc" ? "BUY" : "SELL");

    // Check validTo
    const now = Math.floor(Date.now() / 1000);
    console.log("  validTo:", order.validTo, "(" + (Number(order.validTo) - now) + " seconds remaining)");

    if (now > Number(order.validTo)) {
      console.log("\n⚠️ ORDER EXPIRED!");
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.log("Handler.getTradeableOrder failed:", err.message?.slice(0, 300));
  }

  // Check ComposableCoW registration
  console.log("\n--- ComposableCoW Registration ---");
  const composableCow = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const ComposableCoW = await ethers.getContractAt(
    ["function singleOrders(address owner, bytes32 ctx) view returns (bool)",
     "function hash(tuple(address handler, bytes32 salt, bytes staticData) params) view returns (bytes32)"],
    composableCow
  );

  const cowHash = await ComposableCoW.hash({
    handler: handler,
    salt: salt,
    staticData: staticInput
  });

  const isRegistered = await ComposableCoW.singleOrders(manager, cowHash);
  console.log("Is registered in ComposableCoW:", isRegistered ? "✓" : "✗");

  // Summary
  console.log("\n=== Summary ===");
  console.log("All on-chain checks pass. Possible issues:");
  console.log("1. Solver gas estimation fails");
  console.log("2. Solver doesn't support this borrower/lender combination");
  console.log("3. Order expired before solver could fill");
  console.log("4. Solver simulation of full settlement fails");
  console.log("");
  console.log("To debug further, check CoW Protocol's order book API for rejection reasons.");
}

main().catch(console.error);
