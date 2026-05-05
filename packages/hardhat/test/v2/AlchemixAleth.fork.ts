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
 * Alchemix V3 alETH market — full deposit/borrow/repay/withdraw cycle on Arbitrum fork.
 *
 *   Alchemist (alETH market) : 0xDeD3A04612FF12b57317abE38e68026Fc9D28114
 *   mixWETH MYT (ERC4626)    : 0xfe8F223F3d81462F55bf8609897B8cEcfA4B195C
 *   alETH (debt token)       : 0x17573150d67d820542EFb24210371545a4868B03
 *   Position NFT             : 0x763F5d567403add750e13234DB896CFe6b423059
 *   WETH (Arb)               : 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1
 */

const ALETH_ALCHEMIST = "0xDeD3A04612FF12b57317abE38e68026Fc9D28114";
const ARB_WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const WETH_WHALE = "0xbA1333333333a1BA1108E8412f11850A5C319bA9"; // Balancer V3 vault — large WETH balance

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

function encodeAlchemixContext(marketId: bigint, tokenId: bigint): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [marketId, tokenId]);
}

describe("v2 Alchemix V3 Gateway — alETH market (fork)", function () {
  before(async function () {
    if (!FORK) this.skip();
    const chainId = network.config.chainId || 31337;
    if (chainId !== 42161 && chainId !== 31337) this.skip();

    const code = await ethers.provider.getCode(ALETH_ALCHEMIST);
    if (code === "0x") {
      console.log("Skipping: alETH alchemist not present on fork.");
      this.skip();
    }
  });

  it("executes deposit → borrow → repay → withdraw against the live alETH market", async function () {
    this.timeout(240_000);

    const [deployer] = await ethers.getSigners();

    // ============ Deploy router + gateway ============
    const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

    const Gateway = await ethers.getContractFactory("AlchemixGatewayWrite");
    const gateway = await Gateway.deploy(routerAddress, deployer.address);
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();

    await router.addGateway("alchemix", gatewayAddress);
    await syncGateway("alchemix", gatewayAddress);
    console.log(`✓ Router + AlchemixGatewayWrite deployed: ${gatewayAddress}`);

    // ============ Register the alETH market ============
    const regTx = await gateway.registerMarket(ALETH_ALCHEMIST);
    await regTx.wait();
    const marketId: bigint = await gateway.alchemistToMarketId(ALETH_ALCHEMIST);
    expect(marketId).to.equal(1n);

    const m = await gateway.getMarket(marketId);
    console.log(`✓ Market registered: marketId=${marketId}`);
    console.log(`  myt=${m.myt} debtToken=${m.debtToken} positionNft=${m.positionNft}`);
    expect(m.underlying.toLowerCase()).to.equal(ARB_WETH.toLowerCase());

    // ============ Bind to live contracts ============
    const alchemist = await ethers.getContractAt("IAlchemistV3", ALETH_ALCHEMIST);
    const positionNft = new ethers.Contract(
      m.positionNft,
      [
        "function balanceOf(address owner) view returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function isApprovedForAll(address owner, address operator) view returns (bool)",
      ],
      ethers.provider
    );
    const weth = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      ARB_WETH
    )) as IERC20;
    const alEth = (await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      m.debtToken
    )) as IERC20;
    const myt = await ethers.getContractAt(
      "@openzeppelin/contracts/interfaces/IERC4626.sol:IERC4626",
      m.myt
    );

    const mytTotalAssets: bigint = await myt.totalAssets();
    console.log(`MYT total assets: ${ethers.formatUnits(mytTotalAssets, 18)} WETH`);

    // ============ Fund a fresh user with WETH ============
    const user = ethers.Wallet.createRandom().connect(ethers.provider);
    await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

    await network.provider.send("hardhat_setBalance", [WETH_WHALE, "0x56BC75E2D63100000"]);
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [WETH_WHALE] });
    const whale = await ethers.getSigner(WETH_WHALE);

    const depositAmount = ethers.parseEther("1"); // 1 WETH
    await (weth.connect(whale) as IERC20).transfer(user.address, depositAmount);
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [WETH_WHALE] });
    console.log(`✓ User funded with ${ethers.formatEther(depositAmount)} WETH`);

    // ============================================================
    // STEP 1 — Deposit WETH (gateway wraps to MYT, mints fresh NFT)
    // ============================================================
    console.log("\n--- Step 1: Deposit WETH ---");

    const ctxNew = encodeAlchemixContext(marketId, 0n);
    await (weth.connect(user) as IERC20).approve(routerAddress, depositAmount);

    const depositInstrs = [
      createRouterInstruction(encodePullToken(depositAmount, ARB_WETH, user.address)),
      createRouterInstruction(encodeApprove(0, "alchemix")),
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.DepositCollateral, ARB_WETH, user.address, 0n, ctxNew, 0)
      ),
    ];
    await router.connect(user).processProtocolInstructions(depositInstrs, { gasLimit: 2_000_000 });

    const userNftCount: bigint = await positionNft.balanceOf(user.address);
    expect(userNftCount).to.equal(1n);
    const tokenId: bigint = await positionNft.tokenOfOwnerByIndex(user.address, 0n);
    console.log(`✓ Position NFT minted: tokenId=${tokenId}`);

    let [collateral, debt, earmarked] = await alchemist.getCDP(tokenId);
    expect(collateral).to.be.gt(0n);
    expect(debt).to.equal(0n);
    console.log(
      `  CDP: collateral=${ethers.formatUnits(collateral, 18)} MYT, debt=${ethers.formatUnits(debt, 18)} alETH`
    );

    const ctx = encodeAlchemixContext(marketId, tokenId);

    // ============================================================
    // STEP 2 — Borrow alETH
    // ============================================================
    console.log("\n--- Step 2: Borrow alETH ---");
    const borrowAmount = ethers.parseEther("0.2"); // 0.2 alETH on 1 WETH collateral — well below 90% LTV

    {
      const [targets, data] = await gateway.authorize(
        [
          {
            op: LendingOp.Borrow,
            token: m.debtToken,
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

    const alEthBefore = await alEth.balanceOf(user.address);

    const borrowInstrs = [
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.Borrow, m.debtToken, user.address, borrowAmount, ctx, 999)
      ),
      createRouterInstruction(encodePushToken(0, user.address)),
    ];
    await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 2_000_000 });

    const alEthAfterBorrow = await alEth.balanceOf(user.address);
    expect(alEthAfterBorrow - alEthBefore).to.equal(borrowAmount);
    console.log(`✓ Borrowed: ${ethers.formatUnits(alEthAfterBorrow - alEthBefore, 18)} alETH`);

    [, debt] = await alchemist.getCDP(tokenId);
    expect(debt).to.be.gte(borrowAmount);
    console.log(`  CDP debt now: ${ethers.formatUnits(debt, 18)} alETH`);

    // ============================================================
    // STEP 3 — Repay alETH (burn path)
    // ============================================================
    console.log("\n--- Step 3: Repay alETH ---");
    await network.provider.send("evm_mine", []);

    const repayAmount = borrowAmount;
    await (alEth.connect(user) as IERC20).approve(routerAddress, repayAmount);

    const repayInstrs = [
      createRouterInstruction(encodePullToken(repayAmount, m.debtToken, user.address)),
      createRouterInstruction(encodeApprove(0, "alchemix")),
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.Repay, m.debtToken, user.address, 0n, ctx, 0)
      ),
      createRouterInstruction(encodePushToken(2, user.address)),
    ];
    await router.connect(user).processProtocolInstructions(repayInstrs, { gasLimit: 2_000_000 });

    [, debt, earmarked] = await alchemist.getCDP(tokenId);
    expect(debt - earmarked).to.equal(0n);
    console.log(
      `✓ Unearmarked debt repaid. debt=${ethers.formatUnits(debt, 18)}, earmarked=${ethers.formatUnits(earmarked, 18)}`
    );

    // ============================================================
    // STEP 4 — Withdraw collateral as WETH
    // ============================================================
    console.log("\n--- Step 4: Withdraw collateral as WETH ---");
    {
      const [targets, data] = await gateway.authorize(
        [
          {
            op: LendingOp.WithdrawCollateral,
            token: ARB_WETH,
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

    const wethBefore = await weth.balanceOf(user.address);
    const withdrawInstrs = [
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.GetSupplyBalance, ARB_WETH, user.address, 0n, ctx, 999)
      ),
      createProtocolInstruction(
        "alchemix",
        encodeLendingInstruction(LendingOp.WithdrawCollateral, ARB_WETH, user.address, 0n, ctx, 0)
      ),
      createRouterInstruction(encodePushToken(1, user.address)),
    ];
    await router.connect(user).processProtocolInstructions(withdrawInstrs, { gasLimit: 2_000_000 });

    const wethAfter = await weth.balanceOf(user.address);
    expect(wethAfter).to.be.gt(wethBefore);
    console.log(`✓ Received WETH: ${ethers.formatEther(wethAfter - wethBefore)}`);

    [collateral, debt, earmarked] = await alchemist.getCDP(tokenId);
    expect(collateral).to.be.lt(10n ** 15n);
    console.log(
      `  Final CDP: collateral=${ethers.formatUnits(collateral, 18)}, debt=${ethers.formatUnits(debt, 18)}`
    );

    expect(await positionNft.ownerOf(tokenId)).to.equal(user.address);
    console.log("\n=== Alchemix V3 alETH cycle succeeded ===");
  });
});
