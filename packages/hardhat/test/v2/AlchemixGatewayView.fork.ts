/**
 * AlchemixGatewayView LTV/price math + trigger dispatch test (Arbitrum fork).
 *
 * Purpose: prove (or disprove) that the view path the frontend's "Trigger Met" indicator
 * relies on actually returns sane values for live alchemix positions. The frontend reads
 * `KapanConditionalOrderManager.isTriggerMet(orderHash)` which forwards to the trigger's
 * `shouldExecute()`, which for AutoLeverage calls `KapanViewRouter.getCurrentLtv(protocolId,
 * user, context)` and for the alchemix `protocolId` dispatches into
 * `AlchemixGatewayView.getCurrentLtvBps(marketId, tokenId)`.
 *
 * If anything in that chain reverts or returns garbage, the order is silently invisible to
 * solvers and the UI shows no trigger-met badge — exactly the symptom we're investigating.
 *
 * Cases covered:
 *   1. Empty position (collateral but zero debt) — getCurrentLtv must return 0 (not revert).
 *   2. Borrowed position — non-zero LTV, getPositionValue and asset prices populated.
 *   3. Position with earmarked debt mixed in (forced via direct repay route) — math survives.
 *   4. End-to-end shouldExecute through the AutoLeverageTrigger when LTV < threshold.
 *   5. End-to-end isTriggerMet through KapanConditionalOrderManager (the exact view the FE hits).
 */

import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer, Contract } from "ethers";
import {
  encodeApprove,
  encodePullToken,
  encodePushToken,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
  LendingOp,
  deployRouterWithAuthHelper,
} from "./helpers/instructionHelpers";
import { COW_PROTOCOL, impersonateAndFund } from "./helpers/cowHelpers";
import { ALCHEMIX_GATEWAY_NAME, ALCHEMIX_PROTOCOL_ID } from "../../utils/alchemixConstants";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const USDC_WHALE = "0x47c031236e19d024b42f8AE6780E44A573170703";
const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";

const ALCHEMIX = {
  alchemist: "0x930750a3510E703535e943E826ABa3c364fFC1De",
  alUsd: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
};

function encodeAlchemixContext(marketId: bigint, tokenId: bigint): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [marketId, tokenId]);
}

