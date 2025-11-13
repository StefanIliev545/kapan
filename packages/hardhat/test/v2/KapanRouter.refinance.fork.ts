import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  LendingOp,
  encodePullToken,
  encodeApprove,
  encodeToOutput,
  encodePushToken,
  encodeFlashLoan,
  FlashLoanProvider,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
} from "./helpers/instructionHelpers";

/**
 * Refinance Tests
 * 
 * Pattern: Move a position from Protocol A to Protocol B using flash loans
 * Flow:
 *   1. Setup position in Protocol A (deposit collateral, borrow debt)
 *   2. Flash loan debt amount
 *   3. Repay Protocol A debt (using flash loan)
 *   4. Withdraw Protocol A collateral
 *   5. Deposit collateral to Protocol B
 *   6. Borrow from Protocol B (to repay flash loan)
 *   7. Repay flash loan with borrowed amount
 * 
 * Everything uses UTXOs - no external funds needed during refinance
 */

// Arbitrum One addresses (from deploy files)
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const BALANCER_VAULT3 = "0xbA1333333333a1BA1108E8412f11850A5C319bA9"; // Same across all chains
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Native USDC on Arbitrum
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH on Arbitrum
const USDC_WHALE = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D"; // Known USDC whale on Arbitrum
const WETH_WHALE = BALANCER_VAULT3; // Use Balancer vault as WETH source
const AAVE_POOL_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb"; // Arbitrum Aave v3 PoolAddressesProvider
const COMPOUND_USDC_COMET = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf"; // cUSDCv3 for native USDC on Arbitrum

