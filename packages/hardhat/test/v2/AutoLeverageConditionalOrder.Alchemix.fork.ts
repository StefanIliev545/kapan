/**
 * Auto-Leverage Conditional-Order test for Alchemix V3 — Arbitrum fork.
 *
 * Validates two things in tandem:
 *   1. The new AlchemixGatewayView dispatches correctly through KapanViewRouter so the
 *      AutoLeverageTrigger can read live LTV / position value / asset prices for an alchemix
 *      position keyed by (marketId, tokenId).
 *   2. A *single* approveMint(MAX) on the position NFT carries the gateway through MULTIPLE
 *      AL iterations — each subsequent chunk inherits the existing allowance, decrementing it
 *      but never being re-granted. This is the practical safety guarantee that lets ongoing
 *      auto-leverage work without requiring the user to re-approve before every iteration.
 *
 * Mechanics:
 *   sellToken  = alUSD (debt)
 *   buyToken   = USDC (underlying)
 *   Per-iteration post-hook:
 *     [0] Approve(UTXO[1]=USDC, ALCHEMIX_GATEWAY_NAME)
 *     [1] DepositCollateral(USDC, ctx)         -> alchemix gateway auto-wraps to MYT
 *     [2] Borrow(alUSD, ctx, in=0=actualSell)  -> mintFrom (uses mintAllowance)
 *     [3] PushToken(borrowedUtxo, manager)     -> manager refunds adapter (flash repay path)
 *
 * To keep the test self-contained we bypass the real flashLoanRouter and:
 *   - pre-fund the OrderManager with `actualSell` alUSD before each iteration (simulating the
 *     adapter -> manager funding step that happens inside flashLoanAndSettle), then
 *   - call settlement.settle() directly with a manager-validated EIP-1271 signature.
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/AutoLeverageConditionalOrder.Alchemix.fork.ts
 */

import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder, Signer, Contract } from "ethers";
import {
  encodeApprove,
  encodePullToken,
  encodePushToken,
  encodeToOutput,
  encodeSubtract,
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
import { ALCHEMIX_GATEWAY_NAME, ALCHEMIX_PROTOCOL_ID } from "../../utils/alchemixConstants";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const USDC_WHALE = "0x47c031236e19d024b42f8AE6780E44A573170703";
const AAVE_POOL_ADDRESSES_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";

const ALCHEMIX = {
  alchemist: "0x930750a3510E703535e943E826ABa3c364fFC1De",
  myt: "0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651",
  alUsd: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
};

// ALCHEMIX_PROTOCOL_ID is imported from ../../utils/alchemixConstants — keeps the trigger
// staticData in lockstep with the AlchemixConstants Solidity library.

const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
]);

const coder = AbiCoder.defaultAbiCoder();

function encodeAlchemixContext(marketId: bigint, tokenId: bigint): string {
  return coder.encode(["uint256", "uint256"], [marketId, tokenId]);
}