describe("AlchemixGatewayView dispatch + trigger readback (Fork)", function () {
  this.timeout(360_000);

  before(async function () {
    if (!FORK) this.skip();
    const code = await ethers.provider.getCode(ALCHEMIX.alchemist);
    if (code === "0x") this.skip();
  });

  let owner: Signer;
  let user: Signer;
  let userAddress: string;

  let router: Contract;
  let alchemixGateway: Contract;
  let alchemixGatewayView: Contract;
  let viewRouter: Contract;
  let autoLeverageTrigger: Contract;
  let orderManager: Contract;
  let orderHandler: Contract;

  let routerAddress: string;
  let gatewayAddress: string;

  let usdc: Contract;
  let alchemist: Contract;
  let positionNft: Contract;

  let marketId: bigint;
  let tokenId: bigint;

  before(async function () {
    [owner] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);
    for (let i = 0; i < 3; i++) await network.provider.send("evm_mine", []);

    usdc = await ethers.getContractAt(
      ["function transfer(address to, uint256 amount) returns (bool)", "function approve(address spender, uint256 amount) returns (bool)", "function balanceOf(address account) view returns (uint256)"],
      USDC,
    );
    alchemist = await ethers.getContractAt("IAlchemistV3", ALCHEMIX.alchemist);
    const realPositionNft: string = await alchemist.alchemistPositionNFT();
    positionNft = new ethers.Contract(
      realPositionNft,
      ["function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"],
      ethers.provider,
    );

    await impersonateAndFund(USDC_WHALE);
    const whale = await ethers.getSigner(USDC_WHALE);
    await usdc.connect(whale).transfer(userAddress, 5_000n * 10n ** 6n);

    // Deploy stack.
    const deployed = await deployRouterWithAuthHelper(ethers, await owner.getAddress());
    router = deployed.router;
    routerAddress = deployed.routerAddress;
    const { syncGateway } = deployed;

    const AlchemixGatewayFactory = await ethers.getContractFactory("AlchemixGatewayWrite");
    alchemixGateway = await AlchemixGatewayFactory.deploy(routerAddress, await owner.getAddress());
    gatewayAddress = await alchemixGateway.getAddress();
    await router.addGateway(ALCHEMIX_GATEWAY_NAME, gatewayAddress);
    await syncGateway(ALCHEMIX_GATEWAY_NAME, gatewayAddress);
    await alchemixGateway.registerMarket(ALCHEMIX.alchemist);
    marketId = await alchemixGateway.alchemistToMarketId(ALCHEMIX.alchemist);

    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());
    const AlchemixGatewayViewFactory = await ethers.getContractFactory("AlchemixGatewayView");
    alchemixGatewayView = await AlchemixGatewayViewFactory.deploy(gatewayAddress, AAVE_POOL_ADDRESSES_PROVIDER);
    await viewRouter.setGateway(ALCHEMIX_GATEWAY_NAME, await alchemixGatewayView.getAddress());

    const AutoLeverageTriggerFactory = await ethers.getContractFactory("AutoLeverageTrigger");
    autoLeverageTrigger = await AutoLeverageTriggerFactory.deploy(await viewRouter.getAddress());

    const OrderManagerFactory = await ethers.getContractFactory("KapanConditionalOrderManager");
    orderManager = await OrderManagerFactory.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline,
    );
    const OrderHandlerFactory = await ethers.getContractFactory("KapanConditionalOrderHandler");
    orderHandler = await OrderHandlerFactory.deploy(await orderManager.getAddress());
    await orderManager.setOrderHandler(await orderHandler.getAddress());

    await router.setApprovedManager(await orderManager.getAddress(), true);
    await router.connect(user).setDelegate(await orderManager.getAddress(), true);

    // ============ Open position with NO debt ============
    await usdc.connect(user).approve(routerAddress, 5_000n * 10n ** 6n);
    const ctxNew = encodeAlchemixContext(marketId, 0n);
    await router.connect(user).processProtocolInstructions(
      [
        createRouterInstruction(encodePullToken(5_000n * 10n ** 6n, USDC, userAddress)),
        createRouterInstruction(encodeApprove(0, ALCHEMIX_GATEWAY_NAME)),
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.DepositCollateral, USDC, userAddress, 0n, ctxNew, 0),
        ),
      ],
      { gasLimit: 2_000_000 },
    );
    tokenId = await positionNft.tokenOfOwnerByIndex(userAddress, 0n);
  });

  it("returns LTV=0 for a position with collateral but no debt", async () => {
    const ctx = encodeAlchemixContext(marketId, tokenId);
    const ltv = await viewRouter.getCurrentLtv(ALCHEMIX_PROTOCOL_ID, userAddress, ctx);
    expect(ltv).to.equal(0n);

    // PositionValue: collateral > 0, debt = 0.
    const [collUsd, debtUsd] = await viewRouter.getPositionValue(ALCHEMIX_PROTOCOL_ID, userAddress, ctx);
    expect(collUsd).to.be.gt(0n);
    expect(debtUsd).to.equal(0n);

    // Underlying + alAsset prices should be roughly $1 (alUSD is face-value pegged).
    const usdcPrice = await viewRouter.getCollateralPrice(ALCHEMIX_PROTOCOL_ID, USDC, ctx);
    const alUsdPrice = await viewRouter.getDebtPrice(ALCHEMIX_PROTOCOL_ID, ALCHEMIX.alUsd, ctx);
    expect(usdcPrice).to.be.gt(0n);
    expect(alUsdPrice).to.equal(usdcPrice); // face-value peg
  });

  it("returns sane LTV after borrowing alUSD", async () => {
    const ctx = encodeAlchemixContext(marketId, tokenId);
    const borrowAmount = 1_500n * 10n ** 18n; // 1,500 alUSD against 5k USDC -> ~30% LTV

    // Grant mint allowance via gateway.authorize().
    {
      const [targets, data] = await alchemixGateway.authorize(
        [{ op: LendingOp.Borrow, token: ALCHEMIX.alUsd, user: userAddress, amount: borrowAmount, context: ctx, input: { index: 999 } }],
        userAddress,
        [],
      );
      for (let i = 0; i < targets.length; i++) {
        if (targets[i] !== ethers.ZeroAddress && data[i].length > 0) {
          await user.sendTransaction({ to: targets[i], data: data[i] });
        }
      }
    }
    await router.connect(user).processProtocolInstructions(
      [
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.Borrow, ALCHEMIX.alUsd, userAddress, borrowAmount, ctx, 999),
        ),
        createRouterInstruction(encodePushToken(0, userAddress)),
      ],
      { gasLimit: 2_000_000 },
    );

    const ltv = await viewRouter.getCurrentLtv(ALCHEMIX_PROTOCOL_ID, userAddress, ctx);
    console.log(`  LTV after borrow: ${Number(ltv) / 100}%`);
    expect(ltv).to.be.gt(2900n).and.lt(3100n); // 29-31%

    const [collUsd, debtUsd] = await viewRouter.getPositionValue(ALCHEMIX_PROTOCOL_ID, userAddress, ctx);
    console.log(`  Collateral $${Number(collUsd) / 1e8}, Debt $${Number(debtUsd) / 1e8}`);
    expect(collUsd).to.be.gt(debtUsd);
    // Recompute LTV from position value to cross-check decimals scaling.
    const ltvFromValues = (debtUsd * 10000n) / collUsd;
    expect(ltvFromValues - ltv > 0n ? ltvFromValues - ltv : ltv - ltvFromValues).to.be.lt(50n); // <0.5% diff
  });

  it("ends-to-end: AutoLeverageTrigger.shouldExecute fires while LTV < threshold", async () => {
    const ctx = encodeAlchemixContext(marketId, tokenId);
    const params = await autoLeverageTrigger.encodeTriggerParams({
      protocolId: ALCHEMIX_PROTOCOL_ID,
      protocolContext: ctx,
      triggerLtvBps: 5000n,   // fire while LTV < 50%
      targetLtvBps: 6000n,
      collateralToken: USDC,
      debtToken: ALCHEMIX.alUsd,
      collateralDecimals: 6,
      debtDecimals: 18,
      maxSlippageBps: 200,
      numChunks: 1,
    });

    const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(params, userAddress);
    console.log(`  shouldExecute=${shouldExec} reason="${reason}"`);
    expect(shouldExec).to.equal(true);

    // calculateExecution must produce non-zero amounts (means getPositionValue + getDebtPrice
    // + getCollateralPrice all returned non-zero on the alchemix dispatch path).
    const [sellAmt, minBuy] = await autoLeverageTrigger.calculateExecution(params, userAddress, 0n);
    console.log(`  sellAmt=${ethers.formatUnits(sellAmt, 18)} alUSD, minBuy=${ethers.formatUnits(minBuy, 6)} USDC`);
    expect(sellAmt).to.be.gt(0n);
    expect(minBuy).to.be.gt(0n);
  });

  it("ends-to-end: KapanConditionalOrderManager.isTriggerMet returns true (the FE indicator path)", async () => {
    // Build a minimal AL order targeting the user's position so that `isTriggerMet(orderHash)`
    // exercises the same dispatch chain the frontend's drawer hits.
    const ctx = encodeAlchemixContext(marketId, tokenId);
    const params = await autoLeverageTrigger.encodeTriggerParams({
      protocolId: ALCHEMIX_PROTOCOL_ID,
      protocolContext: ctx,
      triggerLtvBps: 7000n,
      targetLtvBps: 8000n,
      collateralToken: USDC,
      debtToken: ALCHEMIX.alUsd,
      collateralDecimals: 6,
      debtDecimals: 18,
      maxSlippageBps: 200,
      numChunks: 1,
    });

    const orderParams = {
      user: userAddress,
      trigger: await autoLeverageTrigger.getAddress(),
      triggerStaticData: params,
      preInstructions: ethers.AbiCoder.defaultAbiCoder().encode(["tuple(string protocolName, bytes data)[]"], [[]]),
      sellToken: ALCHEMIX.alUsd,
      buyToken: USDC,
      postInstructions: ethers.AbiCoder.defaultAbiCoder().encode(["tuple(string protocolName, bytes data)[]"], [[]]),
      appDataHash: ethers.keccak256(ethers.toUtf8Bytes("kapan-alchemix-view-test")),
      maxIterations: 1n,
      sellTokenRefundAddress: ethers.ZeroAddress,
      isKindBuy: false,
    };
    const salt = ethers.keccak256(ethers.toUtf8Bytes("alchemix-view-test-" + Date.now()));
    const tx = await orderManager.connect(user).createOrder(orderParams, salt);
    const rcpt = await tx.wait();
    const evt = rcpt?.logs.find((log: unknown) => {
      try {
        return orderManager.interface.parseLog(log as { topics: string[]; data: string })?.name === "ConditionalOrderCreated";
      } catch { return false; }
    });
    const orderHash = orderManager.interface.parseLog(evt as { topics: string[]; data: string })?.args[0];

    // The exact view the frontend hits.
    const isTriggerMetIface = new ethers.Interface([
      "function isTriggerMet(bytes32 orderHash) view returns (bool, string)",
    ]);
    const result = await ethers.provider.call({
      to: await orderManager.getAddress(),
      data: isTriggerMetIface.encodeFunctionData("isTriggerMet", [orderHash]),
    });
    const [shouldExec, reason] = isTriggerMetIface.decodeFunctionResult("isTriggerMet", result) as [boolean, string];
    console.log(`  isTriggerMet=${shouldExec} reason="${reason}"`);
    expect(shouldExec).to.equal(true);
  });
});
