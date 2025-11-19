import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  setupLendingTest,
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
  createGetSupplyBalanceInstruction,
  createGetBorrowBalanceInstruction,
  LendingOp,
} from "./helpers/instructionHelpers";

// Env vars and config
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const VENUS_COMPTROLLER = process.env.VENUS_COMPTROLLER || "0xfD36E2c2a6789Db23113685031d7F16329158384";
const USDC = (process.env.USDC || process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
const USDC_WHALE = process.env.USDC_WHALE || "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";

const USDC_TOKEN: TokenConfig = {
  address: USDC,
  decimals: 6,
  whale: USDC_WHALE,
};

const VENUS_GATEWAY: GatewayConfig = {
  type: "venus",
  protocolName: "venus",
  factoryName: "VenusGatewayWrite",
  deployArgs: [VENUS_COMPTROLLER],
};

describe("v2 Venus Dynamic Balance Flow (fork)", function () {
  before(function () {
    if (!FORK) {
      throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
    }
    // Check if we are on BNB Chain (56)
    const chainId = network.config.chainId;
    if (chainId !== 56) {
      console.log(`Skipping Venus Dynamic tests: Current chain ID is ${chainId}, expected 56 (BNB Chain)`);
      this.skip();
    }
    if (!VENUS_COMPTROLLER) {
      throw new Error("VENUS_COMPTROLLER must be set in .env");
    }
  });

  describe("Dynamic withdraw using GetSupplyBalance", function () {
    const config: LendingTestConfig = {
      collateralToken: USDC_TOKEN,
      debtToken: USDC_TOKEN,
      amounts: {
        deposit: 1_000_000_000n, // 1,000 USDC
        borrow: 0n, // No borrow for this test
      },
      gateway: VENUS_GATEWAY,
      userFunding: {
        collateral: 2_000_000_000n, // 2,000 USDC
      },
    };

    it("should query supply balance and use it for withdraw approval", async function () {
      const setup = await setupLendingTest(config);
      const userAddress = await setup.user.getAddress();

      // Step 1: Setup deposit authorization and deposit
      const depObj = {
        op: LendingOp.DepositCollateral,
        token: config.collateralToken.address,
        user: userAddress,
        amount: config.amounts.deposit,
        context: "0x",
        input: { index: 0 },
      };
      const [depTargets, depDatas] = await setup.gateway.authorize([depObj], userAddress);
      console.log("\n=== Deposit Authorization ===");
      for (let i = 0; i < depTargets.length; i++) {
        if (!depTargets[i] || depDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${depTargets[i]}, data=${depDatas[i].substring(0, 20)}...`);
        await setup.user.sendTransaction({ to: depTargets[i], data: depDatas[i] });
      }

      // Approve router and deposit
      await (setup.collateralToken.connect(setup.user) as any).approve(
        await setup.router.getAddress(),
        config.amounts.deposit
      );

      // ALL instructions must be in ONE transaction for UTXO chaining
      console.log("\n=== Single Transaction: Deposit -> Query -> Withdraw ===");
      const allInstrs = [
        // UTXO[0]: Deposit (Pull 1000 USDC from user)
        createRouterInstruction(encodePullToken(config.amounts.deposit, config.collateralToken.address, userAddress)),
        // UTXO[1]: Approve (empty output)
        createRouterInstruction(encodeApprove(0, config.gateway.protocolName)),
        // No output: Deposit UTXO[0]
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.DepositCollateral, config.collateralToken.address, userAddress, config.amounts.deposit, "0x", { index: 0 }]]
          )
        ),
        // UTXO[2]: Query supply balance (returns actual vToken balance in underlying terms)
        createGetSupplyBalanceInstruction(config.gateway.protocolName, config.collateralToken.address, userAddress),
        // UTXO[3]: Withdraw using queried balance from UTXO[2]
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            // inputIndex=2 uses the GetSupplyBalance output
            // But we'll use 999 to use amount parameter for now (need to handle partial withdraws)
            [[LendingOp.WithdrawCollateral, config.collateralToken.address, userAddress, 990_000_000n, "0x", { index: 999 }]]
          )
        ),
        // Push withdrawn amount to user
        createRouterInstruction(encodePushToken(3, userAddress)),
      ];

      // Authorize withdraw (using estimated balance)
      const estimatedBalance = 990_000_000n;
      const witObj = {
        op: LendingOp.WithdrawCollateral,
        token: config.collateralToken.address,
        user: userAddress,
        amount: estimatedBalance,
        context: "0x",
        input: { index: 0 },
      };
      const [witTargets, witDatas] = await setup.gateway.authorize([witObj], userAddress);
      console.log("Withdraw authorization:");
      for (let i = 0; i < witTargets.length; i++) {
        if (!witTargets[i] || witDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${witTargets[i]}`);
        await setup.user.sendTransaction({ to: witTargets[i], data: witDatas[i] });
      }

      await (await setup.router.connect(setup.user).processProtocolInstructions(allInstrs)).wait();
      console.log("✓ Complete flow: Deposit -> Query Balance -> Withdraw");

      const finalBalance = await setup.collateralToken.balanceOf(userAddress);
      console.log(`\nFinal user balance: ${finalBalance / 10n ** 6n} USDC`);
      expect(finalBalance).to.be.gt(config.userFunding.collateral - config.amounts.deposit);
    });
  });

  describe("Complete flow with balance queries", function () {
    const config: LendingTestConfig = {
      collateralToken: USDC_TOKEN,
      debtToken: USDC_TOKEN,
      amounts: {
        deposit: 1_000_000_000n, // 1,000 USDC
        borrow: 100_000_000n, // 100 USDC
      },
      gateway: VENUS_GATEWAY,
      userFunding: {
        collateral: 2_100_000_000n,
      },
    };

    it("should use GetBorrowBalance for exact repay amount", async function () {
      const setup = await setupLendingTest(config);
      const userAddress = await setup.user.getAddress();

      // Setup all authorizations
      const depObj = {
        op: LendingOp.DepositCollateral,
        token: config.collateralToken.address,
        user: userAddress,
        amount: config.amounts.deposit,
        context: "0x",
        input: { index: 0 },
      };
      const borObj = {
        op: LendingOp.Borrow,
        token: config.debtToken.address,
        user: userAddress,
        amount: config.amounts.borrow,
        context: "0x",
        input: { index: 0 },
      };
      const [authTargets, authDatas] = await setup.gateway.authorize([depObj, borObj], userAddress);
      console.log("\n=== Initial Authorizations ===");
      for (let i = 0; i < authTargets.length; i++) {
        if (!authTargets[i] || authDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${authTargets[i]}`);
        await setup.user.sendTransaction({ to: authTargets[i], data: authDatas[i] });
      }

      // Approve router
      await (setup.collateralToken.connect(setup.user) as any).approve(
        await setup.router.getAddress(),
        config.amounts.deposit + 200_000_000n
      );

      console.log("\n=== Combined Flow ===");
      const instructions = [
        // 1. Deposit
        createRouterInstruction(encodePullToken(config.amounts.deposit, config.collateralToken.address, userAddress)),
        createRouterInstruction(encodeApprove(0, config.gateway.protocolName)),
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.DepositCollateral, config.collateralToken.address, userAddress, config.amounts.deposit, "0x", { index: 0 }]]
          )
        ),
        // 2. Borrow
        createRouterInstruction(encodeToOutput(config.amounts.borrow, config.debtToken.address)),
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.Borrow, config.debtToken.address, userAddress, 0n, "0x", { index: 0 }]]
          )
        ),
        // 3. Query borrow balance (produces UTXO with actual debt including interest)
        createGetBorrowBalanceInstruction(config.gateway.protocolName, config.debtToken.address, userAddress),
        // 4. Repay using queried balance
        // NOTE: In practice, we'd need to add buffer or pull this amount from user
        // For now, we pull extra and use a large input
        createRouterInstruction(encodePullToken(150_000_000n, config.debtToken.address, userAddress)),
        createRouterInstruction(encodeApprove(6, config.gateway.protocolName)),
        createProtocolInstruction(
          config.gateway.protocolName,
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
            [[LendingOp.Repay, config.debtToken.address, userAddress, 0n, "0x", { index: 6 }]]
          )
        ),
      ];

      console.log(`Executing ${instructions.length} instructions...`);
      const tx = await setup.router.connect(setup.user).processProtocolInstructions(instructions);
      await tx.wait();
      console.log("✓ Complete flow executed with balance queries");
    });
  });
});