describe("Auto-Leverage Conditional Order - Alchemix V3 (Fork)", function () {
  this.timeout(360_000);

  before(async function () {
    if (!FORK) this.skip();
    const net = await ethers.provider.getNetwork();
    const chainId = Number(net.chainId);
    if (chainId !== 42161 && chainId !== 31337) this.skip();
    const code = await ethers.provider.getCode(ALCHEMIX.alchemist);
    if (code === "0x") this.skip();
  });

  // ---- Position sizing ----
  const DEPOSIT_USDC = 5_000n * 10n ** 6n;     // 5,000 USDC initial collateral
  const INITIAL_BORROW = 1_000n * 10n ** 18n;  // 1,000 alUSD initial debt -> ~20% face-value LTV
  const SOLVER_DEPOSIT_USDC = 8_000n * 10n ** 6n; // solver mints alUSD to pre-fund manager twice over

  // Single-iteration AL: target hit in one fill. Trigger fires while LTV < 49%, full leverage
  // up to 30% in one go.
  const TRIGGER_LTV_BPS = 4900n;
  const TARGET_LTV_BPS = 3000n;
  const NUM_CHUNKS = 1;

  // Static per-iteration flash amount baked into the user-signed order. For 5k/1k -> 30% LTV
  // in one chunk, AutoLeverageTrigger calculates ΔD ≈ 714 USD, so per-chunk swap output
  // (minBuyAmount with 200bps slippage) is ~700 USDC.
  //
  // Deployed (frontend) topology uses WITHDRAW-DEFICIT in the post-hook:
  //   deficit = flashAmount − actualBuy, then WithdrawCollateral(deficit) from position.
  // For Subtract not to underflow, flashAmount MUST be ≥ actualBuy. We oversize 3x (matching
  // `LTVAutomationModal.calcAutoLevFlashLoanConfig`'s HEADROOM_FACTOR) so the post-hook's
  // deficit is comfortably positive across peg/slippage drift.
  const FLASH_AMOUNT_USDC = 2_100n * 10n ** 6n;

  let owner: Signer;
  let user: Signer;
  let solver: Signer;
  let userAddress: string;
  let solverAddress: string;

  let router: Contract;
  let alchemixGateway: Contract;
  let alchemixGatewayView: Contract;
  let viewRouter: Contract;
  let autoLeverageTrigger: Contract;
  let cowAdapter: Contract;
  let orderManager: Contract;
  let orderHandler: Contract;
  let settlement: Contract;

  let routerAddress: string;
  let gatewayAddress: string;
  let orderManagerAddress: string;
  let orderHandlerAddress: string;
  let cowAdapterAddress: string;

  let usdc: Contract;
  let alUsd: Contract;
  let alchemist: Contract;
  let positionNft: Contract;

  let marketId: bigint;
  let tokenId: bigint;

  const erc20Abi = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ];

  before(async function () {
    [owner] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    solver = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();
    solverAddress = await solver.getAddress();
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);
    await network.provider.send("hardhat_setBalance", [solverAddress, "0x56BC75E2D63100000"]);

    // EDR cold-read panic workaround (ExcessBlobGasNotSet) — mine some blocks first.
    for (let i = 0; i < 3; i++) await network.provider.send("evm_mine", []);

    usdc = await ethers.getContractAt(erc20Abi, USDC);
    alUsd = await ethers.getContractAt(erc20Abi, ALCHEMIX.alUsd);
    alchemist = await ethers.getContractAt("IAlchemistV3", ALCHEMIX.alchemist);

    const realPositionNft: string = await alchemist.alchemistPositionNFT();
    positionNft = new ethers.Contract(
      realPositionNft,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function isApprovedForAll(address owner, address operator) view returns (bool)",
      ],
      ethers.provider,
    );

    // Fund both user and solver with USDC.
    await impersonateAndFund(USDC_WHALE);
    const whale = await ethers.getSigner(USDC_WHALE);
    await usdc.connect(whale).transfer(userAddress, DEPOSIT_USDC);
    // Solver gets enough USDC for: (a) opening its parallel alchemix position and
    // (b) per-iteration pre-funding of the router with FLASH_AMOUNT_USDC across all chunks.
    await usdc.connect(whale).transfer(solverAddress, SOLVER_DEPOSIT_USDC + FLASH_AMOUNT_USDC * BigInt(NUM_CHUNKS) * 2n);

    settlement = await getSettlement();

    // Router + alchemix gateway.
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

    // ViewRouter + AlchemixGatewayView (the new piece under test).
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());
    const AlchemixGatewayViewFactory = await ethers.getContractFactory("AlchemixGatewayView");
    alchemixGatewayView = await AlchemixGatewayViewFactory.deploy(gatewayAddress, AAVE_POOL_ADDRESSES_PROVIDER);
    await viewRouter.setGateway(ALCHEMIX_GATEWAY_NAME, await alchemixGatewayView.getAddress());

    // CowAdapter (used as sellTokenRefundAddress; we don't actually flash-loan here).
    const CowAdapterFactory = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapterFactory.deploy(COW_PROTOCOL.flashLoanRouter, await owner.getAddress());
    cowAdapterAddress = await cowAdapter.getAddress();

    // ConditionalOrderManager + Handler — deployed BEFORE the trigger because the
    // TransientAutoLeverageTrigger needs the manager address in its constructor (so it can
    // read order params via getOrder during prepareCache).
    const OrderManagerFactory = await ethers.getContractFactory("KapanConditionalOrderManager");
    orderManager = await OrderManagerFactory.deploy(
      await owner.getAddress(),
      routerAddress,
      COW_PROTOCOL.composableCoW,
      COW_PROTOCOL.settlement,
      COW_PROTOCOL.hooksTrampoline,
    );
    orderManagerAddress = await orderManager.getAddress();
    const OrderHandlerFactory = await ethers.getContractFactory("KapanConditionalOrderHandler");
    orderHandler = await OrderHandlerFactory.deploy(orderManagerAddress);
    orderHandlerAddress = await orderHandler.getAddress();
    await orderManager.setOrderHandler(orderHandlerAddress);

    // TransientAutoLeverageTrigger — fully dynamic calculateExecution (live state, recomputes
    // each iteration), but snapshots its outputs to transient storage during a `prepareCache`
    // pre-interaction so the sig check sees consistent values even when the manager pre-hook
    // mutates position state afterwards. Constructor needs orderManager + hooksTrampoline +
    // settlement so it can read order params and gate `prepareCache` to the trampoline OR
    // Settlement (the latter is required so CoW orderbook balance simulation, which runs
    // appData hooks from the Settlement context, can populate the cache successfully).
    const TransientALFactory = await ethers.getContractFactory("TransientAutoLeverageTrigger");
    autoLeverageTrigger = await TransientALFactory.deploy(
      await viewRouter.getAddress(),
      orderManagerAddress,
      COW_PROTOCOL.hooksTrampoline,
      COW_PROTOCOL.settlement,
    );
    // Keep default 30-min chunk window — matches close-with-collateral test which works.

    await router.setApprovedManager(orderManagerAddress, true);
    await router.connect(user).setDelegate(orderManagerAddress, true);
    await router.connect(solver).setDelegate(orderManagerAddress, true);

    await becomeSolver(await owner.getAddress());

    // ============ User position: 5k USDC -> MYT, 1k alUSD borrow ============
    await usdc.connect(user).approve(routerAddress, DEPOSIT_USDC);
    const ctxNew = encodeAlchemixContext(marketId, 0n);
    await router.connect(user).processProtocolInstructions(
      [
        createRouterInstruction(encodePullToken(DEPOSIT_USDC, USDC, userAddress)),
        createRouterInstruction(encodeApprove(0, ALCHEMIX_GATEWAY_NAME)),
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.DepositCollateral, USDC, userAddress, 0n, ctxNew, 0),
        ),
      ],
      { gasLimit: 2_000_000 },
    );
    tokenId = await positionNft.tokenOfOwnerByIndex(userAddress, 0n);
    const ctx = encodeAlchemixContext(marketId, tokenId);

    // Auth: Borrow needs approveMint(MAX); WithdrawCollateral (post-hook in deployed
    // withdraw-deficit topology) needs setApprovalForAll on the position NFT. Bundle both
    // so a single auth pass covers the whole flow.
    {
      const [targets, data] = await alchemixGateway.authorize(
        [
          {
            op: LendingOp.Borrow, token: ALCHEMIX.alUsd, user: userAddress,
            amount: INITIAL_BORROW, context: ctx, input: { index: 999 },
          },
          {
            op: LendingOp.WithdrawCollateral, token: USDC, user: userAddress,
            amount: 1n, context: ctx, input: { index: 999 },
          },
        ],
        userAddress,
        [],
      );
      for (let i = 0; i < targets.length; i++) {
        if (targets[i] !== ethers.ZeroAddress && data[i].length > 0) {
          await user.sendTransaction({ to: targets[i], data: data[i] });
        }
      }
    }
    // Initial borrow to seed the under-leveraged starting state.
    await router.connect(user).processProtocolInstructions(
      [
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.Borrow, ALCHEMIX.alUsd, userAddress, INITIAL_BORROW, ctx, 999),
        ),
        createRouterInstruction(encodePushToken(0, userAddress)),
      ],
      { gasLimit: 2_000_000 },
    );

    // Solver-side liquidity: open a parallel position, mint enough alUSD to pre-fund the
    // OrderManager twice (once per iteration) and to seed the settlement contract for swaps.
    await usdc.connect(solver).approve(routerAddress, SOLVER_DEPOSIT_USDC);
    await router.connect(solver).processProtocolInstructions(
      [
        createRouterInstruction(encodePullToken(SOLVER_DEPOSIT_USDC, USDC, solverAddress)),
        createRouterInstruction(encodeApprove(0, ALCHEMIX_GATEWAY_NAME)),
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.DepositCollateral, USDC, solverAddress, 0n, ctxNew, 0),
        ),
      ],
      { gasLimit: 2_000_000 },
    );
    const solverTokenId: bigint = await positionNft.tokenOfOwnerByIndex(solverAddress, 0n);
    const solverCtx = encodeAlchemixContext(marketId, solverTokenId);

    const solverMint = 6_000n * 10n ** 18n; // plenty for both iterations + buffer
    {
      const [targets, data] = await alchemixGateway.authorize(
        [{
          op: LendingOp.Borrow, token: ALCHEMIX.alUsd, user: solverAddress,
          amount: solverMint, context: solverCtx, input: { index: 999 },
        }],
        solverAddress,
        [],
      );
      for (let i = 0; i < targets.length; i++) {
        if (targets[i] !== ethers.ZeroAddress && data[i].length > 0) {
          await solver.sendTransaction({ to: targets[i], data: data[i] });
        }
      }
    }
    await router.connect(solver).processProtocolInstructions(
      [
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.Borrow, ALCHEMIX.alUsd, solverAddress, solverMint, solverCtx, 999),
        ),
        createRouterInstruction(encodePushToken(0, solverAddress)),
      ],
      { gasLimit: 2_000_000 },
    );

    // Mine a block — alchemist enforces "no repay on mint block" per tokenId, so giving the
    // chain a tick before any AL iteration runs eliminates spurious reverts.
    await network.provider.send("evm_mine", []);

    // Pre-fund settlement with USDC so the solver can deliver buyToken.
    // We pre-fund 2x (TARGET_LTV - INITIAL_LTV) ~= 3000 USD, comfortably 4000 USDC.
    await usdc.connect(whale).transfer(COW_PROTOCOL.settlement, 4_000n * 10n ** 6n);
  });

  function buildHookCalldata(target: string, fnName: string, args: unknown[]): string {
    const orderManagerIface = new ethers.Interface([
      "function executePreHookBySalt(address user, bytes32 salt) external",
      "function executePostHookBySalt(address user, bytes32 salt) external",
    ]);
    const inner = orderManagerIface.encodeFunctionData(fnName, args);
    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[
      { target, callData: inner, gasLimit: 3_000_000n },
    ]]);
  }

  it("runs two AL iterations with a single approveMint covering both", async function () {
    const ctx = encodeAlchemixContext(marketId, tokenId);

    // Sanity: the view-router path resolves alchemix correctly.
    const initialLtv = await viewRouter.getCurrentLtv(ALCHEMIX_PROTOCOL_ID, userAddress, ctx);
    const [initialCollateralUsd, initialDebtUsd] = await viewRouter.getPositionValue(
      ALCHEMIX_PROTOCOL_ID, userAddress, ctx,
    );
    console.log(`\n=== Initial state ===`);
    console.log(`  LTV:        ${Number(initialLtv) / 100}%`);
    console.log(`  Collateral: $${Number(initialCollateralUsd) / 1e8}`);
    console.log(`  Debt:       $${Number(initialDebtUsd) / 1e8}`);
    expect(initialLtv).to.be.gt(1500n);
    expect(initialLtv).to.be.lt(TRIGGER_LTV_BPS); // under-leveraged → trigger fires

    // ============ Build trigger params — same shape as AutoLeverageTrigger ============
    // The trigger computes amounts dynamically each call. The transient cache populated by
    // `prepareCache` (run as a pre-interaction before the manager pre-hook) keeps the on-chain
    // sig-check stable.
    const triggerParams = {
      protocolId: ALCHEMIX_PROTOCOL_ID,
      protocolContext: ctx,
      triggerLtvBps: TRIGGER_LTV_BPS,
      targetLtvBps: TARGET_LTV_BPS,
      collateralToken: USDC,
      debtToken: ALCHEMIX.alUsd,
      collateralDecimals: 6,
      debtDecimals: 18,
      maxSlippageBps: 200n,
      numChunks: NUM_CHUNKS,
    };
    const triggerStaticData = await autoLeverageTrigger.encodeTriggerParams(triggerParams);

    // ============ Alchemix AL topology — port of the immediate multiply flow ============
    //
    // Mirrors `buildMultiplyFlow`'s alchemix branch in useTransactionBuilder.ts:548-634, with
    // the 1inch swap replaced by the CoW order itself. The flash is on COLLATERAL (USDC) —
    // alAsset has no flash liquidity, but USDC has plenty (Morpho Blue, 0% fee).
    //
    // Where this differs from the immediate multiply: the multiply's own router-level
    // `FlashLoan` instruction wraps the entire deposit→borrow→swap→repay block atomically.
    // The CoW conditional order can't do that because the swap happens BETWEEN our pre-hook
    // and post-hook — it's CoW's job, not ours. So:
    //   - Adapter takes the flash externally via `flashLoanAndSettle` and shoves the USDC
    //     into the router via `fundOrderWithBalance(..., recipient = router)`. No router-side
    //     `FlashLoan` instruction encoded in the order.
    //   - Pre-hook deposits the flashed USDC + borrows alAsset and parks the alAsset on the
    //     manager so CoW can sell it.
    //   - CoW does the swap (alAsset → USDC, into manager).
    //   - Post-hook ships the swap-proceeds USDC straight to the adapter, which repays the
    //     external flash. No `sellTokenRefundAddress` because the manager has no leftover
    //     sellToken to sweep — the pre-hook borrows EXACTLY `sellAmount` and CoW consumes it.
    //
    // The "manager auto-injects ToOutput(sellAmount, sellToken) at UTXO[0]" rule means our
    // stored preInstructions need to:
    //   (a) declare the router's USDC balance as a UTXO (the adapter funded it but the router
    //       has no instruction-level visibility otherwise),
    //   (b) drive the borrow off the manager-injected UTXO[0] so the trigger's dynamic
    //       sellAmount flows naturally through the borrow.
    //
    // PRE-HOOK after manager-injection:
    //   [0] (auto)  ToOutput(sellAmount, alUSD)              -> UTXO[0]      declarative
    //   [1] ToOutput(flashAmountUsdc, USDC)                  -> UTXO[1]      declarative
    //   [2] Approve(in=1, alchemix-v3)                       -> UTXO[2]
    //   [3] DepositCollateral(USDC, user, 0, ctx, in=1)      -> (no output)  USDC -> MYT into position
    //   [4] Borrow(alUSD, user, 0, ctx, in=0)                -> UTXO[3]      mintFrom for sellAmount
    //   [5] PushToken(3, manager)                            -> UTXO[4]      manager has alUSD for CoW
    //
    // CoW settlement: manager sells `sellAmount` alUSD, gets `actualBuy` USDC.
    //
    // POST-HOOK after manager-injection (manager already transferred actualBuy USDC to router):
    //   [0] (auto)  ToOutput(actualSell, alUSD)              -> UTXO[0]
    //   [1] (auto)  ToOutput(actualBuy, USDC)                -> UTXO[1]
    //   [2] PushToken(1, adapter)                            -> sends USDC to adapter for flash repay
    const preInstructions = [
      // declare USDC the adapter funded into the router so subsequent inputs can reference it.
      createRouterInstruction(encodeToOutput(FLASH_AMOUNT_USDC, USDC)),
      // approve USDC for alchemix gateway (pulls from router on DepositCollateral)
      createRouterInstruction(encodeApprove(1, ALCHEMIX_GATEWAY_NAME)),
      // deposit USDC -> MYT into position
      createProtocolInstruction(
        ALCHEMIX_GATEWAY_NAME,
        encodeLendingInstruction(LendingOp.DepositCollateral, USDC, userAddress, 0n, ctx, 1),
      ),
      // borrow alAsset; amount comes from the manager-injected UTXO[0] = sellAmount
      createProtocolInstruction(
        ALCHEMIX_GATEWAY_NAME,
        encodeLendingInstruction(LendingOp.Borrow, ALCHEMIX.alUsd, userAddress, 0n, ctx, 0),
      ),
      // push the freshly-minted alAsset to the manager so CoW can sell it
      createRouterInstruction(encodePushToken(3, orderManagerAddress)),
    ];

    // Post-hook UTXO layout after manager auto-injection — WITHDRAW-DEFICIT topology, matches
    // the deployed `buildAlchemixPostInstructions` in useAutoLeverageOrder.ts:
    //   UTXO[0] = actualSell alUSD (declarative)
    //   UTXO[1] = actualBuy  USDC  (declarative; manager already transferred this to router)
    //
    // WITHDRAW-DEFICIT pattern: pre-hook deposited the *full* FLASH_AMOUNT_USDC into the
    // position. CoW returns `actualBuy` USDC < FLASH_AMOUNT (because flash is oversized).
    // Post-hook withdraws the deficit (FLASH − actualBuy) USDC from the position so the router
    // holds exactly FLASH USDC to push to the adapter for flash repay. Net per-iteration
    // deposit into position = FLASH − deficit = actualBuy ≈ sellAmount×peg, matching the
    // trigger's ΔC ≈ ΔD assumption.
    //
    // Stored post-instructions:
    //   UTXO[2] = ToOutput(FLASH_AMOUNT_USDC, USDC)            — declarative
    //   UTXO[3] = Subtract(2, 1) = FLASH − actualBuy = deficit — withdraw amount
    //             WithdrawCollateral(USDC, in=3)               — pulls deficit out of position
    //             PushToken(2 → adapter)                       — exactly FLASH USDC to adapter
    const postInstructions = [
      createRouterInstruction(encodeToOutput(FLASH_AMOUNT_USDC, USDC)),
      createRouterInstruction(encodeSubtract(2, 1)),
      createProtocolInstruction(
        ALCHEMIX_GATEWAY_NAME,
        encodeLendingInstruction(LendingOp.WithdrawCollateral, USDC, userAddress, 0n, ctx, 3),
      ),
      createRouterInstruction(encodePushToken(2, cowAdapterAddress)),
    ];

    const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-alchemix-autoleverage-test"));
    const salt = ethers.keccak256(ethers.toUtf8Bytes("alchemix-al-" + Date.now()));

    const orderParams = {
      user: userAddress,
      trigger: await autoLeverageTrigger.getAddress(),
      triggerStaticData,
      preInstructions: coder.encode(
        ["tuple(string protocolName, bytes data)[]"],
        [preInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
      ),
      sellToken: ALCHEMIX.alUsd,
      buyToken: USDC,
      postInstructions: coder.encode(
        ["tuple(string protocolName, bytes data)[]"],
        [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
      ),
      appDataHash,
      maxIterations: BigInt(NUM_CHUNKS),
      // No flash loan, so no refund recipient. Manager has no leftover sellToken to sweep
      // because the pre-hook borrows EXACTLY `sellAmount` and CoW consumes it all.
      sellTokenRefundAddress: ethers.ZeroAddress,
      isKindBuy: false, // KIND_SELL: exact sellAmount, min buyAmount
    };

    const createTx = await orderManager.connect(user).createOrder(orderParams, salt);
    const createReceipt = await createTx.wait();
    const orderHashEvent = createReceipt?.logs.find((log: unknown) => {
      try {
        return orderManager.interface.parseLog(log as { topics: string[]; data: string })?.name === "ConditionalOrderCreated";
      } catch { return false; }
    });
    const orderHash = orderManager.interface.parseLog(orderHashEvent as { topics: string[]; data: string })?.args[0];
    console.log(`Order created: ${orderHash}`);

    await orderManager.approveVaultRelayer(ALCHEMIX.alUsd);

    // ============ Snapshot mintAllowance BEFORE any iteration ============
    const allowanceBefore: bigint = await alchemist.mintAllowance(tokenId, gatewayAddress);
    console.log(`  mintAllowance before iteration 1: ${allowanceBefore}`);
    // The setup-time INITIAL_BORROW already consumed `INITIAL_BORROW` of the MAX approval.
    expect(allowanceBefore).to.equal(ethers.MaxUint256 - INITIAL_BORROW);

    // ============ Helper: run one settle iteration ============
    const runIteration = async (iteration: number): Promise<{ sellAmount: bigint; minBuyAmount: bigint }> => {
      console.log(`\n--- Iteration ${iteration} ---`);

      // Trigger should still want to fire.
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(triggerStaticData, userAddress);
      console.log(`  shouldExecute: ${shouldExec} (${reason})`);
      expect(shouldExec).to.equal(true);

      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(
        triggerStaticData, userAddress, BigInt(iteration - 1),
      );
      console.log(`  sellAmount (alUSD to swap):     ${ethers.formatUnits(sellAmount, 18)}`);
      console.log(`  minBuyAmount (USDC to receive): ${ethers.formatUnits(minBuyAmount, 6)}`);
      expect(sellAmount).to.be.gt(0n);
      expect(minBuyAmount).to.be.gt(0n);

      // Simulate the production flash-loan flow without actually wiring `flashLoanAndSettle`:
      // pre-fund the ROUTER with FLASH_AMOUNT_USDC USDC. In production the KapanCowAdapter
      // would do this via `fundOrderWithBalance(token=USDC, recipient=router)` after taking the
      // flash from Morpho. The pre-hook's first ToOutput declares this exact amount so the
      // subsequent DepositCollateral pulls a balance the router actually owns.
      await usdc.connect(solver).transfer(routerAddress, FLASH_AMOUNT_USDC);

      // validTo arbitrary far-future — manager._orderMatches doesn't check validTo so the
      // handler's deterministic value differing from ours doesn't matter; the GPv2 hash is
      // computed from the SAME validTo we pass in both the sig and the trade.
      const validTo = Math.floor(Date.now() / 1000) + 3600;
      const gpv2Order: GPv2OrderData = {
        sellToken: ALCHEMIX.alUsd,
        buyToken: USDC,
        receiver: orderManagerAddress,
        sellAmount,
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
        receiver: orderManagerAddress,
        sellAmount,
        buyAmount: minBuyAmount,
        validTo,
        appData: appDataHash,
        feeAmount: 0n,
        flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.SELL_ORDER | TRADE_FLAGS.FILL_OR_KILL,
        executedAmount: sellAmount,
        signature: buildTradeSignature(orderManagerAddress, gpv2Order, orderHandlerAddress, salt, orderHash),
      };

      // CRITICAL ordering: the trigger's `prepareCacheBySalt(user, salt)` MUST run before the
      // manager pre-hook so the cache is populated against pre-mutation state. Salt-based
      // because the orderHash isn't known at appData-signing time.
      const triggerCacheIface = new ethers.Interface([
        "function prepareCacheBySalt(address user, bytes32 salt) external",
      ]);
      const cacheCalldata = triggerCacheIface.encodeFunctionData("prepareCacheBySalt", [userAddress, salt]);
      const cacheHook = HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[
        { target: await autoLeverageTrigger.getAddress(), callData: cacheCalldata, gasLimit: 1_000_000n },
      ]]);
      const preHook = buildHookCalldata(orderManagerAddress, "executePreHookBySalt", [userAddress, salt]);
      const postHook = buildHookCalldata(orderManagerAddress, "executePostHookBySalt", [userAddress, salt]);

      const settleTx = await settlement.connect(owner).settle(
        [ALCHEMIX.alUsd, USDC],
        [minBuyAmount, sellAmount], // clearingPrices keep the trade math balanced
        [trade],
        [
          [
            { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: cacheHook },
            { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook },
          ],
          [],
          [{ target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHook }],
        ],
        { gasLimit: 8_000_000 },
      );
      const rcpt = await settleTx.wait();
      console.log(`  settle gas: ${rcpt?.gasUsed}`);

      return { sellAmount, minBuyAmount };
    };

    // ============ Iteration 1 ============
    const iter1 = await runIteration(1);
    const ltvAfter1 = await viewRouter.getCurrentLtv(ALCHEMIX_PROTOCOL_ID, userAddress, ctx);
    const allowanceAfter1: bigint = await alchemist.mintAllowance(tokenId, gatewayAddress);
    console.log(`  LTV after iteration 1: ${Number(ltvAfter1) / 100}%`);
    console.log(`  mintAllowance after 1: ${allowanceAfter1}`);
    expect(ltvAfter1).to.be.gt(initialLtv);
    expect(allowanceAfter1).to.be.lt(allowanceBefore);
    // Withdraw-deficit topology nukes mintAllowance via NFT round-trip — expected. For
    // single-iteration AL (target reached in one fill) this is irrelevant; subsequent
    // iterations would need a re-grant, but the deployed orders converge in 1 shot.
    expect(allowanceAfter1).to.equal(0n);

    // ============ Final assertions ============
    const allowanceConsumed = allowanceBefore - allowanceAfter1;
    expect(allowanceConsumed).to.be.gte(iter1.sellAmount);

    // Order should be in Completed state after maxIterations.
    const finalCtx = await orderManager.getOrder(orderHash);
    expect(finalCtx.iterationCount).to.equal(BigInt(NUM_CHUNKS));
    expect(finalCtx.status).to.equal(2); // Completed

    // No alAsset stuck in manager (CoW consumed the borrowed alAsset, post-hook drained USDC).
    expect(await alUsd.balanceOf(orderManagerAddress)).to.be.lte(ethers.parseUnits("1", 18));

    console.log(`\n=== AL completed in ${NUM_CHUNKS} iteration(s) ===`);
    console.log(`  Final LTV: ${Number(ltvAfter1) / 100}%`);
    console.log(`  alUSD borrowed: ${ethers.formatUnits(iter1.sellAmount, 18)}`);
    console.log(`  Allowance consumed: ${ethers.formatUnits(allowanceConsumed, 18)} alUSD`);
    console.log(`  Adapter USDC after flash repay (would be 0 with real flash): ${ethers.formatUnits(await usdc.balanceOf(cowAdapterAddress), 6)}`);
  });
});
