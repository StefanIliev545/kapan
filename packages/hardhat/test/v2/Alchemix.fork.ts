import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import {
  createProtocolInstruction,
  createRouterInstruction,
  encodeLendingInstruction,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  LendingOp,
  deployRouterWithAuthHelper,
} from "./helpers/instructionHelpers";

type IERC20 = Contract & {
  transfer: (to: string, amount: bigint) => Promise<any>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  balanceOf: (account: string) => Promise<bigint>;
  connect: (signer: any) => IERC20;
};

/**
 * Alchemix V3 Fork Tests — Arbitrum
 *
 * Exercises the AlchemixGatewayWrite end-to-end against the live Arbitrum deployment:
 *
 *   Alchemist (alUSD market)  : 0x930750a3510E703535e943E826ABa3c364fFC1De
 *   mixUSDC MYT (ERC4626)     : 0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651
 *   alUSD (debt token)        : 0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A
 *   Position NFT              : 0x4bd4Faad509c4Bc5BA6D68A15C8b1b54A10288B4
 *   USDC (Arb native)         : 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
 *
 * Cycle covered: Deposit (USDC → MYT → alchemist) → Borrow (alUSD) → Repay (alUSD via burn) → Withdraw (MYT → USDC).
 *
 * Run with:
 *   FORK_CHAIN=arbitrum yarn fork                         # terminal 1
 *   yarn hardhat:test:fork --grep "Alchemix V3 Gateway"   # terminal 2
 *
 * Or as a single command via the in-process forked-network provider.
 */

// ============ Arbitrum live addresses ============
const ALCHEMIX = {
  alchemist: "0x930750a3510E703535e943E826ABa3c364fFC1De",
  myt: "0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651",
  alUsd: "0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A",
  positionNft: "0x4bd4Faad509c4Bc5BA6D68A15C8b1b54A10288B4",
};

const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

// Binance hot wallet — also used in other Arbitrum fork tests
const USDC_WHALE = "0x47c031236e19d024b42f8AE6780E44A573170703";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// Encode AlchemixGatewayWrite context: (marketId, tokenId).
// Per-market addresses live in the gateway's on-chain registry — see registerMarket.
function encodeAlchemixContext(marketId: bigint, tokenId: bigint): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [marketId, tokenId]);
}

