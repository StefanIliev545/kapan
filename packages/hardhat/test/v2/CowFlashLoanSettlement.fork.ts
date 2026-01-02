import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder } from "ethers";
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
const WETH_WHALE = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"; // Balancer Vault
const BALANCER_V2_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const AAVE_V3_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"; // Aave V3 on Arbitrum
const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const AAVE_DATA_PROVIDER = "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654";

const coder = AbiCoder.defaultAbiCoder();

// HooksTrampoline interface
const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external"
]);

// FlashLoanRouter interface (CoW's deployed contract)
const FLASH_LOAN_ROUTER_ABI = [
  "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
  "function settlementContract() view returns (address)",
  "function settlementAuthentication() view returns (address)",
];

// AaveBorrower interface (for Aave V3 flash loans)
const AAVE_BORROWER_ABI = [
  "function approve(address token, address target, uint256 amount) external",
  "function router() view returns (address)",
  "function settlementContract() view returns (address)",
];

/**
 * Tests for CoW Protocol Flash Loan Integration with KapanRouter
 * 
 * Uses REAL deployed CoW contracts:
 * - FlashLoanRouter: 0x9da8b48441583a2b93e2ef8213aad0ec0b392c69
 * - AaveBorrower: 0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A (for Aave V3)
 * - ERC3156Borrower: 0x47d71b4b3336ab2729436186c216955f3c27cd04 (for ERC-3156 lenders like Maker)
 * 
 * SUPPORTED LENDERS:
 * - Aave V3 (via AaveBorrower) - RECOMMENDED, tested here
 * - ERC-3156 compliant lenders like Maker (via ERC3156Borrower)
 * 
 * NOT SUPPORTED:
 * - Balancer V2 - does NOT implement ERC-3156, no BalancerBorrower exists
 * 
 * Flow with AaveBorrower:
 * 1. Solver calls FlashLoanRouter.flashLoanAndSettle(loans, settlementCalldata)
 * 2. FlashLoanRouter → AaveBorrower.flashLoanAndCallBack()
 * 3. AaveBorrower → AavePool.flashLoanSimple() → Borrower receives tokens
 * 4. Aave callback → AaveBorrower.executeOperation()
 * 5. AaveBorrower → FlashLoanRouter.borrowerCallBack()
 * 6. FlashLoanRouter → Settlement.settle()
 * 7. Settlement executes pre-hooks: transferFrom(Borrower → OrderManager) + KapanRouter operations
 * 8. Settlement executes order swap
 * 9. Settlement executes post-hooks: KapanRouter operations
 * 10. Flash loan repaid to Aave (includes 0.05% fee)
 */
