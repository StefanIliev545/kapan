import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder } from "ethers";
import {
  encodeApprove,
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
  buildOrderParams,
  extractOrderHash,
  buildTradeSignature,
  GPv2OrderData,
} from "./helpers/cowHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum Addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC_WHALE = "0x489ee077994B6658eAfA855C308275EAd8097C4A";
const WETH_WHALE = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const AAVE_V3_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const AAVE_DATA_PROVIDER = "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654";

const coder = AbiCoder.defaultAbiCoder();

// HooksTrampoline interface
const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external"
]);

// FlashLoanRouter interface
const FLASH_LOAN_ROUTER_ABI = [
  "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
  "function settlementContract() view returns (address)",
];

// KapanCowAdapter interface
const KAPAN_ADAPTER_IFACE = new ethers.Interface([
  "function fundOrder(address token, address recipient, uint256 amount) external",
]);

/**
 * Tests for KapanCowAdapter - our custom borrower for CoW flash loans
 * 
 * This test verifies the full flow:
 * 1. Deploy KapanCowAdapter
 * 2. Use it as the borrower in FlashLoanRouter.flashLoanAndSettle()
 * 3. Pre-hook calls adapter.fundOrder() to move tokens to OrderManager
 * 4. Trade executes
 * 5. Post-hook deposits collateral and borrows for repayment
 */
