import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder } from "ethers";
import {
  encodeApprove,
  encodePullToken,
  encodePushToken,
  encodeAdd,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
  LendingOp,
} from "./helpers/instructionHelpers";
import {
  COW_PROTOCOL,
  impersonateAndFund,
  buildOrderParams,
  extractOrderHash,
} from "./helpers/cowHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Base Addresses ============
const BASE_CHAIN_ID = 8453;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const cbBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const USDC_WHALE = "0xcdac0d6c6c59727a65f871236188350531885c43"; // Coinbase
const cbBTC_WHALE = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"; // Morpho (has cbBTC)
const AAVE_POOL_ADDRESSES_PROVIDER = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D"; // Aave V3 on Base
const AAVE_DATA_PROVIDER = "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac"; // Aave V3 Pool Data Provider on Base

const coder = AbiCoder.defaultAbiCoder();

/**
 * Close With Collateral on Base with Aave
 * 
 * Tests the flow: USDC collateral -> cbBTC debt repayment
 * This matches the real order: 0xa32a0d0e...
 */
describe("Close With Collateral Base Aave (Fork)", function () {
  before(function () {
    if (!FORK) this.skip();
  });

  let owner: any, user: any;
  let router: any, aaveGateway: any, orderManager: any, orderHandler: any;
  let usdc: any, cbbtc: any;
  let mockAdapter: any;

  // Test parameters matching the real order
  const COLLATERAL_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC collateral
  const BORROW_AMOUNT = 50000n; // 0.0005 cbBTC debt (50000 satoshi)
  const CHUNK_SIZE = ethers.parseUnits("15", 6); // 15 USDC flash loan
  const MIN_BUY_PER_CHUNK = 15000n; // 0.00015 cbBTC to repay (15000 satoshi)

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);

    // Get token contracts
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    cbbtc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", cbBTC);

    // Fund user with ETH and tokens
    await network.provider.send("hardhat_setBalance", [await user.getAddress(), "0x56BC75E2D63100000"]);
    
    // Fund with USDC
    await impersonateAndFund(USDC_WHALE);
    const usdcWhale = await ethers.getSigner(USDC_WHALE);
    await usdc.connect(usdcWhale).transfer(await user.getAddress(), ethers.parseUnits("500", 6));

    // Deploy KapanRouter
    const Router = await ethers.getContractFactory("KapanRouter");
    router = await Router.deploy(await owner.getAddress());
    const routerAddress = await router.getAddress();

    // Deploy AuthorizationHelper
    const AuthHelper = await ethers.getContractFactory("KapanAuthorizationHelper");
    const authHelper = await AuthHelper.deploy(routerAddress, await owner.getAddress());
    await router.setAuthorizationHelper(await authHelper.getAddress());

    // Deploy Aave gateway for Base
    const AaveGateway = await ethers.getContractFactory("AaveGatewayWrite");
    aaveGateway = await AaveGateway.deploy(routerAddress, AAVE_POOL_ADDRESSES_PROVIDER, 0);
    await router.addGateway("aave", await aaveGateway.getAddress());
    await authHelper.syncGateway("aave", await aaveGateway.getAddress());

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

    // Deploy mock adapter to receive flash loan repayment
    const MockAdapter = await ethers.getContractFactory("MockFlashLoanReceiver");
    mockAdapter = await MockAdapter.deploy();

    // Router setup
    await router.setApprovedManager(await orderManager.getAddress(), true);
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);
  });

  async function getAaveTokenAddresses(asset: string) {
    const dataProvider = await ethers.getContractAt(
      ["function getReserveTokensAddresses(address) view returns (address aToken, address stableDebt, address variableDebt)"],
      AAVE_DATA_PROVIDER
    );
    return dataProvider.getReserveTokensAddresses(asset);
  }

  async function setupAavePosition(collateralAmount: bigint, borrowAmount: bigint) {
    const userAddr = await user.getAddress();
    const gatewayAddr = await aaveGateway.getAddress();

    // Deposit USDC as collateral
    await usdc.connect(user).approve(await router.getAddress(), collateralAmount);
    const depositInstructions = [
      createRouterInstruction(encodePullToken(collateralAmount, USDC, userAddr)),
      createRouterInstruction(encodeApprove(0, "aave")),
      createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Deposit, USDC, userAddr, collateralAmount, "0x", 999)),
    ];
    await router.connect(user).processProtocolInstructions(depositInstructions);

    // Get variable debt token and approve credit delegation
    const [, , variableDebtCbBTC] = await getAaveTokenAddresses(cbBTC);
    const debtToken = await ethers.getContractAt(
      ["function approveDelegation(address, uint256) external"],
      variableDebtCbBTC
    );
    await debtToken.connect(user).approveDelegation(gatewayAddr, ethers.MaxUint256);

    // Borrow cbBTC
    const borrowInstructions = [
      createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Borrow, cbBTC, userAddr, borrowAmount, "0x", 999)),
      createRouterInstruction(encodePushToken(0, userAddr)),
    ];
    await router.connect(user).processProtocolInstructions(borrowInstructions);

    console.log(`\n=== Position Setup ===`);
    console.log(`Deposited: ${ethers.formatUnits(collateralAmount, 6)} USDC`);
    console.log(`Borrowed: ${borrowAmount} satoshi cbBTC`);
  }

  function buildCloseWithCollateralInstructions(
    debtToken: string,
    collateralToken: string,
    userAddr: string,
    orderManagerAddr: string,
    debtAmount: bigint,
    adapterAddr: string
  ) {
    /**
     * Post-hook instructions for Close With Collateral (KIND_BUY)
     * 
     * OrderManager prepends 2 UTXOs:
     *   UTXO[0] = ToOutput(actualSellAmount, collateral) - what was sold
     *   UTXO[1] = ToOutput(leftover, collateral) - leftover at router
     * 
     * Our instructions (indices shifted by +2):
     *   [0] PullToken(debt, orderManager) → UTXO[2]
     *   [1] Approve(2, aave) → UTXO[3] (empty)
     *   [2] Repay(debt, user, inputIndex=2) → UTXO[4]
     *   [3] WithdrawCollateral(collateral, user, inputIndex=0) → UTXO[5]
     *   [4] Add(5, 1) → UTXO[6] = actualSell + leftover
     *   [5] PushToken(6, adapter) - flash loan repay
     */
    return [
      // [0] PullToken: pull debt (cbBTC) from OrderManager → UTXO[2]
      createRouterInstruction(encodePullToken(debtAmount, debtToken, orderManagerAddr)),
      
      // [1] Approve: approve debt for Aave repay (using UTXO[2]) → UTXO[3]
      createRouterInstruction(encodeApprove(2, "aave")),
      
      // [2] Repay: repay user's cbBTC debt using UTXO[2] → UTXO[4]
      createProtocolInstruction("aave", encodeLendingInstruction(
        LendingOp.Repay, debtToken, userAddr, debtAmount, "0x", 2
      )),
      
      // [3] WithdrawCollateral: withdraw USDC using UTXO[0] (actualSellAmount) → UTXO[5]
      createProtocolInstruction("aave", encodeLendingInstruction(
        LendingOp.WithdrawCollateral, collateralToken, userAddr, 0n, "0x", 0
      )),
      
      // [4] Add: UTXO[5] + UTXO[1] = actualSell + leftover → UTXO[6]
      createRouterInstruction(encodeAdd(5, 1)),
      
      // [5] PushToken: send UTXO[6] to adapter for flash loan repay
      createRouterInstruction(encodePushToken(6, adapterAddr)),
    ];
  }

  describe("Fresh Controlled Test", function () {
    let userAddr: string;
    let orderManagerAddr: string;
    let kapanOrderHash: string;
    let salt: string;
    let aUsdcContract: any;
    let variableDebtCbBTCContract: any;

    beforeEach(async function () {
      userAddr = await user.getAddress();
      orderManagerAddr = await orderManager.getAddress();

      // Get aToken and debt token contracts
      const [aUsdc] = await getAaveTokenAddresses(USDC);
      const [, , variableDebtCbBTC] = await getAaveTokenAddresses(cbBTC);
      aUsdcContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aUsdc);
      variableDebtCbBTCContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", variableDebtCbBTC);

      // Setup the position
      await setupAavePosition(COLLATERAL_AMOUNT, BORROW_AMOUNT);

      // Approve gateway to withdraw aTokens
      await aUsdcContract.connect(user).approve(await aaveGateway.getAddress(), ethers.MaxUint256);
    });

    it("should execute close with collateral (USDC collateral, cbBTC debt)", async function () {
      const adapterAddr = await mockAdapter.getAddress();

      // Build post-instructions
      const postInstructions = buildCloseWithCollateralInstructions(
        cbBTC,
        USDC,
        userAddr,
        orderManagerAddr,
        MIN_BUY_PER_CHUNK,
        adapterAddr
      );

      // Create the order
      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("close-usdc-cbbtc-test"));
      const params = buildOrderParams({
        user: userAddr,
        preInstructions: [],
        preTotalAmount: CHUNK_SIZE,
        sellToken: USDC, // Selling USDC (collateral)
        buyToken: cbBTC, // Buying cbBTC (to repay debt)
        chunkSize: CHUNK_SIZE,
        minBuyPerChunk: MIN_BUY_PER_CHUNK,
        postInstructions,
        targetValue: 1,
        appDataHash,
        isFlashLoanOrder: true,
        isKindBuy: true,
      });

      salt = ethers.keccak256(ethers.toUtf8Bytes("close-test-" + Date.now()));
      const tx = await orderManager.connect(user).createOrder(params, salt, 0);
      kapanOrderHash = extractOrderHash(await tx.wait(), orderManager);

      console.log(`\n=== Order Created ===`);
      console.log(`Order hash: ${kapanOrderHash}`);

      // Record balances before
      const aUsdcBefore = await aUsdcContract.balanceOf(userAddr);
      const debtBefore = await variableDebtCbBTCContract.balanceOf(userAddr);
      const adapterUsdcBefore = await usdc.balanceOf(adapterAddr);

      console.log(`\n=== Before Post-Hook ===`);
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcBefore, 6)}`);
      console.log(`User cbBTC debt: ${debtBefore} satoshi`);
      console.log(`Adapter USDC: ${ethers.formatUnits(adapterUsdcBefore, 6)}`);

      // === SIMULATE POST-SWAP STATE ===
      // Simulate: actualSellAmount = 90% of chunkSize, leftover = 10%
      const actualSellAmount = (CHUNK_SIZE * 90n) / 100n;
      const leftover = CHUNK_SIZE - actualSellAmount;

      console.log(`\n=== Simulating Swap ===`);
      console.log(`Actual sell: ${ethers.formatUnits(actualSellAmount, 6)} USDC`);
      console.log(`Leftover: ${ethers.formatUnits(leftover, 6)} USDC`);

      // Deal cbBTC (buyToken/debt) to OrderManager
      await impersonateAndFund(cbBTC_WHALE);
      const cbbtcWhale = await ethers.getSigner(cbBTC_WHALE);
      await cbbtc.connect(cbbtcWhale).transfer(orderManagerAddr, MIN_BUY_PER_CHUNK);

      // Deal USDC (leftover) to OrderManager
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(orderManagerAddr, leftover);

      // Verify OrderManager balances
      const omCbBTC = await cbbtc.balanceOf(orderManagerAddr);
      const omUsdc = await usdc.balanceOf(orderManagerAddr);
      console.log(`OrderManager cbBTC: ${omCbBTC} satoshi`);
      console.log(`OrderManager USDC: ${ethers.formatUnits(omUsdc, 6)}`);

      // === EXECUTE POST-HOOK ===
      await impersonateAndFund(COW_PROTOCOL.hooksTrampoline);
      const trampoline = await ethers.getSigner(COW_PROTOCOL.hooksTrampoline);

      console.log(`\n=== Executing Post-Hook ===`);
      await orderManager.connect(trampoline).executePostHookBySalt(userAddr, salt);

      // === VERIFY RESULTS ===
      const aUsdcAfter = await aUsdcContract.balanceOf(userAddr);
      const debtAfter = await variableDebtCbBTCContract.balanceOf(userAddr);
      const adapterUsdcAfter = await usdc.balanceOf(adapterAddr);
      const routerUsdc = await usdc.balanceOf(await router.getAddress());
      const omUsdcAfter = await usdc.balanceOf(orderManagerAddr);
      const omCbBTCAfter = await cbbtc.balanceOf(orderManagerAddr);

      console.log(`\n=== After Post-Hook ===`);
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcAfter, 6)} (was ${ethers.formatUnits(aUsdcBefore, 6)})`);
      console.log(`User cbBTC debt: ${debtAfter} satoshi (was ${debtBefore})`);
      console.log(`Adapter USDC: ${ethers.formatUnits(adapterUsdcAfter, 6)}`);
      console.log(`Router USDC: ${ethers.formatUnits(routerUsdc, 6)}`);
      console.log(`OrderManager USDC: ${ethers.formatUnits(omUsdcAfter, 6)}`);
      console.log(`OrderManager cbBTC: ${omCbBTCAfter} satoshi`);

      // Verify debt was repaid
      const debtReduction = debtBefore - debtAfter;
      console.log(`\nDebt reduction: ${debtReduction} satoshi`);
      expect(debtReduction).to.be.closeTo(MIN_BUY_PER_CHUNK, 100n); // Allow small variance for interest

      // Verify collateral was withdrawn (by actualSellAmount)
      const collateralReduction = aUsdcBefore - aUsdcAfter;
      console.log(`Collateral reduction: ${ethers.formatUnits(collateralReduction, 6)} USDC`);
      expect(collateralReduction).to.be.closeTo(actualSellAmount, ethers.parseUnits("0.01", 6));

      // Verify adapter received flash loan repayment (actualSell + leftover = CHUNK_SIZE)
      const adapterReceived = adapterUsdcAfter - adapterUsdcBefore;
      console.log(`Adapter received: ${ethers.formatUnits(adapterReceived, 6)} USDC`);
      expect(adapterReceived).to.be.closeTo(CHUNK_SIZE, ethers.parseUnits("0.01", 6));

      // Verify no tokens stuck
      expect(routerUsdc).to.equal(0n);
      expect(omUsdcAfter).to.equal(0n);
      expect(omCbBTCAfter).to.equal(0n);

      console.log(`\n=== SUCCESS ===`);
      console.log(`✓ Debt repaid: ${debtReduction} satoshi cbBTC`);
      console.log(`✓ Collateral withdrawn: ${ethers.formatUnits(collateralReduction, 6)} USDC`);
      console.log(`✓ Flash loan repaid: ${ethers.formatUnits(adapterReceived, 6)} USDC`);
      console.log(`✓ No tokens stuck in router/orderManager`);
    });
  });

  describe("Real On-Chain Order Test", function () {
    // Real order: 0xa32a0d0e4e9bf354710302eb010277ffffda1192a6be79f956a5720944c42b34
    const REAL_ORDER_MANAGER = "0x9A5cA8E27d17eC708Dba13da2cB077DC9352e761";
    const REAL_ADAPTER = "0x0ade77E3BC1fa45F5D19853e2a49E0f773030266";
    const REAL_USER = "0xa9b108038567f76f55219c630bb0e590b748790d";
    const REAL_SALT = "0x60db76a736809ecd8510d6e015a1626d4074ff919bbf1b7248c00a449a1b82aa";
    const REAL_CHUNK_SIZE = 13455403n; // 13.455403 USDC
    const REAL_MIN_BUY = 14640n; // 0.0001464 cbBTC

    let realOrderManager: any;
    let realAdapter: any;
    let aUsdcContract: any;
    let variableDebtCbBTCContract: any;

    beforeEach(async function () {
      // Get contracts at real addresses
      realOrderManager = await ethers.getContractAt("KapanOrderManager", REAL_ORDER_MANAGER);
      
      // Get aToken and debt token contracts
      const [aUsdc] = await getAaveTokenAddresses(USDC);
      const [, , variableDebtCbBTC] = await getAaveTokenAddresses(cbBTC);
      aUsdcContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aUsdc);
      variableDebtCbBTCContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", variableDebtCbBTC);
    });

    it("should execute real on-chain order post-hook", async function () {
      // Check if order exists
      const orderHash = await realOrderManager.userSaltToOrderHash(REAL_USER, REAL_SALT);
      console.log(`\n=== Real Order ===`);
      console.log(`Order hash: ${orderHash}`);

      if (orderHash === ethers.ZeroHash) {
        console.log("Order not found - skipping test");
        this.skip();
        return;
      }

      // Get order details
      const order = await realOrderManager.getOrder(orderHash);
      console.log(`Order status: ${order.status}`);
      console.log(`Iterations: ${order.iterationCount}`);

      // Skip if order already executed or cancelled
      if (order.status !== 1n) { // 1 = Active
        console.log("Order not active - skipping test");
        this.skip();
        return;
      }

      // Record balances before
      const aUsdcBefore = await aUsdcContract.balanceOf(REAL_USER);
      const debtBefore = await variableDebtCbBTCContract.balanceOf(REAL_USER);
      const adapterUsdcBefore = await usdc.balanceOf(REAL_ADAPTER);

      console.log(`\n=== Before Post-Hook ===`);
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcBefore, 6)}`);
      console.log(`User cbBTC debt: ${debtBefore} satoshi`);
      console.log(`Adapter USDC: ${ethers.formatUnits(adapterUsdcBefore, 6)}`);

      // === SIMULATE POST-SWAP STATE ===
      const actualSellAmount = (REAL_CHUNK_SIZE * 95n) / 100n; // 95% sold
      const leftover = REAL_CHUNK_SIZE - actualSellAmount;

      console.log(`\n=== Simulating Swap ===`);
      console.log(`Actual sell: ${ethers.formatUnits(actualSellAmount, 6)} USDC`);
      console.log(`Leftover: ${ethers.formatUnits(leftover, 6)} USDC`);

      // Deal cbBTC (buyToken/debt) to OrderManager
      await impersonateAndFund(cbBTC_WHALE);
      const cbbtcWhale = await ethers.getSigner(cbBTC_WHALE);
      await cbbtc.connect(cbbtcWhale).transfer(REAL_ORDER_MANAGER, REAL_MIN_BUY);

      // Deal USDC (leftover) to OrderManager
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(REAL_ORDER_MANAGER, leftover);

      // Check user has aToken approval for the gateway
      // Get the gateway from the router (gateways mapping uses string key)
      const realRouter = await ethers.getContractAt("KapanRouter", await realOrderManager.router());
      const aaveGatewayAddr = await realRouter.gateways("aave");
      console.log(`\nAave Gateway: ${aaveGatewayAddr}`);

      const currentAllowance = await aUsdcContract.allowance(REAL_USER, aaveGatewayAddr);
      console.log(`User aUSDC allowance for gateway: ${ethers.formatUnits(currentAllowance, 6)}`);

      if (currentAllowance < actualSellAmount) {
        console.log("Insufficient aToken allowance - setting approval...");
        await impersonateAndFund(REAL_USER);
        const realUser = await ethers.getSigner(REAL_USER);
        await aUsdcContract.connect(realUser).approve(aaveGatewayAddr, ethers.MaxUint256);
      }

      // === EXECUTE POST-HOOK ===
      await impersonateAndFund(COW_PROTOCOL.hooksTrampoline);
      const trampoline = await ethers.getSigner(COW_PROTOCOL.hooksTrampoline);

      console.log(`\n=== Executing Post-Hook ===`);
      await realOrderManager.connect(trampoline).executePostHookBySalt(REAL_USER, REAL_SALT);

      // === VERIFY RESULTS ===
      const aUsdcAfter = await aUsdcContract.balanceOf(REAL_USER);
      const debtAfter = await variableDebtCbBTCContract.balanceOf(REAL_USER);
      const adapterUsdcAfter = await usdc.balanceOf(REAL_ADAPTER);

      console.log(`\n=== After Post-Hook ===`);
      console.log(`User aUSDC: ${ethers.formatUnits(aUsdcAfter, 6)} (was ${ethers.formatUnits(aUsdcBefore, 6)})`);
      console.log(`User cbBTC debt: ${debtAfter} satoshi (was ${debtBefore})`);
      console.log(`Adapter USDC: ${ethers.formatUnits(adapterUsdcAfter, 6)}`);

      // Verify changes
      const debtReduction = debtBefore - debtAfter;
      const collateralReduction = aUsdcBefore - aUsdcAfter;
      const adapterReceived = adapterUsdcAfter - adapterUsdcBefore;

      console.log(`\n=== Results ===`);
      console.log(`Debt reduction: ${debtReduction} satoshi`);
      console.log(`Collateral reduction: ${ethers.formatUnits(collateralReduction, 6)} USDC`);
      console.log(`Adapter received: ${ethers.formatUnits(adapterReceived, 6)} USDC`);

      // Verify debt was repaid
      expect(debtReduction).to.be.gte(REAL_MIN_BUY - 100n);

      // Verify collateral withdrawn matches actualSellAmount
      expect(collateralReduction).to.be.closeTo(actualSellAmount, ethers.parseUnits("0.1", 6));

      // Verify adapter received correct amount (actualSell + leftover)
      expect(adapterReceived).to.be.closeTo(REAL_CHUNK_SIZE, ethers.parseUnits("0.1", 6));

      console.log(`\n=== SUCCESS ===`);
      console.log(`✓ Real order post-hook executed successfully`);
    });
  });
});
