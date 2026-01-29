/* eslint-disable no-unused-expressions */
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder } from "ethers";
import { KapanConditionalOrderManager, KapanConditionalOrderHandler, LtvTrigger, KapanViewRouter, KapanCowAdapter } from "../../typechain-types";
import { Signer, Contract } from "ethers";
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
  GPv2OrderData,
  buildTradeSignature,
} from "./helpers/cowHelpers";

const coder = AbiCoder.defaultAbiCoder();

// ============ Arbitrum Addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";
const USDC_WHALE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const AAVE_UI_POOL_DATA_PROVIDER = "0x5c5228aC8BC1528482514aF3e27E692495148717";
const AAVE_DATA_PROVIDER = "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654";

// Morpho Blue on Arbitrum (for flash loans - 0% fee)
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

// Protocol ID
const AAVE_V3 = ethers.keccak256(ethers.toUtf8Bytes("aave-v3")).slice(0, 10);

// HooksTrampoline interface
const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
]);

// Flash Loan Router ABI
const FLASH_LOAN_ROUTER_ABI = [
  "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
  "function settlementContract() view returns (address)",
];

// Adapter interface for funding orders
const ADAPTER_IFACE = new ethers.Interface([
  "function fundOrderBySalt(address user, bytes32 salt, address token, address recipient, uint256 amount) external",
  "function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient) external",
]);


/**
 * Fork Tests for KapanConditionalOrderManager ADL Flow with Flash Loans
 *
 * This test validates the ADL (Auto-Deleverage) flow using:
 * - Real CoW Protocol FlashLoanRouter + Settlement
 * - KapanCowAdapter for flash loan handling
 * - Real KapanRouter executing Aave operations
 * - LTV trigger calculations
 *
 * SIMPLIFIED Flash Loan ADL Flow:
 * 1. Create Aave position (collateral: wstETH, debt: USDC)
 * 2. Create conditional order with LTV trigger
 * 3. Flash loan wstETH → adapter receives tokens
 * 4. Pre-hook 1: adapter.fundOrderWithBalance → moves ALL wstETH to OrderManager
 * 5. Pre-hook 2: orderManager.executePreHookBySalt → caches amounts (no instructions)
 * 6. Settlement: Swap wstETH → USDC (uses flash loan tokens directly)
 * 7. Post-hook: orderManager.executePostHookBySalt:
 *    - Repays USDC debt to Aave
 *    - Withdraws wstETH collateral
 *    - Auto-refunds remaining wstETH to adapter (via sellTokenRefundAddress)
 * 8. Flash loan repays: adapter receives wstETH (leftover + withdrawn) = flash loan amount
 */
