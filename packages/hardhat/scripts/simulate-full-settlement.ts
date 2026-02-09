import { ethers } from "hardhat";

async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const handler = "0xB3FBB014a668B2FD6887F78B3011F18C5bfB7E14";
  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const salt = "0xcf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  // USDT on Arbitrum: 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9

  console.log("=== Full Settlement Simulation ===\n");

  // Get order hash and order details
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
     "function hooksTrampoline() view returns (address)",
     "function preHookExecutedForIteration(bytes32 orderHash) view returns (uint256)",
     "function executePreHookBySalt(address user, bytes32 salt)",
     "function executePostHookBySalt(address user, bytes32 salt)"],
    manager
  );

  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  console.log("Order hash:", orderHash);

  const orderCtx = await Manager.getOrder(orderHash);
  console.log("\n--- Order Details ---");
  console.log("Status:", orderCtx.status, "(1=Active, 2=Completed, 3=Cancelled)");
  console.log("Iteration count:", orderCtx.iterationCount.toString());
  console.log("Created at:", new Date(Number(orderCtx.createdAt) * 1000).toISOString());
  console.log("Sell token:", orderCtx.params.sellToken);
  console.log("Buy token:", orderCtx.params.buyToken);
  console.log("Trigger:", orderCtx.params.trigger);
  console.log("isKindBuy:", orderCtx.params.isKindBuy);

  const hooksTrampoline = await Manager.hooksTrampoline();
  console.log("\nHooks Trampoline:", hooksTrampoline);

  // Get Handler to check order generation
  const Handler = await ethers.getContractAt(
    ["function getTradeableOrder(address owner, address sender, bytes32 ctx, bytes calldata staticInput, bytes calldata offchainInput) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance))"],
    handler
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const staticInput = abiCoder.encode(["bytes32"], [orderHash]);

  console.log("\n--- Handler.getTradeableOrder ---");
  try {
    const order = await Handler.getTradeableOrder(
      manager, manager, ethers.ZeroHash, staticInput, "0x"
    );
    console.log("Order generated successfully:");
    console.log("  sellToken:", order.sellToken);
    console.log("  buyToken:", order.buyToken);
    console.log("  sellAmount:", ethers.formatUnits(order.sellAmount, 6), "(raw:", order.sellAmount.toString(), ")");
    console.log("  buyAmount:", ethers.formatUnits(order.buyAmount, 6), "(raw:", order.buyAmount.toString(), ")");
    console.log("  validTo:", order.validTo, "(" + new Date(Number(order.validTo) * 1000).toISOString() + ")");
    console.log("  kind:", order.kind);
    console.log("  receiver:", order.receiver);

    // Check if order is economically viable
    const ratio = Number(order.sellAmount) / Number(order.buyAmount);
    console.log("\n  Effective price:", ratio.toFixed(6), "sell/buy");
    console.log("  For BUY order: solver gets up to", order.sellAmount.toString(), "to provide", order.buyAmount.toString());

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (now > Number(order.validTo)) {
      console.log("\n  ⚠️ ORDER EXPIRED! validTo:", order.validTo, "now:", now);
    } else {
      console.log("\n  ✓ Order still valid for", Number(order.validTo) - now, "seconds");
    }
  } catch (e: unknown) {
    const err = e as Error & { data?: string };
    console.log("Handler.getTradeableOrder REVERTED:");
    console.log("  Error:", err.message?.slice(0, 300));
    if (err.data) {
      console.log("  Data:", err.data);
    }
    return;
  }

  // Check trigger
  console.log("\n--- Trigger Check ---");
  const Trigger = await ethers.getContractAt(
    ["function shouldExecute(bytes calldata staticData, address user) view returns (bool, string memory)",
     "function calculateExecution(bytes calldata staticData, address user, uint256 iterationCount) view returns (uint256 sellAmount, uint256 minBuyAmount)"],
    orderCtx.params.trigger
  );

  try {
    const [shouldExecute, reason] = await Trigger.shouldExecute(orderCtx.params.triggerStaticData, user);
    console.log("shouldExecute:", shouldExecute);
    console.log("reason:", reason);

    const [sellAmount, minBuyAmount] = await Trigger.calculateExecution(
      orderCtx.params.triggerStaticData, user, orderCtx.iterationCount
    );
    console.log("Calculated sellAmount:", ethers.formatUnits(sellAmount, 6));
    console.log("Calculated minBuyAmount:", ethers.formatUnits(minBuyAmount, 6));
  } catch (e: unknown) {
    const err = e as Error;
    console.log("Trigger check failed:", err.message?.slice(0, 200));
  }

  // Now simulate the actual settlement with impersonation
  console.log("\n--- Simulating Full Settlement Flow ---");

  try {
    // Impersonate the hooksTrampoline
    console.log("Impersonating hooksTrampoline:", hooksTrampoline);
    await ethers.provider.send("hardhat_impersonateAccount", [hooksTrampoline]);
    const trampolineSigner = await ethers.getSigner(hooksTrampoline);

    // Fund the trampoline with ETH for gas using hardhat_setBalance
    await ethers.provider.send("hardhat_setBalance", [
      hooksTrampoline,
      "0x56BC75E2D63100000" // 100 ETH
    ]);
    console.log("Set hooksTrampoline balance to 100 ETH");

    // Step 1: Simulate pre-hook #1 (fundOrderWithBalance from adapter)
    console.log("\n[Step 1] Checking adapter and balances...");

    // Check current balances
    const USDC_Contract = await ethers.getContractAt(
      ["function balanceOf(address) view returns (uint256)"],
      USDC
    );
    const adapterUSDCBalance = await USDC_Contract.balanceOf(adapter);
    const managerUSDCBalance = await USDC_Contract.balanceOf(manager);
    console.log("Adapter USDC balance:", ethers.formatUnits(adapterUSDCBalance, 6));
    console.log("Manager USDC balance:", ethers.formatUnits(managerUSDCBalance, 6));

    // Note: fundOrderWithBalance requires flash loan funds to be present
    // In real flow: flash loan provider -> adapter -> fundOrderWithBalance transfers to manager
    console.log("(fundOrderWithBalance requires flash loan funds - skipping direct call)");

    // Step 2: Simulate pre-hook #2 (executePreHookBySalt from manager)
    console.log("\n[Step 2] Simulating manager.executePreHookBySalt (as hooksTrampoline)...");
    const ManagerConnected = Manager.connect(trampolineSigner);

    try {
      await ManagerConnected.executePreHookBySalt.staticCall(user, salt);
      console.log("✓ executePreHookBySalt would succeed!");
    } catch (e: unknown) {
      const err = e as Error & { data?: string, reason?: string };
      console.log("✗ executePreHookBySalt REVERTED!");
      console.log("  Reason:", err.reason || err.message?.slice(0, 400));
      if (err.data) {
        console.log("  Error data:", err.data.slice(0, 200));
        // Try to decode the error
        const errorSigs: Record<string, string> = {
          "0x72ce59fc": "NotHooksTrampoline()",
          "0x82b42900": "OrderNotFound()",
          "0x23369fa5": "InvalidOrderState()",
          "0x6a2e8ee1": "PreHookAlreadyExecuted()",
          "0x3c6b4b0b": "TriggerNotMet()",
        };
        const sig = err.data.slice(0, 10);
        if (errorSigs[sig]) {
          console.log("  Decoded error:", errorSigs[sig]);
        }
      }
    }

    // Step 3: Check what would happen in post-hook
    console.log("\n[Step 3] Simulating manager.executePostHookBySalt (as hooksTrampoline)...");
    try {
      await ManagerConnected.executePostHookBySalt.staticCall(user, salt);
      console.log("✓ executePostHookBySalt would succeed!");
    } catch (e: unknown) {
      const err = e as Error & { data?: unknown, reason?: string };
      console.log("✗ executePostHookBySalt REVERTED!");
      console.log("  Reason:", err.reason || err.message?.slice(0, 400));
      if (err.data && typeof err.data === "string") {
        console.log("  Error data:", err.data.slice(0, 200));
      }
      // This is expected - post-hook requires pre-hook to have been executed (not just static called)
      console.log("  (Expected: PreHookNotExecuted since pre-hook was only static called)");
    }

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [hooksTrampoline]);

    // Additional checks
    console.log("\n--- Additional Diagnostics ---");

    // Check ComposableCoW registration
    const composableCow = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
    const ComposableCoW = await ethers.getContractAt(
      ["function singleOrders(address owner, bytes32 ctx) view returns (bool)",
       "function hash(tuple(address handler, bytes32 salt, bytes staticData) params) view returns (bytes32)",
       "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance), bytes)"],
      composableCow
    );

    const cowHash = await ComposableCoW.hash({
      handler: handler,
      salt: salt,
      staticData: staticInput
    });
    console.log("ComposableCoW hash:", cowHash);

    const isRegistered = await ComposableCoW.singleOrders(manager, cowHash);
    console.log("Is registered in ComposableCoW:", isRegistered);

    // Check pre-hook iteration state
    const preHookIteration = await Manager.preHookExecutedForIteration(orderHash);
    console.log("preHookExecutedForIteration:", preHookIteration.toString());

    // Test ComposableCoW's getTradeableOrderWithSignature (what solvers call)
    console.log("\n--- Testing ComposableCoW.getTradeableOrderWithSignature ---");
    try {
      const cowParams = {
        handler: handler,
        salt: salt,
        staticData: staticInput
      };
      const [cowOrder, signature] = await ComposableCoW.getTradeableOrderWithSignature(
        manager,
        cowParams,
        "0x", // offchainInput
        []    // proof (empty for singleOrders)
      );
      console.log("✓ getTradeableOrderWithSignature succeeded!");
      console.log("  Order sellAmount:", ethers.formatUnits(cowOrder.sellAmount, 6));
      console.log("  Order buyAmount:", ethers.formatUnits(cowOrder.buyAmount, 6));
      console.log("  Signature length:", signature.length);
    } catch (e: unknown) {
      const err = e as Error & { reason?: string };
      console.log("✗ getTradeableOrderWithSignature REVERTED!");
      console.log("  Reason:", err.reason || err.message?.slice(0, 400));
    }

    // Get the settlement contract for domain separator
    const settlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
    const Settlement = await ethers.getContractAt(
      ["function domainSeparator() view returns (bytes32)"],
      settlement
    );
    const domainSeparator = await Settlement.domainSeparator();
    console.log("\nSettlement domain separator:", domainSeparator);

  } catch (e: unknown) {
    const err = e as Error;
    console.log("Simulation failed:", err.message?.slice(0, 300));
  }
}

main().catch(console.error);
