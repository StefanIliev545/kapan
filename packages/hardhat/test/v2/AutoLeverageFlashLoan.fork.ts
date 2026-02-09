/* eslint-disable no-unused-expressions */
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder, Signer, Contract } from "ethers";
import {
  encodeApprove,
  encodePushToken,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
  LendingOp,
  deployRouterWithAuthHelper,
} from "./helpers/instructionHelpers";
import {
  COW_PROTOCOL,
  GPV2_ORDER,
  TRADE_FLAGS,
  getSettlement,
  impersonateAndFund,
  becomeSolver,
  buildTradeSignature,
  GPv2OrderData,
} from "./helpers/cowHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum Addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

// Morpho market (wstETH/USDC)
const MORPHO_WSTETH_USDC_MARKET = {
  loanToken: USDC,
  collateralToken: WSTETH,
  oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
  irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
  lltv: BigInt("860000000000000000"),
};

const coder = AbiCoder.defaultAbiCoder();
const MORPHO_BLUE_ID = ethers.keccak256(ethers.toUtf8Bytes("morpho-blue")).slice(0, 10);

// Interfaces
const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
]);

const FLASH_LOAN_ROUTER_ABI = [
  "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
];

const ADAPTER_ABI = [
  "function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient) external",
];

/**
 * Auto-Leverage with REAL Morpho Flash Loan Test
 *
 * Flow:
 * 1. FlashLoanRouter.flashLoanAndSettle() → adapter.flashLoanAndCallBack()
 * 2. Adapter → Morpho.flashLoan(USDC)
 * 3. Morpho sends USDC to adapter → adapter.onMorphoFlashLoan()
 * 4. Adapter pre-approves Morpho for repayment (0% fee!)
 * 5. Adapter calls router.borrowerCallBack() → Settlement executes:
 *    - Pre-hook: adapter.fundOrderWithBalance() → USDC to OrderManager
 *    - Trade: USDC → wstETH
 *    - Post-hook: deposit wstETH, borrow USDC, push to OrderManager
 * 6. OrderManager refunds USDC to sellTokenRefundAddress (adapter)
 * 7. Settlement returns, Morpho pulls repayment from adapter
 */
