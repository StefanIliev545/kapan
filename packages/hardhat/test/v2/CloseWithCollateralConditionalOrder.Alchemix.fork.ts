/**
 * Fork Tests for Close With Collateral Conditional Orders - Alchemix V3
 *
 * Mirrors the Aave V3 conditional-close test but exercises the alchemix close-with-
 * collateral wiring end-to-end via the real CoW Protocol FlashLoanRouter + Settlement.
 *
 * Flow:
 *   1. User opens Alchemix position: deposit USDC -> mint MYT -> borrow alUSD.
 *   2. KapanCowAdapter flash-loans collateral (USDC) from Morpho Blue (0% fee).
 *   3. Pre-hook: adapter pushes flashed USDC into the OrderManager.
 *   4. Settle: Manager sells USDC to settlement; settlement credits alUSD (KIND_BUY).
 *   5. Post-hook (the topology under test):
 *        [0] Approve(UTXO[1]=alUSD, ALCHEMIX_GATEWAY_NAME)
 *        [1] Repay(alUSD, user, 0, ctx, input=1)         -> alchemist.burn -> debt -=
 *        [2] WithdrawCollateral(USDC, user, 0, ctx, in=0)-> alchemist.withdraw, redeem MYT->USDC
 *        [3] PushToken(UTXO[withdraw], orderManager)
 *      Manager auto-refunds remaining sellToken -> KapanCowAdapter -> repays flash.
 *
 * What this proves: with 0-fee flash + a fresh (non-earmarked) alchemix position the
 * limit-order topology balances exactly — the manager has `flashAmount` USDC at the
 * end of post-hook, which fully repays the flash principal.
 *
 * Run with: FORK_CHAIN=arbitrum npx hardhat test test/v2/CloseWithCollateralConditionalOrder.Alchemix.fork.ts
 */

