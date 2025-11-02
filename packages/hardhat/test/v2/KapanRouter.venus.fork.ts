import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  setupLendingTest,
  setupApprovals,
  createLendingFlowInstructions,
  verifyLendingFlowBalances,
  LendingTestConfig,
  TokenConfig,
  GatewayConfig,
} from "./helpers/lendingTestTemplate";
import {
  encodePullToken,
  encodeApprove,
  encodeToOutput,
  encodePushToken,
  createRouterInstruction,
  createProtocolInstruction,
  LendingOp,
} from "./helpers/instructionHelpers";

// Env vars and config
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
// Venus on BNB Chain - using Core Pool Comptroller (0xfD36E2c2a6789Db23113685031d7F16329158384)
// For testing on Arbitrum fork, we need Venus on Arbitrum if available
const VENUS_COMPTROLLER = process.env.VENUS_COMPTROLLER || "0xfD36E2c2a6789Db23113685031d7F16329158384";
const USDC = (process.env.USDC || process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
const USDC_WHALE = process.env.USDC_WHALE || "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";

// Token configurations
const USDC_TOKEN: TokenConfig = {
  address: USDC,
  decimals: 6,
  whale: USDC_WHALE,
};

// Gateway configuration
// VenusGatewayWrite constructor: (comptroller, router, owner)
// Note: router is added by setupLendingTest, owner will be deployer
const VENUS_GATEWAY: GatewayConfig = {
  type: "venus",
  protocolName: "venus",
  factoryName: "VenusGatewayWrite",
  deployArgs: [VENUS_COMPTROLLER], // router and owner are handled by template
};

describe("v2 Venus end-to-end (fork)", function () {
  before(function () {
    if (!FORK) {
      throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
    }
    if (!VENUS_COMPTROLLER) {
      throw new Error("VENUS_COMPTROLLER must be set in .env");
    }
  });

  describe("USDC collateral, USDC debt", function () {
    const config: LendingTestConfig = {
      collateralToken: USDC_TOKEN,
      debtToken: USDC_TOKEN,
      amounts: {
        deposit: 1_000_000_000n, // 1,000 USDC
        borrow: 100_000_000n, // 100 USDC
        repay: 101_000_000n, // 101 USDC (repay more to cover interest)
        withdraw: 990_000_000n, // 990 USDC (withdraw less to leave buffer)
      },
      gateway: VENUS_GATEWAY,
      userFunding: {
        collateral: 2_100_000_000n, // 2,100 USDC (extra for repay)
      },
    };

    it("should execute deposit -> borrow -> repay (individual steps)", async function () {
      const setup = await setupLendingTest(config);
      const userAddress = await setup.user.getAddress();

      // Setup all gateway approvals upfront
      await setupApprovals(setup, config, config.amounts);

      // Approve router to pull tokens
      await (setup.collateralToken.connect(setup.user) as any).approve(
        await setup.router.getAddress(),
        config.amounts.deposit + (config.amounts.repay || config.amounts.borrow)
      );

      const userBalanceBefore = await setup.collateralToken.balanceOf(userAddress);
      console.log(`\n=== Step 1: Deposit ${config.amounts.deposit / 10n ** 6n} USDC ===`);
      console.log(`User USDC before: ${userBalanceBefore / 10n ** 6n}`);

      // Step 1: Deposit
      const depositInstrs = [
        createRouterInstruction(encodePullToken(config.amounts.deposit, config.collateralToken.address, userAddress)),
        createRouterInstruction(encodeApprove(0, config.gateway.protocolName)),
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.DepositCollateral, config.collateralToken.address, userAddress, config.amounts.deposit, "0x", { index: 0 }]]
          )
        ),
      ];
      let tx = await setup.router.connect(setup.user).processProtocolInstructions(depositInstrs);
      await tx.wait();
      console.log(`✓ Deposit completed`);

      // Step 2: Borrow
      console.log(`\n=== Step 2: Borrow ${config.amounts.borrow / 10n ** 6n} USDC ===`);
      const borrowInstrs = [
        createRouterInstruction(encodeToOutput(config.amounts.borrow, config.debtToken.address)),
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.Borrow, config.debtToken.address, userAddress, 0n, "0x", { index: 0 }]]
          )
        ),
      ];
      tx = await setup.router.connect(setup.user).processProtocolInstructions(borrowInstrs);
      await tx.wait();
      console.log(`✓ Borrow completed`);

      const userBalanceAfterBorrow = await setup.collateralToken.balanceOf(userAddress);
      console.log(`User USDC after borrow: ${userBalanceAfterBorrow / 10n ** 6n}`);

      // Step 3: Repay
      console.log(`\n=== Step 3: Repay ${config.amounts.borrow / 10n ** 6n} USDC ===`);
      const repayInstrs = [
        createRouterInstruction(encodePullToken(config.amounts.borrow, config.debtToken.address, userAddress)),
        createRouterInstruction(encodeApprove(0, config.gateway.protocolName)),
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.Repay, config.debtToken.address, userAddress, 0n, "0x", { index: 0 }]]
          )
        ),
      ];
      tx = await setup.router.connect(setup.user).processProtocolInstructions(repayInstrs);
      await tx.wait();
      console.log(`✓ Repay completed`);

      const userBalanceAfterRepay = await setup.collateralToken.balanceOf(userAddress);
      console.log(`User USDC after repay: ${userBalanceAfterRepay / 10n ** 6n}`);

      // Step 4: Withdraw
      console.log(`\n=== Step 4: Withdraw ${config.amounts.deposit / 10n ** 6n} USDC ===`);
      const withdrawInstrs = [
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.WithdrawCollateral, config.collateralToken.address, userAddress, config.amounts.deposit, "0x", { index: 999 }]]
          )
        ),
        createRouterInstruction(encodePushToken(0, userAddress)),
      ];
      tx = await setup.router.connect(setup.user).processProtocolInstructions(withdrawInstrs);
      await tx.wait();
      console.log(`✓ Withdraw completed`);

      const userBalanceAfter = await setup.collateralToken.balanceOf(userAddress);
      console.log(`User USDC after withdraw: ${userBalanceAfter / 10n ** 6n}`);
    });

    it("should execute deposit only (individual step 1)", async function () {
      const setup = await setupLendingTest(config);
      const userAddress = await setup.user.getAddress();

      // Setup gateway approvals for deposit
      const depObj = {
        op: LendingOp.Deposit,
        token: config.collateralToken.address,
        user: userAddress,
        amount: config.amounts.deposit,
        context: "0x",
        input: { index: 0 },
      };
      const [gatewayTargets, gatewayDatas] = await setup.gateway.authorize([depObj], userAddress);
      console.log("\nGateway deposit authorizations:");
      for (let i = 0; i < gatewayTargets.length; i++) {
        if (!gatewayTargets[i] || gatewayDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${gatewayTargets[i]}, data=${gatewayDatas[i].substring(0, 20)}...`);
        await setup.user.sendTransaction({ to: gatewayTargets[i], data: gatewayDatas[i] });
      }

      // Approve router to pull deposit amount
      await (setup.collateralToken.connect(setup.user) as any).approve(
        await setup.router.getAddress(),
        config.amounts.deposit
      );

      const userBalanceBefore = await setup.collateralToken.balanceOf(userAddress);
      console.log(`User USDC before deposit: ${userBalanceBefore / 10n ** 6n}`);

      // Step 1: Pull deposit amount from user
      const i0 = createRouterInstruction(
        encodePullToken(config.amounts.deposit, config.collateralToken.address, userAddress)
      );
      // Step 2: Approve gateway for UTXO[0]
      const i1 = createRouterInstruction(encodeApprove(0, config.gateway.protocolName));
      // Step 3: Deposit to Venus
      const i2 = createProtocolInstruction(
        config.gateway.protocolName,
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
          [[LendingOp.Deposit, config.collateralToken.address, userAddress, config.amounts.deposit, "0x", { index: 0 }]]
        )
      );

      const tx = await setup.router.connect(setup.user).processProtocolInstructions([i0, i1, i2]);
      const receipt = await tx.wait();
      console.log(`✓ Deposit completed: ${receipt!.status === 1 ? "success" : "failed"}`);

      const userBalanceAfter = await setup.collateralToken.balanceOf(userAddress);
      console.log(`User USDC after deposit: ${userBalanceAfter / 10n ** 6n}`);
      
      // Verify deposit worked
      expect(userBalanceAfter).to.equal(userBalanceBefore - config.amounts.deposit);
    });

    it("should execute full flow (combined)", async function () {
      const setup = await setupLendingTest(config);
      await setupApprovals(setup, config, config.amounts);

      const userBalanceBefore = await setup.collateralToken.balanceOf(await setup.user.getAddress());
      console.log("\n=== Combined Execution ===");
      console.log(`User balance before: ${userBalanceBefore / 10n ** 6n} USDC`);

      const instructions = await createLendingFlowInstructions(setup, config, config.amounts);
      console.log(`Instructions: ${instructions.length} total`);
      console.log("  1. PullToken(deposit)");
      console.log("  2. Approve");
      console.log("  3. Deposit");
      console.log("  4. ToOutput(borrow amount)");
      console.log("  5. Borrow");
      console.log("  6. PullToken(repay)");
      console.log("  7. Approve");
      console.log("  8. Repay");
      console.log("  9. Withdraw");
      console.log("  10. PushToken");

      const tx = await setup.router.connect(setup.user).processProtocolInstructions(instructions);
      const receipt = await tx.wait();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      console.log(`✓ Combined execution completed: ${receipt!.status === 1 ? "success" : "failed"}`);

      await verifyLendingFlowBalances(setup, config, config.amounts, userBalanceBefore);
    });
  });
});