describe("KapanCowAdapter Flash Loan Integration (Fork)", function () {
  before(function () {
    if (!FORK) this.skip();
  });

  let owner: any, user: any, solver: any;
  let router: any, aaveGateway: any, orderManager: any, orderHandler: any;
  let kapanAdapter: any;
  let settlement: any, flashLoanRouter: any;
  let usdc: any, weth: any;

  beforeEach(async function () {
    [owner, solver] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);

    // Get token contracts
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

    // Fund user
    await network.provider.send("hardhat_setBalance", [await user.getAddress(), "0x56BC75E2D63100000"]);
    await impersonateAndFund(USDC_WHALE);
    await impersonateAndFund(WETH_WHALE);
    const usdcWhale = await ethers.getSigner(USDC_WHALE);
    const wethWhale = await ethers.getSigner(WETH_WHALE);
    await usdc.connect(usdcWhale).transfer(await user.getAddress(), ethers.parseUnits("2000", 6));
    await weth.connect(wethWhale).transfer(await user.getAddress(), ethers.parseEther("3"));

    // Get CoW Protocol contracts
    settlement = await getSettlement();
    flashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, COW_PROTOCOL.flashLoanRouter);

    // Deploy KapanCowAdapter
    const KapanCowAdapter = await ethers.getContractFactory("KapanCowAdapter");
    kapanAdapter = await KapanCowAdapter.deploy(
      COW_PROTOCOL.flashLoanRouter,
      await owner.getAddress()
    );
    await kapanAdapter.waitForDeployment();

    // Configure Aave as allowed lender
    await kapanAdapter.setLender(AAVE_V3_POOL, true);

    // Deploy KapanRouter
    const { router: _router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, await owner.getAddress());
    router = _router;

    // Deploy Aave gateway
    const AaveGateway = await ethers.getContractFactory("AaveGatewayWrite");
    aaveGateway = await AaveGateway.deploy(routerAddress, AAVE_POOL_ADDRESSES_PROVIDER, 0);
    await router.addGateway("aave", await aaveGateway.getAddress());
    await syncGateway("aave", await aaveGateway.getAddress());

    // Deploy KapanOrderManager
    const OrderManager = await ethers.getContractFactory("KapanOrderManager");
    orderManager = await OrderManager.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline
    );

    // Deploy KapanOrderHandler
    const OrderHandler = await ethers.getContractFactory("KapanOrderHandler");
    orderHandler = await OrderHandler.deploy(await orderManager.getAddress());
    await orderManager.setOrderHandler(await orderHandler.getAddress());

    // Router setup
    await router.setApprovedManager(await orderManager.getAddress(), true);
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);

    // Make FlashLoanRouter and solver authorized
    await becomeSolver(COW_PROTOCOL.flashLoanRouter);
    await becomeSolver(await solver.getAddress());
  });

  async function getAaveTokenAddresses(asset: string) {
    const dataProvider = await ethers.getContractAt(
      ["function getReserveTokensAddresses(address) view returns (address aToken, address stableDebt, address variableDebt)"],
      AAVE_DATA_PROVIDER
    );
    return dataProvider.getReserveTokensAddresses(asset);
  }

  async function depositToAave(token: any, amount: bigint, userAddr: string) {
    await token.connect(user).approve(await router.getAddress(), amount);
    const instructions = [
      createRouterInstruction(coder.encode(
        ["tuple(uint256 amount,address token,address user,uint8 instructionType)"],
        [[amount, await token.getAddress(), userAddr, 1]]
      )),
      createRouterInstruction(encodeApprove(0, "aave")),
      createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Deposit, await token.getAddress(), userAddr, amount, "0x", 999)),
    ];
    await router.connect(user).processProtocolInstructions(instructions);
  }

  function buildHookCalldata(orderManagerAddr: string, kapanOrderHash: string, isPreHook: boolean): string {
    const orderManagerIface = new ethers.Interface([
      "function executePreHook(bytes32 orderHash) external",
      "function executePostHook(bytes32 orderHash) external"
    ]);
    
    const innerCalldata = isPreHook 
      ? orderManagerIface.encodeFunctionData("executePreHook", [kapanOrderHash])
      : orderManagerIface.encodeFunctionData("executePostHook", [kapanOrderHash]);
    
    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
      target: orderManagerAddr,
      callData: innerCalldata,
      gasLimit: 1000000n,
    }]]);
  }

  describe("Flash Loan via KapanCowAdapter", function () {
    const FLASH_AMOUNT = ethers.parseEther("0.5");
    const SELL_AMOUNT = ethers.parseEther("0.5");
    const BUY_AMOUNT = ethers.parseUnits("1500", 6);

    let userAddr: string;
    let orderManagerAddr: string;
    let orderHandlerAddr: string;
    let adapterAddr: string;
    let aUsdcContract: any;
    let kapanOrderHash: string;
    let salt: string;
    let appDataHash: string;

    beforeEach(async function () {
      userAddr = await user.getAddress();
      orderManagerAddr = await orderManager.getAddress();
      orderHandlerAddr = await orderHandler.getAddress();
      adapterAddr = await kapanAdapter.getAddress();

      const [aUsdc] = await getAaveTokenAddresses(USDC);
      aUsdcContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aUsdc);

      // Setup: User deposits WETH as collateral first
      await depositToAave(weth, ethers.parseEther("1"), userAddr);
    });

    it("should execute flash loan via KapanCowAdapter", async function () {
      console.log("\n=== KapanCowAdapter Flash Loan Test ===");
      console.log(`Adapter: ${adapterAddr}`);
      console.log(`Flash loan: ${ethers.formatEther(FLASH_AMOUNT)} WETH`);

      // Create order with post-instructions to deposit received USDC
      const postInstructions = [
        createRouterInstruction(encodeApprove(0, "aave")),
        createProtocolInstruction("aave", encodeLendingInstruction(
          LendingOp.Deposit, USDC, userAddr, 0n, "0x", 0
        )),
      ];

      appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-adapter-test"));
      const params = buildOrderParams({
        user: userAddr,
        preInstructions: [],
        preTotalAmount: SELL_AMOUNT,
        sellToken: WETH,
        buyToken: USDC,
        chunkSize: SELL_AMOUNT,
        minBuyPerChunk: BUY_AMOUNT,
        postInstructions,
        targetValue: 1,
        appDataHash,
        isFlashLoanOrder: true,
      });

      salt = ethers.keccak256(ethers.toUtf8Bytes("adapter-test-" + Date.now()));
      const tx = await orderManager.connect(user).createOrder(params, salt, 0);
      kapanOrderHash = extractOrderHash(await tx.wait(), orderManager);

      console.log(`Order created: ${kapanOrderHash}`);

      // Build GPv2 order
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: WETH,
        buyToken: USDC,
        receiver: COW_PROTOCOL.settlement,
        sellAmount: SELL_AMOUNT,
        buyAmount: BUY_AMOUNT,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        kind: GPV2_ORDER.KIND_SELL,
        partiallyFillable: false,
        sellTokenBalance: GPV2_ORDER.BALANCE_ERC20,
        buyTokenBalance: GPV2_ORDER.BALANCE_ERC20,
      };

      // Build trade
      const trade = {
        sellTokenIndex: 0,
        buyTokenIndex: 1,
        receiver: COW_PROTOCOL.settlement,
        sellAmount: SELL_AMOUNT,
        buyAmount: BUY_AMOUNT,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: SELL_AMOUNT,
        signature: buildTradeSignature(orderManagerAddr, gpv2Order, orderHandlerAddr, salt, kapanOrderHash),
      };

      // Flash loan fee
      const AAVE_FLASH_FEE_BPS = 5n;
      const flashFee = (FLASH_AMOUNT * AAVE_FLASH_FEE_BPS) / 10000n;
      const flashRepayment = FLASH_AMOUNT + flashFee;

      // Build pre-interactions:
      // 1. Adapter.fundOrder() - transfers flash-loaned WETH to OrderManager
      const fundOrderCalldata = KAPAN_ADAPTER_IFACE.encodeFunctionData("fundOrder", [
        WETH, orderManagerAddr, FLASH_AMOUNT
      ]);
      
      // Wrap in HooksTrampoline
      const preFundHookCalldata = HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[{
        target: adapterAddr,
        callData: fundOrderCalldata,
        gasLimit: 300000n,
      }]]);

      // 2. Execute Kapan pre-hook (empty for this order)
      const preHookCalldata = buildHookCalldata(orderManagerAddr, kapanOrderHash, true);

      const preInteractions = [
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preFundHookCalldata },
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHookCalldata },
      ];

      // Build post-interactions
      // 1. Transfer USDC from Settlement to OrderManager
      const transferUsdcCalldata = new ethers.Interface([
        "function transfer(address to, uint256 amount) external returns (bool)"
      ]).encodeFunctionData("transfer", [orderManagerAddr, BUY_AMOUNT]);

      // 2. Execute Kapan post-hook (deposits USDC)
      const postHookCalldata = buildHookCalldata(orderManagerAddr, kapanOrderHash, false);

      // 3. Transfer WETH repayment from Settlement to Adapter
      const transferRepaymentCalldata = new ethers.Interface([
        "function transfer(address to, uint256 amount) external returns (bool)"
      ]).encodeFunctionData("transfer", [adapterAddr, flashRepayment]);

      const postInteractions = [
        { target: USDC, value: 0n, callData: transferUsdcCalldata },
        { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHookCalldata },
        { target: WETH, value: 0n, callData: transferRepaymentCalldata },
      ];

      // Ensure OrderManager has approved VaultRelayer
      await orderManager.approveVaultRelayer(WETH);

      // Pre-fund settlement with USDC (simulating solver liquidity)
      await usdc.connect(await ethers.getSigner(USDC_WHALE)).transfer(COW_PROTOCOL.settlement, BUY_AMOUNT);
      
      // Pre-fund settlement with WETH for flash loan fee
      await weth.connect(await ethers.getSigner(WETH_WHALE)).transfer(COW_PROTOCOL.settlement, flashFee);

      // Encode settlement calldata
      const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
        [WETH, USDC],
        [BUY_AMOUNT, SELL_AMOUNT],
        [trade],
        [preInteractions, [], postInteractions],
      ]);

      // Build loans array using KapanCowAdapter
      const loans = [{
        amount: FLASH_AMOUNT,
        borrower: adapterAddr,
        lender: AAVE_V3_POOL,
        token: WETH,
      }];

      // Record balances before
      const aUsdcBefore = await aUsdcContract.balanceOf(userAddr);

      console.log("\n=== Before Flash Loan ===");
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcBefore, 6)}`);

      // Execute flash loan and settlement
      console.log("\n=== Executing FlashLoanRouter.flashLoanAndSettle() ===");
      
      const flashTx = await flashLoanRouter.connect(solver).flashLoanAndSettle(loans, settlementCalldata);
      const receipt = await flashTx.wait();
      
      console.log(`Gas used: ${receipt.gasUsed}`);

      // Check results
      const aUsdcAfter = await aUsdcContract.balanceOf(userAddr);

      console.log("\n=== After Flash Loan ===");
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcAfter, 6)} (+${ethers.formatUnits(aUsdcAfter - aUsdcBefore, 6)})`);

      // Verify
      expect(aUsdcAfter).to.be.gt(aUsdcBefore);
      expect(aUsdcAfter - aUsdcBefore).to.be.closeTo(BUY_AMOUNT, ethers.parseUnits("10", 6));
      console.log("✓ aUSDC collateral increased");

      // Verify order completed
      const order = await orderManager.getOrder(kapanOrderHash);
      expect(order.status).to.equal(2);
      console.log("✓ Order marked as complete");

      console.log("\n=== KapanCowAdapter Flash Loan Success! ===");
    });
  });
});
