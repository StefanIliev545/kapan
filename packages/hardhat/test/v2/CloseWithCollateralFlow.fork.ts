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
  deployRouterWithAuthHelper,
} from "./helpers/instructionHelpers";
import {
  COW_PROTOCOL,
  impersonateAndFund,
  buildOrderParams,
  extractOrderHash,
} from "./helpers/cowHelpers";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum Addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDC_WHALE = "0x489ee077994B6658eAfA855C308275EAd8097C4A";
const WETH_WHALE = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"; // Balancer Vault
const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const AAVE_DATA_PROVIDER = "0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654";

const coder = AbiCoder.defaultAbiCoder();

/**
 * Close With Collateral Post-Hook Flow Test
 * 
 * Tests the instruction flow for closing a leveraged position using collateral:
 * 1. Setup: Create Aave position (WETH collateral, USDC debt)
 * 2. Create a Close With Collateral order with the FIXED instructions
 * 3. Simulate the swap by dealing tokens to OrderManager
 * 4. Execute post-hook and verify position is closed correctly
 */
describe("Close With Collateral Post-Hook Flow (Fork)", function () {
  before(function () {
    if (!FORK) this.skip();
  });

  let owner: any, user: any;
  let router: any, aaveGateway: any, orderManager: any, orderHandler: any;
  let usdc: any, weth: any;
  let mockAdapter: any; // Simple contract to receive flash loan repayment

  // Test parameters
  const COLLATERAL_AMOUNT = ethers.parseEther("1"); // 1 WETH collateral
  const BORROW_AMOUNT = ethers.parseUnits("1000", 6); // 1000 USDC debt
  const CHUNK_SIZE = ethers.parseEther("0.5"); // Flash loan amount
  const MIN_BUY_PER_CHUNK = ethers.parseUnits("1000", 6); // Exact debt to repay

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
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
    await usdc.connect(usdcWhale).transfer(await user.getAddress(), ethers.parseUnits("5000", 6));
    await weth.connect(wethWhale).transfer(await user.getAddress(), ethers.parseEther("5"));

    // Deploy KapanRouter with auth helper
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

    // Deploy a simple mock adapter to receive flash loan repayment
    const MockAdapter = await ethers.getContractFactory("MockFlashLoanReceiver");
    mockAdapter = await MockAdapter.deploy();

    // Router setup: OrderManager can call router on behalf of users
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

    // Deposit WETH as collateral
    await weth.connect(user).approve(await router.getAddress(), collateralAmount);
    const depositInstructions = [
      createRouterInstruction(encodePullToken(collateralAmount, WETH, userAddr)),
      createRouterInstruction(encodeApprove(0, "aave")),
      createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Deposit, WETH, userAddr, collateralAmount, "0x", 999)),
    ];
    await router.connect(user).processProtocolInstructions(depositInstructions);

    // Get variable debt token and approve credit delegation to the gateway
    const [, , variableDebtUsdc] = await getAaveTokenAddresses(USDC);
    const debtToken = await ethers.getContractAt(
      ["function approveDelegation(address, uint256) external", "function borrowAllowance(address, address) view returns (uint256)"],
      variableDebtUsdc
    );
    await debtToken.connect(user).approveDelegation(await aaveGateway.getAddress(), ethers.MaxUint256);

    // Borrow USDC
    const borrowInstructions = [
      createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Borrow, USDC, userAddr, borrowAmount, "0x", 999)),
      createRouterInstruction(encodePushToken(0, userAddr)),
    ];
    await router.connect(user).processProtocolInstructions(borrowInstructions);

    console.log(`\n=== Position Setup ===`);
    console.log(`Deposited: ${ethers.formatEther(collateralAmount)} WETH`);
    console.log(`Borrowed: ${ethers.formatUnits(borrowAmount, 6)} USDC`);
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
      // [0] PullToken: pull debt from OrderManager → UTXO[2]
      createRouterInstruction(encodePullToken(debtAmount, debtToken, orderManagerAddr)),
      
      // [1] Approve: approve debt for Aave repay (using UTXO[2]) → UTXO[3]
      createRouterInstruction(encodeApprove(2, "aave")),
      
      // [2] Repay: repay user's debt using UTXO[2] → UTXO[4]
      createProtocolInstruction("aave", encodeLendingInstruction(
        LendingOp.Repay, debtToken, userAddr, debtAmount, "0x", 2
      )),
      
      // [3] WithdrawCollateral: withdraw using UTXO[0] (actualSellAmount) → UTXO[5]
      // THE FIX: inputIndex=0 instead of 999
      createProtocolInstruction("aave", encodeLendingInstruction(
        LendingOp.WithdrawCollateral, collateralToken, userAddr, 0n, "0x", 0
      )),
      
      // [4] Add: UTXO[5] + UTXO[1] = actualSell + leftover → UTXO[6]
      createRouterInstruction(encodeAdd(5, 1)),
      
      // [5] PushToken: send UTXO[6] to adapter for flash loan repay
      createRouterInstruction(encodePushToken(6, adapterAddr)),
    ];
  }

  describe("Full Close With Collateral Flow", function () {
    let userAddr: string;
    let orderManagerAddr: string;
    let kapanOrderHash: string;
    let salt: string;
    let aWethContract: any;
    let variableDebtUsdcContract: any;

    beforeEach(async function () {
      userAddr = await user.getAddress();
      orderManagerAddr = await orderManager.getAddress();

      // Get aToken and debt token contracts
      const [aWeth] = await getAaveTokenAddresses(WETH);
      const [, , variableDebtUsdc] = await getAaveTokenAddresses(USDC);
      aWethContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aWeth);
      variableDebtUsdcContract = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", variableDebtUsdc);

      // Setup the position
      await setupAavePosition(COLLATERAL_AMOUNT, BORROW_AMOUNT);

      // Approve gateway to withdraw aTokens (required for WithdrawCollateral)
      await aWethContract.connect(user).approve(await aaveGateway.getAddress(), ethers.MaxUint256);
    });

    it("should execute close with collateral post-hook correctly", async function () {
      const adapterAddr = await mockAdapter.getAddress();

      // Build post-instructions with the FIXED logic
      const postInstructions = buildCloseWithCollateralInstructions(
        USDC,
        WETH,
        userAddr,
        orderManagerAddr,
        MIN_BUY_PER_CHUNK,
        adapterAddr
      );

      // Create the order
      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("close-with-collateral-test"));
      const params = buildOrderParams({
        user: userAddr,
        preInstructions: [], // Empty - fundOrder handles this
        preTotalAmount: CHUNK_SIZE,
        sellToken: WETH,
        buyToken: USDC,
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
      const aWethBefore = await aWethContract.balanceOf(userAddr);
      const debtBefore = await variableDebtUsdcContract.balanceOf(userAddr);
      const adapterWethBefore = await weth.balanceOf(adapterAddr);

      console.log(`\n=== Before Post-Hook ===`);
      console.log(`User aWETH: ${ethers.formatEther(aWethBefore)}`);
      console.log(`User debt: ${ethers.formatUnits(debtBefore, 6)} USDC`);
      console.log(`Adapter WETH: ${ethers.formatEther(adapterWethBefore)}`);

      // === SIMULATE POST-SWAP STATE ===
      // In reality, CoW swap happens and:
      // - OrderManager receives buyToken (USDC = debt)
      // - OrderManager has leftover sellToken (WETH)
      
      // Simulate: actualSellAmount = 90% of chunkSize, leftover = 10%
      const actualSellAmount = (CHUNK_SIZE * 90n) / 100n;
      const leftover = CHUNK_SIZE - actualSellAmount;

      console.log(`\n=== Simulating Swap ===`);
      console.log(`Actual sell: ${ethers.formatEther(actualSellAmount)} WETH`);
      console.log(`Leftover: ${ethers.formatEther(leftover)} WETH`);

      // Deal tokens to OrderManager (simulating post-swap state)
      // 1. USDC (buyToken) - the debt amount
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(orderManagerAddr, MIN_BUY_PER_CHUNK);

      // 2. WETH (leftover) - what wasn't sold
      await impersonateAndFund(WETH_WHALE);
      const wethWhale = await ethers.getSigner(WETH_WHALE);
      await weth.connect(wethWhale).transfer(orderManagerAddr, leftover);

      // Verify OrderManager balances
      const omUsdc = await usdc.balanceOf(orderManagerAddr);
      const omWeth = await weth.balanceOf(orderManagerAddr);
      console.log(`OrderManager USDC: ${ethers.formatUnits(omUsdc, 6)}`);
      console.log(`OrderManager WETH: ${ethers.formatEther(omWeth)}`);

      // === EXECUTE POST-HOOK ===
      // Impersonate HooksTrampoline and call executePostHookBySalt
      await impersonateAndFund(COW_PROTOCOL.hooksTrampoline);
      const trampoline = await ethers.getSigner(COW_PROTOCOL.hooksTrampoline);

      console.log(`\n=== Executing Post-Hook ===`);
      await orderManager.connect(trampoline).executePostHookBySalt(userAddr, salt);

      // === VERIFY RESULTS ===
      const aWethAfter = await aWethContract.balanceOf(userAddr);
      const debtAfter = await variableDebtUsdcContract.balanceOf(userAddr);
      const adapterWethAfter = await weth.balanceOf(adapterAddr);
      const routerWeth = await weth.balanceOf(await router.getAddress());
      const omWethAfter = await weth.balanceOf(orderManagerAddr);
      const omUsdcAfter = await usdc.balanceOf(orderManagerAddr);

      console.log(`\n=== After Post-Hook ===`);
      console.log(`User aWETH: ${ethers.formatEther(aWethAfter)} (was ${ethers.formatEther(aWethBefore)})`);
      console.log(`User debt: ${ethers.formatUnits(debtAfter, 6)} USDC (was ${ethers.formatUnits(debtBefore, 6)})`);
      console.log(`Adapter WETH: ${ethers.formatEther(adapterWethAfter)}`);
      console.log(`Router WETH: ${ethers.formatEther(routerWeth)}`);
      console.log(`OrderManager WETH: ${ethers.formatEther(omWethAfter)}`);
      console.log(`OrderManager USDC: ${ethers.formatUnits(omUsdcAfter, 6)}`);

      // Verify debt was repaid
      const debtReduction = debtBefore - debtAfter;
      console.log(`\nDebt reduction: ${ethers.formatUnits(debtReduction, 6)} USDC`);
      expect(debtReduction).to.be.closeTo(MIN_BUY_PER_CHUNK, ethers.parseUnits("1", 6));

      // Verify collateral was withdrawn (by actualSellAmount)
      const collateralReduction = aWethBefore - aWethAfter;
      console.log(`Collateral reduction: ${ethers.formatEther(collateralReduction)} WETH`);
      expect(collateralReduction).to.be.closeTo(actualSellAmount, ethers.parseEther("0.001"));

      // Verify adapter received flash loan repayment (actualSell + leftover = CHUNK_SIZE)
      const adapterReceived = adapterWethAfter - adapterWethBefore;
      console.log(`Adapter received: ${ethers.formatEther(adapterReceived)} WETH`);
      expect(adapterReceived).to.be.closeTo(CHUNK_SIZE, ethers.parseEther("0.001"));

      // Verify no tokens stuck
      expect(routerWeth).to.equal(0n);
      expect(omWethAfter).to.equal(0n);
      expect(omUsdcAfter).to.equal(0n);

      // Verify order state
      const order = await orderManager.getOrder(kapanOrderHash);
      expect(order.iterationCount).to.equal(1n);

      console.log(`\n=== SUCCESS ===`);
      console.log(`✓ Debt repaid: ${ethers.formatUnits(debtReduction, 6)} USDC`);
      console.log(`✓ Collateral withdrawn: ${ethers.formatEther(collateralReduction)} WETH`);
      console.log(`✓ Flash loan repaid: ${ethers.formatEther(adapterReceived)} WETH`);
      console.log(`✓ No tokens stuck in router/orderManager`);
    });

    it("should handle exact sell (no leftover)", async function () {
      const adapterAddr = await mockAdapter.getAddress();

      // Build post-instructions
      const postInstructions = buildCloseWithCollateralInstructions(
        USDC,
        WETH,
        userAddr,
        orderManagerAddr,
        MIN_BUY_PER_CHUNK,
        adapterAddr
      );

      const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("close-exact-test"));
      const params = buildOrderParams({
        user: userAddr,
        preInstructions: [],
        preTotalAmount: CHUNK_SIZE,
        sellToken: WETH,
        buyToken: USDC,
        chunkSize: CHUNK_SIZE,
        minBuyPerChunk: MIN_BUY_PER_CHUNK,
        postInstructions,
        targetValue: 1,
        appDataHash,
        isFlashLoanOrder: true,
        isKindBuy: true,
      });

      salt = ethers.keccak256(ethers.toUtf8Bytes("exact-test-" + Date.now()));
      const tx = await orderManager.connect(user).createOrder(params, salt, 0);
      kapanOrderHash = extractOrderHash(await tx.wait(), orderManager);

      // Record before
      const aWethBefore = await aWethContract.balanceOf(userAddr);
      const debtBefore = await variableDebtUsdcContract.balanceOf(userAddr);

      // Simulate exact sell: no leftover
      const actualSellAmount = CHUNK_SIZE;
      const leftover = 0n;

      console.log(`\n=== Exact Sell Test ===`);
      console.log(`Actual sell: ${ethers.formatEther(actualSellAmount)} WETH`);
      console.log(`Leftover: ${ethers.formatEther(leftover)} WETH`);

      // Deal USDC only (no leftover WETH)
      await impersonateAndFund(USDC_WHALE);
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await usdc.connect(usdcWhale).transfer(orderManagerAddr, MIN_BUY_PER_CHUNK);

      // Execute post-hook
      await impersonateAndFund(COW_PROTOCOL.hooksTrampoline);
      const trampoline = await ethers.getSigner(COW_PROTOCOL.hooksTrampoline);
      await orderManager.connect(trampoline).executePostHookBySalt(userAddr, salt);

      // Verify
      const aWethAfter = await aWethContract.balanceOf(userAddr);
      const debtAfter = await variableDebtUsdcContract.balanceOf(userAddr);
      const adapterWethAfter = await weth.balanceOf(adapterAddr);

      const collateralReduction = aWethBefore - aWethAfter;
      const debtReduction = debtBefore - debtAfter;

      console.log(`Collateral reduction: ${ethers.formatEther(collateralReduction)} WETH`);
      console.log(`Debt reduction: ${ethers.formatUnits(debtReduction, 6)} USDC`);
      console.log(`Adapter received: ${ethers.formatEther(adapterWethAfter)} WETH`);

      // Exact sell means actualSellAmount = chunkSize
      expect(collateralReduction).to.be.closeTo(CHUNK_SIZE, ethers.parseEther("0.001"));
      expect(debtReduction).to.be.closeTo(MIN_BUY_PER_CHUNK, ethers.parseUnits("1", 6));
      // Adapter receives actualSell + leftover = chunkSize + 0 = chunkSize
      expect(adapterWethAfter).to.be.closeTo(CHUNK_SIZE, ethers.parseEther("0.001"));

      console.log(`✓ Exact sell handled correctly`);
    });
  });
});
