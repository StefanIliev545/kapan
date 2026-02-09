import { ethers, network } from "hardhat";

/**
 * Simulates what a CoW solver would do to fill this order
 */
async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const handler = "0xB3FBB014a668B2FD6887F78B3011F18C5bfB7E14";
  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const salt = "0xcf2125b931b5552e1282ff52416d69f3622dff00cde78b5e940b5b934175f73f";
  const morpho = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
  const flashLoanRouter = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";
  const settlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  const hooksTrampoline = "0x60Bf78233f48eC42eE3F101b9a05eC7878728006";
  const composableCow = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const authenticator = "0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE";
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  const USDT = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";

  console.log("=== Simulating Solver Fill Flow ===\n");

  // Get order hash and details
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
     "function approveVaultRelayer(address token)"],
    manager
  );

  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  const orderCtx = await Manager.getOrder(orderHash);
  console.log("Order hash:", orderHash);
  console.log("Order status:", orderCtx.status, "(1=Active)");

  // Get trade amounts from trigger
  const Trigger = await ethers.getContractAt(
    ["function calculateExecution(bytes calldata staticData, address user, uint256 iterationCount) view returns (uint256 sellAmount, uint256 minBuyAmount)"],
    orderCtx.params.trigger
  );

  const [sellAmount, buyAmount] = await Trigger.calculateExecution(
    orderCtx.params.triggerStaticData, user, orderCtx.iterationCount
  );

  console.log("\nOrder amounts:");
  console.log("  sellAmount (USDC):", ethers.formatUnits(sellAmount, 6));
  console.log("  buyAmount (USDT):", ethers.formatUnits(buyAmount, 6));

  // Step 1: Become a solver
  console.log("\n--- Step 1: Becoming a solver ---");
  const [deployer] = await ethers.getSigners();
  const solverAddress = await deployer.getAddress();

  // Get the manager from the Authenticator
  const Authenticator = await ethers.getContractAt(
    ["function addSolver(address solver)",
     "function isSolver(address) view returns (bool)",
     "function manager() view returns (address)"],
    authenticator
  );

  const authManager = await Authenticator.manager();
  console.log("Authenticator manager:", authManager);

  await network.provider.send("hardhat_impersonateAccount", [authManager]);
  await network.provider.send("hardhat_setBalance", [authManager, "0x56BC75E2D63100000"]);
  const authManagerSigner = await ethers.getSigner(authManager);

  await Authenticator.connect(authManagerSigner).addSolver(solverAddress);
  const isSolver = await Authenticator.isSolver(solverAddress);
  console.log("Added as solver:", isSolver);
  await network.provider.send("hardhat_stopImpersonatingAccount", [authManager]);

  // Step 2: Get the tradeable order from ComposableCoW
  console.log("\n--- Step 2: Getting tradeable order ---");
  const ComposableCoW = await ethers.getContractAt(
    ["function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance), bytes)"],
    composableCow
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const staticInput = abiCoder.encode(["bytes32"], [orderHash]);

  const cowParams = {
    handler: handler,
    salt: salt,
    staticData: staticInput
  };

  const [gpv2Order, signature] = await ComposableCoW.getTradeableOrderWithSignature(
    manager,
    cowParams,
    "0x",
    []
  );

  console.log("Order from ComposableCoW:");
  console.log("  sellToken:", gpv2Order.sellToken);
  console.log("  buyToken:", gpv2Order.buyToken);
  console.log("  sellAmount:", ethers.formatUnits(gpv2Order.sellAmount, 6));
  console.log("  buyAmount:", ethers.formatUnits(gpv2Order.buyAmount, 6));
  console.log("  validTo:", gpv2Order.validTo);
  console.log("  kind:", gpv2Order.kind);
  console.log("  Raw signature length:", signature.length);

  // For EIP-1271, the signature format is: owner (20 bytes) + payload
  // The signature from ComposableCoW is the payload, we need to prepend owner
  const fullSignature = ethers.concat([manager, signature]);
  console.log("  Full signature length:", fullSignature.length);

  // Step 3: Build the settlement
  console.log("\n--- Step 3: Building settlement ---");

  // Build trade struct
  const isBuyOrder = gpv2Order.kind === "0x6ed88e868af0a1983e3886d5f3e95a2fafbd6c3450bc229e27342283dc429ccc";
  console.log("Is BUY order:", isBuyOrder);

  // Trade flags (from cowHelpers.ts)
  const FLAG_EIP1271 = 0x40; // 0b01000000 - Bits 5-6 = 10 for EIP-1271
  const FLAG_BUY = 0x01;     // Bit 0 for buy order
  const tradeFlags = FLAG_EIP1271 | (isBuyOrder ? FLAG_BUY : 0);
  console.log("Trade flags:", tradeFlags, "(EIP1271:", FLAG_EIP1271, "BUY:", FLAG_BUY, ")");

  // Build the trade
  // Note: validTo must be a number for proper uint32 encoding
  const trade = {
    sellTokenIndex: 0, // USDC
    buyTokenIndex: 1,  // USDT
    receiver: manager,
    sellAmount: gpv2Order.sellAmount,
    buyAmount: gpv2Order.buyAmount,
    validTo: Number(gpv2Order.validTo), // Convert to number for uint32
    appData: gpv2Order.appData,
    feeAmount: 0n,
    flags: tradeFlags,
    executedAmount: isBuyOrder ? gpv2Order.buyAmount : gpv2Order.sellAmount,
    signature: fullSignature // Use full signature with owner prefix
  };

  console.log("Trade struct:", {
    ...trade,
    sellAmount: trade.sellAmount.toString(),
    buyAmount: trade.buyAmount.toString(),
    executedAmount: trade.executedAmount.toString(),
    signatureLength: trade.signature.length
  });

  // Build hooks - IMPORTANT: For flashLoanAndSettle, interactions call HooksTrampoline
  // which then calls the actual targets. This is different from direct Settlement.settle() calls.
  const HOOKS_IFACE = new ethers.Interface([
    "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks)"
  ]);
  const ADAPTER_IFACE = new ethers.Interface([
    "function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient)"
  ]);
  const MANAGER_IFACE = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt)",
    "function executePostHookBySalt(address user, bytes32 salt)"
  ]);

  // Pre-hook 1: fundOrderWithBalance wrapped in HooksTrampoline.execute()
  const preHook1Inner = ADAPTER_IFACE.encodeFunctionData("fundOrderWithBalance", [
    user, salt, USDC, manager
  ]);
  const preHook1 = HOOKS_IFACE.encodeFunctionData("execute", [[
    { target: adapter, callData: preHook1Inner, gasLimit: 500000n } // Using higher gas like test
  ]]);

  // Pre-hook 2: executePreHookBySalt wrapped in HooksTrampoline.execute()
  const preHook2Inner = MANAGER_IFACE.encodeFunctionData("executePreHookBySalt", [user, salt]);
  const preHook2 = HOOKS_IFACE.encodeFunctionData("execute", [[
    { target: manager, callData: preHook2Inner, gasLimit: 3000000n } // Using higher gas like test
  ]]);

  // Post-hook: executePostHookBySalt wrapped in HooksTrampoline.execute()
  const postHookInner = MANAGER_IFACE.encodeFunctionData("executePostHookBySalt", [user, salt]);
  const postHook = HOOKS_IFACE.encodeFunctionData("execute", [[
    { target: manager, callData: postHookInner, gasLimit: 3000000n } // Using higher gas like test
  ]]);

  // Interactions - target is HooksTrampoline, callData is the execute() call
  const preInteractions = [
    { target: hooksTrampoline, value: 0n, callData: preHook1 },
    { target: hooksTrampoline, value: 0n, callData: preHook2 },
  ];
  const postInteractions = [
    { target: hooksTrampoline, value: 0n, callData: postHook },
  ];

  // Debug: Print the encoded hooks
  console.log("\n--- Debug: Hook encoding ---");
  console.log("preHook1 (HooksTrampoline.execute) length:", preHook1.length);
  console.log("preHook1Inner (fundOrderWithBalance) length:", preHook1Inner.length);
  console.log("preHook2Inner (executePreHookBySalt) length:", preHook2Inner.length);
  console.log("postHookInner (executePostHookBySalt) length:", postHookInner.length);

  // Step 4: Fund settlement with solver liquidity (USDT to provide to the order)
  console.log("\n--- Step 4: Funding settlement with solver liquidity ---");
  const usdtWhale = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
  await network.provider.send("hardhat_impersonateAccount", [usdtWhale]);
  await network.provider.send("hardhat_setBalance", [usdtWhale, "0x56BC75E2D63100000"]);
  const whaleSigner = await ethers.getSigner(usdtWhale);

  const USDT_Contract = await ethers.getContractAt(
    ["function transfer(address to, uint256 amount) returns (bool)",
     "function balanceOf(address) view returns (uint256)"],
    USDT
  );

  // Fund settlement with USDT (solver provides this)
  const requiredUsdt = gpv2Order.buyAmount * 2n; // Extra buffer
  await USDT_Contract.connect(whaleSigner).transfer(settlement, requiredUsdt);
  console.log("Funded settlement with", ethers.formatUnits(requiredUsdt, 6), "USDT");

  await network.provider.send("hardhat_stopImpersonatingAccount", [usdtWhale]);

  // Step 5: Build settlement calldata
  console.log("\n--- Step 5: Building settlement calldata ---");
  // CRITICAL: The interactions parameter is `[3]` not `[][]` - this affects the function selector!
  const Settlement = await ethers.getContractAt(
    ["function settle(address[] tokens, uint256[] clearingPrices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions)",
     "function domainSeparator() view returns (bytes32)"],
    settlement
  );

  // Clearing prices for stablecoin swap (roughly 1:1)
  const clearingPrices = [gpv2Order.buyAmount, gpv2Order.sellAmount];

  const settlementCalldata = Settlement.interface.encodeFunctionData("settle", [
    [USDC, USDT], // tokens
    clearingPrices,
    [trade],
    [preInteractions, [], postInteractions] // [pre, in-trade, post]
  ]);

  console.log("Settlement calldata length:", settlementCalldata.length);
  console.log("Settlement selector:", settlementCalldata.slice(0, 10));
  // Verify it's the settle() selector
  const settleSelector = Settlement.interface.getFunction("settle")?.selector;
  console.log("Expected settle() selector:", settleSelector);
  console.log("Selector matches:", settlementCalldata.slice(0, 10) === settleSelector);

  // Step 6: Build flash loan config and execute
  console.log("\n--- Step 6: Executing flashLoanAndSettle ---");
  // Use exact same ABI as the test
  const FLASH_LOAN_ROUTER_ABI = [
    "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
  ];
  const FlashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, flashLoanRouter);

  const loans = [{
    amount: gpv2Order.sellAmount,
    borrower: adapter,
    lender: morpho,
    token: USDC
  }];

  console.log("Flash loan config:");
  console.log("  Amount:", ethers.formatUnits(gpv2Order.sellAmount, 6), "USDC");
  console.log("  Borrower:", adapter);
  console.log("  Lender:", morpho);

  // Check Morpho liquidity
  const USDC_Contract = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)"],
    USDC
  );
  const morphoUsdc = await USDC_Contract.balanceOf(morpho);
  console.log("Morpho USDC liquidity:", ethers.formatUnits(morphoUsdc, 6));

  // Check adapter's current balance and configuration
  const adapterUsdc = await USDC_Contract.balanceOf(adapter);
  console.log("Adapter USDC balance before:", ethers.formatUnits(adapterUsdc, 6));

  // Check if adapter's Morpho lender is configured
  const AdapterCheck = await ethers.getContractAt(
    ["function allowedLenders(address) view returns (bool)",
     "function lenderTypes(address) view returns (uint8)",
     "function router() view returns (address)"],
    adapter
  );
  const isMorphoAllowed = await AdapterCheck.allowedLenders(morpho);
  const morphoType = await AdapterCheck.lenderTypes(morpho);
  const adapterRouter = await AdapterCheck.router();
  console.log("Adapter config:");
  console.log("  Morpho allowed:", isMorphoAllowed);
  console.log("  Morpho type:", morphoType, "(2=Morpho)");
  console.log("  Router:", adapterRouter);
  console.log("  Expected router:", flashLoanRouter);

  // Debug: Encode and check the call
  console.log("\n--- Debug: Encoding flashLoanAndSettle call ---");
  const flashLoanCalldata = FlashLoanRouter.interface.encodeFunctionData("flashLoanAndSettle", [loans, settlementCalldata]);
  console.log("FlashLoanRouter calldata length:", flashLoanCalldata.length);
  console.log("FlashLoanRouter selector:", flashLoanCalldata.slice(0, 10));
  console.log("Loans array:", JSON.stringify(loans, (_, v) => typeof v === 'bigint' ? v.toString() : v));

  // Check the settlement bytes in the encoded call
  // The settlement is a bytes parameter that should start with the settle() selector
  console.log("Settlement calldata first 20 chars:", settlementCalldata.slice(0, 20));

  try {
    // Try executing directly (not static call) to get proper trace
    console.log("\nExecuting flashLoanAndSettle...");
    const tx = await FlashLoanRouter.connect(deployer).flashLoanAndSettle(loans, settlementCalldata, { gasLimit: 10000000 });
    const receipt = await tx.wait();
    console.log("✓ Transaction succeeded!");
    console.log("  Gas used:", receipt.gasUsed.toString());

  } catch (e: unknown) {
    const err = e as Error & { reason?: string, data?: string };
    console.log("✗ flashLoanAndSettle FAILED!");
    console.log("  Error:", err.reason || err.message?.slice(0, 500));
    if (err.data && typeof err.data === "string") {
      console.log("  Error data:", err.data.slice(0, 200));
    }

    // Additional debugging
    console.log("\n--- Debug: Check individual components ---");

    // Check manager's balance
    const managerUsdcBalance = await USDC_Contract.balanceOf(manager);
    console.log("Manager USDC balance:", ethers.formatUnits(managerUsdcBalance, 6));

    // Try calling settlement directly (without flash loan)
    console.log("\n--- Debug: Try direct settlement (will fail but shows more info) ---");
    try {
      await Settlement.settle.staticCall(
        [USDC, USDT],
        [gpv2Order.buyAmount, gpv2Order.sellAmount],
        [trade],
        [preInteractions, [], postInteractions],
        { gasLimit: 10000000 }
      );
      console.log("Direct settlement would succeed (unexpected)");
    } catch (directErr: unknown) {
      const de = directErr as Error & { reason?: string };
      console.log("Direct settlement error:", de.reason || de.message?.slice(0, 400));
    }

    // Check VaultRelayer approval
    const vaultRelayer = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
    const USDC_Full = await ethers.getContractAt(
      ["function allowance(address owner, address spender) view returns (uint256)"],
      USDC
    );
    const managerAllowance = await USDC_Full.allowance(manager, vaultRelayer);
    console.log("Manager USDC allowance to VaultRelayer:", ethers.formatUnits(managerAllowance, 6));

    // Test isValidSignature
    console.log("\n--- Debug: Test isValidSignature ---");
    const ManagerSig = await ethers.getContractAt(
      ["function isValidSignature(bytes32 hash, bytes calldata signature) view returns (bytes4)"],
      manager
    );

    // Compute order hash
    const domainSeparator = await Settlement.domainSeparator();
    const GPV2_ORDER_TYPE_HASH = ethers.keccak256(ethers.toUtf8Bytes(
      "Order(address sellToken,address buyToken,address receiver,uint256 sellAmount,uint256 buyAmount,uint32 validTo,bytes32 appData,uint256 feeAmount,string kind,bool partiallyFillable,string sellTokenBalance,string buyTokenBalance)"
    ));
    const KIND_BUY = ethers.keccak256(ethers.toUtf8Bytes("buy"));
    const BALANCE_ERC20 = ethers.keccak256(ethers.toUtf8Bytes("erc20"));

    const structHash = ethers.keccak256(abiCoder.encode(
      ["bytes32", "address", "address", "address", "uint256", "uint256", "uint32", "bytes32", "uint256", "bytes32", "bool", "bytes32", "bytes32"],
      [
        GPV2_ORDER_TYPE_HASH,
        gpv2Order.sellToken,
        gpv2Order.buyToken,
        gpv2Order.receiver,
        gpv2Order.sellAmount,
        gpv2Order.buyAmount,
        gpv2Order.validTo,
        gpv2Order.appData,
        0n, // feeAmount
        KIND_BUY,
        false, // partiallyFillable
        BALANCE_ERC20,
        BALANCE_ERC20
      ]
    ));

    const orderDigest = ethers.keccak256(ethers.concat([
      "0x1901",
      domainSeparator,
      structHash
    ]));
    console.log("Order digest:", orderDigest);

    try {
      const magicValue = await ManagerSig.isValidSignature(orderDigest, signature);
      console.log("isValidSignature returned:", magicValue);
      console.log("Expected magic value: 0x1626ba7e");
      console.log("Match:", magicValue === "0x1626ba7e" ? "✓" : "✗");
    } catch (sigErr: unknown) {
      const se = sigErr as Error;
      console.log("isValidSignature failed:", se.message?.slice(0, 300));
    }
  }
}

main().catch(console.error);