import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AbiCoder, Signer, Contract } from "ethers";
import {
  encodeApprove,
  encodePullToken,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
  encodePushToken,
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
import { ALCHEMIX_GATEWAY_NAME, ALCHEMIX_PROTOCOL_ID } from "../../utils/alchemixConstants";

const coder = AbiCoder.defaultAbiCoder();

// ============ Arbitrum addresses ============
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const USDC_WHALE = "0x47c031236e19d024b42f8AE6780E44A573170703"; // Binance hot wallet
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e"; // 0% fee flash

// Live alUSD market
const ALCHEMIX = {
  alchemist: "0x930750a3510E703535e943E826ABa3c364fFC1De",
  myt: "0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651",
  alUsd: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
};

// Use the production constant — same source of truth as the AlchemixConstants Solidity library.

const HOOKS_TRAMPOLINE_IFACE = new ethers.Interface([
  "function execute(tuple(address target, bytes callData, uint256 gasLimit)[] hooks) external",
]);

const FLASH_LOAN_ROUTER_ABI = [
  "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
];

const ADAPTER_IFACE = new ethers.Interface([
  "function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient) external",
]);

function encodeAlchemixContext(marketId: bigint, tokenId: bigint): string {
  return coder.encode(["uint256", "uint256"], [marketId, tokenId]);
}

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

describe("Close With Collateral Conditional Order - Alchemix V3 (Fork)", function () {
  before(async function () {
    if (!FORK) {
      console.log("Skipping: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }
    const net = await ethers.provider.getNetwork();
    const chainId = Number(net.chainId);
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping - requires Arbitrum fork (got chainId ${chainId})`);
      this.skip();
    }
    // Make sure the live alchemist is actually deployed at this fork block.
    const code = await ethers.provider.getCode(ALCHEMIX.alchemist);
    if (code === "0x") {
      console.log("Skipping: Alchemix V3 alchemist not present at fork block");
      this.skip();
    }
  });

  // Position sizing — picked to keep us well below the 90% face-value LTV cap.
  const DEPOSIT_USDC = 5_000n * 10n ** 6n; // 5,000 USDC
  const BORROW_ALUSD = 1_000n * 10n ** 18n; // 1,000 alUSD
  const CLOSE_BUY_AMOUNT = 800n * 10n ** 18n; // close 800 alUSD of debt

  let owner: Signer;
  let user: Signer;
  let solver: Signer; // separate signer that mints alUSD for settlement liquidity
  let userAddress: string;

  let router: Contract;
  let alchemixGateway: Contract;
  let cowAdapter: Contract;
  let orderManager: Contract;
  let orderHandler: Contract;
  let limitPriceTrigger: Contract;
  let viewRouter: Contract;
  let settlement: Contract;
  let flashLoanRouter: Contract;

  let routerAddress: string;
  let gatewayAddress: string;
  let adapterAddress: string;
  let orderManagerAddress: string;
  let orderHandlerAddress: string;

  let usdc: Contract;
  let alUsd: Contract;
  let alchemist: Contract;
  let positionNft: Contract;

  let marketId: bigint;
  let tokenId: bigint;

  const erc20Abi = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ];

  before(async function () {
    this.timeout(300_000);

    [owner] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    solver = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();
    await network.provider.send("hardhat_setBalance", [userAddress, "0x56BC75E2D63100000"]);
    await network.provider.send("hardhat_setBalance", [await solver.getAddress(), "0x56BC75E2D63100000"]);

    // EDR cold-read panic workaround (ExcessBlobGasNotSet on certain Arbitrum blocks):
    // mine a few blocks to force the provider past the bad header path before touching live state.
    for (let i = 0; i < 3; i++) {
      await network.provider.send("evm_mine", []);
    }

    usdc = await ethers.getContractAt(erc20Abi, USDC);
    alUsd = await ethers.getContractAt(erc20Abi, ALCHEMIX.alUsd);
    alchemist = await ethers.getContractAt("IAlchemistV3", ALCHEMIX.alchemist);

    // Pull live position-NFT address from the alchemist (don't trust constants).
    const realPositionNft: string = await alchemist.alchemistPositionNFT();
    positionNft = new ethers.Contract(
      realPositionNft,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function isApprovedForAll(address owner, address operator) view returns (bool)",
        "function setApprovalForAll(address operator, bool approved)",
      ],
      ethers.provider,
    );

    // Fund both user and solver with USDC from a whale.
    await impersonateAndFund(USDC_WHALE);
    const whale = await ethers.getSigner(USDC_WHALE);
    await usdc.connect(whale).transfer(userAddress, DEPOSIT_USDC);
    await usdc.connect(whale).transfer(await solver.getAddress(), DEPOSIT_USDC);

    settlement = await getSettlement();
    flashLoanRouter = await ethers.getContractAt(FLASH_LOAN_ROUTER_ABI, COW_PROTOCOL.flashLoanRouter);

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

    // CowAdapter — Morpho Blue is whitelisted so the flash callback succeeds.
    const CowAdapterFactory = await ethers.getContractFactory("KapanCowAdapter");
    cowAdapter = await CowAdapterFactory.deploy(COW_PROTOCOL.flashLoanRouter, await owner.getAddress());
    adapterAddress = await cowAdapter.getAddress();
    await cowAdapter.setMorphoLender(MORPHO_BLUE, true);

    // ConditionalOrderManager + Handler.
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

    // ViewRouter is required by LimitPriceTrigger's constructor; the trigger never dispatches
    // through it for limit orders (shouldExecute returns true unconditionally), so we don't
    // need to register an alchemix gateway view here.
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await owner.getAddress());
    const LimitPriceTriggerFactory = await ethers.getContractFactory("LimitPriceTrigger");
    limitPriceTrigger = await LimitPriceTriggerFactory.deploy(await viewRouter.getAddress());

    await router.setApprovedManager(orderManagerAddress, true);
    await router.connect(user).setDelegate(orderManagerAddress, true);

    await becomeSolver(await owner.getAddress());

    // ============ Set up the user's alchemix position: deposit USDC -> borrow alUSD ============
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

    // Borrow alUSD — needs approveMint(tokenId, gateway, amount). Get it from the gateway's authorize().
    {
      const [targets, data] = await alchemixGateway.authorize(
        [
          {
            op: LendingOp.Borrow,
            token: ALCHEMIX.alUsd,
            user: userAddress,
            amount: BORROW_ALUSD,
            context: ctx,
            input: { index: 999 },
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
    await router.connect(user).processProtocolInstructions(
      [
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.Borrow, ALCHEMIX.alUsd, userAddress, BORROW_ALUSD, ctx, 999),
        ),
        createRouterInstruction(encodePushToken(0, userAddress)),
      ],
      { gasLimit: 2_000_000 },
    );

    // Pre-grant NFT operator approval — frontend's auth flow does this in the create-order batch.
    {
      const [targets, data] = await alchemixGateway.authorize(
        [
          {
            op: LendingOp.WithdrawCollateral,
            token: USDC,
            user: userAddress,
            amount: 0n,
            context: ctx,
            input: { index: 999 },
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
    expect(await positionNft.isApprovedForAll(userAddress, gatewayAddress)).to.equal(true);

    // ============ Solver-side liquidity: open a parallel alchemix position to mint alUSD ============
    // Settlement needs alUSD on hand to credit to the manager when the order fills. There is no
    // reliable alUSD whale on Arbitrum, so we mint our own via a parallel position controlled by
    // an unrelated signer, then transfer the alUSD to the settlement contract.
    const solverAddress = await solver.getAddress();
    await router.connect(solver).setDelegate(orderManagerAddress, true);
    await usdc.connect(solver).approve(routerAddress, DEPOSIT_USDC);
    const solverDepositCtx = encodeAlchemixContext(marketId, 0n);
    await router.connect(solver).processProtocolInstructions(
      [
        createRouterInstruction(encodePullToken(DEPOSIT_USDC, USDC, solverAddress)),
        createRouterInstruction(encodeApprove(0, ALCHEMIX_GATEWAY_NAME)),
        createProtocolInstruction(
          ALCHEMIX_GATEWAY_NAME,
          encodeLendingInstruction(LendingOp.DepositCollateral, USDC, solverAddress, 0n, solverDepositCtx, 0),
        ),
      ],
      { gasLimit: 2_000_000 },
    );
    const solverTokenId: bigint = await positionNft.tokenOfOwnerByIndex(solverAddress, 0n);
    const solverCtx = encodeAlchemixContext(marketId, solverTokenId);

    // Mint > CLOSE_BUY_AMOUNT alUSD into solver, then transfer 2x buffer into settlement.
    const solverMintAmount = CLOSE_BUY_AMOUNT * 2n;
    {
      const [targets, data] = await alchemixGateway.authorize(
        [
          {
            op: LendingOp.Borrow,
            token: ALCHEMIX.alUsd,
            user: solverAddress,
            amount: solverMintAmount,
            context: solverCtx,
            input: { index: 999 },
          },
        ],
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
          encodeLendingInstruction(LendingOp.Borrow, ALCHEMIX.alUsd, solverAddress, solverMintAmount, solverCtx, 999),
        ),
        createRouterInstruction(encodePushToken(0, solverAddress)),
      ],
      { gasLimit: 2_000_000 },
    );

    await alUsd.connect(solver).transfer(COW_PROTOCOL.settlement, solverMintAmount);

    // AlchemistV3 has a "no repay on mint block" guard. Mine a block before the settlement runs
    // so the post-hook's burn() doesn't trip CannotRepayOnMintBlock.
    await network.provider.send("evm_mine", []);
  });

  function buildHookCalldata(target: string, fnName: string, args: unknown[]): string {
    const orderManagerIface = new ethers.Interface([
      "function executePreHookBySalt(address user, bytes32 salt) external",
      "function executePostHookBySalt(address user, bytes32 salt) external",
    ]);
    const innerCalldata = orderManagerIface.encodeFunctionData(fnName, args);
    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[
      { target, callData: innerCalldata, gasLimit: 3_000_000n },
    ]]);
  }

  function buildAdapterFundHookCalldata(userAddr: string, salt: string, token: string, recipient: string): string {
    const innerCalldata = ADAPTER_IFACE.encodeFunctionData("fundOrderWithBalance", [userAddr, salt, token, recipient]);
    return HOOKS_TRAMPOLINE_IFACE.encodeFunctionData("execute", [[
      { target: adapterAddress, callData: innerCalldata, gasLimit: 500_000n },
    ]]);
  }

  it("settles a close-with-collateral order against the live alUSD market", async function () {
    this.timeout(300_000);

    const ctx = encodeAlchemixContext(marketId, tokenId);

    // Pre-state.
    const [collateralBefore, debtBefore] = await alchemist.getCDP(tokenId);
    console.log(`\nBefore: collateral=${ethers.formatUnits(collateralBefore, 18)} MYT, debt=${ethers.formatUnits(debtBefore, 18)} alUSD`);

    // ============ Build post-instructions (mirrors useClosePositionConfig.tsx exactly) ============
    // Manager prepends UTXO[0]=actualSell(USDC) and UTXO[1]=actualBuy(alUSD) before these run.
    const postInstructions = [
      createRouterInstruction(encodeApprove(1, ALCHEMIX_GATEWAY_NAME)),
      createProtocolInstruction(
        ALCHEMIX_GATEWAY_NAME,
        encodeLendingInstruction(LendingOp.Repay, ALCHEMIX.alUsd, userAddress, 0n, ctx, 1),
      ),
      createProtocolInstruction(
        ALCHEMIX_GATEWAY_NAME,
        encodeLendingInstruction(LendingOp.WithdrawCollateral, USDC, userAddress, 0n, ctx, 0),
      ),
      // Repay produces UTXO[3] (refund), Withdraw produces UTXO[4] (withdrawn USDC).
      createRouterInstruction(encodePushToken(4, orderManagerAddress)),
    ];

    // ============ Trigger params ============
    // limitPrice = (buyAmount / sellAmount) * 1e8. We size sellAmount conservatively.
    const sellAmount = (CLOSE_BUY_AMOUNT * 11n) / 10n / 10n ** 12n; // ~10% slippage, 18->6 decimal scale
    const limitPrice = (CLOSE_BUY_AMOUNT * 10n ** 8n) / (sellAmount * 10n ** 12n); // 8-decimal exchange rate

    const triggerStaticData = await limitPriceTrigger.encodeTriggerParams({
      protocolId: ALCHEMIX_PROTOCOL_ID,
      protocolContext: ctx,
      sellToken: USDC,
      buyToken: ALCHEMIX.alUsd,
      sellDecimals: 6,
      buyDecimals: 18,
      limitPrice,
      triggerAbovePrice: true,
      totalSellAmount: sellAmount,
      totalBuyAmount: CLOSE_BUY_AMOUNT,
      numChunks: 1,
      maxSlippageBps: 1000,
      isKindBuy: true,
    });

    // ============ Create the conditional order ============
    const appDataHash = ethers.keccak256(ethers.toUtf8Bytes("kapan-close-collateral-alchemix-test"));
    const salt = ethers.keccak256(ethers.toUtf8Bytes("close-pos-alchemix-" + Date.now()));

    const orderParams = {
      user: userAddress,
      trigger: await limitPriceTrigger.getAddress(),
      triggerStaticData,
      preInstructions: coder.encode(["tuple(string protocolName, bytes data)[]"], [[]]),
      sellToken: USDC,
      buyToken: ALCHEMIX.alUsd,
      postInstructions: coder.encode(
        ["tuple(string protocolName, bytes data)[]"],
        [postInstructions.map(i => ({ protocolName: i.protocolName, data: i.data }))],
      ),
      appDataHash,
      maxIterations: 1,
      sellTokenRefundAddress: adapterAddress,
      isKindBuy: true,
    };

    const createTx = await orderManager.connect(user).createOrder(orderParams, salt);
    const createReceipt = await createTx.wait();
    const createdEvent = createReceipt?.logs.find((log: unknown) => {
      try {
        return orderManager.interface.parseLog(log as { topics: string[]; data: string })?.name === "ConditionalOrderCreated";
      } catch {
        return false;
      }
    });
    const orderHash = orderManager.interface.parseLog(createdEvent as { topics: string[]; data: string })?.args[0];
    console.log(`Order created: ${orderHash}`);

    // ============ Pull the trigger-calculated amounts ============
    const triggerView = await ethers.getContractAt(
      [
        "function calculateExecution(bytes calldata staticData, address owner, uint256 iterationCount) external pure returns (uint256 sellAmount, uint256 buyAmount)",
      ],
      await limitPriceTrigger.getAddress(),
    );
    const [triggerSellAmount, triggerBuyAmount] = await triggerView.calculateExecution(triggerStaticData, userAddress, 0);
    console.log(`Trigger amounts: sell=${ethers.formatUnits(triggerSellAmount, 6)} USDC, buy=${ethers.formatUnits(triggerBuyAmount, 18)} alUSD`);

    // ============ GPv2Order + EIP-1271 signature ============
    const validTo = Math.floor(Date.now() / 1000) + 3600;
    const gpv2Order: GPv2OrderData = {
      sellToken: USDC,
      buyToken: ALCHEMIX.alUsd,
      receiver: orderManagerAddress,
      sellAmount: triggerSellAmount,
      buyAmount: triggerBuyAmount,
      validTo,
      appData: appDataHash,
      feeAmount: 0n,
      kind: GPV2_ORDER.KIND_BUY,
      partiallyFillable: false,
      sellTokenBalance: GPV2_ORDER.BALANCE_ERC20,
      buyTokenBalance: GPV2_ORDER.BALANCE_ERC20,
    };

    const trade = {
      sellTokenIndex: 0,
      buyTokenIndex: 1,
      receiver: orderManagerAddress,
      sellAmount: triggerSellAmount,
      buyAmount: triggerBuyAmount,
      validTo,
      appData: appDataHash,
      feeAmount: 0n,
      flags: TRADE_FLAGS.EIP1271 | TRADE_FLAGS.BUY_ORDER | TRADE_FLAGS.FILL_OR_KILL,
      executedAmount: triggerBuyAmount,
      signature: buildTradeSignature(orderManagerAddress, gpv2Order, orderHandlerAddress, salt, orderHash),
    };

    // ============ Settlement interactions ============
    const preHook1 = buildAdapterFundHookCalldata(userAddress, salt, USDC, orderManagerAddress);
    const preHook2 = buildHookCalldata(orderManagerAddress, "executePreHookBySalt", [userAddress, salt]);
    const postHook = buildHookCalldata(orderManagerAddress, "executePostHookBySalt", [userAddress, salt]);

    const preInteractions = [
      { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook1 },
      { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: preHook2 },
    ];
    const postInteractions = [
      { target: COW_PROTOCOL.hooksTrampoline, value: 0n, callData: postHook },
    ];

    await orderManager.approveVaultRelayer(USDC);

    // ============ Flash USDC from Morpho (0% fee) and settle ============
    const loans = [{
      amount: triggerSellAmount,
      borrower: adapterAddress,
      lender: MORPHO_BLUE,
      token: USDC,
    }];

    const settlementCalldata = settlement.interface.encodeFunctionData("settle", [
      [USDC, ALCHEMIX.alUsd],
      [triggerBuyAmount, triggerSellAmount],
      [trade],
      [preInteractions, [], postInteractions],
    ]);

    // Pre-flight: simulate what the alchemix gateway would actually return for actualSell.
    // The gateway round-trips: U -> Y -> withdraw(Y) -> redeem(Y) -> U, which loses dust on each step.
    {
      const mytShares = await alchemist.convertUnderlyingTokensToYield(triggerSellAmount);
      const myt = await ethers.getContractAt("@openzeppelin/contracts/interfaces/IERC4626.sol:IERC4626", ALCHEMIX.myt);
      const previewRedeem = await myt.previewRedeem(mytShares);
      console.log(`\n=== Conversion round-trip probe ===`);
      console.log(`  triggerSellAmount:                 ${triggerSellAmount} (${ethers.formatUnits(triggerSellAmount, 6)} USDC)`);
      console.log(`  convertUnderlyingTokensToYield ->  ${mytShares}`);
      console.log(`  previewRedeem(mytShares) ->        ${previewRedeem} (${ethers.formatUnits(previewRedeem, 6)} USDC)`);
      console.log(`  round-trip loss:                   ${triggerSellAmount - previewRedeem} (${ethers.formatUnits(triggerSellAmount - previewRedeem, 6)} USDC)`);
    }

    // Probe the manager pre-hook in isolation: callStatic the post-hook to see what (if anything)
    // the manager would return to the adapter. This requires the pre-hook to have run, so we skip
    // here and rely on the failure-mode diagnostics below.

    let settleReceipt;
    try {
      const settleTx = await flashLoanRouter.connect(owner).flashLoanAndSettle(loans, settlementCalldata, { gasLimit: 8_000_000 });
      settleReceipt = await settleTx.wait();
      console.log(`Gas used: ${settleReceipt?.gasUsed}`);
    } catch (err) {
      const adapterUsdc = await usdc.balanceOf(adapterAddress);
      const managerUsdc = await usdc.balanceOf(orderManagerAddress);
      const managerAlUsd = await alUsd.balanceOf(orderManagerAddress);
      console.log(`\n=== Settle failed — post-mortem balances ===`);
      console.log(`  triggerSellAmount (flash principal): ${ethers.formatUnits(triggerSellAmount, 6)} USDC`);
      console.log(`  adapter USDC at revert:              ${ethers.formatUnits(adapterUsdc, 6)} (raw=${adapterUsdc})`);
      console.log(`  shortfall (principal − adapter):     ${ethers.formatUnits(triggerSellAmount - adapterUsdc, 6)} USDC (raw=${triggerSellAmount - adapterUsdc})`);
      console.log(`  manager leftover USDC:               ${ethers.formatUnits(managerUsdc, 6)}`);
      console.log(`  manager leftover alUSD:              ${ethers.formatUnits(managerAlUsd, 18)}`);
      throw err;
    }

    // ============ Assertions ============
    const [collateralAfter, debtAfter] = await alchemist.getCDP(tokenId);
    console.log(`After:  collateral=${ethers.formatUnits(collateralAfter, 18)} MYT, debt=${ethers.formatUnits(debtAfter, 18)} alUSD`);

    expect(debtAfter).to.be.lt(debtBefore);
    const debtReduced = debtBefore - debtAfter;
    expect(debtReduced).to.be.closeTo(triggerBuyAmount, triggerBuyAmount / 100n);

    expect(collateralAfter).to.be.lt(collateralBefore);

    // Order completed.
    const orderCtxAfter = await orderManager.getOrder(orderHash);
    expect(orderCtxAfter.status).to.equal(2); // Completed

    // Adapter has zero leftover USDC -> flash repaid in full.
    const adapterUsdc = await usdc.balanceOf(adapterAddress);
    expect(adapterUsdc).to.equal(0n);

    // Manager has no stuck dust.
    const managerUsdc = await usdc.balanceOf(orderManagerAddress);
    const managerAlUsd = await alUsd.balanceOf(orderManagerAddress);
    expect(managerUsdc).to.be.lt(1_000_000n); // <1 USDC
    expect(managerAlUsd).to.be.lt(ethers.parseUnits("1", 18));

    // NFT back to user.
    expect(await positionNft.ownerOf(tokenId)).to.equal(userAddress);
  });
});