describe("v2 Refinance Positions (fork)", function () {
  this.timeout(120000); // 2 minutes

  before(function () {
    if (!FORK) {
      throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
    }
  });

  describe("Refinance: Aave -> Compound (WETH collateral, USDC debt)", function () {
    it("should move position from Aave to Compound using flash loan", async function () {
      const [deployer] = await ethers.getSigners();
      const user = ethers.Wallet.createRandom().connect(ethers.provider);

      // Fund whales
      await network.provider.send("hardhat_setBalance", [WETH_WHALE, "0x56BC75E2D63100000"]); // 100 ETH
      await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);

      // Impersonate whales
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [WETH_WHALE] });
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
      const wethWhale = await ethers.getSigner(WETH_WHALE);

      // Fund user
      await wethWhale.sendTransaction({ to: await user.getAddress(), value: ethers.parseEther("1") });

      const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);
      const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);

      // Fund user with WETH
      await (weth.connect(wethWhale) as any).transfer(await user.getAddress(), ethers.parseEther("2"));

      // Deploy router
      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(await deployer.getAddress());
      await router.waitForDeployment();
      await (await router.setBalancerV3(BALANCER_VAULT3)).wait();

      // Deploy Aave gateway
      const AaveGateway = await ethers.getContractFactory("AaveGatewayWrite");
      const aaveGateway = await AaveGateway.deploy(await router.getAddress(), AAVE_POOL_PROVIDER, 0);
      await aaveGateway.waitForDeployment();
      await (await router.addGateway("aave", await aaveGateway.getAddress())).wait();

      // Deploy Compound gateway
      const CompoundGateway = await ethers.getContractFactory("CompoundGatewayWrite");
      const compoundGateway = await CompoundGateway.deploy(await router.getAddress(), await deployer.getAddress());
      await compoundGateway.waitForDeployment();
      // Register Comet mapping without relying on on-chain baseToken()
      await compoundGateway.setCometForBase(USDC, COMPOUND_USDC_COMET);
      await (await router.addGateway("compound", await compoundGateway.getAddress())).wait();

      const userAddress = await user.getAddress();
      const depositAmt = ethers.parseEther("1.5"); // 1.5 WETH (~$3000 at $2000/ETH)
      const borrowAmt = 50_000_000n; // 50 USDC (conservative LTV ~1.67%)

      console.log("\n=== STEP 1: Setup Position in Aave ===");

      // Authorize Aave operations
      const aaveDepObj = {
        op: LendingOp.DepositCollateral,
        token: WETH,
        user: userAddress,
        amount: depositAmt,
        context: "0x",
        input: { index: 0 },
      };
      const aaveBorObj = {
        op: LendingOp.Borrow,
        token: USDC,
        user: userAddress,
        amount: borrowAmt,
        context: "0x",
        input: { index: 0 },
      };
      const [aaveAuthTargets, aaveAuthDatas] = await aaveGateway.authorize([aaveDepObj, aaveBorObj], userAddress);
      console.log("Aave authorizations:");
      for (let i = 0; i < aaveAuthTargets.length; i++) {
        if (!aaveAuthTargets[i] || aaveAuthDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${aaveAuthTargets[i]}`);
        await user.sendTransaction({ to: aaveAuthTargets[i], data: aaveAuthDatas[i] });
      }

      // Approve router
      await (weth.connect(user) as any).approve(await router.getAddress(), depositAmt);

      // Setup position in Aave
      const setupInstructions = [
        createRouterInstruction(encodePullToken(depositAmt, WETH, userAddress)), // UTXO[0]
        createRouterInstruction(encodeApprove(0, "aave")), // UTXO[1] (empty)
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.DepositCollateral, WETH, userAddress, 0n, "0x", 0)), // No output
        createRouterInstruction(encodeToOutput(borrowAmt, USDC)), // UTXO[2]
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Borrow, USDC, userAddress, 0n, "0x", 2)), // Uses UTXO[2], produces UTXO[3]
        createRouterInstruction(encodePushToken(3, userAddress)), // Uses UTXO[3]
      ];
      await (await router.connect(user).processProtocolInstructions(setupInstructions)).wait();

      // Verify position was created correctly
      const userWethAfterSetup = await weth.balanceOf(userAddress);
      const userUsdcAfterSetup = await usdc.balanceOf(userAddress);
      
      // Skip v1 gateway view checks; we verify via balances and protocol reads later
      
      console.log(`✓ Position created in Aave`);
      console.log(`  User WETH: ${ethers.formatEther(userWethAfterSetup)} (should be ~0.5 WETH, started with 2)`);
      console.log(`  User USDC: ${userUsdcAfterSetup / 10n ** 6n} USDC (borrowed)`);
      
      // Verify setup was correct
      expect(userWethAfterSetup).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.01")); // User should have ~0.5 WETH left (2 - 1.5)
      expect(userUsdcAfterSetup).to.be.gte(borrowAmt); // User should have at least the borrowed amount

      console.log("\n=== STEP 2: Refinance to Compound (via Flash Loan) ===");

      // Authorize Aave repay/withdraw
      const aaveRepObj = {
        op: LendingOp.Repay,
        token: USDC,
        user: userAddress,
        amount: borrowAmt + 1_000_000n, // Buffer
        context: "0x",
        input: { index: 0 },
      };
      const aaveWitObj = {
        op: LendingOp.WithdrawCollateral,
        token: WETH,
        user: userAddress,
        amount: depositAmt,
        context: "0x",
        input: { index: 0 },
      };
      const [aaveRepTargets, aaveRepDatas] = await aaveGateway.authorize([aaveRepObj, aaveWitObj], userAddress);
      console.log("Aave repay/withdraw authorizations:");
      for (let i = 0; i < aaveRepTargets.length; i++) {
        if (!aaveRepTargets[i] || aaveRepDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${aaveRepTargets[i]}`);
        await user.sendTransaction({ to: aaveRepTargets[i], data: aaveRepDatas[i] });
      }

      // Authorize Compound operations
      const marketContext = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [USDC]);
      const compoundDepObj = {
        op: LendingOp.DepositCollateral,
        token: WETH,
        user: userAddress,
        amount: depositAmt,
        context: marketContext,
        input: { index: 0 },
      };
      // For borrow authorization, use a conservative amount (actual will come from UTXO[1])
      // Compound borrow just needs allow() which is boolean, not amount-dependent
      const compoundBorObj = {
        op: LendingOp.Borrow,
        token: USDC,
        user: userAddress,
        amount: borrowAmt + 10_000_000n, // Use buffer for authorization
        context: marketContext,
        input: { index: 0 },
      };
      const [compoundAuthTargets, compoundAuthDatas] = await compoundGateway.authorize(
        [compoundDepObj, compoundBorObj],
        userAddress
      );
      console.log("Compound authorizations:");
      for (let i = 0; i < compoundAuthTargets.length; i++) {
        if (!compoundAuthTargets[i] || compoundAuthDatas[i].length === 0) continue;
        console.log(`  ${i}: target=${compoundAuthTargets[i]}, data=${compoundAuthDatas[i].substring(0, 20)}...`);
        await user.sendTransaction({ to: compoundAuthTargets[i], data: compoundAuthDatas[i] });
      }

      // Query actual Aave debt balance off-chain (for flash loan sizing with buffer)
      const poolProvider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
        AAVE_POOL_PROVIDER
      );
      const dataProvider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol:IPoolDataProvider",
        await poolProvider.getPoolDataProvider()
      );
      
      // Resolve variable debt token to approximate debt via scaled balance
      // Resolve variable debt token via data provider
      let vDebtToken: string | null = null;
      try {
        const reserveData = await dataProvider.getReserveData(USDC);
        vDebtToken = reserveData.variableDebtTokenAddress;
      } catch {
        vDebtToken = null;
      }
      
      let actualDebtAmount = borrowAmt + 5_000_000n; // Start with buffer, will query on-chain
      if (vDebtToken) {
        try {
          const vDebt = await ethers.getContractAt("@aave/core-v3/contracts/interfaces/IVariableDebtToken.sol:IVariableDebtToken", vDebtToken);
          const scaledDebt = await vDebt.scaledBalanceOf(userAddress);
          // Get normalized debt (approximate - would need rate calculation for exact)
          // For test purposes, use scaled debt * 1.01 as approximation
          actualDebtAmount = (scaledDebt * 101n / 100n) + 5_000_000n; // Add 5 USDC buffer
        } catch (e) {
          // Fallback to borrow amount + buffer
          actualDebtAmount = borrowAmt + 5_000_000n;
        }
      }
      
      console.log(`Flash loan size: ${actualDebtAmount / 10n ** 6n} USDC (includes buffer for interest)`);

      // Refinance instructions (all in one atomic transaction via flash loan)
      // New flow: Get exact debt first, then flash loan that exact amount
      const refinanceInstructions = [
        // 0. Query actual Aave debt balance -> UTXO[0] (exact current debt amount)
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetBorrowBalance, USDC, userAddress, 0n, "0x", 999)),
        // 1. Flash loan USDC using exact debt amount from UTXO[0] -> UTXO[1] (flash loan output with repayment amount)
        createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV3, 0)), // Use UTXO[0] as input
        // 2. Approve Aave gateway for flash loan UTXO[1] (for repay) -> UTXO[2] (empty)
        createRouterInstruction(encodeApprove(1, "aave")),
        // 3. Repay Aave debt using exact queried balance from UTXO[0] -> UTXO[3] (repay refund, if any)
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Repay, USDC, userAddress, 0n, "0x", 0)),
        // 4. Withdraw Aave collateral -> UTXO[4] (WETH collateral - separate from USDC refund)
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.WithdrawCollateral, WETH, userAddress, depositAmt, "0x", 999)),
        // 5. Approve Compound gateway for UTXO[4] (WETH collateral) -> UTXO[5] (empty)
        createRouterInstruction(encodeApprove(4, "compound")),
        // 6. Deposit collateral to Compound (consumes UTXO[4], no output)
        // Context encodes the debt market (USDC Comet) to differentiate from supply
        createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.DepositCollateral, WETH, userAddress, 0n, marketContext, 4)),
        // 7. Borrow from Compound using flash loan output UTXO[1] (exact repayment amount) -> UTXO[6] (borrowed amount)
        // The flash loan output (UTXO[1]) contains the repayment amount (principal + fee)
        // Use inputIndex 1 to borrow exactly what's needed to repay the flash loan
        createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.Borrow, USDC, userAddress, 0n, "0x", 1)),
        // Flash loan repayment: Balancer v3 will use UTXO[1] (flash loan output) to repay
        // The borrowed amount (UTXO[6]) should match the repayment amount, ensuring atomic refinance
      ];

      console.log("Instructions:");
      console.log("  0. GetBorrowBalance(Aave) -> UTXO[0] (exact debt)");
      console.log("  1. FlashLoan(USDC, using UTXO[0]) -> UTXO[1] (repayment amount)");
      console.log("  2. Approve Aave (for UTXO[1]) -> UTXO[2] (empty)");
      console.log("  3. Repay Aave (using UTXO[0] exact debt) -> UTXO[3] (refund if any)");
      console.log("  4. Withdraw from Aave -> UTXO[4] (WETH collateral)");
      console.log("  5. Approve Compound (for UTXO[4]) -> UTXO[5] (empty)");
      console.log("  6. Deposit to Compound (consumes UTXO[4], no output)");
      console.log("  7. Borrow from Compound (using UTXO[1] repayment amount) -> UTXO[6]");
      console.log("  Flash loan repayment uses UTXO[1] (repayment amount from flash loan output)");

      const userWethBefore = await weth.balanceOf(userAddress);
      const userUsdcBefore = await usdc.balanceOf(userAddress);

      const tx = await router.connect(user).processProtocolInstructions(refinanceInstructions);
      const receipt = await tx.wait();
      console.log(`✓ Refinance completed: ${receipt?.status === 1 ? "success" : "failed"}`);

      // Verify positions actually moved by querying balances in both protocols
      console.log("\n=== Verifying Position Migration ===");
      
      // Query Aave balances (should be ~0)
      const checkAaveBalances = [
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetSupplyBalance, WETH, userAddress, 0n, "0x", 999)),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetBorrowBalance, USDC, userAddress, 0n, "0x", 999)),
      ];
      await (await router.connect(user).processProtocolInstructions(checkAaveBalances)).wait();
      
      // Query Compound balances (should have position)
      const checkCompoundBalances = [
        createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.GetSupplyBalance, WETH, userAddress, 0n, marketContext, 999)),
        createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.GetBorrowBalance, USDC, userAddress, 0n, "0x", 999)),
      ];
      await (await router.connect(user).processProtocolInstructions(checkCompoundBalances)).wait();
      
      // Parse outputs from receipts (need to decode events or use view calls)
      // For now, let's use the gateway's view functions if available, or parse from logs
      // Actually, let's use GetSupplyBalance/GetBorrowBalance directly via static call to gateways
      
      // Check Aave balances via protocol data provider (no v1 gateway dependency)
      const dataProviderPost = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol:IPoolDataProvider",
        await poolProvider.getPoolDataProvider()
      );
      let aaveSupply = 0n;
      let aaveDebt = 0n;
      try {
        const wethData = await dataProviderPost.getUserReserveData(WETH, userAddress);
        // tuple: (currentATokenBalance, currentStableDebt, currentVariableDebt, ...)
        aaveSupply = wethData[0] as bigint; // currentATokenBalance
        const usdcData = await dataProviderPost.getUserReserveData(USDC, userAddress);
        const currentStableDebt = usdcData[1] as bigint;
        const currentVariableDebt = usdcData[2] as bigint;
        aaveDebt = currentStableDebt + currentVariableDebt;
      } catch (e) {
        console.log("  Note: Failed to read Aave balances via data provider:", e);
      }
      
      // Compound balances queried directly on Comet below
      let compoundSupply = 0n;
      let compoundDebt = 0n;
      try {
        // For Compound, supply balance is collateral balance
        const comet = await ethers.getContractAt(
          "contracts/v2/interfaces/compound/ICompoundComet.sol:ICompoundComet",
          COMPOUND_USDC_COMET
        );
        compoundSupply = await comet.collateralBalanceOf(userAddress, WETH);
        compoundDebt = await comet.borrowBalanceOf(userAddress);
      } catch (e) {
        console.log(`  Error checking Compound balances: ${e}`);
      }
      
      // Also check user/router balances
      const userWethAfter = await weth.balanceOf(userAddress);
      const userUsdcAfter = await usdc.balanceOf(userAddress);
      const routerWeth = await weth.balanceOf(await router.getAddress());
      const routerUsdc = await usdc.balanceOf(await router.getAddress());

      console.log("\n=== Final Position Status ===");
      console.log(`Aave WETH collateral: ${ethers.formatEther(aaveSupply)}`);
      console.log(`Aave USDC debt: ${aaveDebt / 10n ** 6n}`);
      console.log(`Compound WETH collateral: ${ethers.formatEther(compoundSupply)}`);
      console.log(`Compound USDC debt: ${compoundDebt / 10n ** 6n} (borrowed ${borrowAmt / 10n ** 6n}, includes interest accrual)`);
      console.log(`\nRouter WETH: ${ethers.formatEther(routerWeth)}`);
      console.log(`Router USDC: ${routerUsdc / 10n ** 6n}`);
      console.log(`User WETH: ${ethers.formatEther(userWethAfter)} (was ${ethers.formatEther(userWethBefore)})`);
      console.log(`User USDC: ${userUsdcAfter / 10n ** 6n} (was ${userUsdcBefore / 10n ** 6n})`);

      // CRITICAL VERIFICATION:
      // 1. Aave position should be cleared (or minimal due to interest accrual during test execution)
      expect(aaveSupply).to.be.lt(ethers.parseEther("0.01")); // Aave collateral should be ~0
      expect(aaveDebt).to.be.lt(1_000_000n); // Aave debt should be ~0 (< 1 USDC)
      
      // 2. Compound position should exist (debt slightly higher than borrowed amount due to interest)
      expect(compoundSupply).to.be.gte(depositAmt - ethers.parseEther("0.01")); // Compound should have ~1.5 WETH
      expect(compoundDebt).to.be.gte(borrowAmt); // Compound debt should be >= original borrow (interest accrued)
      
      // 3. User balances unchanged (no external funds used)
      expect(userWethAfter).to.equal(userWethBefore);
      expect(userUsdcAfter).to.equal(userUsdcBefore);
      
      // 4. Router has minimal balances (flash loan repaid)
      expect(routerWeth).to.be.lt(ethers.parseEther("0.01"));
      expect(routerUsdc).to.be.lt(10_000_000n); // < 10 USDC

      console.log("\n✅ Position successfully refinanced from Aave to Compound!");
      console.log("   ✓ Aave position cleared");
      console.log("   ✓ Compound position created");
      console.log("   ✓ Flash loan repaid");
    });
  });
});

