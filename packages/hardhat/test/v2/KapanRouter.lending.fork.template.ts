/**
 * Template for lending protocol fork tests
 * 
 * Usage:
 * 1. Copy this file to a specific protocol test (e.g., KapanRouter.compound.fork.ts)
 * 2. Configure the gateway and token addresses
 * 3. Run the tests
 */

import { ethers } from "hardhat";
import {
  setupLendingTest,
  setupApprovals,
  createLendingFlowInstructions,
  verifyLendingFlowBalances,
  TokenConfig,
  GatewayConfig,
  LendingTestConfig,
} from "./helpers/lendingTestTemplate";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// Example: USDC collateral, USDC debt (same token)
const USDC: TokenConfig = {
  address: (process.env.USDC || process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase(),
  decimals: 6,
  whale: process.env.USDC_WHALE || "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
};

// Example: WETH collateral, USDC debt (different tokens)
const WETH: TokenConfig = {
  address: (process.env.WETH || process.env.WETH_ARB || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1").toLowerCase(),
  decimals: 18,
  // Arbitrum WETH whale - using Balancer V3 vault which holds WETH
  whale: process.env.WETH_WHALE || (process.env.BALANCER_VAULT3 || "0xBA12222222228d8Ba445958a75a0704d566BF2C8").toLowerCase(),
};

// Configure gateway based on protocol
const AAVE_GATEWAY: GatewayConfig = {
  type: "aave",
  protocolName: "aave",
  factoryName: "AaveGatewayWrite",
  // Arbitrum Aave V3 Pool Addresses Provider
  deployArgs: [process.env.AAVE_POOL_ADDRESSES_PROVIDER || "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb", 0], // [poolAddressesProvider, referralCode]
};

// Example gateway configurations (uncomment to use)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const COMPOUND_GATEWAY: GatewayConfig = {
  type: "compound",
  protocolName: "compound",
  factoryName: "CompoundGatewayWrite",
  deployArgs: [], // Add constructor args as needed
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const VENUS_GATEWAY: GatewayConfig = {
  type: "venus",
  protocolName: "venus",
  factoryName: "VenusGatewayWrite",
  deployArgs: [process.env.VENUS_COMPTROLLER || "", process.env.VENUS_OWNER || ""], // [comptroller, owner]
};

describe("v2 Lending end-to-end (fork)", function () {
  before(function () {
    if (!FORK) throw new Error("MAINNET_FORKING_ENABLED must be true");
  });

  // Example 1: Same token (USDC collateral, USDC debt)
  describe("USDC collateral, USDC debt", function () {
    const config: LendingTestConfig = {
      collateralToken: USDC,
      debtToken: USDC,
      amounts: {
        deposit: 1_000_000_000n, // 1,000 USDC
        borrow: 100_000_000n, // 100 USDC
        repay: 100_100_000n, // 100.1 USDC (to cover interest and ensure full debt repayment)
        // repay and withdraw default to borrow and deposit respectively
      },
      gateway: AAVE_GATEWAY, // Change to COMPOUND_GATEWAY or VENUS_GATEWAY
      userFunding: {
        collateral: 1000_000_000n, // 1000 USDC (Whale has ~2050)
        debt: 100_000_000n, // 100 USDC
      },
    };

    it("should execute deposit -> borrow -> repay -> withdraw in combined call", async function () {
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

  // Example 2: Different tokens (WETH collateral, USDC debt)
  describe("WETH collateral, USDC debt", function () {
    const config: LendingTestConfig = {
      collateralToken: WETH,
      debtToken: USDC,
      amounts: {
        deposit: ethers.parseEther("1"), // 1 WETH
        borrow: 100_000_000n, // 100 USDC
        repay: 100_100_000n, // 100.1 USDC (to cover interest)
        withdraw: ethers.parseEther("1"), // 1 WETH
      },
      gateway: AAVE_GATEWAY, // Change to COMPOUND_GATEWAY or VENUS_GATEWAY
      userFunding: {
        collateral: ethers.parseEther("1.5"), // 1.5 WETH (enough for 1 WETH deposit + gas)
        debt: 200_000_000n, // 200 USDC (for repay)
      },
    };

    it("should execute deposit -> borrow -> repay -> withdraw in combined call", async function () {
      const setup = await setupLendingTest(config);
      await setupApprovals(setup, config, config.amounts);

      const userBalanceBefore = await setup.collateralToken.balanceOf(await setup.user.getAddress());
      console.log("\n=== Combined Execution ===");
      console.log(`User balance before: ${ethers.formatEther(userBalanceBefore)} WETH`);

      const instructions = await createLendingFlowInstructions(setup, config, config.amounts);
      const tx = await setup.router.connect(setup.user).processProtocolInstructions(instructions);
      const receipt = await tx.wait();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      console.log(`✓ Combined execution completed: ${receipt!.status === 1 ? "success" : "failed"}`);

      await verifyLendingFlowBalances(setup, config, config.amounts, userBalanceBefore);
    });
  });
});

