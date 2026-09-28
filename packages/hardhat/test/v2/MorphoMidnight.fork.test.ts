import { expect } from "chai";
import { ethers, network } from "hardhat";
import { coder, Z, MAX, WAD, cash, col, NAME, ctx, marketId, deploy } from "./helpers/midnightHelpers";
import {
  LendingOp as Op,
  FlashLoanProvider,
  createProtocolInstruction as protocol,
  createRouterInstruction as ri,
  encodeLendingInstruction as li,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeToOutput,
  encodeFlashLoan,
  encodeSubtract,
} from "./helpers/instructionHelpers";

// Real Base deployments. No code or storage replacement on these contracts.
const MIDNIGHT = "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A";
const SETTER = "0x800B5F12A61B8198a5a6EfD794Cac6699B294d63";
const BLUE = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const types = {
  CollateralParams: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "liquidationCursor", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
  Market: [
    { name: "chainId", type: "uint256" },
    { name: "midnight", type: "address" },
    { name: "loanToken", type: "address" },
    { name: "collateralParams", type: "CollateralParams[]" },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "enterGate", type: "address" },
    { name: "liquidatorGate", type: "address" },
  ],
  Offer: [
    { name: "market", type: "Market" },
    { name: "buy", type: "bool" },
    { name: "maker", type: "address" },
    { name: "start", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "tick", type: "uint256" },
    { name: "group", type: "bytes32" },
    { name: "callback", type: "address" },
    { name: "callbackData", type: "bytes" },
    { name: "receiverIfMakerIsSeller", type: "address" },
    { name: "ratifier", type: "address" },
    { name: "reduceOnly", type: "bool" },
    { name: "maxUnits", type: "uint128" },
    { name: "maxAssets", type: "uint128" },
    { name: "continuousFeeCap", type: "uint256" },
  ],
};

