import { expect } from "chai";
import { ethers, network, deployments } from "hardhat";
import { Contract } from "ethers";
import { execSync } from "child_process";
import {
  createProtocolInstruction,
  createRouterInstruction,
  encodeLendingInstruction,
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeFlashLoan,
  LendingOp,
  deployRouterWithAuthHelper,
} from "./helpers/instructionHelpers";

// Type helper for ERC20 contracts
type IERC20 = Contract & {
  transfer: (to: string, amount: bigint) => Promise<any>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  balanceOf: (account: string) => Promise<bigint>;
  connect: (signer: any) => IERC20;
};

/**
 * Euler V2 Debt Swap Fork Tests
 *
 * Tests the sub-account migration approach for debt swaps:
 * - User has position on sub-account N with controller (borrow vault) A
 * - User wants to switch to borrow vault B
 * - Since only 1 controller per sub-account, migrate to sub-account N+1
 *
 * Flow:
 * 1. Flash loan new debt token
 * 2. Swap if needed (new token → old token)
 * 3. Repay old debt on old sub-account
 * 4. Withdraw collateral from old sub-account
 * 5. Deposit collateral to new sub-account (with new controller)
 * 6. Borrow from new vault on new sub-account
 * 7. Repay flash loan
 *
 * Run with:
 *   MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/EulerDebtSwap.fork.ts
 */

// EVC on Arbitrum
const EVC_ADDRESS = "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066";

// Euler vaults on Arbitrum
const ARB_EULER_VAULTS = {
  USDC: {
    vault: "0x0a1eCC5Fe8C9be3C809844fcBe615B46A869b899",
    asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
  },
  WETH: {
    vault: "0x78E3E051D32157AACD550fBB78458762d8f7edFF",
    asset: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    decimals: 18,
  },
  wstETH: {
    vault: "0xA8616E4D9f3f0aa01aff1d7c3b66249f8a5f1A58",
    asset: "0x5979D7b546E38E414F7E9822514be443A4800529",
    decimals: 18,
  },
};

// Whales for token funding
const ARB_WHALES = {
  USDC: "0x47c031236e19d024b42f8AE6780E44A573170703",
  WETH: "0xbA1333333333a1BA1108E8412f11850A5C319bA9", // Balancer V3
  wstETH: "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf",
};

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

/**
 * Encode Euler vault context for use in LendingInstruction context
 * @param borrowVault - The vault to borrow from (controller)
 * @param collateralVault - The vault where collateral is deposited
 * @param subAccountIndex - Sub-account index (0-255), 0 = main account (default)
 * @returns Encoded context bytes
 *
 * Note: Context format is (address borrowVault, address[] collateralVaults, uint8 subAccountIndex)
 */
function encodeEulerContext(borrowVault: string, collateralVault: string, subAccountIndex: number = 0): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address[]", "uint8"],
    [borrowVault, [collateralVault], subAccountIndex]
  );
}

/**
 * Calculate sub-account address from user address and index
 * Sub-account = (user & 0xFF...FF00) | subAccountIndex
 *
 * Note: Index 0 produces 0x...00, NOT the user's address.
 * The user's "main" account is at index = last byte of their address.
 */
function getSubAccount(user: string, subAccountIndex: number): string {
  const mask = ~BigInt(0xFF);
  const userBigInt = BigInt(user);
  return ethers.getAddress("0x" + ((userBigInt & mask) | BigInt(subAccountIndex)).toString(16).padStart(40, "0"));
}

/**
 * Get the natural sub-account index for a user (their "main" account)
 * This is the last byte of the user's address.
 */
function getUserMainAccountIndex(user: string): number {
  return Number(BigInt(user) & BigInt(0xFF));
}

