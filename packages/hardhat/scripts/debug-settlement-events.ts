import { ethers, network } from "hardhat";

/**
 * Debug script to trace settlement events
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
  const vaultRelayer = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";

  console.log("=== Debug Settlement Events ===\n");

  const [deployer] = await ethers.getSigners();
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  // Get order details
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))"],
    manager
  );

  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  const orderCtx = await Manager.getOrder(orderHash);

  // Get amounts from trigger
  const Trigger = await ethers.getContractAt(
    ["function calculateExecution(bytes calldata staticData, address user, uint256 iterationCount) view returns (uint256 sellAmount, uint256 minBuyAmount)"],
    orderCtx.params.trigger
  );
  const [sellAmount, buyAmount] = await Trigger.calculateExecution(orderCtx.params.triggerStaticData, user, orderCtx.iterationCount);

  console.log("Order:", orderHash);
  console.log("sellAmount (USDC):", ethers.formatUnits(sellAmount, 6));
  console.log("buyAmount (USDT):", ethers.formatUnits(buyAmount, 6));

  // Get tradeable order from ComposableCoW
  const ComposableCoW = await ethers.getContractAt(
    ["function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance), bytes)"],
    composableCow
  );

  const staticInput = abiCoder.encode(["bytes32"], [orderHash]);
  const cowParams = { handler, salt, staticData: staticInput };
  const [gpv2Order, signature] = await ComposableCoW.getTradeableOrderWithSignature(manager, cowParams, "0x", []);

  // Build settlement
  const fullSignature = ethers.concat([manager, signature]);
  const isBuyOrder = gpv2Order.kind === "0x6ed88e868af0a1983e3886d5f3e95a2fafbd6c3450bc229e27342283dc429ccc";

  const trade = {
    sellTokenIndex: 0,
    buyTokenIndex: 1,
    receiver: manager,
    sellAmount: gpv2Order.sellAmount,
    buyAmount: gpv2Order.buyAmount,
    validTo: Number(gpv2Order.validTo),
    appData: gpv2Order.appData,
    feeAmount: 0n,
    flags: 0x40 | (isBuyOrder ? 0x01 : 0),
    executedAmount: isBuyOrder ? gpv2Order.buyAmount : gpv2Order.sellAmount,
    signature: fullSignature
  };

  // Build hooks
  const HOOKS_IFACE = new ethers.Interface(["function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks)"]);
  const ADAPTER_IFACE = new ethers.Interface(["function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient)"]);
  const MANAGER_IFACE = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt)",
    "function executePostHookBySalt(address user, bytes32 salt)"
  ]);

  const preHook1Inner = ADAPTER_IFACE.encodeFunctionData("fundOrderWithBalance", [user, salt, USDC, manager]);
  const preHook1 = HOOKS_IFACE.encodeFunctionData("execute", [[{ target: adapter, callData: preHook1Inner, gasLimit: 500000n }]]);
  const preHook2Inner = MANAGER_IFACE.encodeFunctionData("executePreHookBySalt", [user, salt]);
  const preHook2 = HOOKS_IFACE.encodeFunctionData("execute", [[{ target: manager, callData: preHook2Inner, gasLimit: 3000000n }]]);
  const postHookInner = MANAGER_IFACE.encodeFunctionData("executePostHookBySalt", [user, salt]);
  const postHook = HOOKS_IFACE.encodeFunctionData("execute", [[{ target: manager, callData: postHookInner, gasLimit: 3000000n }]]);

  const preInteractions = [
    { target: hooksTrampoline, value: 0n, callData: preHook1 },
    { target: hooksTrampoline, value: 0n, callData: preHook2 },
  ];
  const postInteractions = [
    { target: hooksTrampoline, value: 0n, callData: postHook },
  ];

  // Fund settlement with solver USDT
  const usdtWhale = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
  await network.provider.send("hardhat_impersonateAccount", [usdtWhale]);
  await network.provider.send("hardhat_setBalance", [usdtWhale, "0x56BC75E2D63100000"]);
  const whaleSigner = await ethers.getSigner(usdtWhale);
  const USDT_Contract = await ethers.getContractAt(["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"], USDT);
  await USDT_Contract.connect(whaleSigner).transfer(settlement, gpv2Order.buyAmount * 2n);
  console.log("Funded settlement with", ethers.formatUnits(gpv2Order.buyAmount * 2n, 6), "USDT");

  // Build settlement calldata
  const Settlement = await ethers.getContractAt(
    ["function settle(address[] tokens, uint256[] clearingPrices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions)"],
    settlement
  );

  const settlementCalldata = Settlement.interface.encodeFunctionData("settle", [
    [USDC, USDT],
    [gpv2Order.buyAmount, gpv2Order.sellAmount],
    [trade],
    [preInteractions, [], postInteractions]
  ]);

  // Become a solver
  const Authenticator = await ethers.getContractAt(["function addSolver(address solver)", "function manager() view returns (address)"], authenticator);
  const authManager = await Authenticator.manager();
  await network.provider.send("hardhat_impersonateAccount", [authManager]);
  await network.provider.send("hardhat_setBalance", [authManager, "0x56BC75E2D63100000"]);
  const authSigner = await ethers.getSigner(authManager);
  await Authenticator.connect(authSigner).addSolver(await deployer.getAddress());
  await network.provider.send("hardhat_stopImpersonatingAccount", [authManager]);

  // Check balances before
  const USDC_Contract = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"], USDC);
  console.log("\n=== Balances Before ===");
  console.log("Adapter USDC:", ethers.formatUnits(await USDC_Contract.balanceOf(adapter), 6));
  console.log("Manager USDC:", ethers.formatUnits(await USDC_Contract.balanceOf(manager), 6));
  console.log("Manager USDT:", ethers.formatUnits(await USDT_Contract.balanceOf(manager), 6));
  console.log("Manager USDC allowance to VaultRelayer:", ethers.formatUnits(await USDC_Contract.allowance(manager, vaultRelayer), 6));

  // Build flash loan config
  const FlashLoanRouter = await ethers.getContractAt(
    ["function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external"],
    flashLoanRouter
  );

  const loans = [{
    amount: gpv2Order.sellAmount,
    borrower: adapter,
    lender: morpho,
    token: USDC
  }];

  console.log("\n=== Executing flashLoanAndSettle ===");
  console.log("Flash loan amount:", ethers.formatUnits(gpv2Order.sellAmount, 6), "USDC");

  try {
    // Use debug_traceCall to get detailed trace
    const tx = await FlashLoanRouter.connect(deployer).flashLoanAndSettle(loans, settlementCalldata, { gasLimit: 10000000 });
    const receipt = await tx.wait();
    console.log("✓ Transaction succeeded!");
    console.log("Gas used:", receipt?.gasUsed.toString());

    // Check for events
    console.log("\n=== Events ===");
    for (const log of receipt?.logs || []) {
      try {
        // Try to parse as adapter event
        const adapterIface = new ethers.Interface(["event OrderFunded(address indexed user, bytes32 indexed salt, address indexed token, address recipient, uint256 amount)"]);
        const parsed = adapterIface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed) {
          console.log("OrderFunded:", parsed.args);
        }
      } catch {}
    }
  } catch (e) {
    console.log("✗ Transaction FAILED!");
    const err = e as Error & { data?: string };
    console.log("Error:", err.message?.slice(0, 500));

    // Check balances after failure
    console.log("\n=== Balances After Failure ===");
    console.log("Adapter USDC:", ethers.formatUnits(await USDC_Contract.balanceOf(adapter), 6));
    console.log("Manager USDC:", ethers.formatUnits(await USDC_Contract.balanceOf(manager), 6));
    console.log("Manager USDT:", ethers.formatUnits(await USDT_Contract.balanceOf(manager), 6));
  }
}

main().catch(console.error);
