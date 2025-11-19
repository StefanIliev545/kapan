import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  LendingOp,
  encodePullToken,
  encodeApprove,
  encodeToOutput,
  encodePushToken,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
} from "./helpers/instructionHelpers";

// Env vars and config
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
// Compound v3 USDC Comet (default Arbitrum One)
// Mainnet: 0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA
// Arbitrum: 0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf
const COMPOUND_USDC_COMET =
  process.env.COMPOUND_USDC_COMET ||
  "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";
const USDC = (process.env.USDC || process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
const WETH = (process.env.WETH || process.env.WETH_ARB || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1").toLowerCase();
const USDC_WHALE = process.env.USDC_WHALE || "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
const WETH_WHALE = process.env.WETH_WHALE || (process.env.BALANCER_VAULT3 || "0xBA12222222228d8Ba445958a75a0704d566BF2C8").toLowerCase();

describe("v2 Compound end-to-end (fork)", function () {
  before(function () {
    if (!FORK) {
      throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
    }
  });

  describe("WETH collateral, USDC debt", function () {
    it("should execute full flow with Compound Comet", async function () {
      const [deployer] = await ethers.getSigners();
      const user = ethers.Wallet.createRandom().connect(ethers.provider);

      // Fund user with ETH and tokens
      await network.provider.send("hardhat_setBalance", [
        WETH_WHALE,
        "0x56BC75E2D63100000", // 100 ETH
      ]);
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [WETH_WHALE],
      });
      const wethWhale = await ethers.getSigner(WETH_WHALE);
      await wethWhale.sendTransaction({ to: await user.getAddress(), value: ethers.parseEther("1") });

      const weth = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        WETH
      );
      const usdc = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        USDC
      );

      // Fund user with WETH
      await (weth.connect(wethWhale) as any).transfer(await user.getAddress(), ethers.parseEther("2"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(await deployer.getAddress());
      await router.waitForDeployment();

      // Deploy Compound gateway
      const CompoundGateway = await ethers.getContractFactory("CompoundGatewayWrite");
      const gateway = await CompoundGateway.deploy(
        await router.getAddress(),
        await deployer.getAddress()
      );
      await gateway.waitForDeployment();

      // Register the USDC Comet mapping explicitly (avoid on-chain baseToken() dependency)
      await gateway.setCometForBase(USDC, COMPOUND_USDC_COMET);

      // Register gateway with router
      await (await router.addGateway("compound", await gateway.getAddress())).wait();

      const userAddress = await user.getAddress();
      const depositAmt = ethers.parseEther("1"); // 1 WETH collateral
      const borrowAmt = 100_000_000n; // 100 USDC
      const repayAmt = 101_000_000n; // 101 USDC (with buffer)
      const withdrawAmt = ethers.parseEther("0.99"); // 0.99 WETH (leave buffer)

      console.log("\n=== Compound Comet Flow ===");
      console.log(`Market (base): ${USDC}`);
      console.log(`Collateral: ${WETH}`);

      // Encode market (USDC comet) in context
      const marketContext = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [USDC]);

      // Step 1: Gateway authorizations for collateral operations
      const depObj = {
        op: LendingOp.DepositCollateral,
        token: WETH, // collateral token
        user: userAddress,
        amount: depositAmt,
        context: marketContext, // market = USDC comet
        input: { index: 0 },
      };
      const borObj = {
        op: LendingOp.Borrow,
        token: USDC, // base token to borrow
        user: userAddress,
        amount: borrowAmt,
        context: marketContext,
        input: { index: 0 },
      };
      const witObj = {
        op: LendingOp.WithdrawCollateral,
        token: WETH, // collateral to withdraw
        user: userAddress,
        amount: withdrawAmt,
        context: marketContext, // market = USDC comet
        input: { index: 0 },
      };

      const [authTargets, authDatas, produced] = await gateway.authorize([depObj, borObj, witObj], userAddress, []);
      console.log("\n=== Gateway Authorizations ===");
      for (let i = 0; i < authTargets.length; i++) {
        if (!authTargets[i] || authDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${authTargets[i]}`);
        await user.sendTransaction({ to: authTargets[i], data: authDatas[i] });
      }

      // Step 2: Approve router to pull tokens
      await (weth.connect(user) as any).approve(await router.getAddress(), depositAmt);

      // Fund user with USDC for repay (from whale)
      await network.provider.send("hardhat_setBalance", [
        USDC_WHALE,
        "0x56BC75E2D63100000", // 100 ETH
      ]);
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [USDC_WHALE],
      });
      const usdcWhale = await ethers.getSigner(USDC_WHALE);
      await (usdc.connect(usdcWhale) as any).transfer(userAddress, repayAmt);
      await (usdc.connect(user) as any).approve(await router.getAddress(), repayAmt);

      console.log("\n=== Combined Execution ===");
      const userWethBefore = await weth.balanceOf(userAddress);
      const userUsdcBefore = await usdc.balanceOf(userAddress);
      console.log(`User WETH before: ${ethers.formatEther(userWethBefore)}`);
      console.log(`User USDC before: ${userUsdcBefore / 10n ** 6n}`);

      const instructions = [
        // 1. Pull WETH collateral from user -> UTXO[0]
        createRouterInstruction(encodePullToken(depositAmt, WETH, userAddress)),
        // 2. Approve gateway for UTXO[0] -> UTXO[1] (empty)
        createRouterInstruction(encodeApprove(0, "compound")),
        // 3. Deposit collateral (WETH) to USDC market
        createProtocolInstruction(
          "compound",
          encodeLendingInstruction(LendingOp.DepositCollateral, WETH, userAddress, 0n, marketContext, 0)
        ),
        // 4. ToOutput for borrow amount -> UTXO[2]
        createRouterInstruction(encodeToOutput(borrowAmt, USDC)),
        // 5. Borrow USDC -> UTXO[3]
        createProtocolInstruction(
          "compound",
          encodeLendingInstruction(LendingOp.Borrow, USDC, userAddress, 0n, marketContext, 2)
        ),
        // 6. Pull USDC for repay -> UTXO[4]
        createRouterInstruction(encodePullToken(repayAmt, USDC, userAddress)),
        // 7. Approve gateway for UTXO[4] -> UTXO[5] (empty)
        createRouterInstruction(encodeApprove(4, "compound")),
        // 8. Repay USDC -> UTXO[6]
        createProtocolInstruction(
          "compound",
          encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, marketContext, 4)
        ),
        // 9. Withdraw collateral (WETH) -> UTXO[7]
        createProtocolInstruction(
          "compound",
          encodeLendingInstruction(LendingOp.WithdrawCollateral, WETH, userAddress, withdrawAmt, marketContext, 999)
        ),
        // 10. Push withdrawn WETH to user
        createRouterInstruction(encodePushToken(7, userAddress)),
      ];

      console.log(`Instructions: ${instructions.length} total`);
      console.log("  1. PullToken(WETH collateral)");
      console.log("  2. Approve");
      console.log("  3. DepositCollateral(WETH to USDC market)");
      console.log("  4. ToOutput(borrow amount)");
      console.log("  5. Borrow(USDC)");
      console.log("  6. PullToken(USDC repay)");
      console.log("  7. Approve");
      console.log("  8. Repay(USDC)");
      console.log("  9. WithdrawCollateral(WETH)");
      console.log("  10. PushToken(WETH)");

      const tx = await router.connect(user).processProtocolInstructions(instructions);
      const receipt = await tx.wait();
      console.log(`✓ Combined execution completed: ${receipt!.status === 1 ? "success" : "failed"}`);

      const userWethAfter = await weth.balanceOf(userAddress);
      const userUsdcAfter = await usdc.balanceOf(userAddress);
      const routerWeth = await weth.balanceOf(await router.getAddress());
      const routerUsdc = await usdc.balanceOf(await router.getAddress());

      console.log(`\nRouter WETH balance: ${ethers.formatEther(routerWeth)}`);
      console.log(`Router USDC balance: ${routerUsdc / 10n ** 6n}`);
      console.log(`User WETH after: ${ethers.formatEther(userWethAfter)} (started with ${ethers.formatEther(userWethBefore)})`);
      console.log(`User USDC after: ${userUsdcAfter / 10n ** 6n} (started with ${userUsdcBefore / 10n ** 6n})`);

      // Verify balances
      // User started with 2 WETH, deposited 1, withdrew 0.99 => should have ~1.99 WETH
      expect(userWethAfter).to.be.closeTo(userWethBefore - depositAmt + withdrawAmt, ethers.parseEther("0.01"));
      // User started with repayAmt USDC, repaid repayAmt => should have 0 USDC left
      expect(userUsdcAfter).to.equal(0n);
      // Router should have minimal balances
      expect(routerWeth).to.be.lt(ethers.parseEther("0.01"));
    });
  });
});

