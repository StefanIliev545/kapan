import { expect } from "chai";
import { ethers, network } from "hardhat";
import { readFileSync } from "fs";
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

import { coder, Z, MAX, U128, WAD, cash, col, NAME, ctx, marketId, deploy } from "./helpers/midnightHelpers";

describe("Morpho Midnight lending instructions", function () {
  this.timeout(120000);
  let owner: any, user: any, lender: any, keeper: any, stranger: any;
  let router: any, gateway: any, view: any, viewRouter: any, auth: any, core: any;
  let loan: any, collateral: any, collateral2: any, oracle: any, ratifier: any, flash: any, swap: any;
  let market: any, id: string, base: any;
  const instruction = (op: Op, token: string, amount: bigint, context: string, index = 999) =>
    protocol(NAME, li(op, token, user.address, amount, context, index));
  const run = (instructions: any[]) => router.connect(user).processProtocolInstructions(instructions);
  const offer = (overrides: any = {}) => ({
    market,
    buy: true,
    maker: lender.address,
    start: 0,
    expiry: market.maturity - 1,
    tick: 3960,
    group: ethers.id("lender"),
    callback: Z,
    callbackData: "0x",
    receiverIfMakerIsSeller: Z,
    ratifier: ratifier.target,
    reduceOnly: false,
    maxUnits: cash(100000),
    maxAssets: 0,
    continuousFeeCap: MAX,
    ...overrides,
  });
  const trade = (overrides: any = {}) => ({
    ...base,
    takes: [{ offer: offer(), ratifierData: "0x", maxUnits: cash(100000) }],
    ...overrides,
  });
  const swapContext = (src: string, dst: string, n: bigint, d: bigint) =>
    coder.encode(
      ["address", "uint256", "bytes"],
      [dst, 1, swap.interface.encodeFunctionData("swap", [src, dst, n, d])],
    );
  const borrow = (amount: bigint, t = trade()) =>
    run([instruction(Op.Borrow, loan.target, amount, ctx(id, 0, t)), ri(encodePushToken(0, user.address))]);
  const deposit = (amount = col(1000), index = 0, token = collateral.target, mid = id) =>
    run([
      ri(encodePullToken(amount, token, user.address)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.DepositCollateral, token, 0n, ctx(mid, index), 0),
    ]);

  beforeEach(async () => {
    [owner, user, lender, keeper, stranger] = await ethers.getSigners();
    router = await deploy("KapanRouter", owner.address);
    auth = await deploy("KapanAuthorizationHelper", router.target, owner.address);
    await router.setAuthorizationHelper(auth.target);
    if (process.env.MIDNIGHT_ARTIFACT) {
      const a = JSON.parse(readFileSync(process.env.MIDNIGHT_ARTIFACT, "utf8"));
      core = await new ethers.ContractFactory(a.abi, a.bytecode, owner).deploy();
      await core.waitForDeployment();
    } else core = await deploy("MockMidnight");
    loan = await deploy("MockERC20Decimals", "Loan", "LOAN", 6);
    collateral = await deploy("MockERC20Decimals", "Collateral", "COL", 18);
    collateral2 = await deploy("MockERC20Decimals", "Collateral two", "COL2", 18);
    oracle = await deploy("MidnightTestOracle", 10n ** 24n);
    ratifier = await deploy("MidnightTestRatifier");
    gateway = await deploy("MorphoMidnightGatewayWrite", router.target, core.target);
    view = await deploy("MorphoMidnightGatewayView", core.target);
    viewRouter = await deploy("KapanViewRouter", owner.address);
    await router.addGateway(NAME, gateway.target);
    await auth.syncGateway(NAME, gateway.target);
    await viewRouter.setGateway(NAME, view.target);
    await core.enableLltv((8n * WAD) / 10n);
    await core.enableLiquidationCursor((3n * WAD) / 10n);
    await core.setFeeSetter(owner.address);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    market = {
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      midnight: core.target,
      loanToken: loan.target,
      collateralParams: [collateral, collateral2]
        .sort((a, b) => a.target.toLowerCase().localeCompare(b.target.toLowerCase()))
        .map(c => ({
          token: c.target,
          lltv: (8n * WAD) / 10n,
          liquidationCursor: (3n * WAD) / 10n,
          oracle: oracle.target,
        })),
      maturity: now + 30 * 86400,
      rcfThreshold: 0,
      enterGate: Z,
      liquidatorGate: Z,
    };
    // Use sorted slot zero consistently in all tests.
    if (market.collateralParams[0].token !== collateral.target) [collateral, collateral2] = [collateral2, collateral];
    id = marketId(market);
    await core.touchMarket(market);
    await core.connect(user).setIsAuthorized(gateway.target, true, user.address);
    await core.connect(lender).setIsAuthorized(ratifier.target, true, lender.address);
    await core.connect(user).setIsAuthorized(ratifier.target, true, user.address);
    for (const c of [collateral, collateral2]) {
      await c.mint(user.address, col(10000));
      await c.connect(user).approve(router.target, MAX);
    }
    await loan.mint(lender.address, cash(1000000));
    await loan.connect(lender).approve(core.target, MAX);
    await loan.mint(user.address, cash(100000));
    await loan.connect(user).approve(router.target, MAX);
    flash = await deploy("MidnightTestFlashLender");
    await loan.mint(flash.target, cash(100000));
    await collateral.mint(flash.target, col(100000));
    await collateral2.mint(flash.target, col(100000));
    await router.setBalancerV2(flash.target);
    swap = await deploy("MidnightTestSwapVenue");
    const swapGateway = await deploy("OneInchGateway", router.target, owner.address);
    const adapter = await deploy("OneInchAdapter", swapGateway.target, swap.target);
    await swapGateway.setAdapter(adapter.target);
    await router.addGateway("oneinch", swapGateway.target);
    await loan.mint(swap.target, cash(100000));
    await collateral.mint(swap.target, col(100000));
    await collateral2.mint(swap.target, col(100000));
    base = {
      deadline: market.maturity - 1,
      maxUnits: cash(1000),
      minUnits: 0,
      priceLimit: (9n * WAD) / 10n,
      maxApr: MAX,
      minHealthFactor: 0,
      planProvider: Z,
      planKey: ethers.ZeroHash,
      takes: [],
    };
  });

  it("keeps Midnight distinct and authorizes every mutating operation, including collateral supply and repay", async () => {
    expect(await router.gateways("morpho-blue")).to.equal(Z);
    await core.connect(user).setIsAuthorized(gateway.target, false, user.address);
    for (const op of [Op.Deposit, Op.DepositCollateral, Op.Repay, Op.Borrow, Op.WithdrawCollateral]) {
      const token = op === Op.DepositCollateral || op === Op.WithdrawCollateral ? collateral.target : loan.target;
      const ins = { op, token, user: user.address, amount: 1, context: ctx(id), input: { index: 999 } };
      const [targets, data] = await gateway.authorize([ins], user.address, []);
      expect(targets[0]).to.equal(core.target);
      expect(data[0]).to.equal(
        core.interface.encodeFunctionData("setIsAuthorized", [gateway.target, true, user.address]),
      );
    }
    await expect(gateway.connect(user).processLendingInstruction([], "0x")).to.be.revertedWith("Only router can call");
  });

  it("supports deposit, cash-denominated borrow, face-debt reads, repay-max refunds and collateral withdrawal", async () => {
    await deposit();
    const before = await loan.balanceOf(user.address);
    await borrow(cash(500));
    const debt = await core.debt(id, user.address);
    expect(await loan.balanceOf(user.address)).to.equal(before + cash(500));
    expect(debt).to.be.greaterThan(cash(500));
    expect(await view.getBorrowBalance(id, user.address)).to.equal(debt);
    await run([
      ri(encodePullToken(debt + 3n, loan.target, user.address)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.Repay, loan.target, 0n, ctx(id), 0),
      ri(encodePushToken(2, user.address)),
      instruction(Op.GetSupplyBalance, collateral.target, 0n, ctx(id)),
      instruction(Op.WithdrawCollateral, collateral.target, 0n, ctx(id), 3),
      ri(encodePushToken(4, user.address)),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.collateral(id, user.address, 0)).to.equal(0);
    expect(await loan.balanceOf(gateway.target)).to.equal(0);
    expect(await loan.allowance(gateway.target, core.target)).to.equal(0);
  });

  it("uses multi-collateral capacity and returns prices in loan-token units through the view router", async () => {
    await deposit(col(500));
    await deposit(col(500), 1, collateral2.target);
    await borrow(cash(500));
    const p = await view.getPosition(id, user.address);
    expect(p.collateralValue).to.equal(cash(1000));
    expect(p.borrowCapacity).to.equal(cash(800));
    const pid = await viewRouter.MORPHO_MIDNIGHT();
    expect(await viewRouter.getCurrentLtv(pid, user.address, ctx(id))).to.equal(p.ltvBps);
    expect(await viewRouter.getCollateralPrice(pid, collateral.target, ctx(id))).to.equal(10n ** 8n);
    expect(await viewRouter.getDebtPrice(pid, loan.target, ctx(id))).to.equal(10n ** 8n);
    expect((await viewRouter.getPositionValue(pid, user.address, ctx(id)))[0]).to.equal(1000n * 10n ** 8n);
    expect(await viewRouter.calculateMinBuy(pid, col(1), 100, collateral.target, loan.target, 18, 6, ctx(id))).to.equal(
      990000n,
    );
  });

  it("fails closed on an invalid price pair or a zero oracle price", async () => {
    const pid = await viewRouter.MORPHO_MIDNIGHT();
    await expect(
      viewRouter.calculateMinBuy(pid, col(1), 100, loan.target, collateral.target, 6, 18, ctx(id)),
    ).to.be.revertedWithCustomError(view, "WrongToken");
    await oracle.setPrice(0);
    await expect(
      viewRouter.calculateMinBuy(pid, col(1), 100, collateral.target, loan.target, 18, 6, ctx(id)),
    ).to.be.revertedWithCustomError(view, "InvalidOraclePrice");
  });

  it("fills fallback offers without consuming the API's excess liquidity", async () => {
    await deposit();
    const small = offer({ maxUnits: cash(100), group: ethers.id("small") });
    await core.connect(lender).setConsumed(small.group, cash(80), lender.address);
    const t = trade({
      takes: [
        { offer: offer({ expiry: 1 }), ratifierData: "0x", maxUnits: cash(1000) },
        { offer: small, ratifierData: "0x", maxUnits: cash(100) },
        { offer: offer({ group: ethers.id("bad-signature") }), ratifierData: "0xff", maxUnits: cash(1000) },
        { offer: offer(), ratifierData: "0x", maxUnits: cash(10000) },
      ],
    });
    await borrow(cash(500), t);
    expect(await core.consumed(lender.address, small.group)).to.equal(cash(100));
    expect(await core.debt(id, user.address)).to.be.lessThan(cash(600));
  });

  it("handles asset-capped bids and skips an exhausted group", async () => {
    await deposit();
    await borrow(
      cash(50),
      trade({
        takes: [{ offer: offer({ maxUnits: 0, maxAssets: cash(100) }), ratifierData: "0x", maxUnits: cash(1000) }],
      }),
    );
    await core.connect(lender).setConsumed(ethers.id("lender"), U128, lender.address);
    await expect(borrow(cash(1))).to.be.revertedWithCustomError(gateway, "InsufficientOffers");
  });

  it("rejects inadequate net price, excessive units, APR, and health; rolls back every fill", async () => {
    await deposit();
    await expect(borrow(cash(500), trade({ priceLimit: WAD }))).to.be.revertedWithCustomError(
      gateway,
      "InsufficientOffers",
    );
    await expect(borrow(cash(500), trade({ maxUnits: cash(500) }))).to.be.revertedWithCustomError(
      gateway,
      "InsufficientOffers",
    );
    await expect(borrow(cash(500), trade({ maxApr: 0 }))).to.be.revertedWithCustomError(gateway, "RateLimit");
    await expect(borrow(cash(500), trade({ minHealthFactor: 2n * WAD }))).to.be.revertedWithCustomError(
      gateway,
      "HealthLimit",
    );
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.consumed(lender.address, ethers.id("lender"))).to.equal(0);
  });

  it("rejects mismatched market, token and UTXO token", async () => {
    await deposit();
    await expect(
      borrow(
        cash(1),
        trade({
          takes: [
            {
              offer: offer({ market: { ...market, maturity: market.maturity + 1 } }),
              ratifierData: "0x",
              maxUnits: cash(100),
            },
          ],
        }),
      ),
    ).to.be.revertedWithCustomError(gateway, "InvalidContext");
    await expect(
      run([instruction(Op.Borrow, collateral.target, cash(1), ctx(id, 0, trade()))]),
    ).to.be.revertedWithCustomError(gateway, "WrongToken");
    await expect(
      run([ri(encodeToOutput(1n, collateral.target)), instruction(Op.Borrow, loan.target, 0n, ctx(id, 0, trade()), 0)]),
    ).to.be.revertedWithCustomError(gateway, "WrongToken");
    await expect(run([instruction(Op.DepositCollateral, loan.target, 1n, ctx(id))])).to.be.revertedWithCustomError(
      gateway,
      "WrongToken",
    );
  });

  it("refreshes deferred offers without granting the publisher the ability to change user limits", async () => {
    await deposit();
    const key = ethers.id("limit-order");
    const b = trade({ planProvider: keeper.address, planKey: key, takes: [] });
    await gateway
      .connect(keeper)
      .setExecutionPlan(key, [{ offer: offer({ expiry: 1 }), ratifierData: "0x", maxUnits: cash(1000) }]);
    await expect(borrow(cash(100), b)).to.be.revertedWithCustomError(gateway, "InsufficientOffers");
    await gateway.connect(stranger).setExecutionPlan(key, trade().takes);
    await expect(borrow(cash(100), b)).to.be.revertedWithCustomError(gateway, "InsufficientOffers");
    await gateway.connect(keeper).setExecutionPlan(key, trade().takes);
    await borrow(cash(100), b);
    await gateway
      .connect(keeper)
      .setExecutionPlan(key, [{ offer: offer({ tick: 3000 }), ratifierData: "0x", maxUnits: cash(1000) }]);
    await expect(borrow(cash(100), b)).to.be.revertedWithCustomError(gateway, "InsufficientOffers");
  });

  it("enforces execution-time deadline and APR as maturity approaches", async () => {
    await deposit();
    await expect(borrow(cash(100), trade({ deadline: 1 }))).to.be.revertedWithCustomError(gateway, "InvalidBounds");
    // ~5% term cost is below 100% APR with 30 days left, but not with one day left.
    await borrow(cash(100), trade({ maxApr: WAD }));
    await network.provider.send("evm_setNextBlockTimestamp", [market.maturity - 86400]);
    await expect(borrow(cash(100), trade({ maxApr: WAD }))).to.be.revertedWithCustomError(gateway, "RateLimit");
  });

  it("accounts for changed settlement fees in net borrowing proceeds", async () => {
    await deposit();
    for (let i = 0; i < 7; i++) await core.setMarketSettlementFee(id, i, 1000000000000n); // 0.01 bps, below every core cap.
    const before = await loan.balanceOf(user.address);
    await borrow(cash(100));
    expect(await loan.balanceOf(user.address)).to.equal(before + cash(100));
  });

  it("allows direct repayment after maturity but refuses new borrowing", async () => {
    await deposit();
    await borrow(cash(100));
    const debt = await core.debt(id, user.address);
    await network.provider.send("evm_setNextBlockTimestamp", [market.maturity + 1]);
    await expect(borrow(cash(1))).to.be.revertedWithCustomError(gateway, "InvalidBounds");
    await run([
      ri(encodePullToken(debt, loan.target, user.address)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.Repay, loan.target, 0n, ctx(id), 0),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect((await view.getPosition(id, user.address)).pastMaturity).to.equal(true);
  });

  it("lends through Deposit and redeems credit through the explicit credit selector", async () => {
    // Lender account is the borrower/maker of this ask.
    await collateral.mint(lender.address, col(1000));
    await collateral.connect(lender).approve(core.target, MAX);
    await core.connect(lender).supplyCollateral(market, 0, col(1000), lender.address);
    const ask = offer({ buy: false, receiverIfMakerIsSeller: lender.address });
    const t = trade({
      priceLimit: WAD,
      minUnits: cash(100),
      takes: [{ offer: ask, ratifierData: "0x", maxUnits: cash(1000) }],
    });
    await run([
      ri(encodePullToken(cash(100), loan.target, user.address)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.Deposit, loan.target, 0n, ctx(id, 0, t), 0),
    ]);
    const credit = await core.credit(id, user.address);
    expect(credit).to.be.greaterThan(cash(100));
    await core.connect(lender).repay(market, credit, lender.address, Z, "0x");
    const creditCtx = coder.encode(["bytes32", "uint256", "bytes"], [id, MAX, "0x"]);
    await run([
      instruction(Op.GetSupplyBalance, loan.target, 0n, creditCtx),
      instruction(Op.WithdrawCollateral, loan.target, 0n, creditCtx, 0),
      ri(encodePushToken(1, user.address)),
    ]);
    expect(await core.credit(id, user.address)).to.equal(0);
  });

  it("leverages atomically using the existing flash loan and swap instructions", async () => {
    const swapCtx = swapContext(loan.target, collateral.target, 10n ** 12n, 1n);
    const before = await loan.balanceOf(flash.target);
    await run([
      ri(encodePullToken(col(500), collateral.target, user.address)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.DepositCollateral, collateral.target, 0n, ctx(id), 0),
      ri(encodeToOutput(cash(400), loan.target)),
      ri(encodeFlashLoan(FlashLoanProvider.BalancerV2, 2)),
      ri(encodeApprove(2, "oneinch")),
      protocol("oneinch", li(Op.Swap, loan.target, user.address, 0n, swapCtx, 2)),
      ri(encodeApprove(5, NAME)),
      instruction(Op.DepositCollateral, collateral.target, 0n, ctx(id), 5),
      instruction(Op.Borrow, loan.target, 0n, ctx(id, 0, trade()), 3),
    ]);
    expect(await core.collateral(id, user.address, 0)).to.equal(col(900));
    expect(await core.debt(id, user.address)).to.be.greaterThan(cash(400));
    expect(await loan.balanceOf(flash.target)).to.equal(before + cash(400) / 1000n);
    expect(await loan.balanceOf(router.target)).to.equal(0);
  });

  it("delevers atomically by repaying, withdrawing, swapping and repaying the flash loan", async () => {
    await deposit();
    await borrow(cash(400));
    const debt = await core.debt(id, user.address);
    const toSell = col(500),
      swapCtx = swapContext(collateral.target, loan.target, 1n, 10n ** 12n);
    await run([
      ri(encodeToOutput(debt, loan.target)),
      ri(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.Repay, loan.target, 0n, ctx(id), 0),
      instruction(Op.WithdrawCollateral, collateral.target, toSell, ctx(id)),
      ri(encodeApprove(4, "oneinch")),
      protocol("oneinch", li(Op.Swap, collateral.target, user.address, 0n, swapCtx, 4)),
      ri(encodeSubtract(6, 1)),
      ri(encodePushToken(8, user.address)),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.collateral(id, user.address, 0)).to.equal(col(500));
    expect(await loan.balanceOf(router.target)).to.equal(0);
  });

  it("swaps collateral within a multi-collateral Midnight market", async () => {
    await deposit();
    await borrow(cash(100));
    const swapCtx = swapContext(collateral.target, collateral2.target, 1n, 1n);
    await run([
      ri(encodeToOutput(col(500), collateral2.target)),
      ri(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.DepositCollateral, collateral2.target, 0n, ctx(id, 1), 0),
      instruction(Op.WithdrawCollateral, collateral.target, col(501), ctx(id)),
      ri(encodeApprove(3, "oneinch")),
      protocol("oneinch", li(Op.Swap, collateral.target, user.address, 0n, swapCtx, 3)),
      ri(encodeSubtract(5, 1)),
      ri(encodePushToken(7, user.address)),
    ]);
    expect(await core.collateral(id, user.address, 1)).to.equal(col(500));
    expect(await core.collateral(id, user.address, 0)).to.equal(col(499));
    expect(await collateral2.balanceOf(router.target)).to.equal(0);
  });

  it("rolls back financing when the aggregator cannot meet its minimum output", async () => {
    await deposit();
    const badSwap = coder.encode(
      ["address", "uint256", "bytes"],
      [
        collateral.target,
        col(1000),
        swap.interface.encodeFunctionData("swap", [loan.target, collateral.target, 10n ** 12n, 1]),
      ],
    );
    await expect(
      run([
        instruction(Op.Borrow, loan.target, cash(500), ctx(id, 0, trade())),
        ri(encodeApprove(0, "oneinch")),
        protocol("oneinch", li(Op.Swap, loan.target, user.address, 0n, badSwap, 0)),
      ]),
    ).to.be.revertedWith("Adapter: High Slippage");
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.consumed(lender.address, ethers.id("lender"))).to.equal(0);
    expect(await loan.balanceOf(router.target)).to.equal(0);
  });

  it("honors revoked borrower authorization before changing the position", async () => {
    await deposit();
    await core.connect(user).setIsAuthorized(gateway.target, false, user.address);
    await expect(borrow(cash(100))).to.be.revertedWithCustomError(gateway, "InsufficientOffers");
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.collateral(id, user.address, 0)).to.equal(col(1000));
  });

  it("rolls back collateral and funding when financing cannot complete", async () => {
    const before = await collateral.balanceOf(user.address);
    await expect(
      run([
        ri(encodePullToken(col(1000), collateral.target, user.address)),
        ri(encodeApprove(0, NAME)),
        instruction(Op.DepositCollateral, collateral.target, 0n, ctx(id), 0),
        instruction(Op.Borrow, loan.target, cash(100), ctx(id, 0, trade({ takes: [] }))),
      ]),
    ).to.be.revertedWithCustomError(gateway, "InsufficientOffers");
    expect(await collateral.balanceOf(user.address)).to.equal(before);
    expect(await core.collateral(id, user.address, 0)).to.equal(0);
  });

  it("refinances Blue into Midnight and back without a token swap", async () => {
    const blue = await deploy("MidnightBlueFixture");
    const blueGateway = await deploy("MorphoBlueGatewayWrite", router.target, owner.address, blue.target);
    await router.addGateway("morpho-blue", blueGateway.target);
    await blue.connect(user).setAuthorization(blueGateway.target, true);
    await loan.mint(blue.target, cash(100000));
    const params = {
      loanToken: loan.target,
      collateralToken: collateral.target,
      oracle: oracle.target,
      irm: Z,
      lltv: (8n * WAD) / 10n,
    };
    const blueCtx = coder.encode(
      ["tuple(address loanToken,address collateralToken,address oracle,address irm,uint256 lltv)"],
      [params],
    );
    const blueId = ethers.keccak256(blueCtx);
    const bi = (op: Op, token: string, amount: bigint, index = 999) =>
      protocol("morpho-blue", li(op, token, user.address, amount, blueCtx, index));
    await collateral.connect(user).approve(blue.target, MAX);
    await blue.connect(user).supplyCollateral(params, col(1000), user.address, "0x");
    await blue.connect(user).borrow(params, cash(300), 0, user.address, user.address);
    await run([
      ri(encodeToOutput(cash(300), loan.target)),
      ri(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),
      ri(encodeApprove(0, "morpho-blue")),
      bi(Op.Repay, loan.target, 0n, 0),
      bi(Op.WithdrawCollateral, collateral.target, col(1000)),
      ri(encodeApprove(4, NAME)),
      instruction(Op.DepositCollateral, collateral.target, 0n, ctx(id), 4),
      instruction(Op.Borrow, loan.target, 0n, ctx(id, 0, trade()), 1),
    ]);
    expect((await blue.position(blueId, user.address)).borrowShares).to.equal(0);
    expect(await core.collateral(id, user.address, 0)).to.equal(col(1000));
    const debt = await core.debt(id, user.address);
    await run([
      ri(encodeToOutput(debt, loan.target)),
      ri(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.Repay, loan.target, 0n, ctx(id), 0),
      instruction(Op.WithdrawCollateral, collateral.target, col(1000), ctx(id)),
      ri(encodeApprove(4, "morpho-blue")),
      bi(Op.DepositCollateral, collateral.target, 0n, 4),
      bi(Op.Borrow, loan.target, 0n, 1),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect((await blue.position(blueId, user.address)).collateral).to.equal(col(1000));
    expect((await blue.position(blueId, user.address)).borrowShares).to.equal(debt + debt / 1000n);
  });

  it("swaps debt into another Midnight market while migrating its collateral", async () => {
    await deposit();
    await borrow(cash(300));
    const oldDebt = await core.debt(id, user.address);
    const nextLoan = await deploy("MockERC20Decimals", "Other loan", "OTHER", 6);
    const nextMarket = { ...market, loanToken: nextLoan.target },
      nextId = marketId(nextMarket);
    await core.touchMarket(nextMarket);
    await nextLoan.mint(lender.address, cash(100000));
    await nextLoan.connect(lender).approve(core.target, MAX);
    await nextLoan.mint(swap.target, cash(100000));
    // Flash old debt; repay old market, move collateral, borrow the new token and swap it for flash repayment.
    const repayment = oldDebt + oldDebt / 1000n;
    const nextTrade = trade({
      takes: [
        {
          offer: offer({ market: nextMarket, group: ethers.id("new-debt") }),
          ratifierData: "0x",
          maxUnits: cash(1000),
        },
      ],
    });
    const swapCtx = swapContext(nextLoan.target, loan.target, 1n, 1n);
    await run([
      ri(encodeToOutput(oldDebt, loan.target)),
      ri(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),
      ri(encodeApprove(0, NAME)),
      instruction(Op.Repay, loan.target, 0n, ctx(id), 0),
      instruction(Op.WithdrawCollateral, collateral.target, col(1000), ctx(id)),
      ri(encodeApprove(4, NAME)),
      instruction(Op.DepositCollateral, collateral.target, 0n, ctx(nextId), 4),
      instruction(Op.Borrow, nextLoan.target, repayment, ctx(nextId, 0, nextTrade)),
      ri(encodeApprove(6, "oneinch")),
      protocol("oneinch", li(Op.Swap, nextLoan.target, user.address, 0n, swapCtx, 6)),
    ]);
    expect(await core.debt(id, user.address)).to.equal(0);
    expect(await core.collateral(nextId, user.address, 0)).to.equal(col(1000));
    expect(await core.debt(nextId, user.address)).to.be.greaterThan(repayment);
  });
});