describe("CoW Flash Loan with Real FlashLoanRouter (Fork)", function () {
  before(function () {
    if (!FORK) this.skip();
  });

  let owner: any, user: any, solver: any;
  let router: any, aaveGateway: any, orderManager: any, orderHandler: any;
  let settlement: any, flashLoanRouter: any, aaveBorrower: any;
  let usdc: any, weth: any;

  beforeEach(async function () {
    [owner, solver] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);

    // Get token contracts
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

    // Fund user with ETH and tokens
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
    aaveBorrower = await ethers.getContractAt(AAVE_BORROWER_ABI, COW_PROTOCOL.aaveBorrower);

    // Verify CoW contracts are correctly configured
    expect((await flashLoanRouter.settlementContract()).toLowerCase()).to.equal(COW_PROTOCOL.settlement.toLowerCase());
    expect((await aaveBorrower.router()).toLowerCase()).to.equal(COW_PROTOCOL.flashLoanRouter.toLowerCase());

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

    // Router setup: OrderManager can call router on behalf of users
    await router.setApprovedManager(await orderManager.getAddress(), true);
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);

    // Make FlashLoanRouter a solver (required to call flashLoanAndSettle)
    await becomeSolver(COW_PROTOCOL.flashLoanRouter);
    // Make our test solver address a solver too
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
        [[amount, await token.getAddress(), userAddr, 1]] // PullToken = 1
      )),
      createRouterInstruction(encodeApprove(0, "aave")),
      createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Deposit, await token.getAddress(), userAddr, amount, "0x", 999)),
    ];
    await router.connect(user).processProtocolInstructions(instructions);
  }

  async function approveCreditDelegation(debtTokenAddr: string, spender: string) {
    const debtToken = await ethers.getContractAt(["function approveDelegation(address, uint256) external"], debtTokenAddr);
    await debtToken.connect(user).approveDelegation(spender, ethers.MaxUint256);
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

  describe("Flash Loan via Real FlashLoanRouter", function () {
    const FLASH_AMOUNT = ethers.parseEther("0.5"); // 0.5 WETH flash loan
    const SELL_AMOUNT = ethers.parseEther("0.5");  // Sell the flash loaned WETH
    const BUY_AMOUNT = ethers.parseUnits("1500", 6); // Buy ~1500 USDC

    let userAddr: string;
    let orderManagerAddr: string;
    let orderHandlerAddr: string;
    let aWethContract: any;
    let aUsdcContract: any;
    let domainSeparator: string;
    let kapanOrderHash: string;
    let salt: string;
    let appDataHash: string;

    beforeEach(async function () {
      userAddr = await user.getAddress();
      orderManagerAddr = await orderManager.getAddress();
      orderHandlerAddr = await orderHandler.getAddress();

      const [aWeth] = await getAaveTokenAddresses(WETH);
      const [aUsdc] = await getAaveTokenAddresses(USDC);

      aWethContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aWeth);
      aUsdcContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aUsdc);

      // Setup: User needs collateral to be able to deposit the bought USDC
      // For flash loan leverage, user deposits WETH, borrows USDC via flash loan
      await depositToAave(weth, ethers.parseEther("1"), userAddr);

      domainSeparator = await settlement.domainSeparator();
    });

    it("should execute flash loan settlement through CoW's FlashLoanRouter", async function () {
      /**
       * This test executes the REAL CoW flash loan flow:
       * 
       * 1. Create a Kapan order that:
       *    - Has empty pre-instructions (flash loan provides the sell tokens)
       *    - Has post-instructions to deposit received USDC as collateral
       *    - Has receiver = Settlement (required for flash loan orders)
       * 
       * 2. Build settlement with:
       *    - Pre-hook: Transfer flash loaned WETH from Borrower → OrderManager
       *    - Order: Sell WETH for USDC
       *    - Post-hook: Execute Kapan post-instructions (deposit USDC)
       * 
       * 3. Call FlashLoanRouter.flashLoanAndSettle() which orchestrates:
       *    - Flash loan from Balancer
       *    - Settlement execution with hooks
       *    - Flash loan repayment
       */

      console.log("\n=== CoW Flash Loan Settlement Test ===");
      console.log(`Flash loan: ${ethers.formatEther(FLASH_AMOUNT)} WETH`);
      console.log(`Sell: ${ethers.formatEther(SELL_AMOUNT)} WETH → Buy: ${ethers.formatUnits(BUY_AMOUNT, 6)} USDC`);

      // Create order with flash loan mode (receiver = Settlement)
      // Post-instructions: deposit received USDC as collateral
      const postInstructions = [
        createRouterInstruction(encodeApprove(0, "aave")),
        createProtocolInstruction("aave", encodeLendingInstruction(
          LendingOp.Deposit, USDC, userAddr, 0n, "0x", 0 // Use UTXO[0] = received USDC
        )),
      ];

      appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-flash-loan-leverage"));
      const params = buildOrderParams({
        user: userAddr,
        preInstructions: [], // Empty! Flash loan provides funds
        preTotalAmount: SELL_AMOUNT,
        sellToken: WETH,
        buyToken: USDC,
        chunkSize: SELL_AMOUNT,
        minBuyPerChunk: BUY_AMOUNT,
        postInstructions,
        targetValue: 1,
        appDataHash,
        isFlashLoanOrder: true, // receiver = Settlement
      });

      salt = ethers.keccak256(ethers.toUtf8Bytes("flash-test-" + Date.now()));
      const tx = await orderManager.connect(user).createOrder(params, salt, 0);
      kapanOrderHash = extractOrderHash(await tx.wait(), orderManager);

      console.log(`Order created: ${kapanOrderHash}`);

      // Build the GPv2 order
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: WETH,
        buyToken: USDC,
        receiver: COW_PROTOCOL.settlement, // Flash loan orders must have receiver = Settlement
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
        receiver: COW_PROTOCOL.settlement, // Must match order receiver for flash loans
        sellAmount: SELL_AMOUNT,
        buyAmount: BUY_AMOUNT,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: SELL_AMOUNT,
        signature: buildTradeSignature(orderManagerAddr, gpv2Order, orderHandlerAddr, salt, kapanOrderHash),
      };

      // Aave V3 charges a flash loan fee (0.05%)
      const AAVE_FLASH_FEE_BPS = 5n; // 0.05% = 5 basis points
      const flashFee = (FLASH_AMOUNT * AAVE_FLASH_FEE_BPS) / 10000n;
      const flashRepayment = FLASH_AMOUNT + flashFee;
      
      const borrowerAddr = COW_PROTOCOL.aaveBorrower;
      
      // The Borrower needs to approve Settlement to transfer the flash loaned tokens
      // This is done via Borrower.approve() which can only be called by Settlement
      const borrowerApproveCalldata = new ethers.Interface([
        "function approve(address token, address target, uint256 amount) external"
      ]).encodeFunctionData("approve", [WETH, COW_PROTOCOL.settlement, FLASH_AMOUNT]);

      // Transfer flash loaned WETH from Borrower to OrderManager
      const transferFromCalldata = new ethers.Interface([
        "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
      ]).encodeFunctionData("transferFrom", [borrowerAddr, orderManagerAddr, FLASH_AMOUNT]);

      const preHookCalldata = buildHookCalldata(orderManagerAddr, kapanOrderHash, true);
      const postHookCalldata = buildHookCalldata(orderManagerAddr, kapanOrderHash, false);

      const preInteractions = [
        // 1. Borrower approves Settlement to transfer WETH
        {
          target: borrowerAddr,
          value: 0n,
          callData: borrowerApproveCalldata,
        },
        // 2. Transfer WETH from Borrower to OrderManager
        {
          target: WETH,
          value: 0n,
          callData: transferFromCalldata,
        },
        // 3. Execute Kapan pre-hook (empty for this order, but still needed for state)
        {
          target: COW_PROTOCOL.hooksTrampoline,
          value: 0n,
          callData: preHookCalldata,
        },
      ];

      // Aave repayment: Borrower needs to approve Aave Pool and have funds
      // The flash loaned WETH was transferred to OrderManager
      // After swap, we need to ensure Borrower has WETH + fee to repay Aave
      
      // Approve Borrower to transfer WETH back to itself for repayment
      const borrowerApproveForAave = new ethers.Interface([
        "function approve(address token, address target, uint256 amount) external"
      ]).encodeFunctionData("approve", [WETH, AAVE_V3_POOL, flashRepayment]);

      // For flash loan orders, receiver = Settlement, so we need to transfer
      // the received USDC from Settlement to OrderManager before post-hook
      const transferUsdcToOrderManager = new ethers.Interface([
        "function transfer(address to, uint256 amount) external returns (bool)"
      ]).encodeFunctionData("transfer", [orderManagerAddr, BUY_AMOUNT]);

      const postInteractions = [
        // 1. Transfer received USDC from Settlement to OrderManager
        {
          target: USDC,
          value: 0n,
          callData: transferUsdcToOrderManager,
        },
        // 2. Execute Kapan post-hook (deposits USDC to Aave)
        {
          target: COW_PROTOCOL.hooksTrampoline,
          value: 0n,
          callData: postHookCalldata,
        },
        // 3. Transfer repayment amount (principal + fee) back to Borrower
        // Need to cover the flash loan fee from Settlement's WETH balance
        {
          target: WETH,
          value: 0n,
          callData: new ethers.Interface([
            "function transfer(address to, uint256 amount) external returns (bool)"
          ]).encodeFunctionData("transfer", [borrowerAddr, flashRepayment]),
        },
        // 4. Approve Aave Pool to pull the repayment from Borrower
        {
          target: borrowerAddr,
          value: 0n,
          callData: borrowerApproveForAave,
        },
      ];

      // Ensure OrderManager has approved VaultRelayer
      await orderManager.approveVaultRelayer(WETH);

      // Pre-fund settlement with USDC (simulating solver liquidity for the swap)
      await usdc.connect(await ethers.getSigner(USDC_WHALE)).transfer(COW_PROTOCOL.settlement, BUY_AMOUNT);
      
      // Pre-fund settlement with WETH to cover flash loan fee
      await weth.connect(await ethers.getSigner(WETH_WHALE)).transfer(COW_PROTOCOL.settlement, flashFee);

      // Encode settlement calldata
      const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
        [WETH, USDC], // tokens
        [BUY_AMOUNT, SELL_AMOUNT], // clearing prices
        [trade], // trades
        [preInteractions, [], postInteractions], // interactions
      ]);

      // Build loans array - use Aave V3 as lender
      const loans = [{
        amount: FLASH_AMOUNT,
        borrower: borrowerAddr,
        lender: AAVE_V3_POOL,
        token: WETH,
      }];

      // Record balances before
      const aWethBefore = await aWethContract.balanceOf(userAddr);
      const aUsdcBefore = await aUsdcContract.balanceOf(userAddr);

      console.log("\n=== Before Flash Loan Settlement ===");
      console.log(`User aWETH: ${ethers.formatEther(aWethBefore)}`);
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcBefore, 6)}`);

      // Execute flash loan and settlement
      console.log("\n=== Executing FlashLoanRouter.flashLoanAndSettle() ===");
      
      const flashTx = await flashLoanRouter.connect(solver).flashLoanAndSettle(loans, settlementCalldata);
      const receipt = await flashTx.wait();
      
      console.log(`Gas used: ${receipt.gasUsed}`);

      // Record balances after
      const aWethAfter = await aWethContract.balanceOf(userAddr);
      const aUsdcAfter = await aUsdcContract.balanceOf(userAddr);
      
      // Check where the USDC ended up
      const settlementUsdc = await usdc.balanceOf(COW_PROTOCOL.settlement);
      const orderManagerUsdc = await usdc.balanceOf(orderManagerAddr);
      const userUsdc = await usdc.balanceOf(userAddr);

      console.log("\n=== After Flash Loan Settlement ===");
      console.log(`User aWETH: ${ethers.formatEther(aWethAfter)}`);
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcAfter, 6)} (+${ethers.formatUnits(aUsdcAfter - aUsdcBefore, 6)})`);
      console.log(`Settlement USDC: ${ethers.formatUnits(settlementUsdc, 6)}`);
      console.log(`OrderManager USDC: ${ethers.formatUnits(orderManagerUsdc, 6)}`);
      console.log(`User USDC: ${ethers.formatUnits(userUsdc, 6)}`);

      // Verify results
      expect(aUsdcAfter).to.be.gt(aUsdcBefore);
      expect(aUsdcAfter - aUsdcBefore).to.be.closeTo(BUY_AMOUNT, ethers.parseUnits("10", 6));
      console.log("✓ aUSDC collateral increased from swap proceeds");

      // Verify order completed
      const order = await orderManager.getOrder(kapanOrderHash);
      expect(order.status).to.equal(2); // Completed
      console.log("✓ Order marked as complete");

      console.log("\n=== Flash Loan Settlement Success! ===");
      console.log("Full flow executed:");
      console.log("  1. FlashLoanRouter.flashLoanAndSettle() called");
      console.log("  2. AaveBorrower requested flash loan from Aave V3");
      console.log("  3. Flash loaned WETH transferred to OrderManager");
      console.log("  4. Settlement executed with VaultRelayer pulling WETH");
      console.log("  5. WETH swapped for USDC (solver liquidity)");
      console.log("  6. USDC transferred to OrderManager");
      console.log("  7. Post-hook deposited USDC to Aave via KapanRouter");
      console.log("  8. Flash loan repaid to Aave (principal + 0.05% fee)");
    });
  });
});