describe("Auto-Leverage with Real Morpho Flash Loan (Fork)", function () {
  this.timeout(180000);

  before(function () {
    if (!FORK) this.skip();
  });

  let owner: Signer, user: Signer, solver: Signer;
  let router: Contract, morphoGateway: Contract;
  let conditionalOrderManager: Contract;
  let condOrderHandler: Contract;
  let cowAdapter: Contract;
  let settlement: Contract;
  let flashLoanRouter: Contract;
  let viewRouter: Contract, autoLeverageTrigger: Contract;
  let wsteth: Contract;
  let morpho: Contract;
  let userAddress: string;

  const COLLATERAL_AMOUNT = ethers.parseEther("2"); // 2 wstETH
  const BORROW_AMOUNT = 1000_000000n; // 1000 USDC (low LTV position)

  beforeEach(async function () {
    [owner, solver] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Get tokens
    wsteth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WSTETH);

    // Fund user
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);
    await impersonateAndFund(WSTETH_WHALE);
    const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
    await wsteth.connect(wstethWhale).transfer(userAddress, COLLATERAL_AMOUNT);

    // Get CoW contracts
    settlement = await getSettlement();
    flashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, COW_PROTOCOL.flashLoanRouter);

    // Deploy Router
    const { router: _router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, await owner.getAddress());
    router = _router;

    // Deploy Morpho gateway
    const MorphoGateway = await ethers.getContractFactory("MorphoBlueGatewayWrite");
    morphoGateway = await MorphoGateway.deploy(routerAddress, await owner.getAddress(), MORPHO_BLUE);
    await router.addGateway("morpho-blue", await morphoGateway.getAddress());
    await syncGateway("morpho-blue", await morphoGateway.getAddress());

    // Deploy ConditionalOrderManager
    const ConditionalOrderManager = await ethers.getContractFactory("KapanConditionalOrderManager");
    conditionalOrderManager = await ConditionalOrderManager.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline,
    );

    // Deploy handler
    const ConditionalOrderHandler = await ethers.getContractFactory("KapanConditionalOrderHandler");
    condOrderHandler = await ConditionalOrderHandler.deploy(await conditionalOrderManager.getAddress());
    await conditionalOrderManager.setOrderHandler(await condOrderHandler.getAddress());

    // Deploy OUR adapter with Morpho flash loan support
    const CowAdapter = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapter.deploy(COW_PROTOCOL.flashLoanRouter, await owner.getAddress());
    // Enable Morpho as flash loan lender (0% fee!)
    await cowAdapter.setMorphoLender(MORPHO_BLUE, true);

    // Router setup
    await router.setApprovedManager(await conditionalOrderManager.getAddress(), true);
    await router.connect(user).setDelegate(await conditionalOrderManager.getAddress(), true);

    // Deploy ViewRouter and Trigger
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());

    const MorphoGatewayViewFactory = await ethers.getContractFactory("MorphoBlueGatewayView");
    const morphoGatewayView = await MorphoGatewayViewFactory.deploy(MORPHO_BLUE, await owner.getAddress());
    await viewRouter.setGateway("morpho-blue", await morphoGatewayView.getAddress());

    const AutoLeverageTriggerFactory = await ethers.getContractFactory("AutoLeverageTrigger");
    autoLeverageTrigger = await AutoLeverageTriggerFactory.deploy(await viewRouter.getAddress());

    // Get Morpho
    morpho = await ethers.getContractAt(
      [
        "function supplyCollateral((address,address,address,address,uint256) marketParams, uint256 assets, address onBehalf, bytes data)",
        "function borrow((address,address,address,address,uint256) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
        "function setAuthorization(address authorized, bool newIsAuthorized)",
      ],
      MORPHO_BLUE,
    );

    // Create initial LOW LTV position
    const marketTuple = [
      MORPHO_WSTETH_USDC_MARKET.loanToken,
      MORPHO_WSTETH_USDC_MARKET.collateralToken,
      MORPHO_WSTETH_USDC_MARKET.oracle,
      MORPHO_WSTETH_USDC_MARKET.irm,
      MORPHO_WSTETH_USDC_MARKET.lltv,
    ];

    await wsteth.connect(user).approve(MORPHO_BLUE, COLLATERAL_AMOUNT);
    await morpho.connect(user).supplyCollateral(marketTuple, COLLATERAL_AMOUNT, userAddress, "0x");
    await morpho.connect(user).borrow(marketTuple, BORROW_AMOUNT, 0, userAddress, userAddress);

    // Authorize gateway
    await morpho.connect(user).setAuthorization(await morphoGateway.getAddress(), true);

    // Make solvers
    await becomeSolver(COW_PROTOCOL.flashLoanRouter);
    await becomeSolver(await solver.getAddress());

    console.log("\n=== Setup Complete ===");
    console.log(`User: ${userAddress}`);
    console.log(`Adapter: ${await cowAdapter.getAddress()}`);
    console.log(`Collateral: ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH`);
    console.log(`Debt: ${ethers.formatUnits(BORROW_AMOUNT, 6)} USDC`);
  });

  function encodeMarketContext(): string {
    return coder.encode(
      ["tuple(address,address,address,address,uint256)"],
      [[
        MORPHO_WSTETH_USDC_MARKET.loanToken,
        MORPHO_WSTETH_USDC_MARKET.collateralToken,
        MORPHO_WSTETH_USDC_MARKET.oracle,
        MORPHO_WSTETH_USDC_MARKET.irm,
        MORPHO_WSTETH_USDC_MARKET.lltv,
      ]],
    );
  }

  it("should execute auto-leverage with REAL Morpho flash loan (0% fee)", async function () {
    const context = encodeMarketContext();
    const condOrderManagerAddr = await conditionalOrderManager.getAddress();
    const condOrderHandlerAddr = await condOrderHandler.getAddress();
    const adapterAddr = await cowAdapter.getAddress();

    // 1. Get initial state
    const initialLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
    console.log(`\n=== Initial LTV: ${Number(initialLtv) / 100}% ===`);

    // 2. Calculate leverage amounts
    const targetLtvBps = 2500n; // Target 25%
    const triggerParams = {
      protocolId: MORPHO_BLUE_ID,
      protocolContext: context,
      triggerLtvBps: initialLtv + 100n,
      targetLtvBps: targetLtvBps,
      collateralToken: WSTETH,
      debtToken: USDC,
      collateralDecimals: 18,
      debtDecimals: 6,
      maxSlippageBps: 100,
      numChunks: 1,
    };

    const triggerStaticData = await autoLeverageTrigger.encodeTriggerParams(triggerParams);
    const [calculatedSellAmount, calculatedMinBuy] = await autoLeverageTrigger.calculateExecution(triggerStaticData, userAddress);

    // Cap for safety
    const sellAmount = calculatedSellAmount > 1000_000000n ? 500_000000n : calculatedSellAmount;
    const minBuyAmount = (calculatedMinBuy * sellAmount) / calculatedSellAmount;

    console.log(`Sell: ${ethers.formatUnits(sellAmount, 6)} USDC`);
    console.log(`Min buy: ${ethers.formatEther(minBuyAmount)} wstETH`);
    console.log(`Flash loan: ${ethers.formatUnits(sellAmount, 6)} USDC (0% fee from Morpho!)`);

    // 3. Build post-instructions (EXACT same as frontend)
    const postInstructions = [
      // Approve collateral (UTXO[1]) for Morpho
      createRouterInstruction(encodeApprove(1, "morpho-blue")),
      // DepositCollateral (UTXO[1]) - returns NO output
      createProtocolInstruction(
        "morpho-blue",
        encodeLendingInstruction(LendingOp.DepositCollateral, WSTETH, userAddress, 0n, context, 1),
      ),
      // Borrow (UTXO[0] amount) - returns output at UTXO[3]
      createProtocolInstruction(
        "morpho-blue",
        encodeLendingInstruction(LendingOp.Borrow, USDC, userAddress, 0n, context, 0),
      ),
      // PushToken(3) - push borrowed USDC to OrderManager
      createRouterInstruction(encodePushToken(3, condOrderManagerAddr)),
    ];

    const encodedPreInstructions = coder.encode(["tuple(string protocolName, bytes data)[]"], [[]]);
    const encodedPostInstructions = coder.encode(
      ["tuple(string protocolName, bytes data)[]"],
      [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
    );

    // 4. Create order - sellTokenRefundAddress = adapter for Morpho repayment
    const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("auto-leverage-morpho-flash"));
    const salt = ethers.keccak256(ethers.toUtf8Bytes("auto-lev-morpho-" + Date.now()));

    const orderParams = {
      user: userAddress,
      trigger: await autoLeverageTrigger.getAddress(),
      triggerStaticData,
      preInstructions: encodedPreInstructions,
      sellToken: USDC,
      buyToken: WSTETH,
      postInstructions: encodedPostInstructions,
      appDataHash,
      maxIterations: 1n,
      sellTokenRefundAddress: adapterAddr, // Borrowed USDC refunds to adapter for Morpho repayment
    };

    const tx = await conditionalOrderManager.connect(user).createOrder(orderParams, salt);
    const receipt = await tx.wait();

    const event = receipt?.logs.find((log: any) => {
      try {
        return conditionalOrderManager.interface.parseLog(log)?.name === "ConditionalOrderCreated";
      } catch {
        return false;
      }
    });
    const kapanOrderHash = conditionalOrderManager.interface.parseLog(event!)?.args[0];
    console.log(`Order created: ${kapanOrderHash}`);

    // 5. Build GPv2 order
    const validTo = Math.floor(Date.now() / 1000) + 3600;
    const gpv2Order: GPv2OrderData = {
      sellToken: USDC,
      buyToken: WSTETH,
      receiver: condOrderManagerAddr,
      sellAmount: sellAmount,
      buyAmount: minBuyAmount,
      validTo,
      appData: appDataHash,
      feeAmount: 0n,
      kind: GPV2_ORDER.KIND_SELL,
      partiallyFillable: false,
      sellTokenBalance: GPV2_ORDER.BALANCE_ERC20,
      buyTokenBalance: GPV2_ORDER.BALANCE_ERC20,
    };

    const trade = {
      sellTokenIndex: 0,
      buyTokenIndex: 1,
      receiver: condOrderManagerAddr,
      sellAmount: sellAmount,
      buyAmount: minBuyAmount,
      validTo,
      appData: appDataHash,
      feeAmount: 0n,
      flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
      executedAmount: sellAmount,
      signature: buildTradeSignature(condOrderManagerAddr, gpv2Order, condOrderHandlerAddr, salt, kapanOrderHash),
    };

    // 6. Build interactions
    const condOrderManagerIface = new ethers.Interface([
      "function executePreHookBySalt(address user, bytes32 salt) external",
      "function executePostHookBySalt(address user, bytes32 salt) external",
    ]);

    // Pre-hook 1: Adapter approves Settlement to pull USDC
    const adapterApproveCalldata = new ethers.Interface([
      "function approve(address token, address target, uint256 amount) external",
    ]).encodeFunctionData("approve", [USDC, COW_PROTOCOL.settlement, sellAmount]);

    // Pre-hook 2: Transfer USDC from Adapter to OrderManager
    const fundOrderCalldata = new ethers.Interface(ADAPTER_ABI).encodeFunctionData(
      "fundOrderWithBalance",
      [userAddress, salt, USDC, condOrderManagerAddr],
    );

    // Pre-hook 3: Kapan pre-hook (empty but needed for state)
    const preHookInnerCalldata = condOrderManagerIface.encodeFunctionData("executePreHookBySalt", [userAddress, salt]);
    const preHookCalldata = HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
      target: condOrderManagerAddr,
      callData: preHookInnerCalldata,
      gasLimit: 500000n,
    }]]);

    // Post-hook: Kapan post-hook (deposit, borrow, push)
    const postHookInnerCalldata = condOrderManagerIface.encodeFunctionData("executePostHookBySalt", [userAddress, salt]);
    const postHookCalldata = HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
      target: condOrderManagerAddr,
      callData: postHookInnerCalldata,
      gasLimit: 1500000n,
    }]]);

    const preInteractions = [
      // 1. Adapter approves Settlement (called BY Settlement on adapter)
      { target: adapterAddr, value: 0n, callData: adapterApproveCalldata },
      // 2. Transfer USDC from Adapter to OrderManager
      { target: adapterAddr, value: 0n, callData: fundOrderCalldata },
      // 3. Kapan pre-hook
      { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHookCalldata },
    ];

    const postInteractions = [
      // Post-hook: deposit wstETH, borrow USDC, push to OrderManager → refund to adapter
      { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHookCalldata },
    ];

    // 7. Approve VaultRelayer
    await conditionalOrderManager.approveVaultRelayer(USDC);

    // 8. Pre-fund settlement with wstETH (solver liquidity for swap)
    await impersonateAndFund(WSTETH_WHALE);
    const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
    const wstethToSettle = minBuyAmount + (minBuyAmount / 100n);
    await wsteth.connect(wstethWhale).transfer(COW_PROTOCOL.settlement, wstethToSettle);

    // 9. Build settlement
    const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
      [USDC, WSTETH],
      [wstethToSettle, sellAmount],
      [trade],
      [preInteractions, [], postInteractions],
    ]);

    // 10. Flash loan from Morpho (0% fee!) via our adapter
    const loans = [{
      amount: sellAmount,
      borrower: adapterAddr,
      lender: MORPHO_BLUE, // Use Morpho as lender!
      token: USDC,
    }];

    // 11. Execute!
    console.log("\n=== Executing flashLoanAndSettle() with Morpho flash loan ===");

    const flashTx = await flashLoanRouter.connect(solver).flashLoanAndSettle(loans, settlementCalldata);
    const settleReceipt = await flashTx.wait();
    console.log(`Gas used: ${settleReceipt.gasUsed}`);

    // 12. Verify
    const finalLtv = await autoLeverageTrigger.getCurrentLtv(MORPHO_BLUE_ID, userAddress, context);
    const [finalCollateralUsd, finalDebtUsd] = await viewRouter.getPositionValue(MORPHO_BLUE_ID, userAddress, context);

    console.log(`\n=== Final State ===`);
    console.log(`Final LTV: ${Number(finalLtv) / 100}%`);
    console.log(`Final Collateral: $${Number(finalCollateralUsd) / 1e8}`);
    console.log(`Final Debt: $${Number(finalDebtUsd) / 1e8}`);

    const ltvIncrease = finalLtv - initialLtv;
    console.log(`LTV increase: ${Number(ltvIncrease) / 100}%`);

    expect(finalLtv).to.be.gt(initialLtv);
    console.log("✓ LTV increased (leverage successful)");

    const order = await conditionalOrderManager.getOrder(kapanOrderHash);
    expect(order.status).to.equal(2);
    console.log("✓ Order completed");

    console.log("\n=== Auto-Leverage with Real Morpho Flash Loan SUCCESS! ===");
    console.log("Full flow executed:");
    console.log("  1. FlashLoanRouter → adapter.flashLoanAndCallBack()");
    console.log("  2. Adapter → Morpho.flashLoan(USDC) [0% fee!]");
    console.log("  3. Morpho sends USDC → adapter.onMorphoFlashLoan()");
    console.log("  4. Pre-hook: adapter.fundOrderWithBalance() → USDC to OrderManager");
    console.log("  5. VaultRelayer pulls USDC, swaps for wstETH");
    console.log("  6. Post-hook: deposit wstETH, borrow USDC, push to OrderManager");
    console.log("  7. OrderManager refunds USDC to adapter (sellTokenRefundAddress)");
    console.log("  8. Morpho pulls repayment from adapter (0% fee!)");
  });
});