(process.env.MIDNIGHT_FORK_RPC_URL ? describe : describe.skip)("Morpho Midnight :fork deployed matching", function () {
  this.timeout(240000);
  let user: any,
    lender: any,
    keeper: any,
    owner: any,
    router: any,
    core: any,
    blue: any,
    gateway: any,
    loan: any,
    collateral: any,
    setter: any;
  let market: any, id: string, base: any, params: any, blueCtx: string, blueId: string, snapshot: string;
  const mi = (op: Op, token: string, amount: bigint, context = ctx(id), index = 999) =>
    protocol(NAME, li(op, token, user.address, amount, context, index));
  const bi = (op: Op, token: string, amount: bigint, index = 999) =>
    protocol("morpho-blue", li(op, token, user.address, amount, blueCtx, index));
  const run = (instructions: any[]) => router.connect(user).processProtocolInstructions(instructions);
  async function ratify(overrides: any = {}) {
    const offer = {
      market,
      buy: true,
      maker: lender.address,
      start: 0,
      expiry: market.maturity - 1,
      tick: 3960,
      group: ethers.id("fork-lender"),
      callback: Z,
      callbackData: "0x",
      receiverIfMakerIsSeller: Z,
      ratifier: SETTER,
      reduceOnly: false,
      maxUnits: cash(100000),
      maxAssets: 0,
      continuousFeeCap: MAX,
      ...overrides,
    };
    const root = ethers.TypedDataEncoder.hashStruct("Offer", types, offer);
    await setter.connect(lender).setIsRootRatified(lender.address, root, true);
    return {
      offer,
      ratifierData: coder.encode(["bytes32", "uint256", "bytes32[]"], [root, 0, []]),
      maxUnits: cash(100000),
    };
  }
  const deposit = () =>
    run([
      ri(encodePullToken(col(2), WETH, user.address)),
      ri(encodeApprove(0, NAME)),
      mi(Op.DepositCollateral, WETH, 0n, ctx(id), 0),
    ]);

  before(async () => {
    [owner, user, lender, keeper] = await ethers.getSigners();
    expect((await ethers.provider.getNetwork()).chainId).to.equal(8453n);
    for (const address of [MIDNIGHT, SETTER, BLUE, USDC, WETH])
      expect(await ethers.provider.getCode(address)).not.to.equal("0x");
    core = await ethers.getContractAt("IMidnight", MIDNIGHT);
    blue = await ethers.getContractAt("IMorphoBlue", BLUE);
    loan = await ethers.getContractAt("IERC20", USDC);
    collateral = new ethers.Contract(
      WETH,
      [
        "function deposit() payable",
        "function approve(address,uint256) returns(bool)",
        "function transfer(address,uint256) returns(bool)",
        "function balanceOf(address) view returns(uint256)",
      ],
      user,
    );
    setter = new ethers.Contract(SETTER, ["function setIsRootRatified(address,bytes32,bool)"], lender);
    // Fund test actors by transferring real USDC on the local fork only; never overwrite token storage.
    await network.provider.send("hardhat_setBalance", [BLUE, "0x56BC75E2D63100000"]);
    await network.provider.send("hardhat_impersonateAccount", [BLUE]);
    const whale = await ethers.getSigner(BLUE);
    await loan.connect(whale).transfer(lender.address, cash(200000));
    await loan.connect(whale).transfer(user.address, cash(10000));
    await network.provider.send("hardhat_stopImpersonatingAccount", [BLUE]);
    await collateral.deposit({ value: col(20) });
    const oracle = await deploy("MidnightTestOracle", 3000n * 10n ** 24n);
    router = await deploy("KapanRouter", owner.address);
    await router.setMorphoBluePool(BLUE); // Real flash loan, including during Blue repay/supply callbacks.
    gateway = await deploy("MorphoMidnightGatewayWrite", router.target, MIDNIGHT);
    await router.addGateway(NAME, gateway.target);
    const blueGateway = await deploy("MorphoBlueGatewayWrite", router.target, owner.address, BLUE);
    await router.addGateway("morpho-blue", blueGateway.target);
    await core.connect(user).setIsAuthorized(gateway.target, true, user.address);
    await core.connect(lender).setIsAuthorized(SETTER, true, lender.address);
    await blue.connect(user).setAuthorization(blueGateway.target, true);
    await loan.connect(lender).approve(MIDNIGHT, MAX);
    await loan.connect(lender).approve(BLUE, MAX);
    await loan.connect(user).approve(router.target, MAX);
    await collateral.approve(router.target, MAX);
    await collateral.approve(BLUE, MAX);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    market = {
      chainId: 8453,
      midnight: MIDNIGHT,
      loanToken: USDC,
      collateralParams: [
        { token: WETH, lltv: (86n * WAD) / 100n, liquidationCursor: (3n * WAD) / 10n, oracle: oracle.target },
      ],
      maturity: now + 30 * 86400,
      rcfThreshold: 0,
      enterGate: Z,
      liquidatorGate: Z,
    };
    id = marketId(market);
    await core.touchMarket(market);
    params = { loanToken: USDC, collateralToken: WETH, oracle: oracle.target, irm: Z, lltv: (86n * WAD) / 100n };
    blueCtx = coder.encode(
      ["tuple(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)"],
      [params],
    );
    blueId = ethers.keccak256(blueCtx);
    await new ethers.Contract(
      BLUE,
      ["function createMarket((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv))"],
      owner,
    ).createMarket(params);
    await blue.connect(lender).supply(params, cash(100000), 0, lender.address, "0x");
    base = {
      deadline: market.maturity - 1,
      maxUnits: cash(10000),
      minUnits: 0,
      priceLimit: (9n * WAD) / 10n,
      maxApr: MAX,
      minHealthFactor: 0,
      planProvider: Z,
      planKey: ethers.ZeroHash,
      takes: [],
    };
    snapshot = await network.provider.send("evm_snapshot");
  });
  beforeEach(async () => {
    await network.provider.send("evm_revert", [snapshot]);
    snapshot = await network.provider.send("evm_snapshot");
  });

  it("matches real ratified bids, accounts face debt, repays and releases collateral", async () => {
    await deposit();
    const take = await ratify();
    const before = await loan.balanceOf(user.address);
    await run([
      mi(Op.Borrow, USDC, cash(1000), ctx(id, 0, { ...base, takes: [take] })),
      ri(encodePushToken(0, user.address)),
    ]);
    const debt = await core.debt(id, user.address);
    expect(debt).to.be.greaterThan(cash(1000));
    expect(await core.credit(id, lender.address)).to.equal(debt);
    expect(await core.consumed(lender.address, take.offer.group)).to.equal(debt);
    expect(await loan.balanceOf(user.address)).to.equal(before + cash(1000));
    await run([
      ri(encodePullToken(debt, USDC, user.address)),
      ri(encodeApprove(0, NAME)),
      mi(Op.Repay, USDC, 0n, ctx(id), 0),
      mi(Op.WithdrawCollateral, WETH, col(2)),
      ri(encodePushToken(3, user.address)),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.collateral(id, user.address, 0)).to.equal(0);
    expect(await loan.balanceOf(gateway.target)).to.equal(0);
  });

  it("refinances deployed Blue to Midnight and back using deployed Blue flash loans", async () => {
    await blue.connect(user).supplyCollateral(params, col(2), user.address, "0x");
    await blue.connect(user).borrow(params, cash(1000), 0, user.address, user.address);
    const take = await ratify();
    await run([
      ri(encodeToOutput(cash(1000), USDC)),
      ri(encodeFlashLoan(FlashLoanProvider.Morpho, 0)),
      ri(encodeApprove(0, "morpho-blue")),
      bi(Op.Repay, USDC, 0n, 0),
      bi(Op.WithdrawCollateral, WETH, col(2)),
      ri(encodeApprove(4, NAME)),
      mi(Op.DepositCollateral, WETH, 0n, ctx(id), 4),
      mi(Op.Borrow, USDC, 0n, ctx(id, 0, { ...base, takes: [take] }), 1),
    ]);
    expect((await blue.position(blueId, user.address)).borrowShares).to.equal(0);
    expect(await core.collateral(id, user.address, 0)).to.equal(col(2));
    const debt = await core.debt(id, user.address);
    await run([
      ri(encodeToOutput(debt, USDC)),
      ri(encodeFlashLoan(FlashLoanProvider.Morpho, 0)),
      ri(encodeApprove(0, NAME)),
      mi(Op.Repay, USDC, 0n, ctx(id), 0),
      mi(Op.WithdrawCollateral, WETH, col(2)),
      ri(encodeApprove(4, "morpho-blue")),
      bi(Op.DepositCollateral, WETH, 0n, 4),
      bi(Op.Borrow, USDC, 0n, 1),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect((await blue.position(blueId, user.address)).collateral).to.equal(col(2));
    expect(await loan.balanceOf(router.target)).to.equal(0);
  });

  it("rolls back the entire refinance when ratification is revoked, then executes after offer refresh", async () => {
    await blue.connect(user).supplyCollateral(params, col(2), user.address, "0x");
    await blue.connect(user).borrow(params, cash(1000), 0, user.address, user.address);
    const take = await ratify();
    const key = ethers.id("deferred-refinance");
    const root = ethers.TypedDataEncoder.hashStruct("Offer", types, take.offer);
    await setter.connect(lender).setIsRootRatified(lender.address, root, false);
    await gateway.connect(keeper).setExecutionPlan(key, [take]);
    const instructions = [
      ri(encodeToOutput(cash(1000), USDC)),
      ri(encodeFlashLoan(FlashLoanProvider.Morpho, 0)),
      ri(encodeApprove(0, "morpho-blue")),
      bi(Op.Repay, USDC, 0n, 0),
      bi(Op.WithdrawCollateral, WETH, col(2)),
      ri(encodeApprove(4, NAME)),
      mi(Op.DepositCollateral, WETH, 0n, ctx(id), 4),
      mi(Op.Borrow, USDC, 0n, ctx(id, 0, { ...base, planProvider: keeper.address, planKey: key }), 1),
    ];
    await expect(run(instructions)).to.be.revertedWithCustomError(gateway, "InsufficientOffers");
    expect((await blue.position(blueId, user.address)).collateral).to.equal(col(2));
    expect(await core.debt(id, user.address)).to.equal(0);
    await gateway.connect(keeper).setExecutionPlan(key, [await ratify({ group: ethers.id("refreshed") })]);
    await run(instructions);
    expect((await blue.position(blueId, user.address)).borrowShares).to.equal(0);
    expect(await core.debt(id, user.address)).to.be.greaterThan(cash(1000));
  });

  it("leverages and closes through the production aggregator gateway with real lending and flash loans", async () => {
    await deposit();
    const take = await ratify();
    const venue = await deploy("MidnightTestSwapVenue");
    const swapGateway = await deploy("OneInchGateway", router.target, owner.address);
    const adapter = await deploy("OneInchAdapter", swapGateway.target, venue.target);
    await swapGateway.setAdapter(adapter.target);
    await router.addGateway("oneinch", swapGateway.target);
    await collateral.transfer(venue.target, col(5));
    await loan.connect(lender).transfer(venue.target, cash(20000));
    const sc = (src: string, dst: string, n: bigint, d: bigint) =>
      coder.encode(
        ["address", "uint256", "bytes"],
        [dst, 1, venue.interface.encodeFunctionData("swap", [src, dst, n, d])],
      );
    await run([
      ri(encodeToOutput(cash(1000), USDC)),
      ri(encodeFlashLoan(FlashLoanProvider.Morpho, 0)),
      ri(encodeApprove(0, "oneinch")),
      protocol("oneinch", li(Op.Swap, USDC, user.address, 0n, sc(USDC, WETH, 10n ** 12n, 3000n), 0)),
      ri(encodeApprove(3, NAME)),
      mi(Op.DepositCollateral, WETH, 0n, ctx(id), 3),
      mi(Op.Borrow, USDC, 0n, ctx(id, 0, { ...base, takes: [take] }), 1),
    ]);
    const balance = await core.collateral(id, user.address, 0),
      debt = await core.debt(id, user.address);
    expect(balance).to.be.greaterThan(col(2));
    expect(debt).to.be.greaterThan(cash(1000));
    await run([
      ri(encodeToOutput(debt, USDC)),
      ri(encodeFlashLoan(FlashLoanProvider.Morpho, 0)),
      ri(encodeApprove(0, NAME)),
      mi(Op.Repay, USDC, 0n, ctx(id), 0),
      mi(Op.WithdrawCollateral, WETH, balance),
      ri(encodeApprove(4, "oneinch")),
      protocol("oneinch", li(Op.Swap, WETH, user.address, 0n, sc(WETH, USDC, 3000n, 10n ** 12n), 4)),
      ri(encodeSubtract(6, 1)),
      ri(encodePushToken(8, user.address)),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.collateral(id, user.address, 0)).to.equal(0);
    for (const a of [router.target, gateway.target, swapGateway.target, adapter.target]) {
      expect(await loan.balanceOf(a)).to.equal(0);
      expect(await collateral.balanceOf(a)).to.equal(0);
    }
  });

  it("uses stored limit-order instructions with refreshed offers through the existing manager and handler", async () => {
    await deposit();
    const view = await deploy("MorphoMidnightGatewayView", MIDNIGHT),
      vr = await deploy("KapanViewRouter", owner.address);
    await vr.setGateway(NAME, view.target);
    const trigger = await deploy("LimitPriceTrigger", vr.target);
    const settlement = await deploy("MockGPv2Settlement", keeper.address),
      cc = await deploy("MockComposableCoW");
    const manager = await deploy(
      "KapanConditionalOrderManager",
      owner.address,
      router.target,
      cc.target,
      settlement.target,
      keeper.address,
    );
    const handler = await deploy("KapanConditionalOrderHandler", manager.target);
    await manager.setOrderHandler(handler.target);
    await router.setApprovedManager(manager.target, true);
    await router.connect(user).setDelegate(manager.target, true);
    const key = ethers.id("limit-plan"),
      salt = ethers.id("limit-order"),
      pid = await vr.MORPHO_MIDNIGHT();
    const encodeInstructions = (items: any[]) => coder.encode(["tuple(string protocolName,bytes data)[]"], [items]);
    const triggerData = coder.encode(
      [
        "tuple(bytes4 protocolId,bytes protocolContext,address sellToken,address buyToken,uint8 sellDecimals,uint8 buyDecimals,uint256 limitPrice,bool triggerAbovePrice,uint256 totalSellAmount,uint256 totalBuyAmount,uint8 numChunks,uint256 maxSlippageBps,bool isKindBuy)",
      ],
      [[pid, ctx(id), USDC, WETH, 6, 18, 100000n, false, cash(100), 0, 1, 0, false]],
    );
    const params = {
      user: user.address,
      trigger: trigger.target,
      triggerStaticData: triggerData,
      sellToken: USDC,
      buyToken: WETH,
      preInstructions: encodeInstructions([
        mi(Op.Borrow, USDC, 0n, ctx(id, 0, { ...base, planProvider: keeper.address, planKey: key }), 0),
        ri(encodePushToken(1, manager.target)),
      ]),
      postInstructions: encodeInstructions([
        ri(encodeApprove(1, NAME)),
        mi(Op.DepositCollateral, WETH, 0n, ctx(id), 1),
      ]),
      appDataHash: ethers.id("simulated-hooks"),
      maxIterations: 1,
      sellTokenRefundAddress: Z,
      isKindBuy: false,
    };
    await manager.connect(user).createOrder(params, salt);
    const hash = await manager.userSaltToOrderHash(user.address, salt);
    const order = await handler.getTradeableOrder(
      manager.target,
      Z,
      ethers.ZeroHash,
      coder.encode(["bytes32"], [hash]),
      "0x",
    );
    expect(order.sellAmount).to.equal(cash(100));
    expect(order.buyAmount).to.equal(WAD / 10n);
    await expect(manager.connect(keeper).executePreHook(hash)).to.be.revertedWithCustomError(
      gateway,
      "InsufficientOffers",
    );
    await gateway.connect(keeper).setExecutionPlan(key, [await ratify()]);
    await manager.connect(keeper).executePreHook(hash);
    // Simulate settlement transfers at the limit; this is not a live CoW solver/settlement test.
    await loan.connect(keeper).transferFrom(manager.target, lender.address, order.sellAmount);
    await collateral.transfer(manager.target, order.buyAmount);
    await manager.connect(keeper).executePostHook(hash);
    expect((await manager.getOrder(hash)).status).to.equal(2);
    expect(await core.collateral(id, user.address, 0)).to.equal(col(2) + order.buyAmount);
    expect(await core.debt(id, user.address)).to.be.greaterThan(cash(100));
    expect(await loan.balanceOf(router.target)).to.equal(0);
    expect(await collateral.balanceOf(router.target)).to.equal(0);
  });
});