describe("KapanConditionalOrderManager - ADL Flow with Flash Loans (Fork)", function () {
  before(async function () {
    const provider = ethers.provider;
    const net = await provider.getNetwork();
    const chainId = Number(net.chainId);
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping - requires Arbitrum fork (got chainId ${chainId})`);
      this.skip();
    }
  });

  // Test amounts
  const COLLATERAL_AMOUNT = ethers.parseEther("5"); // 5 wstETH
  const BORROW_AMOUNT = 5000_000000n; // 5000 USDC

  let orderManager: KapanConditionalOrderManager;
  let cowAdapter: KapanCowAdapter;
  let ltvTrigger: LtvTrigger;
  let viewRouter: KapanViewRouter;
  let router: Contract;
  let aaveGateway: Contract;
  let owner: Signer;
  let user: Signer;
  let userAddress: string;
  let orderManagerAddress: string;
  let orderHandlerAddress: string;
  let adapterAddress: string;
  let routerAddress: string;
  let wsteth: Contract;
  let usdc: Contract;
  let pool: Contract;
  let settlement: Contract;
  let flashLoanRouter: Contract;

  before(async function () {
    [owner] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Fund user with ETH
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);

    // Get token contracts
    const erc20Abi = [
      "function transfer(address to, uint256 amount) returns (bool)",
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function balanceOf(address account) view returns (uint256)",
      "function allowance(address owner, address spender) view returns (uint256)",
    ];
    wsteth = await ethers.getContractAt(erc20Abi, WSTETH);
    usdc = await ethers.getContractAt(erc20Abi, USDC);

    // Get wstETH from whale
    await impersonateAndFund(WSTETH_WHALE);
    const whaleSigner = await ethers.getSigner(WSTETH_WHALE);
    await wsteth.connect(whaleSigner).transfer(userAddress, COLLATERAL_AMOUNT);

    // Get Aave pool
    const poolProvider = await ethers.getContractAt(
      ["function getPool() view returns (address)"],
      AAVE_POOL_ADDRESSES_PROVIDER,
    );
    const poolAddress = await poolProvider.getPool();
    pool = await ethers.getContractAt(
      [
        "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
        "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
        "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
      ],
      poolAddress,
    );

    // Create Aave position
    await wsteth.connect(user).approve(poolAddress, COLLATERAL_AMOUNT);
    await pool.connect(user).supply(WSTETH, COLLATERAL_AMOUNT, userAddress, 0);
    await pool.connect(user).borrow(USDC, BORROW_AMOUNT, 2, 0, userAddress);

    // Get CoW Protocol contracts
    settlement = await getSettlement();
    flashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, COW_PROTOCOL.flashLoanRouter);

    // Deploy KapanRouter
    const deployed = await deployRouterWithAuthHelper(ethers, await owner.getAddress());
    router = deployed.router;
    routerAddress = deployed.routerAddress;
    const { syncGateway } = deployed;

    // Deploy Aave gateway
    const AaveGatewayFactory = await ethers.getContractFactory("AaveGatewayWrite");
    aaveGateway = await AaveGatewayFactory.deploy(routerAddress, AAVE_POOL_ADDRESSES_PROVIDER, 0);
    await router.addGateway("aave", await aaveGateway.getAddress());
    await syncGateway("aave", await aaveGateway.getAddress());

    // Deploy KapanViewRouter and AaveGatewayView
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());

    const AaveGatewayViewFactory = await ethers.getContractFactory("AaveGatewayView");
    const aaveGatewayView = await AaveGatewayViewFactory.deploy(
      AAVE_POOL_ADDRESSES_PROVIDER,
      AAVE_UI_POOL_DATA_PROVIDER,
    );

    await viewRouter.setGateway("aave-v3", await aaveGatewayView.getAddress());

    // Deploy LtvTrigger
    const LtvTriggerFactory = await ethers.getContractFactory("LtvTrigger");
    ltvTrigger = await LtvTriggerFactory.deploy(await viewRouter.getAddress());

    // Deploy KapanCowAdapter
    const CowAdapterFactory = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapterFactory.deploy(
      COW_PROTOCOL.flashLoanRouter,
      await owner.getAddress(),
    );
    adapterAddress = await cowAdapter.getAddress();

    // Configure adapter with Morpho as allowed lender
    await cowAdapter.setMorphoLender(MORPHO_BLUE, true);

    // Deploy KapanConditionalOrderManager
    const OrderManagerFactory = await ethers.getContractFactory("KapanConditionalOrderManager");
    orderManager = await OrderManagerFactory.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline,
    );

    orderManagerAddress = await orderManager.getAddress();

    // Deploy KapanConditionalOrderHandler and set it on the manager
    const OrderHandlerFactory = await ethers.getContractFactory("KapanConditionalOrderHandler");
    const orderHandler = await OrderHandlerFactory.deploy(orderManagerAddress) as KapanConditionalOrderHandler;
    orderHandlerAddress = await orderHandler.getAddress();
    await orderManager.setOrderHandler(orderHandlerAddress);

    // Router setup
    await router.setApprovedManager(orderManagerAddress, true);
    await router.connect(user).setDelegate(orderManagerAddress, true);

    // User approves aToken for gateway to withdraw
    const dataProvider = await ethers.getContractAt(
      [
        "function getReserveTokensAddresses(address) view returns (address aToken, address stableDebt, address variableDebt)",
      ],
      AAVE_DATA_PROVIDER,
    );
    const [aWsteth] = await dataProvider.getReserveTokensAddresses(WSTETH);
    const aWstethContract = await ethers.getContractAt(erc20Abi, aWsteth);
    await aWstethContract.connect(user).approve(await aaveGateway.getAddress(), ethers.MaxUint256);

    // Make owner a solver
    await becomeSolver(await owner.getAddress());

    console.log("\n=== Setup Complete ===");
    console.log(`Router: ${routerAddress}`);
    console.log(`OrderManager: ${orderManagerAddress}`);
    console.log(`CowAdapter: ${adapterAddress}`);
    console.log(`LtvTrigger: ${await ltvTrigger.getAddress()}`);
    console.log(`User: ${userAddress}`);
    console.log(`Collateral: ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH`);
    console.log(`Debt: ${ethers.formatUnits(BORROW_AMOUNT, 6)} USDC`);
  });

  function buildHookCalldata(target: string, fnName: string, args: unknown[]): string {
    const orderManagerIface = new ethers.Interface([
      "function executePreHookBySalt(address user, bytes32 salt) external",
      "function executePostHookBySalt(address user, bytes32 salt) external",
    ]);

    const innerCalldata = orderManagerIface.encodeFunctionData(fnName, args);

    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [
      [
        {
          target: target,
          callData: innerCalldata,
          gasLimit: 2000000n,
        },
      ],
    ]);
  }

  function buildAdapterFundWithBalanceHookCalldata(
    adapterAddr: string,
    userAddr: string,
    salt: string,
    token: string,
    recipient: string,
  ): string {
    const innerCalldata = ADAPTER_IFACE.encodeFunctionData("fundOrderWithBalance", [
      userAddr,
      salt,
      token,
      recipient,
    ]);

    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [
      [
        {
          target: adapterAddr,
          callData: innerCalldata,
          gasLimit: 500000n,
        },
      ],
    ]);
  }

  describe("ADL Flow with flashLoanAndSettle", () => {
    it("should execute ADL via flashLoanAndSettle", async function () {
      this.timeout(180000);

      // Get current LTV
      const currentLtv = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");
      console.log(`\n=== Initial State ===`);
      console.log(`Current LTV: ${currentLtv} bps (${Number(currentLtv) / 100}%)`);

      // Configure trigger: deleverage when LTV is above (currentLtv - 1%) down to (currentLtv - 5%)
      // Since we set trigger below current LTV, it will trigger immediately
      const triggerParams = {
        protocolId: AAVE_V3,
        protocolContext: "0x",
        triggerLtvBps: currentLtv - 100n, // Trigger at current - 1%
        targetLtvBps: currentLtv - 500n, // Target current - 5%
        collateralToken: WSTETH,
        debtToken: USDC,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const triggerStaticData = await ltvTrigger.encodeTriggerParams(triggerParams);
      const [estimatedSellAmount, estimatedMinBuy] = await ltvTrigger.calculateExecution(triggerStaticData, userAddress);

      console.log(`Estimated sell: ${ethers.formatEther(estimatedSellAmount)} wstETH`);
      console.log(`Estimated buy: ${ethers.formatUnits(estimatedMinBuy, 6)} USDC`);

      // ============ BUILD ORDER ============
      // SIMPLIFIED FLOW (like KapanOrderManager):
      // 1. Flash loan wstETH → Adapter → OrderManager (via pre-hook)
      // 2. Swap wstETH → USDC (uses flash loan tokens directly)
      // 3. Post-hook: Repay debt, withdraw collateral
      // 4. Manager auto-refunds remaining wstETH to adapter (via sellTokenRefundAddress)

      // Pre-instructions: EMPTY - no withdrawal before swap
      // The flash loan tokens are used directly for the swap
      const preInstructions: { protocolName: string; data: string }[] = [];

      // Post-hook: Repay debt, then withdraw collateral to cover flash loan
      // Note: _buildPostHookInstructions prepends two ToOutput instructions:
      //   UTXO[0] = actualSellAmount (wstETH - what was sold)
      //   UTXO[1] = actualBuyAmount (USDC - what was received from swap)
      // Post-instructions UTXO layout after _buildPostHookInstructions prepends:
      // UTXO[0] = actualSellAmount (prepended ToOutput)
      // UTXO[1] = actualBuyAmount (prepended ToOutput)
      // UTXO[2] = (Approve produces no output)
      // UTXO[3] = Repay output
      // UTXO[4] = WithdrawCollateral output (the wstETH we need!)
      const postInstructions = [
        // 1. Approve USDC for Aave (UTXO[1] = actualBuyAmount received from swap)
        createRouterInstruction(encodeApprove(1, "aave")),
        // 2. Repay debt using UTXO[1] (the USDC received)
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, "0x", 1),
        ),
        // 3. Withdraw collateral (UTXO[0] = actualSellAmount - to cover flash loan)
        // Output goes to UTXO[4] (after the 2 prepended + approve + repay outputs)
        createProtocolInstruction(
          "aave",
          encodeLendingInstruction(LendingOp.WithdrawCollateral, WSTETH, userAddress, 0n, "0x", 0),
        ),
        // 4. Push withdrawn collateral from router to manager (UTXO[4] → manager)
        // Then manager's auto-refund will send it to adapter for flash loan repayment
        createRouterInstruction(encodePushToken(4, orderManagerAddress)),
      ];

      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-adl-flash-loan-test"));
      const salt = ethers.keccak256(ethers.toUtf8Bytes("adl-flash-" + Date.now()));

      const orderParams = {
        user: userAddress,
        trigger: await ltvTrigger.getAddress(),
        triggerStaticData,
        preInstructions: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [preInstructions],
        ),
        sellToken: WSTETH,
        buyToken: USDC,
        postInstructions: coder.encode(
          ["tuple(string protocolName, bytes data)[]"],
          [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
        ),
        appDataHash,
        maxIterations: 1,
        sellTokenRefundAddress: adapterAddress, // Auto-refund remaining wstETH to adapter for flash loan repayment
      };

      // Create order
      const tx = await orderManager.connect(user).createOrder(orderParams, salt);
      const receipt = await tx.wait();

      const event = receipt?.logs.find((log: unknown) => {
        try {
          return orderManager.interface.parseLog(log as { topics: string[]; data: string })?.name === "ConditionalOrderCreated";
        } catch {
          return false;
        }
      });
      const orderHash = orderManager.interface.parseLog(event as { topics: string[]; data: string })?.args[0];
      console.log(`Order created: ${orderHash}`);

      // ============ GET ORDER FROM COMPOSABLECOW ============
      const composableCoW = await ethers.getContractAt(
        [
          "function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticData) params, bytes offchainInput, bytes32[] proof) external view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)",
        ],
        COW_PROTOCOL.composableCoW,
      );

      const cowParams = {
        handler: orderHandlerAddress,
        salt: salt,
        staticData: coder.encode(["bytes32"], [orderHash]),
      };

      // Get the order that will be settled
      const [freshOrder] = await composableCoW.getTradeableOrderWithSignature(
        orderManagerAddress,
        cowParams,
        "0x",
        [],
      );

      console.log(`\nOrder from ComposableCoW:`);
      console.log(`  sellAmount: ${ethers.formatEther(freshOrder.sellAmount)} wstETH`);
      console.log(`  buyAmount: ${ethers.formatUnits(freshOrder.buyAmount, 6)} USDC`);

      // ============ BUILD SETTLEMENT ============
      const gpv2Order: GPv2OrderData = {
        sellToken: WSTETH,
        buyToken: USDC,
        receiver: orderManagerAddress,
        sellAmount: freshOrder.sellAmount,
        buyAmount: freshOrder.buyAmount,
        validTo: Number(freshOrder.validTo),
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
        receiver: orderManagerAddress,
        sellAmount: freshOrder.sellAmount,
        buyAmount: freshOrder.buyAmount,
        validTo: Number(freshOrder.validTo),
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: freshOrder.sellAmount,
        signature: buildTradeSignature(orderManagerAddress, gpv2Order, orderHandlerAddress, salt, orderHash),
      };

      // Build hook calldata
      // Pre-hook 1: adapter.fundOrderWithBalance - moves ALL flash loan tokens to OrderManager
      const preHook1Calldata = buildAdapterFundWithBalanceHookCalldata(
        adapterAddress,
        userAddress,
        salt,
        WSTETH,
        orderManagerAddress,
      );

      // Pre-hook 2: orderManager.executePreHookBySalt - withdraws collateral, pushes to adapter
      const preHook2Calldata = buildHookCalldata(orderManagerAddress, "executePreHookBySalt", [userAddress, salt]);

      // Post-hook: orderManager.executePostHookBySalt - repays debt
      const postHookCalldata = buildHookCalldata(orderManagerAddress, "executePostHookBySalt", [userAddress, salt]);

      console.log(`\n=== Debug: Hook Calldata ===`);
      console.log(`Pre-hook 1 (fundOrder) calldata length: ${preHook1Calldata.length} bytes`);
      console.log(`Pre-hook 2 (executePreHook) calldata length: ${preHook2Calldata.length} bytes`);
      console.log(`Post-hook calldata length: ${postHookCalldata.length} bytes`);

      const preInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook1Calldata },
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook2Calldata },
      ];
      const postInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHookCalldata },
      ];

      console.log(`Pre-interactions count: ${preInteractions.length}`);
      console.log(`Post-interactions count: ${postInteractions.length}`);

      // Approve VaultRelayer to pull sell tokens from OrderManager
      await orderManager.approveVaultRelayer(WSTETH);

      // ============ FUND SETTLEMENT WITH SOLVER LIQUIDITY (USDC) ============
      // Solver provides USDC to give to the trader in exchange for wstETH
      const actualBuyAmount = (freshOrder.buyAmount * 105n) / 100n; // 5% better execution
      console.log(`\n=== Funding Settlement with Solver Liquidity ===`);
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(COW_PROTOCOL.settlement, actualBuyAmount);
      console.log(`Sent ${ethers.formatUnits(actualBuyAmount, 6)} USDC to Settlement (solver liquidity)`);

      // ============ RECORD STATE BEFORE ============
      const [collateralBefore, debtBefore] = await pool.getUserAccountData(userAddress);
      const ltvBefore = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      console.log(`\n=== Before Settlement ===`);
      console.log(`Collateral: $${ethers.formatUnits(collateralBefore, 8)}`);
      console.log(`Debt: $${ethers.formatUnits(debtBefore, 8)}`);
      console.log(`LTV: ${ltvBefore} bps`);

      // ============ BUILD FLASH LOAN CONFIG ============
      const loans = [
        {
          amount: freshOrder.sellAmount,
          borrower: adapterAddress,
          lender: MORPHO_BLUE,
          token: WSTETH,
        },
      ];

      console.log(`\n=== Flash Loan Config ===`);
      console.log(`Lender: ${MORPHO_BLUE} (Morpho Blue - 0% fee)`);
      console.log(`Borrower: ${adapterAddress} (KapanCowAdapter)`);
      console.log(`Token: wstETH`);
      console.log(`Amount: ${ethers.formatEther(freshOrder.sellAmount)} wstETH`);

      // Build settlement calldata
      const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
        [WSTETH, USDC],
        [actualBuyAmount, freshOrder.sellAmount], // Clearing prices
        [trade],
        [preInteractions, [], postInteractions],
      ]);

      // ============ EXECUTE FLASH LOAN AND SETTLE ============
      console.log(`\n=== Executing flashLoanAndSettle ===`);

      try {
        const settleTx = await flashLoanRouter.connect(owner).flashLoanAndSettle(
          loans,
          settlementCalldata,
          { gasLimit: 8000000 },
        );
        const settleReceipt = await settleTx.wait();
        console.log(`Gas used: ${settleReceipt.gasUsed}`);
        console.log(`\n✅ flashLoanAndSettle SUCCEEDED!`);
      } catch (error: unknown) {
        console.log(`\n❌ flashLoanAndSettle FAILED: ${(error as Error).message}`);

        // Try to get more details
        if ((error as { data?: string }).data) {
          console.log(`Error data: ${(error as { data: string }).data}`);
        }

        // Check adapter state
        const adapterWstethBalance = await wsteth.balanceOf(adapterAddress);
        console.log(`\nAdapter wstETH balance: ${ethers.formatEther(adapterWstethBalance)}`);

        // Try checking if Morpho has wstETH liquidity
        const morphoWstethBalance = await wsteth.balanceOf(MORPHO_BLUE);
        console.log(`Morpho wstETH balance: ${ethers.formatEther(morphoWstethBalance)}`);

        throw error;
      }

      // ============ VERIFY RESULTS ============
      const [collateralAfter, debtAfter] = await pool.getUserAccountData(userAddress);
      const ltvAfter = await ltvTrigger.getCurrentLtv(AAVE_V3, userAddress, "0x");

      console.log(`\n=== After Settlement ===`);
      console.log(`Collateral: $${ethers.formatUnits(collateralAfter, 8)}`);
      console.log(`Debt: $${ethers.formatUnits(debtAfter, 8)}`);
      console.log(`LTV: ${ltvAfter} bps`);

      // Debug: Check where the tokens went
      const userUsdcBalance = await usdc.balanceOf(userAddress);
      const orderManagerUsdcBalance = await usdc.balanceOf(orderManagerAddress);
      const adapterWstethBalance = await wsteth.balanceOf(adapterAddress);
      console.log(`\n=== Debug: Token Balances ===`);
      console.log(`User USDC: ${ethers.formatUnits(userUsdcBalance, 6)}`);
      console.log(`OrderManager USDC: ${ethers.formatUnits(orderManagerUsdcBalance, 6)}`);
      console.log(`Adapter wstETH: ${ethers.formatEther(adapterWstethBalance)} (should be 0 - flash loan repaid)`);

      // Verify order executed
      const order = await orderManager.getOrder(orderHash);
      console.log(`\n=== Order Status ===`);
      console.log(`Order status: ${order.status} (2=Completed)`);
      console.log(`Iteration count: ${order.iterationCount}`);

      // Verify collateral decreased (we withdrew some to sell)
      expect(collateralAfter).to.be.lt(collateralBefore);
      console.log(`\n✓ Collateral reduced (sold for swap)`);

      // Verify debt decreased (we repaid with swap proceeds)
      expect(debtAfter).to.be.lt(debtBefore);
      const debtReduction = debtBefore - debtAfter;
      console.log(`✓ Debt reduced by $${ethers.formatUnits(debtReduction, 8)}`);

      // Verify LTV decreased
      expect(ltvAfter).to.be.lt(ltvBefore);
      console.log(`✓ LTV reduced by ${Number(ltvBefore - ltvAfter)} bps`);

      // Verify adapter has minimal wstETH (flash loan was repaid, small dust acceptable)
      // Due to rounding between flash loan amount and collateral withdrawal, tiny dust may remain
      const maxDustWei = ethers.parseEther("0.00001"); // 0.00001 wstETH = ~$0.03 at $3000/ETH
      expect(adapterWstethBalance).to.be.lt(maxDustWei);
      console.log(`✓ Flash loan repaid (adapter wstETH dust: ${ethers.formatEther(adapterWstethBalance)})`);

      console.log(`\n=== ADL with Flash Loan Completed Successfully ===`);
      console.log(`Flow executed:`);
      console.log(`  1. Flash loan: Borrowed ${ethers.formatEther(freshOrder.sellAmount)} wstETH from Morpho`);
      console.log(`  2. Pre-hook 1: Moved flash loan wstETH to OrderManager`);
      console.log(`  3. Pre-hook 2: Withdrew collateral from Aave → pushed to adapter`);
      console.log(`  4. Swap: Sold wstETH for USDC`);
      console.log(`  5. Post-hook: Repaid USDC debt to Aave`);
      console.log(`  6. Flash loan repaid: Adapter returned wstETH to Morpho`);
    });
  });
});