describe("v2 Alchemix V3 Gateway (fork)", function () {
  let chainId: number;

  before(async function () {
    if (!FORK) {
      console.log("Skipping: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }
    chainId = network.config.chainId || 31337;

    // Sanity: verify the live contracts exist on this fork
    const alchCode = await ethers.provider.getCode(ALCHEMIX.alchemist);
    const mytCode = await ethers.provider.getCode(ALCHEMIX.myt);
    const nftCode = await ethers.provider.getCode(ALCHEMIX.positionNft);
    if (alchCode === "0x" || mytCode === "0x" || nftCode === "0x") {
      console.log(
        `Skipping: Alchemix V3 contracts not present on fork (chainId=${chainId}). ` +
          `Run with FORK_CHAIN=arbitrum at a recent block.`
      );
      this.skip();
    }
  });

  it("executes deposit → borrow → repay → withdraw against the live alUSD market", async function () {
    this.timeout(240_000);

    const [deployer] = await ethers.getSigners();

    // ============ Deploy router + gateway ============
    const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(
      ethers,
      deployer.address
    );

    const Gateway = await ethers.getContractFactory("AlchemixGatewayWrite");
    const gateway = await Gateway.deploy(routerAddress, deployer.address);
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();

    await router.addGateway("alchemix", gatewayAddress);
    await syncGateway("alchemix", gatewayAddress);
    console.log(`✓ Router + AlchemixGatewayWrite deployed: ${gatewayAddress}`);

    // Register the alUSD market — gateway pulls MYT/underlying/debtToken/positionNFT from the alchemist itself.
    const regTx = await gateway.registerMarket(ALCHEMIX.alchemist);
    const regReceipt = await regTx.wait();
    const marketId: bigint = await gateway.alchemistToMarketId(ALCHEMIX.alchemist);
    expect(marketId).to.equal(1n);
    console.log(`✓ Market registered: marketId=${marketId} (gas=${regReceipt?.gasUsed})`);

    // ============ Bind to live contracts ============
    const alchemist = await ethers.getContractAt("IAlchemistV3", ALCHEMIX.alchemist);

    // Ask the alchemist for the actual position NFT address (don't trust the human-supplied one).
    const realPositionNft: string = await alchemist.alchemistPositionNFT();
    console.log(`alchemist.alchemistPositionNFT() = ${realPositionNft}`);
    console.log(`(supplied positionNft        = ${ALCHEMIX.positionNft})`);

    const positionNft = new ethers.Contract(
      realPositionNft,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function isApprovedForAll(address owner, address operator) view returns (bool)",
        "function totalSupply() view returns (uint256)",
        "function setApprovalForAll(address operator, bool approved)",
      ],
      ethers.provider
    );
    const usdc = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      ARB_USDC
    )) as IERC20;
    const alUsd = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      ALCHEMIX.alUsd
    )) as IERC20;
    const myt = await ethers.getContractAt("@openzeppelin/contracts/interfaces/IERC4626.sol:IERC4626", ALCHEMIX.myt);

    // Quick liquidity sanity — if the alchemist is paused / empty, skip cleanly.
    const mytTotalAssets: bigint = await myt.totalAssets();
    console.log(`MYT total assets: ${ethers.formatUnits(mytTotalAssets, 6)} USDC`);

    // ============ Fund a fresh user ============
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

    await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
    const whale = await ethers.getSigner(USDC_WHALE);

    const depositAmount = 5_000n * 10n ** 6n; // 5,000 USDC
    await (usdc.connect(whale) as IERC20).transfer(user.address, depositAmount);
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [USDC_WHALE] });
    console.log(`✓ User funded with ${ethers.formatUnits(depositAmount, 6)} USDC`);

    // ============================================================
    // STEP 1 — Deposit USDC (gateway wraps to MYT, deposits with tokenId=0 → mints fresh NFT)
    // ============================================================
    console.log("\n--- Step 1: Deposit USDC ---");

    const ctxNew = encodeAlchemixContext(marketId, 0n);

    await (usdc.connect(user) as IERC20).approve(routerAddress, depositAmount);

    const depositInstrs = [
      createRouterInstruction(encodePullToken(depositAmount, ARB_USDC, user.address)),
      createRouterInstruction(encodeApprove(0, "alchemix")),
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.DepositCollateral, ARB_USDC, user.address, 0n, ctxNew, 0)
      ),
    ];

    await router.connect(user).processProtocolInstructions(depositInstrs, { gasLimit: 2_000_000 });

    // The alchemist mints a fresh ERC721 to the user — discover the tokenId.
    let userNftCount: bigint;
    try {
      userNftCount = await positionNft.balanceOf(user.address);
    } catch (err) {
      console.log("balanceOf reverted — diagnosing...");
      const totalSupply = await positionNft.totalSupply();
      console.log(`  positionNft.totalSupply() = ${totalSupply}`);
      throw err;
    }
    expect(userNftCount).to.equal(1n);

    const tokenId: bigint = await positionNft.tokenOfOwnerByIndex(user.address, 0n);
    console.log(`✓ Position NFT minted: tokenId=${tokenId}`);

    let [collateral, debt, earmarked] = await alchemist.getCDP(tokenId);
    expect(collateral).to.be.gt(0n);
    expect(debt).to.equal(0n);
    expect(earmarked).to.equal(0n);
    console.log(
      `  CDP: collateral=${ethers.formatUnits(collateral, 18)} MYT, debt=${ethers.formatUnits(debt, 18)} alUSD`
    );

    const ctx = encodeAlchemixContext(marketId, tokenId);

    // ============================================================
    // STEP 2 — Borrow alUSD against the position
    // ============================================================
    console.log("\n--- Step 2: Borrow alUSD ---");

    const borrowAmount = 1_000n * 10n ** 18n; // 1,000 alUSD (well below 90% LTV on 5k USDC)

    // Authorize: the gateway calls mintFrom, so it needs approveMint(tokenId, gateway, amount).
    // Call the gateway's authorize() directly with a Borrow instruction; user signs the emitted txs.
    {
      const [targets, data] = await gateway.authorize(
        [
          {
            op: LendingOp.Borrow,
            token: ALCHEMIX.alUsd,
            user: user.address,
            amount: borrowAmount,
            context: ctx,
            input: { index: 999 },
          },
        ],
        user.address,
        []
      );
      for (let i = 0; i < targets.length; i++) {
        if (targets[i] !== ethers.ZeroAddress && data[i].length > 0) {
          await user.sendTransaction({ to: targets[i], data: data[i] });
        }
      }
    }
    console.log(`✓ approveMint emitted for tokenId=${tokenId}`);

    const usdcBefore = await usdc.balanceOf(user.address);
    const alUsdBefore = await alUsd.balanceOf(user.address);

    const borrowInstrs = [
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.Borrow, ALCHEMIX.alUsd, user.address, borrowAmount, ctx, 999)
      ),
      createRouterInstruction(encodePushToken(0, user.address)),
    ];

    await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 2_000_000 });

    const alUsdAfterBorrow = await alUsd.balanceOf(user.address);
    expect(alUsdAfterBorrow - alUsdBefore).to.equal(borrowAmount);
    console.log(`✓ Borrowed: ${ethers.formatUnits(alUsdAfterBorrow - alUsdBefore, 18)} alUSD`);

    [, debt] = await alchemist.getCDP(tokenId);
    expect(debt).to.be.gte(borrowAmount);
    console.log(`  CDP debt now: ${ethers.formatUnits(debt, 18)} alUSD`);

    // ============================================================
    // STEP 3 — Repay using alUSD (burn path, repays unearmarked debt)
    //   AlchemistV3 has a same-block-as-mint guard — mine a block between borrow and repay.
    // ============================================================
    console.log("\n--- Step 3: Repay alUSD ---");
    await network.provider.send("evm_mine", []);

    const repayAmount = borrowAmount; // try to repay full
    await (alUsd.connect(user) as IERC20).approve(routerAddress, repayAmount);

    const repayInstrs = [
      createRouterInstruction(encodePullToken(repayAmount, ALCHEMIX.alUsd, user.address)),
      createRouterInstruction(encodeApprove(0, "alchemix")),
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.Repay, ALCHEMIX.alUsd, user.address, 0n, ctx, 0)
      ),
      createRouterInstruction(encodePushToken(2, user.address)), // refund (index 2 = output of Repay)
    ];

    await router.connect(user).processProtocolInstructions(repayInstrs, { gasLimit: 2_000_000 });

    [, debt, earmarked] = await alchemist.getCDP(tokenId);
    // burn() only repays unearmarked debt; on a freshly opened position earmarked should still be 0,
    // so debt should now be ~0.
    expect(debt - earmarked).to.equal(0n);
    console.log(
      `✓ Unearmarked debt repaid. Remaining debt=${ethers.formatUnits(debt, 18)}, earmarked=${ethers.formatUnits(
        earmarked,
        18
      )}`
    );

    // ============================================================
    // STEP 4 — Withdraw collateral as USDC (gateway transfers NFT in/out + redeems MYT to USDC)
    // ============================================================
    console.log("\n--- Step 4: Withdraw collateral as USDC ---");

    // Authorize: gateway needs setApprovalForAll on the position NFT
    {
      const [targets, data] = await gateway.authorize(
        [
          {
            op: LendingOp.WithdrawCollateral,
            token: ARB_USDC,
            user: user.address,
            amount: 0n,
            context: ctx,
            input: { index: 999 },
          },
        ],
        user.address,
        []
      );
      for (let i = 0; i < targets.length; i++) {
        if (targets[i] !== ethers.ZeroAddress && data[i].length > 0) {
          await user.sendTransaction({ to: targets[i], data: data[i] });
        }
      }
    }
    expect(await positionNft.isApprovedForAll(user.address, gatewayAddress)).to.equal(true);
    console.log(`✓ setApprovalForAll emitted to gateway`);

    // Withdraw via GetSupplyBalance → WithdrawCollateral chain so the gateway pulls everything available.
    const withdrawInstrs = [
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.GetSupplyBalance, ARB_USDC, user.address, 0n, ctx, 999)
      ),
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.WithdrawCollateral, ARB_USDC, user.address, 0n, ctx, 0)
      ),
      createRouterInstruction(encodePushToken(1, user.address)),
    ];

    await router.connect(user).processProtocolInstructions(withdrawInstrs, { gasLimit: 2_000_000 });

    const usdcAfter = await usdc.balanceOf(user.address);
    expect(usdcAfter).to.be.gt(usdcBefore);
    console.log(`✓ Received USDC: ${ethers.formatUnits(usdcAfter - usdcBefore, 6)}`);

    // CDP collateral should be EXACTLY 0 — the gateway's full-withdraw guard skips the
    // convertUTY(convertYTU(...)) round-trip when the requested amount equals the current
    // underlying-equivalent of collateral, so no MYT-share dust remains.
    [collateral, debt, earmarked] = await alchemist.getCDP(tokenId);
    expect(collateral).to.equal(0n);
    console.log(
      `  Final CDP: collateral=${ethers.formatUnits(collateral, 18)}, debt=${ethers.formatUnits(
        debt,
        18
      )}, earmarked=${ethers.formatUnits(earmarked, 18)}`
    );

    // NFT is back with the user
    expect(await positionNft.ownerOf(tokenId)).to.equal(user.address);

    console.log("\n=== Alchemix V3 deposit/borrow/repay/withdraw cycle succeeded ===");
  });

  /**
   * Regression test for the full-withdraw dust guard.
   *
   * Without the guard in `_withdrawCollateral`, the chained
   *   GetSupplyBalance(underlying) → WithdrawCollateral(underlying)
   * pattern leaves a few wei of MYT-share dust in the position because the gateway
   * round-trips: GetSupplyBalance returns `convertYieldTokensToUnderlying(collateral)`,
   * and WithdrawCollateral then computes `mytShares = convertUnderlyingTokensToYield(...)`,
   * which rounds down twice.
   *
   * With the guard, when the requested underlying amount is >= the current underlying-
   * equivalent of collateral, the gateway uses the raw MYT collateral directly. This test
   * asserts collateral === 0 (exact) after a full withdraw — not just "less than dust".
   */
  it("leaves zero CDP collateral after a full withdraw via GetSupplyBalance → WithdrawCollateral", async function () {
    this.timeout(180_000);

    const [deployer] = await ethers.getSigners();

    const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(
      ethers,
      deployer.address
    );
    const Gateway = await ethers.getContractFactory("AlchemixGatewayWrite");
    const gateway = await Gateway.deploy(routerAddress, deployer.address);
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();
    await router.addGateway("alchemix", gatewayAddress);
    await syncGateway("alchemix", gatewayAddress);

    const regTx = await gateway.registerMarket(ALCHEMIX.alchemist);
    await regTx.wait();
    const marketId: bigint = await gateway.alchemistToMarketId(ALCHEMIX.alchemist);

    const alchemist = await ethers.getContractAt("IAlchemistV3", ALCHEMIX.alchemist);
    const realPositionNft: string = await alchemist.alchemistPositionNFT();
    const positionNft = new ethers.Contract(
      realPositionNft,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
      ],
      ethers.provider
    );
    const usdc = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      ARB_USDC
    )) as IERC20;

    // Fund a fresh user with USDC
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });
    await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
    const whale = await ethers.getSigner(USDC_WHALE);
    const depositAmount = 1_234n * 10n ** 6n; // 1,234 USDC — non-round number to surface rounding bugs
    await (usdc.connect(whale) as IERC20).transfer(user.address, depositAmount);
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [USDC_WHALE] });

    // Deposit
    const ctxNew = encodeAlchemixContext(marketId, 0n);
    await (usdc.connect(user) as IERC20).approve(routerAddress, depositAmount);
    await router.connect(user).processProtocolInstructions(
      [
        createRouterInstruction(encodePullToken(depositAmount, ARB_USDC, user.address)),
        createRouterInstruction(encodeApprove(0, "alchemix")),
        createProtocolInstruction(
          "alchemix",
          encodeLendingInstruction(LendingOp.DepositCollateral, ARB_USDC, user.address, 0n, ctxNew, 0)
        ),
      ],
      { gasLimit: 2_000_000 }
    );

    const tokenId: bigint = await positionNft.tokenOfOwnerByIndex(user.address, 0n);
    const ctx = encodeAlchemixContext(marketId, tokenId);

    // Pre-withdraw assertion: position has non-zero collateral
    let [collateral] = await alchemist.getCDP(tokenId);
    expect(collateral).to.be.gt(0n);

    // NFT approval
    {
      const [targets, data] = await gateway.authorize(
        [
          {
            op: LendingOp.WithdrawCollateral,
            token: ARB_USDC,
            user: user.address,
            amount: 0n,
            context: ctx,
            input: { index: 999 },
          },
        ],
        user.address,
        []
      );
      for (let i = 0; i < targets.length; i++) {
        if (targets[i] !== ethers.ZeroAddress && data[i].length > 0) {
          await user.sendTransaction({ to: targets[i], data: data[i] });
        }
      }
    }

    // Full withdraw via the chained flow that previously left dust
    await router.connect(user).processProtocolInstructions(
      [
        createProtocolInstruction(
          "alchemix",
          encodeLendingInstruction(LendingOp.GetSupplyBalance, ARB_USDC, user.address, 0n, ctx, 999)
        ),
        createProtocolInstruction(
          "alchemix",
          encodeLendingInstruction(LendingOp.WithdrawCollateral, ARB_USDC, user.address, 0n, ctx, 0)
        ),
        createRouterInstruction(encodePushToken(1, user.address)),
      ],
      { gasLimit: 2_000_000 }
    );

    // Critical assertion: ZERO dust left in the position after a full withdraw.
    [collateral] = await alchemist.getCDP(tokenId);
    expect(collateral).to.equal(0n);

    // NFT is returned to the user.
    expect(await positionNft.ownerOf(tokenId)).to.equal(user.address);
  });
});