describe("v2 Euler Debt Swap (fork)", function () {
  before(function () {
    if (!FORK) {
      console.log("Skipping Euler debt swap fork tests: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }

    const chainId = network.config.chainId || 31337;
    if (chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping: Need Arbitrum fork (got chainId ${chainId})`);
      this.skip();
    }
  });

  describe("Sub-Account Migration (Same Token)", function () {
    it("should migrate position from sub-account 0 to sub-account 1 (same borrow token)", async function () {
      this.timeout(180000);

      const [deployer] = await ethers.getSigners();

      // Check EVC exists
      const evcCode = await ethers.provider.getCode(EVC_ADDRESS);
      if (evcCode === "0x") {
        console.log("EVC not found, skipping");
        this.skip();
      }

      console.log("\n=== Euler Debt Swap: Sub-Account Migration ===");
      console.log("Scenario: Move USDC debt from sub-account 0 to sub-account 1");
      console.log("(Same borrow vault, simulating vault upgrade or controller switch)\n");

      // Setup infrastructure
      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, EVC_ADDRESS);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      await router.addGateway("euler", gatewayAddress);
      await syncGateway("euler", gatewayAddress);
      console.log(`✓ Infrastructure deployed`);

      // Create and fund test user
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      // Use user's natural index for "main" account, then next index for migration
      const oldSubAccountIndex = getUserMainAccountIndex(user.address);
      const newSubAccountIndex = (oldSubAccountIndex + 1) % 256;
      const oldSubAccount = getSubAccount(user.address, oldSubAccountIndex);
      const newSubAccount = getSubAccount(user.address, newSubAccountIndex);

      // Verify old sub-account equals user address (natural index property)
      expect(oldSubAccount.toLowerCase()).to.equal(user.address.toLowerCase());

      console.log(`User address: ${user.address}`);
      console.log(`Old sub-account (index ${oldSubAccountIndex}): ${oldSubAccount}`);
      console.log(`New sub-account (index ${newSubAccountIndex}): ${newSubAccount}`);

      // Fund user with wstETH
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(ARB_WHALES.wstETH);

      const wstEth = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.wstETH.asset
      )) as IERC20;
      const collateralAmount = ethers.parseEther("0.5"); // 0.5 wstETH (~$2000)
      await wstEth.connect(wstEthWhale).transfer(user.address, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });
      console.log(`✓ User funded with ${ethers.formatEther(collateralAmount)} wstETH`);

      // ========================================
      // STEP 1: Setup initial position on sub-account 0
      // ========================================
      console.log("\n--- Step 1: Create Initial Position on Sub-Account 0 ---");

      const evc = await ethers.getContractAt("IEVC", EVC_ADDRESS);
      const borrowVault = ARB_EULER_VAULTS.USDC.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const oldContext = encodeEulerContext(borrowVault, collateralVault, oldSubAccountIndex);

      // Setup EVC for old sub-account
      await evc.connect(user).enableCollateral(oldSubAccount, collateralVault);
      await evc.connect(user).enableController(oldSubAccount, borrowVault);
      await evc.connect(user).setAccountOperator(oldSubAccount, gatewayAddress, true);
      console.log(`✓ EVC authorization for sub-account 0`);

      // Deposit collateral
      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);

      const depositInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.DepositCollateral,
            ARB_EULER_VAULTS.wstETH.asset,
            user.address,
            0n,
            oldContext,
            0
          )
        ),
      ];

      await router.connect(user).processProtocolInstructions(depositInstrs);

      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const initialCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(oldSubAccount));
      console.log(`✓ Deposited: ${ethers.formatEther(initialCollateral)} wstETH to sub-account 0`);

      // Borrow USDC
      const borrowAmount = BigInt(100e6); // 100 USDC

      const borrowInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.Borrow,
            ARB_EULER_VAULTS.USDC.asset,
            user.address,
            borrowAmount,
            oldContext,
            999
          )
        ),
        createRouterInstruction(encodePushToken(0, user.address)),
      ];

      await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 1_500_000 });

      const usdcVault = await ethers.getContractAt("IEulerVault", borrowVault);
      const initialDebt = await usdcVault.debtOf(oldSubAccount);
      console.log(`✓ Borrowed: ${ethers.formatUnits(initialDebt, 6)} USDC from sub-account 0`);

      // ========================================
      // STEP 2: Setup new sub-account (while old has debt)
      // ========================================
      console.log("\n--- Step 2: Setup New Sub-Account 1 ---");

      // Setup EVC for NEW sub-account
      // Key insight: This works because sub-account 1 has NO controller yet!
      await evc.connect(user).enableCollateral(newSubAccount, collateralVault);
      await evc.connect(user).enableController(newSubAccount, borrowVault);
      await evc.connect(user).setAccountOperator(newSubAccount, gatewayAddress, true);
      console.log(`✓ EVC authorization for sub-account 1 (no controller conflict!)`);

      // Verify both sub-accounts have controllers
      const oldControllers = await evc.getControllers(oldSubAccount);
      const newControllers = await evc.getControllers(newSubAccount);
      console.log(`Old sub-account controllers: ${oldControllers}`);
      console.log(`New sub-account controllers: ${newControllers}`);
      expect(oldControllers.length).to.equal(1);
      expect(newControllers.length).to.equal(1);

      // ========================================
      // STEP 3: Execute debt swap (manual, no flash loan)
      // ========================================
      console.log("\n--- Step 3: Execute Debt Swap (Manual) ---");
      console.log("Note: This test manually repays debt then re-borrows to prove sub-account migration works");
      console.log("In production, flash loans make this atomic");

      const newContext = encodeEulerContext(borrowVault, collateralVault, newSubAccountIndex);

      // Fund user with extra USDC for repaying debt + interest
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.USDC, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.USDC] });
      const usdcWhale = await ethers.getSigner(ARB_WHALES.USDC);
      const usdc = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.USDC.asset
      )) as IERC20;
      await (usdc.connect(usdcWhale) as IERC20).transfer(user.address, BigInt(120e6)); // 120 USDC
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.USDC] });

      // Get exact debt amount
      const exactDebt = await usdcVault.debtOf(oldSubAccount);
      console.log(`Exact debt to repay: ${ethers.formatUnits(exactDebt, 6)} USDC`);

      // Step 3a: Repay debt on old sub-account
      console.log("\n  Step 3a: Repay debt on old sub-account");
      await (usdc.connect(user) as IERC20).approve(routerAddress, exactDebt + BigInt(10e6));

      const repayInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.GetBorrowBalance, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, oldContext, 999)
        ),
        createRouterInstruction(encodePullToken(exactDebt + BigInt(10e6), ARB_EULER_VAULTS.USDC.asset, user.address)),
        createRouterInstruction(encodeApprove(1, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.Repay, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, oldContext, 0)
        ),
        createRouterInstruction(encodePushToken(3, user.address)), // Refund excess
      ];

      await router.connect(user).processProtocolInstructions(repayInstrs, { gasLimit: 1_500_000 });
      const debtAfterRepay = await usdcVault.debtOf(oldSubAccount);
      console.log(`  ✓ Debt after repay: ${ethers.formatUnits(debtAfterRepay, 6)} USDC`);
      expect(debtAfterRepay).to.equal(0n);

      // Step 3b: Disable old controller (required to withdraw collateral freely)
      console.log("\n  Step 3b: Disable old controller");
      await evc.connect(user).disableController(oldSubAccount);
      console.log(`  ✓ Controller disabled`);

      // Step 3c: Withdraw collateral from old sub-account
      console.log("\n  Step 3c: Withdraw collateral from old sub-account");
      const withdrawInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.GetSupplyBalance, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, oldContext, 999)
        ),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.WithdrawCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, oldContext, 0)
        ),
        createRouterInstruction(encodePushToken(1, user.address)),
      ];

      await router.connect(user).processProtocolInstructions(withdrawInstrs, { gasLimit: 1_500_000 });
      const userWstEthBalance = await wstEth.balanceOf(user.address);
      console.log(`  ✓ User wstETH balance: ${ethers.formatEther(userWstEthBalance)} wstETH`);

      // Step 3d: Deposit collateral to new sub-account
      console.log("\n  Step 3d: Deposit collateral to new sub-account");
      await (wstEth.connect(user) as IERC20).approve(routerAddress, userWstEthBalance);

      const depositNewInstrs = [
        createRouterInstruction(encodePullToken(userWstEthBalance, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, newContext, 0)
        ),
      ];

      await router.connect(user).processProtocolInstructions(depositNewInstrs);
      console.log(`  ✓ Collateral deposited to new sub-account`);

      // Step 3e: Borrow on new sub-account
      console.log("\n  Step 3e: Borrow on new sub-account");
      const borrowInstrsNew = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, borrowAmount, newContext, 999)
        ),
        createRouterInstruction(encodePushToken(0, user.address)),
      ];

      await router.connect(user).processProtocolInstructions(borrowInstrsNew, { gasLimit: 1_500_000 });
      console.log(`  ✓ Borrowed on new sub-account`);

      // ========================================
      // STEP 4: Verify migration
      // ========================================
      console.log("\n--- Step 4: Verify Migration ---");

      // Old sub-account should have no debt
      const oldDebtAfter = await usdcVault.debtOf(oldSubAccount);
      console.log(`Old sub-account debt: ${ethers.formatUnits(oldDebtAfter, 6)} USDC`);
      expect(oldDebtAfter).to.equal(0n);

      // Old sub-account should have no collateral
      const oldCollateralAfter = await wstEthVault.balanceOf(oldSubAccount);
      console.log(`Old sub-account collateral: ${ethers.formatEther(oldCollateralAfter)} wstETH (shares)`);
      expect(oldCollateralAfter).to.equal(0n);

      // New sub-account should have debt
      const newDebtAfter = await usdcVault.debtOf(newSubAccount);
      console.log(`New sub-account debt: ${ethers.formatUnits(newDebtAfter, 6)} USDC`);
      expect(newDebtAfter).to.be.closeTo(exactDebt, BigInt(1e6)); // Allow 1 USDC variance for interest

      // New sub-account should have collateral
      const newCollateralAfter = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(newSubAccount));
      console.log(`New sub-account collateral: ${ethers.formatEther(newCollateralAfter)} wstETH`);
      expect(newCollateralAfter).to.be.closeTo(initialCollateral, ethers.parseEther("0.01"));

      console.log("\n=== Debt Swap Complete ===");
      console.log(`✓ Position migrated from sub-account 0 to sub-account 1`);
      console.log(`✓ Collateral: ${ethers.formatEther(newCollateralAfter)} wstETH`);
      console.log(`✓ Debt: ${ethers.formatUnits(newDebtAfter, 6)} USDC`);
    });
  });

  describe("Sub-Account Migration (Different Token)", function () {
    it("should migrate from USDC debt to WETH debt on new sub-account", async function () {
      this.timeout(180000);

      const [deployer] = await ethers.getSigners();

      // Check EVC exists
      const evcCode = await ethers.provider.getCode(EVC_ADDRESS);
      if (evcCode === "0x") {
        console.log("EVC not found, skipping");
        this.skip();
      }

      // Check WETH vault has liquidity
      const wethVault = await ethers.getContractAt("IEulerVault", ARB_EULER_VAULTS.WETH.vault);
      const wethLiquidity = await wethVault.totalAssets();
      if (wethLiquidity < ethers.parseEther("1")) {
        console.log("WETH vault has insufficient liquidity, skipping");
        this.skip();
      }

      console.log("\n=== Euler Debt Swap: USDC → WETH ===");
      console.log("Scenario: Switch from USDC borrow vault to WETH borrow vault\n");

      // Setup infrastructure
      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, EVC_ADDRESS);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      await router.addGateway("euler", gatewayAddress);
      await syncGateway("euler", gatewayAddress);
      console.log(`✓ Infrastructure deployed`);

      // Create and fund test user
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      // Use user's natural index for "main" account, then next index for migration
      const oldSubAccountIndex = getUserMainAccountIndex(user.address);
      const newSubAccountIndex = (oldSubAccountIndex + 1) % 256;
      const oldSubAccount = getSubAccount(user.address, oldSubAccountIndex);
      const newSubAccount = getSubAccount(user.address, newSubAccountIndex);

      // Verify old sub-account equals user address (natural index property)
      expect(oldSubAccount.toLowerCase()).to.equal(user.address.toLowerCase());

      console.log(`User address: ${user.address}`);
      console.log(`Old sub-account (USDC vault, index ${oldSubAccountIndex}): ${oldSubAccount}`);
      console.log(`New sub-account (WETH vault, index ${newSubAccountIndex}): ${newSubAccount}`);

      // Fund user with wstETH (collateral)
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(ARB_WHALES.wstETH);

      const wstEth = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.wstETH.asset
      )) as IERC20;
      const collateralAmount = ethers.parseEther("1"); // 1 wstETH
      await wstEth.connect(wstEthWhale).transfer(user.address, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });

      // Fund user with USDC (for repaying old debt + interest)
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.USDC, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.USDC] });
      const usdcWhale = await ethers.getSigner(ARB_WHALES.USDC);
      const usdc = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.USDC.asset
      )) as IERC20;
      await (usdc.connect(usdcWhale) as IERC20).transfer(user.address, BigInt(500e6)); // 500 USDC
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.USDC] });
      console.log(`✓ User funded with 1 wstETH and 500 USDC`);

      // ========================================
      // STEP 1: Setup initial position (USDC debt on sub-account 0)
      // ========================================
      console.log("\n--- Step 1: Create USDC Position on Sub-Account 0 ---");

      const evc = await ethers.getContractAt("IEVC", EVC_ADDRESS);
      const usdcVault = ARB_EULER_VAULTS.USDC.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const oldContext = encodeEulerContext(usdcVault, collateralVault, oldSubAccountIndex);

      await evc.connect(user).enableCollateral(oldSubAccount, collateralVault);
      await evc.connect(user).enableController(oldSubAccount, usdcVault);
      await evc.connect(user).setAccountOperator(oldSubAccount, gatewayAddress, true);

      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);

      const depositInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.DepositCollateral,
            ARB_EULER_VAULTS.wstETH.asset,
            user.address,
            0n,
            oldContext,
            0
          )
        ),
      ];

      await router.connect(user).processProtocolInstructions(depositInstrs);

      const borrowAmount = BigInt(100e6); // 100 USDC
      const borrowInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.Borrow,
            ARB_EULER_VAULTS.USDC.asset,
            user.address,
            borrowAmount,
            oldContext,
            999
          )
        ),
        createRouterInstruction(encodePushToken(0, user.address)),
      ];

      await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 1_500_000 });

      const usdcVaultContract = await ethers.getContractAt("IEulerVault", usdcVault);
      const initialUsdcDebt = await usdcVaultContract.debtOf(oldSubAccount);
      console.log(`✓ USDC debt: ${ethers.formatUnits(initialUsdcDebt, 6)} USDC`);

      // ========================================
      // STEP 2: Setup new sub-account with WETH vault as controller
      // ========================================
      console.log("\n--- Step 2: Setup WETH Position on Sub-Account 1 ---");

      const wethVaultAddress = ARB_EULER_VAULTS.WETH.vault;
      const newContext = encodeEulerContext(wethVaultAddress, collateralVault, newSubAccountIndex);

      // Enable WETH vault as controller on NEW sub-account
      await evc.connect(user).enableCollateral(newSubAccount, collateralVault);
      await evc.connect(user).enableController(newSubAccount, wethVaultAddress);
      await evc.connect(user).setAccountOperator(newSubAccount, gatewayAddress, true);
      console.log(`✓ New sub-account authorized with WETH vault as controller`);

      // ========================================
      // STEP 3: Execute debt swap (manual - no swap integrated)
      // ========================================
      console.log("\n--- Step 3: Execute Debt Swap ---");
      console.log("Note: This test manually repays USDC and borrows WETH");
      console.log("In production, a DEX swap would convert WETH → USDC for repayment");

      // Get exact USDC debt
      const exactUsdcDebt = await usdcVaultContract.debtOf(oldSubAccount);

      // Approve USDC for repayment
      await (usdc.connect(user) as IERC20).approve(routerAddress, exactUsdcDebt + BigInt(10e6));

      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const collateralShares = await wstEthVault.balanceOf(oldSubAccount);
      const collateralAssets = await wstEthVault.convertToAssets(collateralShares);

      console.log(`USDC debt to repay: ${ethers.formatUnits(exactUsdcDebt, 6)} USDC`);
      console.log(`Collateral to migrate: ${ethers.formatEther(collateralAssets)} wstETH`);

      // Step 3a: Repay USDC debt on old sub-account
      const repayInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.GetBorrowBalance,
            ARB_EULER_VAULTS.USDC.asset,
            user.address,
            0n,
            oldContext,
            999
          )
        ),
        createRouterInstruction(
          encodePullToken(exactUsdcDebt + BigInt(10e6), ARB_EULER_VAULTS.USDC.asset, user.address)
        ),
        createRouterInstruction(encodeApprove(1, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.Repay, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, oldContext, 0)
        ),
        createRouterInstruction(encodePushToken(3, user.address)), // Refund excess
      ];

      await router.connect(user).processProtocolInstructions(repayInstrs, { gasLimit: 1_500_000 });

      const usdcDebtAfterRepay = await usdcVaultContract.debtOf(oldSubAccount);
      console.log(`✓ USDC debt after repay: ${ethers.formatUnits(usdcDebtAfterRepay, 6)} USDC`);
      expect(usdcDebtAfterRepay).to.equal(0n);

      // Step 3b: Disable old controller (required to withdraw all collateral)
      await evc.connect(user).disableController(oldSubAccount);
      console.log(`✓ Disabled old controller`);

      // Step 3c: Withdraw collateral from old sub-account
      const withdrawInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.GetSupplyBalance,
            ARB_EULER_VAULTS.wstETH.asset,
            user.address,
            0n,
            oldContext,
            999
          )
        ),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.WithdrawCollateral,
            ARB_EULER_VAULTS.wstETH.asset,
            user.address,
            0n,
            oldContext,
            0
          )
        ),
        createRouterInstruction(encodePushToken(1, user.address)),
      ];

      await router.connect(user).processProtocolInstructions(withdrawInstrs, { gasLimit: 1_500_000 });
      console.log(`✓ Collateral withdrawn from old sub-account`);

      // Step 3d: Deposit collateral to new sub-account
      const userWstEthBalance = await wstEth.balanceOf(user.address);
      await (wstEth.connect(user) as IERC20).approve(routerAddress, userWstEthBalance);

      const depositNewInstrs = [
        createRouterInstruction(encodePullToken(userWstEthBalance, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.DepositCollateral,
            ARB_EULER_VAULTS.wstETH.asset,
            user.address,
            0n,
            newContext,
            0
          )
        ),
      ];

      await router.connect(user).processProtocolInstructions(depositNewInstrs);
      console.log(`✓ Collateral deposited to new sub-account`);

      // Step 3e: Borrow WETH on new sub-account
      const wethBorrowAmount = ethers.parseEther("0.05"); // 0.05 WETH (~$150)

      const borrowWethInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(
            LendingOp.Borrow,
            ARB_EULER_VAULTS.WETH.asset,
            user.address,
            wethBorrowAmount,
            newContext,
            999
          )
        ),
        createRouterInstruction(encodePushToken(0, user.address)),
      ];

      await router.connect(user).processProtocolInstructions(borrowWethInstrs, { gasLimit: 1_500_000 });

      // ========================================
      // STEP 4: Verify final state
      // ========================================
      console.log("\n--- Step 4: Verify Final State ---");

      // Old sub-account should be empty
      const oldFinalDebt = await usdcVaultContract.debtOf(oldSubAccount);
      const oldFinalCollateral = await wstEthVault.balanceOf(oldSubAccount);
      console.log(`Old sub-account - Debt: ${ethers.formatUnits(oldFinalDebt, 6)} USDC`);
      console.log(`Old sub-account - Collateral: ${ethers.formatEther(oldFinalCollateral)} wstETH`);
      expect(oldFinalDebt).to.equal(0n);
      expect(oldFinalCollateral).to.equal(0n);

      // New sub-account should have WETH debt and wstETH collateral
      const wethVaultContract = await ethers.getContractAt("IEulerVault", wethVaultAddress);
      const newWethDebt = await wethVaultContract.debtOf(newSubAccount);
      const newCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(newSubAccount));
      console.log(`New sub-account - WETH debt: ${ethers.formatEther(newWethDebt)} WETH`);
      console.log(`New sub-account - Collateral: ${ethers.formatEther(newCollateral)} wstETH`);

      expect(newWethDebt).to.be.closeTo(wethBorrowAmount, ethers.parseEther("0.001"));
      expect(newCollateral).to.be.closeTo(collateralAmount, ethers.parseEther("0.01"));

      // User should have WETH
      const weth = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.WETH.asset
      );
      const userWethBalance = await weth.balanceOf(user.address);
      console.log(`User WETH balance: ${ethers.formatEther(userWethBalance)} WETH`);
      expect(userWethBalance).to.equal(wethBorrowAmount);

      console.log("\n=== Debt Swap Complete (USDC → WETH) ===");
      console.log(`✓ Old position (USDC debt) closed on sub-account 0`);
      console.log(`✓ New position (WETH debt) created on sub-account 1`);
      console.log(`✓ Collateral preserved: ${ethers.formatEther(newCollateral)} wstETH`);
    });
  });

  describe("Atomic Sub-Account Migration (NO disableController)", function () {
    /**
     * This test proves that debt swap can work atomically WITHOUT calling disableController.
     *
     * Key insight: When debt=0, the EVC health check passes even with controller still enabled.
     * This allows us to: repay → withdraw → deposit → borrow in one atomic transaction.
     *
     * Requirements:
     * 1. NEW sub-account must have NO existing controller (fresh sub-account)
     * 2. Auth transactions must be signed BEFORE the atomic flow (operator, collateral, controller)
     * 3. Buffer on repay amount to ensure full debt clearance
     */
    it("should migrate position atomically without disableController", async function () {
      this.timeout(180000);

      const [deployer] = await ethers.getSigners();

      const evcCode = await ethers.provider.getCode(EVC_ADDRESS);
      if (evcCode === "0x") {
        console.log("EVC not found, skipping");
        this.skip();
      }

      console.log("\n=== Atomic Debt Swap (NO disableController) ===");
      console.log("Proving: repay → withdraw → deposit → borrow works atomically\n");

      // Setup infrastructure
      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, EVC_ADDRESS);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      await router.addGateway("euler", gatewayAddress);
      await syncGateway("euler", gatewayAddress);
      console.log(`✓ Infrastructure deployed`);

      // Create and fund test user
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      // Sub-account indices
      const oldSubAccountIndex = getUserMainAccountIndex(user.address);
      const newSubAccountIndex = (oldSubAccountIndex + 1) % 256;
      const oldSubAccount = getSubAccount(user.address, oldSubAccountIndex);
      const newSubAccount = getSubAccount(user.address, newSubAccountIndex);

      console.log(`Old sub-account (index ${oldSubAccountIndex}): ${oldSubAccount}`);
      console.log(`New sub-account (index ${newSubAccountIndex}): ${newSubAccount}`);

      // Fund user with collateral
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(ARB_WHALES.wstETH);
      const wstEth = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.wstETH.asset
      )) as IERC20;
      const collateralAmount = ethers.parseEther("0.5");
      await wstEth.connect(wstEthWhale).transfer(user.address, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });

      // Fund user with USDC for repayment (with buffer)
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.USDC, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.USDC] });
      const usdcWhale = await ethers.getSigner(ARB_WHALES.USDC);
      const usdc = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.USDC.asset
      )) as IERC20;
      await (usdc.connect(usdcWhale) as IERC20).transfer(user.address, BigInt(150e6)); // 150 USDC (50% buffer)
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.USDC] });
      console.log(`✓ User funded with 0.5 wstETH and 150 USDC`);

      const evc = await ethers.getContractAt("IEVC", EVC_ADDRESS);
      const borrowVault = ARB_EULER_VAULTS.USDC.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;

      // ========================================
      // STEP 1: Create initial position on OLD sub-account
      // ========================================
      console.log("\n--- Step 1: Create Position on OLD Sub-Account ---");

      const oldContext = encodeEulerContext(borrowVault, collateralVault, oldSubAccountIndex);

      // Setup EVC for OLD sub-account
      await evc.connect(user).enableCollateral(oldSubAccount, collateralVault);
      await evc.connect(user).enableController(oldSubAccount, borrowVault);
      await evc.connect(user).setAccountOperator(oldSubAccount, gatewayAddress, true);

      // Deposit collateral
      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);
      await router.connect(user).processProtocolInstructions([
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, oldContext, 0
        )),
      ]);

      // Borrow USDC
      const borrowAmount = BigInt(100e6); // 100 USDC
      await router.connect(user).processProtocolInstructions([
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, borrowAmount, oldContext, 999
        )),
        createRouterInstruction(encodePushToken(0, user.address)),
      ], { gasLimit: 1_500_000 });

      const usdcVault = await ethers.getContractAt("IEulerVault", borrowVault);
      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const initialDebt = await usdcVault.debtOf(oldSubAccount);
      const initialCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(oldSubAccount));
      console.log(`✓ Position created: ${ethers.formatUnits(initialDebt, 6)} USDC debt, ${ethers.formatEther(initialCollateral)} wstETH collateral`);

      // ========================================
      // STEP 2: Setup NEW sub-account (authorization only, no position yet)
      // ========================================
      console.log("\n--- Step 2: Authorize NEW Sub-Account ---");

      // Verify NEW sub-account has NO existing controller
      const newControllersBefore = await evc.getControllers(newSubAccount);
      expect(newControllersBefore.length).to.equal(0, "New sub-account should have no controllers");
      console.log(`✓ New sub-account has no existing controller (clean slate)`);

      // Setup authorization for NEW sub-account (same borrow vault for simplicity)
      await evc.connect(user).enableCollateral(newSubAccount, collateralVault);
      await evc.connect(user).enableController(newSubAccount, borrowVault);
      await evc.connect(user).setAccountOperator(newSubAccount, gatewayAddress, true);
      console.log(`✓ New sub-account authorized (operator, collateral, controller)`);

      // ========================================
      // STEP 3: ATOMIC debt swap - repay → withdraw → deposit → borrow
      // NO disableController call!
      // ========================================
      console.log("\n--- Step 3: ATOMIC Debt Swap (single tx) ---");
      console.log("Flow: repay(old) → withdraw(old) → deposit(new) → borrow(new)");

      const newContext = encodeEulerContext(borrowVault, collateralVault, newSubAccountIndex);

      // Get exact debt and add buffer (0.5% to be safe)
      const exactDebt = await usdcVault.debtOf(oldSubAccount);
      const bufferedDebt = (exactDebt * 1005n) / 1000n; // 0.5% buffer
      console.log(`Exact debt: ${ethers.formatUnits(exactDebt, 6)} USDC`);
      console.log(`Buffered repay: ${ethers.formatUnits(bufferedDebt, 6)} USDC`);

      // Get collateral balance (in assets, not shares)
      const collateralAssets = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(oldSubAccount));
      console.log(`Collateral to migrate: ${ethers.formatEther(collateralAssets)} wstETH`);

      // Approve router to pull USDC for repayment
      await (usdc.connect(user) as IERC20).approve(routerAddress, bufferedDebt);

      // Build atomic instruction sequence
      const atomicInstructions = [
        // 1. Pull USDC from user for repayment → [0]
        createRouterInstruction(encodePullToken(bufferedDebt, ARB_EULER_VAULTS.USDC.asset, user.address)),

        // 2. Approve Euler gateway for USDC → [1]
        createRouterInstruction(encodeApprove(0, "euler")),

        // 3. Repay debt on OLD sub-account → [2] (refund output)
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Repay, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, oldContext, 0
        )),

        // 4. Withdraw ALL collateral from OLD sub-account → [3]
        // Note: This works because debt=0 after repay, health check passes
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.WithdrawCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, collateralAssets, oldContext, 999
        )),

        // 5. Approve Euler gateway for collateral → [4]
        createRouterInstruction(encodeApprove(3, "euler")),

        // 6. Deposit collateral to NEW sub-account (no output)
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, newContext, 3
        )),

        // 7. Borrow on NEW sub-account → [5]
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, borrowAmount, newContext, 999
        )),

        // 8. Push borrowed USDC to user
        createRouterInstruction(encodePushToken(5, user.address)),

        // 9. Push repay refund to user
        createRouterInstruction(encodePushToken(2, user.address)),
      ];

      // Execute the atomic swap
      console.log(`Executing ${atomicInstructions.length} instructions atomically...`);
      await router.connect(user).processProtocolInstructions(atomicInstructions, { gasLimit: 3_000_000 });
      console.log(`✓ Atomic transaction succeeded!`);

      // ========================================
      // STEP 4: Verify migration
      // ========================================
      console.log("\n--- Step 4: Verify Migration ---");

      // OLD sub-account should have NO debt (fully repaid)
      const oldDebtAfter = await usdcVault.debtOf(oldSubAccount);
      console.log(`Old sub-account debt: ${ethers.formatUnits(oldDebtAfter, 6)} USDC`);
      expect(oldDebtAfter).to.equal(0n, "Old sub-account should have zero debt");

      // OLD sub-account should have NO collateral (fully withdrawn, allowing for dust)
      const oldCollateralAfter = await wstEthVault.balanceOf(oldSubAccount);
      console.log(`Old sub-account collateral: ${oldCollateralAfter} wei shares (dust from rounding)`);
      // Allow up to 1000 wei of rounding dust
      expect(oldCollateralAfter).to.be.lte(1000n, "Old sub-account should have near-zero collateral (dust ok)");

      // OLD sub-account should STILL have controller enabled (we didn't disable it)
      const oldControllersAfter = await evc.getControllers(oldSubAccount);
      console.log(`Old sub-account controllers: ${oldControllersAfter.length} (controller NOT disabled)`);
      expect(oldControllersAfter.length).to.equal(1, "Controller should still be enabled on old sub-account");

      // NEW sub-account should have debt
      const newDebt = await usdcVault.debtOf(newSubAccount);
      console.log(`New sub-account debt: ${ethers.formatUnits(newDebt, 6)} USDC`);
      expect(newDebt).to.be.closeTo(borrowAmount, BigInt(1e6));

      // NEW sub-account should have collateral
      const newCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(newSubAccount));
      console.log(`New sub-account collateral: ${ethers.formatEther(newCollateral)} wstETH`);
      expect(newCollateral).to.be.closeTo(initialCollateral, ethers.parseEther("0.01"));

      console.log("\n=== ATOMIC Debt Swap SUCCEEDED ===");
      console.log(`✓ NO disableController was called`);
      console.log(`✓ Old controller still enabled (but empty position)`);
      console.log(`✓ Position migrated from sub-account ${oldSubAccountIndex} to ${newSubAccountIndex}`);
      console.log(`✓ Debt: ${ethers.formatUnits(newDebt, 6)} USDC`);
      console.log(`✓ Collateral: ${ethers.formatEther(newCollateral)} wstETH`);
    });

    /**
     * THIS IS THE KEY TEST - Uses DIFFERENT borrow vaults (USDC → WETH)
     * This matches the real debt swap scenario in the frontend.
     */
    it("should migrate atomically with DIFFERENT borrow vaults (USDC → WETH)", async function () {
      this.timeout(180000);

      const [deployer] = await ethers.getSigners();

      const evcCode = await ethers.provider.getCode(EVC_ADDRESS);
      if (evcCode === "0x") {
        console.log("EVC not found, skipping");
        this.skip();
      }

      // Check WETH vault has liquidity
      const wethVault = await ethers.getContractAt("IEulerVault", ARB_EULER_VAULTS.WETH.vault);
      const wethLiquidity = await wethVault.totalAssets();
      if (wethLiquidity < ethers.parseEther("0.1")) {
        console.log("WETH vault has insufficient liquidity, skipping");
        this.skip();
      }

      console.log("\n=== Atomic Debt Swap (USDC → WETH, NO disableController) ===");
      console.log("This matches the REAL debt swap frontend scenario!\n");

      // Setup infrastructure
      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, EVC_ADDRESS);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      await router.addGateway("euler", gatewayAddress);
      await syncGateway("euler", gatewayAddress);
      console.log(`✓ Infrastructure deployed`);

      // Create and fund test user
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      // Sub-account indices
      const oldSubAccountIndex = getUserMainAccountIndex(user.address);
      const newSubAccountIndex = (oldSubAccountIndex + 1) % 256;
      const oldSubAccount = getSubAccount(user.address, oldSubAccountIndex);
      const newSubAccount = getSubAccount(user.address, newSubAccountIndex);

      console.log(`Old sub-account (USDC vault, index ${oldSubAccountIndex}): ${oldSubAccount}`);
      console.log(`New sub-account (WETH vault, index ${newSubAccountIndex}): ${newSubAccount}`);

      // Fund user with collateral
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(ARB_WHALES.wstETH);
      const wstEth = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.wstETH.asset
      )) as IERC20;
      const collateralAmount = ethers.parseEther("0.5");
      await wstEth.connect(wstEthWhale).transfer(user.address, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });

      // Fund user with USDC for repayment (with buffer)
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.USDC, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.USDC] });
      const usdcWhale = await ethers.getSigner(ARB_WHALES.USDC);
      const usdc = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.USDC.asset
      )) as IERC20;
      await (usdc.connect(usdcWhale) as IERC20).transfer(user.address, BigInt(150e6)); // 150 USDC
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.USDC] });
      console.log(`✓ User funded with 0.5 wstETH and 150 USDC`);

      const evc = await ethers.getContractAt("IEVC", EVC_ADDRESS);
      const usdcVaultAddress = ARB_EULER_VAULTS.USDC.vault;
      const wethVaultAddress = ARB_EULER_VAULTS.WETH.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;

      // ========================================
      // STEP 1: Create initial position on OLD sub-account (USDC borrow)
      // ========================================
      console.log("\n--- Step 1: Create Position on OLD Sub-Account (USDC borrow) ---");

      // Context for OLD sub-account with USDC borrow vault
      const oldContext = encodeEulerContext(usdcVaultAddress, collateralVault, oldSubAccountIndex);

      // Setup EVC for OLD sub-account
      await evc.connect(user).enableCollateral(oldSubAccount, collateralVault);
      await evc.connect(user).enableController(oldSubAccount, usdcVaultAddress);
      await evc.connect(user).setAccountOperator(oldSubAccount, gatewayAddress, true);

      // Deposit collateral
      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);
      await router.connect(user).processProtocolInstructions([
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, oldContext, 0
        )),
      ]);

      // Borrow USDC
      const usdcBorrowAmount = BigInt(100e6); // 100 USDC
      await router.connect(user).processProtocolInstructions([
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, usdcBorrowAmount, oldContext, 999
        )),
        createRouterInstruction(encodePushToken(0, user.address)),
      ], { gasLimit: 1_500_000 });

      const usdcVault = await ethers.getContractAt("IEulerVault", usdcVaultAddress);
      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const initialDebt = await usdcVault.debtOf(oldSubAccount);
      const initialCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(oldSubAccount));
      console.log(`✓ Position created: ${ethers.formatUnits(initialDebt, 6)} USDC debt, ${ethers.formatEther(initialCollateral)} wstETH collateral`);

      // ========================================
      // STEP 2: Setup NEW sub-account with WETH borrow vault (DIFFERENT controller)
      // ========================================
      console.log("\n--- Step 2: Authorize NEW Sub-Account with WETH controller ---");

      // Verify NEW sub-account has NO existing controller
      const newControllersBefore = await evc.getControllers(newSubAccount);
      expect(newControllersBefore.length).to.equal(0, "New sub-account should have no controllers");
      console.log(`✓ New sub-account has no existing controller (clean slate)`);

      // Setup authorization for NEW sub-account with WETH vault as controller
      await evc.connect(user).enableCollateral(newSubAccount, collateralVault);
      await evc.connect(user).enableController(newSubAccount, wethVaultAddress); // WETH as controller!
      await evc.connect(user).setAccountOperator(newSubAccount, gatewayAddress, true);
      console.log(`✓ New sub-account authorized with WETH vault as controller`);

      // ========================================
      // STEP 3: ATOMIC debt swap - repay USDC → withdraw → deposit → borrow WETH
      // ========================================
      console.log("\n--- Step 3: ATOMIC Debt Swap (USDC → WETH) ---");
      console.log("Flow: repay USDC(old) → withdraw(old) → deposit(new) → borrow WETH(new)");

      // Context for NEW sub-account with WETH borrow vault
      const newContext = encodeEulerContext(wethVaultAddress, collateralVault, newSubAccountIndex);

      // Get exact USDC debt and add buffer
      const exactUsdcDebt = await usdcVault.debtOf(oldSubAccount);
      const bufferedDebt = (exactUsdcDebt * 1005n) / 1000n; // 0.5% buffer
      console.log(`Exact USDC debt: ${ethers.formatUnits(exactUsdcDebt, 6)} USDC`);
      console.log(`Buffered repay: ${ethers.formatUnits(bufferedDebt, 6)} USDC`);

      // Get collateral balance
      const collateralAssets = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(oldSubAccount));
      console.log(`Collateral to migrate: ${ethers.formatEther(collateralAssets)} wstETH`);

      // WETH borrow amount - small amount for safety
      const wethBorrowAmount = ethers.parseEther("0.02"); // 0.02 WETH

      // Approve router to pull USDC for repayment
      await (usdc.connect(user) as IERC20).approve(routerAddress, bufferedDebt);

      // Build atomic instruction sequence
      const atomicInstructions = [
        // 1. Pull USDC from user for repayment → [0]
        createRouterInstruction(encodePullToken(bufferedDebt, ARB_EULER_VAULTS.USDC.asset, user.address)),

        // 2. Approve Euler gateway for USDC → [1]
        createRouterInstruction(encodeApprove(0, "euler")),

        // 3. Repay USDC debt on OLD sub-account → [2] (refund output)
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Repay, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, oldContext, 0
        )),

        // 4. Withdraw ALL collateral from OLD sub-account → [3]
        // Note: This works because USDC debt=0 after repay, health check passes
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.WithdrawCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, collateralAssets, oldContext, 999
        )),

        // 5. Approve Euler gateway for collateral → [4]
        createRouterInstruction(encodeApprove(3, "euler")),

        // 6. Deposit collateral to NEW sub-account (no output)
        // NOTE: newContext has WETH as borrowVault, wstETH as collateral
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, newContext, 3
        )),

        // 7. Borrow WETH on NEW sub-account → [5]
        // This uses WETH vault as controller (different from old USDC vault)
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Borrow, ARB_EULER_VAULTS.WETH.asset, user.address, wethBorrowAmount, newContext, 999
        )),

        // 8. Push borrowed WETH to user
        createRouterInstruction(encodePushToken(5, user.address)),

        // 9. Push USDC repay refund to user
        createRouterInstruction(encodePushToken(2, user.address)),
      ];

      // Execute the atomic swap
      console.log(`Executing ${atomicInstructions.length} instructions atomically...`);
      await router.connect(user).processProtocolInstructions(atomicInstructions, { gasLimit: 3_000_000 });
      console.log(`✓ Atomic transaction succeeded!`);

      // ========================================
      // STEP 4: Verify migration
      // ========================================
      console.log("\n--- Step 4: Verify Migration ---");

      // OLD sub-account should have NO USDC debt (fully repaid)
      const oldUsdcDebtAfter = await usdcVault.debtOf(oldSubAccount);
      console.log(`Old sub-account USDC debt: ${ethers.formatUnits(oldUsdcDebtAfter, 6)} USDC`);
      expect(oldUsdcDebtAfter).to.equal(0n, "Old sub-account should have zero USDC debt");

      // OLD sub-account should have NO collateral (allowing for dust)
      const oldCollateralAfter = await wstEthVault.balanceOf(oldSubAccount);
      console.log(`Old sub-account collateral: ${oldCollateralAfter} wei shares (dust ok)`);
      expect(oldCollateralAfter).to.be.lte(1000n, "Old sub-account should have near-zero collateral");

      // OLD sub-account should STILL have USDC controller enabled (we didn't disable it)
      const oldControllersAfter = await evc.getControllers(oldSubAccount);
      console.log(`Old sub-account controllers: ${oldControllersAfter}`);
      expect(oldControllersAfter.length).to.equal(1, "Old controller should still be enabled");
      expect(oldControllersAfter[0].toLowerCase()).to.equal(usdcVaultAddress.toLowerCase());

      // NEW sub-account should have WETH debt (DIFFERENT vault!)
      const wethVaultContract = await ethers.getContractAt("IEulerVault", wethVaultAddress);
      const newWethDebt = await wethVaultContract.debtOf(newSubAccount);
      console.log(`New sub-account WETH debt: ${ethers.formatEther(newWethDebt)} WETH`);
      expect(newWethDebt).to.be.closeTo(wethBorrowAmount, ethers.parseEther("0.001"));

      // NEW sub-account should have WETH controller (not USDC!)
      const newControllersAfter = await evc.getControllers(newSubAccount);
      console.log(`New sub-account controllers: ${newControllersAfter}`);
      expect(newControllersAfter.length).to.equal(1);
      expect(newControllersAfter[0].toLowerCase()).to.equal(wethVaultAddress.toLowerCase());

      // NEW sub-account should have collateral
      const newCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(newSubAccount));
      console.log(`New sub-account collateral: ${ethers.formatEther(newCollateral)} wstETH`);
      expect(newCollateral).to.be.closeTo(initialCollateral, ethers.parseEther("0.01"));

      // User should have WETH
      const weth = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        ARB_EULER_VAULTS.WETH.asset
      );
      const userWethBalance = await weth.balanceOf(user.address);
      console.log(`User WETH balance: ${ethers.formatEther(userWethBalance)} WETH`);
      expect(userWethBalance).to.equal(wethBorrowAmount);

      console.log("\n=== ATOMIC Debt Swap (USDC → WETH) SUCCEEDED ===");
      console.log(`✓ NO disableController was called`);
      console.log(`✓ Old sub-account: USDC controller (empty position)`);
      console.log(`✓ New sub-account: WETH controller (active position)`);
      console.log(`✓ Position migrated from sub-account ${oldSubAccountIndex} to ${newSubAccountIndex}`);
      console.log(`✓ Old debt: USDC -> New debt: WETH (DIFFERENT vaults!)`);
      console.log(`✓ Collateral preserved: ${ethers.formatEther(newCollateral)} wstETH`);
    });
  });

  /**
   * REAL DEBT SWAP TEST - Uses flash loan + 1inch swap like the frontend
   * This test matches the exact flow used in DebtSwapEvmModal.tsx
   */
  describe("Real Debt Swap with Flash Loan + 1inch Swap", function () {
    before(function () {
      if (!process.env.ONE_INCH_API_KEY) {
        console.log("Skipping 1inch tests: ONE_INCH_API_KEY not set");
        this.skip();
      }
    });

    it("should swap Euler debt from USDC to WETH via flash loan + 1inch (matching frontend flow)", async function () {
      this.timeout(300000);

      await deployments.fixture(["KapanRouter", "OneInchGateway", "EulerGateway"]);

      const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
      const routerAddress = await router.getAddress();
      const oneInchGateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
      const adapterAddress = await oneInchGateway.adapter();
      const eulerGateway = await ethers.getContractAt("EulerGatewayWrite", (await deployments.get("EulerGatewayWrite")).address);
      const eulerGatewayAddress = await eulerGateway.getAddress();

      const evcCode = await ethers.provider.getCode(EVC_ADDRESS);
      if (evcCode === "0x") {
        console.log("EVC not found, skipping");
        this.skip();
      }

      // Check WETH vault has liquidity
      const wethVault = await ethers.getContractAt("IEulerVault", ARB_EULER_VAULTS.WETH.vault);
      const wethLiquidity = await wethVault.totalAssets();
      if (wethLiquidity < ethers.parseEther("0.1")) {
        console.log("WETH vault has insufficient liquidity, skipping");
        this.skip();
      }

      console.log("\n=== REAL Euler Debt Swap: Flash Loan + 1inch ===");
      console.log("Flow: Flash WETH → Swap to USDC → Repay USDC → Migrate collateral → Borrow WETH");
      console.log("This matches the EXACT frontend flow!\n");

      const { deployer } = await ethers.getNamedSigners();
      const user = deployer;
      const userAddress = await user.getAddress();

      // Contracts
      const usdc = (await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.USDC.asset)) as IERC20;
      const weth = (await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.WETH.asset)) as IERC20;
      const wstEth = (await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.wstETH.asset)) as IERC20;
      const evc = await ethers.getContractAt("IEVC", EVC_ADDRESS);

      // Sub-account setup
      const oldSubAccountIndex = getUserMainAccountIndex(userAddress);
      const newSubAccountIndex = (oldSubAccountIndex + 1) % 256;
      const oldSubAccount = getSubAccount(userAddress, oldSubAccountIndex);
      const newSubAccount = getSubAccount(userAddress, newSubAccountIndex);

      console.log(`User: ${userAddress}`);
      console.log(`Old sub-account (index ${oldSubAccountIndex}): ${oldSubAccount}`);
      console.log(`New sub-account (index ${newSubAccountIndex}): ${newSubAccount}`);

      // ========================================
      // STEP 1: Setup initial Euler position (wstETH collateral, USDC debt)
      // ========================================
      console.log("\n--- Step 1: Create Initial Position ---");

      // Fund user with wstETH
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(ARB_WHALES.wstETH);
      const collateralAmount = ethers.parseEther("0.5"); // 0.5 wstETH (~$2000)
      await wstEth.connect(wstEthWhale).transfer(userAddress, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });
      console.log(`✓ User funded with ${ethers.formatEther(collateralAmount)} wstETH`);

      const usdcVaultAddress = ARB_EULER_VAULTS.USDC.vault;
      const wethVaultAddress = ARB_EULER_VAULTS.WETH.vault;
      const wstEthVaultAddress = ARB_EULER_VAULTS.wstETH.vault;

      const oldContext = encodeEulerContext(usdcVaultAddress, wstEthVaultAddress, oldSubAccountIndex);

      // Setup EVC for old sub-account
      await evc.connect(user).enableCollateral(oldSubAccount, wstEthVaultAddress);
      await evc.connect(user).enableController(oldSubAccount, usdcVaultAddress);
      await evc.connect(user).setAccountOperator(oldSubAccount, eulerGatewayAddress, true);
      console.log(`✓ EVC authorization for old sub-account`);

      // Deposit collateral
      await wstEth.connect(user).approve(routerAddress, collateralAmount);
      const depositInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, userAddress)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, userAddress, 0n, oldContext, 0
        )),
      ];
      await router.connect(user).processProtocolInstructions(depositInstrs);

      const wstEthVault = await ethers.getContractAt("IEulerVault", wstEthVaultAddress);
      const initialCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(oldSubAccount));
      console.log(`✓ Deposited: ${ethers.formatEther(initialCollateral)} wstETH`);

      // Borrow USDC
      const borrowUsdc = BigInt(100e6); // 100 USDC
      const borrowInstrs = [
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, userAddress, borrowUsdc, oldContext, 999
        )),
        createRouterInstruction(encodePushToken(0, userAddress)),
      ];
      await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 1_500_000 });

      const usdcVault = await ethers.getContractAt("IEulerVault", usdcVaultAddress);
      const initialDebt = await usdcVault.debtOf(oldSubAccount);
      console.log(`✓ Borrowed: ${ethers.formatUnits(initialDebt, 6)} USDC`);

      // Move user's USDC away so we must use flash loan
      const userUsdcBal = await usdc.balanceOf(userAddress);
      if (userUsdcBal > 0n) {
        await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.USDC] });
        const usdcWhale = await ethers.getSigner(ARB_WHALES.USDC);
        await usdc.connect(user).transfer(await usdcWhale.getAddress(), userUsdcBal);
        await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.USDC] });
      }
      console.log(`✓ User USDC moved away (must use flash loan)`);

      // ========================================
      // STEP 2: Setup new sub-account
      // ========================================
      console.log("\n--- Step 2: Setup New Sub-Account ---");

      await evc.connect(user).enableCollateral(newSubAccount, wstEthVaultAddress);
      await evc.connect(user).enableController(newSubAccount, wethVaultAddress);
      await evc.connect(user).setAccountOperator(newSubAccount, eulerGatewayAddress, true);
      console.log(`✓ EVC authorization for new sub-account (WETH controller)`);

      // ========================================
      // STEP 3: Get 1inch quote for WETH → USDC swap
      // ========================================
      console.log("\n--- Step 3: Fetch 1inch Quote ---");

      const debtToRepay = initialDebt;
      const debtWithBuffer = (debtToRepay * 101n) / 100n; // +1% buffer for interest

      // Binary search for minimal WETH needed to get debtWithBuffer USDC
      let lowWei = ethers.parseEther("0.01");
      let highWei = ethers.parseEther("1.0");
      let foundWei = highWei;

      for (let i = 0; i < 6; i++) {
        const mid = (lowWei + highWei) / 2n;
        const qUrl = `https://api.1inch.dev/swap/v6.0/42161/quote?src=${ARB_EULER_VAULTS.WETH.asset}&dst=${ARB_EULER_VAULTS.USDC.asset}&amount=${mid}`;
        try {
          const qResp = execSync(`curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${qUrl}"`).toString();
          const q = JSON.parse(qResp);
          if (q.error) break;
          const out = BigInt(q.dstAmount);
          if (out >= debtWithBuffer) {
            foundWei = mid;
            highWei = mid - 1n;
          } else {
            lowWei = mid + 1n;
          }
        } catch {
          break;
        }
      }

      const wethFlashAmount = (foundWei * 105n) / 100n; // +5% buffer for slippage
      console.log(`Required WETH to repay ${ethers.formatUnits(debtWithBuffer, 6)} USDC: ~${ethers.formatEther(wethFlashAmount)} WETH`);

      // Get actual swap data
      const swapUrl = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${ARB_EULER_VAULTS.WETH.asset}&dst=${ARB_EULER_VAULTS.USDC.asset}&amount=${wethFlashAmount}&from=${adapterAddress}&slippage=3&disableEstimate=true`;
      console.log("Fetching swap quote...");
      const swapCmd = `curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${swapUrl}"`;
      const swapResponse = execSync(swapCmd).toString();
      const swapJson = JSON.parse(swapResponse);

      if (swapJson.error) {
        throw new Error(`1inch API Error: ${swapJson.error} - ${swapJson.description || ""}`);
      }

      const txData = swapJson.tx.data;
      const expectedUsdc = BigInt(swapJson.dstAmount);
      console.log(`✓ 1inch quote: ${ethers.formatEther(wethFlashAmount)} WETH → ${ethers.formatUnits(expectedUsdc, 6)} USDC`);

      // ========================================
      // STEP 4: Build and execute debt swap instructions
      // ========================================
      console.log("\n--- Step 4: Execute Debt Swap (Flash + Swap + Migrate) ---");

      const newContext = encodeEulerContext(wethVaultAddress, wstEthVaultAddress, newSubAccountIndex);

      // Swap context: SwapExactOut to get exactly debtToRepay USDC
      const swapContext = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes"],
        [ARB_EULER_VAULTS.USDC.asset, debtToRepay, txData]
      );

      // This matches the frontend flow EXACTLY:
      // 1. ToOutput (flash amount)
      // 2. FlashLoan
      // 3. Approve swap
      // 4. SwapExactOut (WETH → USDC)
      // 5. Approve Euler for USDC
      // 6. Repay USDC on OLD sub-account
      // 7. GetSupplyBalance (collateral)
      // 8. WithdrawCollateral from OLD
      // 9. Approve Euler for collateral
      // 10. DepositCollateral to NEW
      // 11. Borrow WETH on NEW (to repay flash loan)
      // 12. Push refunds

      const instructions = [
        // 0. ToOutput: flash loan amount → [0]
        createRouterInstruction(ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(uint256 amount,address token,address user,uint8 instructionType)"],
          [[wethFlashAmount, ARB_EULER_VAULTS.WETH.asset, ethers.ZeroAddress, 3]]
        )),

        // 1. FlashLoan WETH using [0] → [1]
        createRouterInstruction(encodeFlashLoan(0, 0)), // BalancerV2

        // 2. Approve 1inch for WETH → [2]
        createRouterInstruction(encodeApprove(1, "oneinch")),

        // 3. SwapExactOut WETH → USDC → [3]=USDC, [4]=WETH refund
        createProtocolInstruction("oneinch", ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
          [[LendingOp.SwapExactOut, ARB_EULER_VAULTS.WETH.asset, userAddress, 0n, swapContext, { index: 1 }]]
        )),

        // 4. Approve Euler for USDC → [5]
        createRouterInstruction(encodeApprove(3, "euler")),

        // 5. Repay USDC on OLD sub-account → [6]=repay refund
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Repay, ARB_EULER_VAULTS.USDC.asset, userAddress, 0n, oldContext, 3
        )),

        // 6. GetSupplyBalance (collateral on OLD) → [7]
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.GetSupplyBalance, ARB_EULER_VAULTS.wstETH.asset, userAddress, 0n, oldContext, 999
        )),

        // 7. WithdrawCollateral from OLD using [7] → [8]
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.WithdrawCollateral, ARB_EULER_VAULTS.wstETH.asset, userAddress, 0n, oldContext, 7
        )),

        // 8. Approve Euler for collateral → [9]
        createRouterInstruction(encodeApprove(8, "euler")),

        // 9. DepositCollateral to NEW (no output)
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, userAddress, 0n, newContext, 8
        )),

        // 10. Borrow WETH on NEW using [0] amount → [10]
        createProtocolInstruction("euler", encodeLendingInstruction(
          LendingOp.Borrow, ARB_EULER_VAULTS.WETH.asset, userAddress, 0n, newContext, 0
        )),

        // 11. Push USDC repay refund [6] to user
        createRouterInstruction(encodePushToken(6, userAddress)),

        // 12. Push WETH swap refund [4] to user
        createRouterInstruction(encodePushToken(4, userAddress)),
      ];

      console.log(`Executing ${instructions.length} instructions (matching frontend flow)...`);
      await router.connect(user).processProtocolInstructions(instructions, { gasLimit: 5_000_000 });
      console.log(`✓ Debt swap executed!`);

      // ========================================
      // STEP 5: Verify results
      // ========================================
      console.log("\n--- Step 5: Verify Migration ---");

      // OLD sub-account: zero USDC debt
      const oldUsdcDebt = await usdcVault.debtOf(oldSubAccount);
      console.log(`Old sub-account USDC debt: ${ethers.formatUnits(oldUsdcDebt, 6)}`);
      expect(oldUsdcDebt).to.equal(0n, "Old USDC debt should be zero");

      // OLD sub-account: zero collateral (dust ok)
      const oldCollateral = await wstEthVault.balanceOf(oldSubAccount);
      console.log(`Old sub-account collateral: ${oldCollateral} wei shares`);
      expect(oldCollateral).to.be.lte(1000n, "Old collateral should be near zero");

      // NEW sub-account: WETH debt
      const wethVaultContract = await ethers.getContractAt("IEulerVault", wethVaultAddress);
      const newWethDebt = await wethVaultContract.debtOf(newSubAccount);
      console.log(`New sub-account WETH debt: ${ethers.formatEther(newWethDebt)}`);
      expect(newWethDebt).to.be.closeTo(wethFlashAmount, ethers.parseEther("0.01"));

      // NEW sub-account: collateral preserved
      const newCollateral = await wstEthVault.convertToAssets(await wstEthVault.balanceOf(newSubAccount));
      console.log(`New sub-account collateral: ${ethers.formatEther(newCollateral)} wstETH`);
      expect(newCollateral).to.be.closeTo(initialCollateral, ethers.parseEther("0.01"));

      // Verify controller change
      const newControllers = await evc.getControllers(newSubAccount);
      expect(newControllers[0].toLowerCase()).to.equal(wethVaultAddress.toLowerCase());

      // Dust checks
      expect(await usdc.balanceOf(routerAddress)).to.equal(0n, "Router USDC dust");
      expect(await weth.balanceOf(routerAddress)).to.equal(0n, "Router WETH dust");
      expect(await wstEth.balanceOf(routerAddress)).to.equal(0n, "Router wstETH dust");

      console.log("\n=== REAL Debt Swap (Flash + 1inch) SUCCEEDED ===");
      console.log(`✓ Flash loaned ${ethers.formatEther(wethFlashAmount)} WETH`);
      console.log(`✓ Swapped WETH → USDC via 1inch`);
      console.log(`✓ Repaid ${ethers.formatUnits(initialDebt, 6)} USDC debt`);
      console.log(`✓ Migrated ${ethers.formatEther(newCollateral)} wstETH collateral`);
      console.log(`✓ New debt: ${ethers.formatEther(newWethDebt)} WETH on new sub-account`);
      console.log(`✓ NO disableController needed!`);
    });
  });
});
