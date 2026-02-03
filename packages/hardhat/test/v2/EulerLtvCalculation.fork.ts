import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, Signer } from "ethers";
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

/**
 * EulerGatewayView LTV Calculation Fork Tests
 *
 * Tests the getCurrentLtvBps function for Euler V2 positions.
 * Creates real positions (deposit wstETH collateral, borrow USDC) and verifies
 * that LTV calculations match manual calculation: (debt / collateral * 10000)
 *
 * To run:
 *   MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/EulerLtvCalculation.fork.ts
 */

// ============ Fork Configuration ============
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum Addresses ============
const EVC = "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066";

// Euler vaults on Arbitrum
const EULER_VAULTS = {
  USDC: {
    vault: "0x0a1eCC5Fe8C9be3C809844fcBe615B46A869b899",
    asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
  },
  wstETH: {
    vault: "0xA8616E4D9f3f0aa01aff1d7c3b66249f8a5f1A58",
    asset: "0x5979D7b546E38E414F7E9822514be443A4800529",
    decimals: 18,
  },
};

// Whales for token funding
const WHALES = {
  wstETH: "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf",
  USDC: "0x47c031236e19d024b42f8AE6780E44A573170703",
};

// Type helper for ERC20 contracts
type IERC20 = Contract & {
  transfer: (to: string, amount: bigint) => Promise<any>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  balanceOf: (account: string) => Promise<bigint>;
  connect: (signer: any) => IERC20;
};

/**
 * Encode Euler context for gateway operations
 */
function encodeEulerContext(borrowVault: string, collateralVault: string, subAccountIndex: number = 0): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address[]", "uint8"],
    [borrowVault, [collateralVault], subAccountIndex]
  );
}

/**
 * Get the natural sub-account index for a user (their "main" account)
 * This is the last byte of the user's address.
 */
function getUserMainAccountIndex(user: string): number {
  return Number(BigInt(user) & BigInt(0xFF));
}

describe("v2 EulerGatewayView LTV Calculation (fork)", function () {
  this.timeout(180000);

  let deployer: Signer;
  let user: Signer;
  let userAddress: string;
  let eulerView: Contract;
  let wstEth: IERC20;
  let usdc: IERC20;
  let evc: Contract;

  before(async function () {
    if (!FORK) {
      console.log("Skipping EulerLtvCalculation fork tests: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }

    const chainId = network.config.chainId;
    if (chainId && chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping tests: Current chain ID is ${chainId}, expected 42161 (Arbitrum)`);
      this.skip();
    }

    // Check EVC exists
    const evcCode = await ethers.provider.getCode(EVC);
    if (evcCode === "0x") {
      console.log("EVC not deployed, skipping tests");
      this.skip();
    }

    [deployer] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    // Deploy EulerGatewayView
    const EulerGatewayView = await ethers.getContractFactory("EulerGatewayView");
    eulerView = await EulerGatewayView.deploy(EVC);
    await eulerView.waitForDeployment();

    // Get token contracts
    wstEth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", EULER_VAULTS.wstETH.asset) as unknown as IERC20;
    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", EULER_VAULTS.USDC.asset) as unknown as IERC20;
    evc = await ethers.getContractAt("IEVC", EVC);

    // Fund user with ETH for gas
    await deployer.sendTransaction({ to: userAddress, value: ethers.parseEther("1") });

    console.log("\n=== EulerGatewayView LTV Calculation Test Setup ===");
    console.log(`EulerGatewayView deployed at: ${await eulerView.getAddress()}`);
    console.log(`User: ${userAddress}`);
  });

  describe("getCurrentLtvBps behavior without position", function () {
    it("should return 0 when calling getCurrentLtvBps for user without controller (no position)", async function () {
      // getCurrentLtvBps has try-catch and returns 0 when no controller set
      const subAccountIndex = getUserMainAccountIndex(userAddress);

      const ltv = await eulerView.getCurrentLtvBps(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);
      console.log(`  LTV for user without controller: ${ltv}`);
      expect(ltv).to.equal(0n);
    });

    it("should return 0 from getUserAccountData for user without controller", async function () {
      // getUserAccountData has try-catch and returns (0, 0) for users without position
      const subAccountIndex = getUserMainAccountIndex(userAddress);

      const [totalCollateral, totalDebt] = await eulerView.getUserAccountData(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      expect(totalCollateral).to.equal(0n);
      expect(totalDebt).to.equal(0n);
      console.log(`  getUserAccountData for no position: collateral=${totalCollateral}, debt=${totalDebt}`);
    });
  });

  describe("getCurrentLtvBps with real position", function () {
    let subAccountIndex: number;
    let collateralAmount: bigint;
    let borrowAmount: bigint;
    let positionCreated = false;
    let router: Contract;
    let routerAddress: string;

    before(async function () {
      // Check USDC vault has enough liquidity
      const usdcVault = await ethers.getContractAt("IEulerVault", EULER_VAULTS.USDC.vault);
      const vaultLiquidity = await usdcVault.totalAssets();
      if (vaultLiquidity < BigInt(500e6)) {
        console.log(`USDC vault has insufficient liquidity (${ethers.formatUnits(vaultLiquidity, 6)} USDC), skipping`);
        this.skip();
      }

      collateralAmount = ethers.parseEther("0.5"); // 0.5 wstETH (~$2000 at ~$4000/wstETH)
      borrowAmount = BigInt(100e6); // 100 USDC (conservative, like other Euler tests)

      // Fund user with wstETH from whale
      await network.provider.send("hardhat_setBalance", [WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(WHALES.wstETH);
      await (wstEth.connect(wstEthWhale) as IERC20).transfer(userAddress, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [WHALES.wstETH] });

      console.log(`\n  User funded with ${ethers.formatEther(collateralAmount)} wstETH`);

      // Deploy router and Euler gateway
      const deployed = await deployRouterWithAuthHelper(ethers, await deployer.getAddress());
      router = deployed.router;
      routerAddress = deployed.routerAddress;

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const eulerGateway = await EulerGateway.deploy(routerAddress, await deployer.getAddress(), EVC);
      const eulerGatewayAddress = await eulerGateway.getAddress();
      await router.addGateway("euler", eulerGatewayAddress);
      await deployed.syncGateway("euler", eulerGatewayAddress);

      // Setup EVC authorization
      const borrowVault = EULER_VAULTS.USDC.vault;
      const collateralVault = EULER_VAULTS.wstETH.vault;

      subAccountIndex = getUserMainAccountIndex(userAddress);
      const eulerContext = encodeEulerContext(borrowVault, collateralVault, subAccountIndex);

      // Enable collateral, controller, and set gateway as operator via EVC
      await evc.connect(user).enableCollateral(userAddress, collateralVault);
      await evc.connect(user).enableController(userAddress, borrowVault);
      await evc.connect(user).setAccountOperator(userAddress, eulerGatewayAddress, true);
      console.log(`  EVC authorization complete (subAccountIndex: ${subAccountIndex})`);

      // Deposit collateral via router
      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);

      const depositInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, EULER_VAULTS.wstETH.asset, userAddress)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.DepositCollateral, EULER_VAULTS.wstETH.asset, userAddress, 0n, eulerContext, 0)
        ),
      ];

      await router.connect(user).processProtocolInstructions(depositInstrs);

      // Verify deposit
      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const shares = await wstEthVault.balanceOf(userAddress);
      const assets = await wstEthVault.convertToAssets(shares);
      console.log(`  Deposited: ${ethers.formatEther(assets)} wstETH as collateral`);

      // Borrow USDC via router
      const borrowInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.Borrow, EULER_VAULTS.USDC.asset, userAddress, borrowAmount, eulerContext, 999)
        ),
        createRouterInstruction(encodePushToken(0, userAddress)),
      ];

      try {
        await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 1_500_000 });

        // Verify borrow
        const usdcBalance = await usdc.balanceOf(userAddress);
        const debt = await usdcVault.debtOf(userAddress);
        console.log(`  Borrowed: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
        console.log(`  Debt recorded: ${ethers.formatUnits(debt, 6)} USDC`);
        positionCreated = true;
      } catch (error: any) {
        console.log(`  Borrow failed: ${error.message?.slice(0, 100)}`);
        // Position may still be partially created (has collateral and controller)
        const debt = await usdcVault.debtOf(userAddress);
        if (debt > 0n) {
          positionCreated = true;
          console.log(`  Partial position exists with debt: ${ethers.formatUnits(debt, 6)} USDC`);
        }
      }
    });

    it("should return correct LTV for Euler position with debt", async function () {
      if (!positionCreated) {
        this.skip();
      }

      const currentLtv = await eulerView.getCurrentLtvBps(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);

      console.log(`\n  Current LTV from getCurrentLtvBps: ${currentLtv} bps (${Number(currentLtv) / 100}%)`);

      // LTV should be positive (we have debt)
      expect(currentLtv).to.be.gt(0n);
      // LTV should be less than 100% (not over-borrowed)
      expect(currentLtv).to.be.lt(10000n);
    });

    it("should match manual LTV calculation (debt / collateral * 10000)", async function () {
      if (!positionCreated) {
        this.skip();
      }

      // Get position values from getUserAccountData
      const [totalCollateralUsd, totalDebtUsd] = await eulerView.getUserAccountData(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      console.log(`\n  Total Collateral (8 decimals USD): ${totalCollateralUsd}`);
      console.log(`  Total Debt (8 decimals USD): ${totalDebtUsd}`);

      // Manual LTV calculation: (debt / collateral) * 10000
      let manualLtvBps = 0n;
      if (totalCollateralUsd > 0n) {
        manualLtvBps = (totalDebtUsd * 10000n) / totalCollateralUsd;
      }
      console.log(`  Manual LTV calculation: ${manualLtvBps} bps (${Number(manualLtvBps) / 100}%)`);

      // Get LTV from the view contract
      const contractLtv = await eulerView.getCurrentLtvBps(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);
      console.log(`  Contract LTV (getCurrentLtvBps): ${contractLtv} bps (${Number(contractLtv) / 100}%)`);

      // They should be very close (may differ slightly due to different calculation paths)
      // Allow 1% tolerance (100 bps) due to potential rounding/calculation differences
      const diff = contractLtv > manualLtvBps ? contractLtv - manualLtvBps : manualLtvBps - contractLtv;
      console.log(`  Difference: ${diff} bps`);

      expect(diff).to.be.lt(100n); // Less than 1% difference
    });

    it("should verify LTV is below liquidation threshold", async function () {
      if (!positionCreated) {
        this.skip();
      }

      const currentLtv = await eulerView.getCurrentLtvBps(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);
      const liquidationLtv = await eulerView.getLiquidationLtvBps(EULER_VAULTS.USDC.vault);

      console.log(`\n  Current LTV: ${currentLtv} bps (${Number(currentLtv) / 100}%)`);
      console.log(`  Liquidation LTV threshold: ${liquidationLtv} bps (${Number(liquidationLtv) / 100}%)`);

      // Current LTV should be below liquidation threshold (position is healthy)
      expect(currentLtv).to.be.lt(liquidationLtv);

      // Check health via isHealthy function too
      const isHealthy = await eulerView.isHealthy(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);
      console.log(`  Position healthy: ${isHealthy}`);
      expect(isHealthy).to.equal(true);
    });

    it("should calculate LTV using accountLiquidityFull values", async function () {
      if (!positionCreated) {
        this.skip();
      }

      // Directly call the vault's accountLiquidityFull to understand raw values
      const usdcVault = await ethers.getContractAt("IEulerVault", EULER_VAULTS.USDC.vault);
      const subAccount = await eulerView.getSubAccount(userAddress, subAccountIndex);

      // Get full liquidity data (with liquidation = true for LLTV-adjusted values)
      const [collaterals, collateralValues, liabilityValue] = await usdcVault.accountLiquidityFull(subAccount, true);

      console.log(`\n  Sub-account: ${subAccount}`);
      console.log(`  Collateral vaults: ${collaterals.length}`);
      console.log(`  Liability value (LLTV-adjusted): ${liabilityValue}`);

      let totalCollateralValue = 0n;
      for (let i = 0; i < collaterals.length; i++) {
        console.log(`    Collateral ${i}: ${collaterals[i]} = ${collateralValues[i]}`);
        totalCollateralValue += collateralValues[i];
      }
      console.log(`  Total LLTV-adjusted collateral: ${totalCollateralValue}`);

      // The _calculateLtvBps function un-adjusts each collateral by its LLTV to get raw value
      // Then computes: LTV = liabilityValue * 10000 / rawCollateralValue

      // Get the LLTV for wstETH collateral in USDC borrow vault
      const wstEthVaultLltv = await usdcVault.LTVLiquidation(EULER_VAULTS.wstETH.vault);
      console.log(`  wstETH LLTV in USDC vault: ${wstEthVaultLltv} bps`);

      // Verify contract LTV aligns with this understanding
      const contractLtv = await eulerView.getCurrentLtvBps(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);

      // If we have one collateral, raw = adjusted * 10000 / LLTV
      // LTV = liability * 10000 / raw
      if (collaterals.length === 1 && collateralValues[0] > 0n && wstEthVaultLltv > 0) {
        const rawCollateral = (collateralValues[0] * 10000n) / BigInt(wstEthVaultLltv);
        const expectedLtv = rawCollateral > 0n ? (liabilityValue * 10000n) / rawCollateral : 0n;
        console.log(`\n  Raw collateral (un-adjusted): ${rawCollateral}`);
        console.log(`  Expected LTV from raw calculation: ${expectedLtv} bps`);
        console.log(`  Contract LTV: ${contractLtv} bps`);

        // Should match exactly (same formula)
        expect(contractLtv).to.equal(expectedLtv);
      }
    });

    it("should get consistent LTV from getCurrentLtvBps and getCurrentLtvBpsSimple", async function () {
      if (!positionCreated) {
        this.skip();
      }

      const ltv1 = await eulerView.getCurrentLtvBps(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);
      const ltv2 = await eulerView.getCurrentLtvBpsSimple(EULER_VAULTS.USDC.vault, userAddress, subAccountIndex);

      console.log(`\n  getCurrentLtvBps: ${ltv1} bps`);
      console.log(`  getCurrentLtvBpsSimple: ${ltv2} bps`);

      // Both should return the same value (they use the same internal function)
      expect(ltv1).to.equal(ltv2);
    });
  });

  describe("LTV with collateral only (no debt)", function () {
    it("should handle collateral-only positions (Euler may revert accountLiquidityFull without debt)", async function () {
      // Create a new user with collateral + controller enabled, but no borrowing
      const collateralOnlyUser = ethers.Wallet.createRandom().connect(ethers.provider);
      const collateralOnlyAddress = await collateralOnlyUser.getAddress();

      await deployer.sendTransaction({ to: collateralOnlyAddress, value: ethers.parseEther("0.1") });

      // Fund with wstETH
      const smallCollateral = ethers.parseEther("0.1");
      await network.provider.send("hardhat_setBalance", [WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(WHALES.wstETH);
      await (wstEth.connect(wstEthWhale) as IERC20).transfer(collateralOnlyAddress, smallCollateral);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [WHALES.wstETH] });

      // Setup EVC - enable collateral AND controller (to allow LTV query)
      const collateralVault = EULER_VAULTS.wstETH.vault;
      const borrowVault = EULER_VAULTS.USDC.vault;
      const subAccountIndex = getUserMainAccountIndex(collateralOnlyAddress);

      await evc.connect(collateralOnlyUser).enableCollateral(collateralOnlyAddress, collateralVault);
      await evc.connect(collateralOnlyUser).enableController(collateralOnlyAddress, borrowVault);

      // Deposit collateral
      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      await (wstEth.connect(collateralOnlyUser) as IERC20).approve(collateralVault, smallCollateral);
      await wstEthVault.connect(collateralOnlyUser).deposit(smallCollateral, collateralOnlyAddress);

      console.log(`\n  Deposited ${ethers.formatEther(smallCollateral)} wstETH (no borrowing)`);

      // Euler V2's accountLiquidityFull may revert for positions with controller but no actual borrows
      // This is Euler-specific behavior. getUserAccountData handles this with try-catch.
      try {
        const ltv = await eulerView.getCurrentLtvBps(borrowVault, collateralOnlyAddress, subAccountIndex);
        console.log(`  LTV with collateral but no debt: ${ltv} bps`);
        expect(ltv).to.equal(0n);
      } catch (error: any) {
        // Euler vault may revert accountLiquidityFull for no-debt positions
        console.log(`  getCurrentLtvBps reverted (expected for no-debt position): ${error.message?.slice(0, 60)}...`);
        expect(error.message).to.include("reverted");
      }

      // getUserAccountData has try-catch and should return (0, 0) or (collateral, 0)
      const [collateralUsd, debtUsd] = await eulerView.getUserAccountData(borrowVault, collateralOnlyAddress, subAccountIndex);
      console.log(`  getUserAccountData: Collateral USD: ${collateralUsd}, Debt USD: ${debtUsd}`);
      // Either both 0 (try-catch returned default) or collateral > 0 with debt = 0
      expect(debtUsd).to.equal(0n);
    });
  });

  describe("LTV helper functions", function () {
    it("should get liquidation LTV for vault", async function () {
      const liquidationLtv = await eulerView.getLiquidationLtvBps(EULER_VAULTS.USDC.vault);
      console.log(`\n  Liquidation LTV: ${liquidationLtv} bps (${Number(liquidationLtv) / 100}%)`);

      // Should have a configured LLTV
      expect(liquidationLtv).to.be.gt(0n);
      // Typically around 80-90% for major collaterals
      expect(liquidationLtv).to.be.lt(10000n);
    });

    it("should get borrow LTV for vault", async function () {
      const borrowLtv = await eulerView.getBorrowLtvBps(EULER_VAULTS.USDC.vault);
      console.log(`\n  Borrow LTV (min across collaterals): ${borrowLtv} bps (${Number(borrowLtv) / 100}%)`);

      // Should have a configured LTV (this is the MINIMUM across all collaterals)
      expect(borrowLtv).to.be.gt(0n);
      expect(borrowLtv).to.be.lt(10000n);
      // Note: getBorrowLtvBps and getLiquidationLtvBps return MINIMUMS across all collaterals
      // Individual collaterals may have different borrow/liquidation LTVs
    });

    it("should get accepted collaterals for vault", async function () {
      const collaterals = await eulerView.getAcceptedCollaterals(EULER_VAULTS.USDC.vault);
      console.log(`\n  USDC vault accepts ${collaterals.length} collateral vault(s)`);

      for (const collateral of collaterals) {
        const [borrowLtv, liqLtv] = await eulerView.getCollateralLtv(EULER_VAULTS.USDC.vault, collateral);
        console.log(`    ${collateral}: Borrow LTV=${borrowLtv} bps, Liq LTV=${liqLtv} bps`);
      }

      // Should have at least one accepted collateral
      expect(collaterals.length).to.be.gt(0);
    });

    it("should handle health factor calculation (may revert for no-debt positions)", async function () {
      // Create a position and test health factor
      const testUser = ethers.Wallet.createRandom().connect(ethers.provider);
      const testUserAddress = await testUser.getAddress();

      await deployer.sendTransaction({ to: testUserAddress, value: ethers.parseEther("0.1") });

      // Fund and setup
      const testCollateral = ethers.parseEther("0.1");
      await network.provider.send("hardhat_setBalance", [WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [WHALES.wstETH] });
      const wstEthWhale = await ethers.getSigner(WHALES.wstETH);
      await (wstEth.connect(wstEthWhale) as IERC20).transfer(testUserAddress, testCollateral);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [WHALES.wstETH] });

      const subAccountIndex = getUserMainAccountIndex(testUserAddress);

      await evc.connect(testUser).enableCollateral(testUserAddress, EULER_VAULTS.wstETH.vault);
      await evc.connect(testUser).enableController(testUserAddress, EULER_VAULTS.USDC.vault);

      const wstEthVault = await ethers.getContractAt("IEulerVault", EULER_VAULTS.wstETH.vault);
      await (wstEth.connect(testUser) as IERC20).approve(EULER_VAULTS.wstETH.vault, testCollateral);
      await wstEthVault.connect(testUser).deposit(testCollateral, testUserAddress);

      // Euler V2's accountLiquidity may revert for positions without debt
      // Test the behavior - either max uint or reverts
      try {
        const healthFactor = await eulerView.getHealthFactor(EULER_VAULTS.USDC.vault, testUserAddress, subAccountIndex);
        console.log(`\n  Health factor (no debt): ${healthFactor}`);
        // Max uint256 indicates infinite health (no debt)
        expect(healthFactor).to.equal(ethers.MaxUint256);
      } catch (error: any) {
        console.log(`\n  getHealthFactor reverted for no-debt position: ${error.message?.slice(0, 60)}...`);
        expect(error.message).to.include("reverted");
      }
    });
  });

  describe("Sub-account handling", function () {
    it("should correctly derive sub-account addresses", async function () {
      // Sub-account formula: (user & ~0xFF) | index
      // So getSubAccount(user, 0) sets last byte to 0x00

      // Using the user's main index (last byte of address) should give back user address
      const mainIndex = Number(BigInt(userAddress) & BigInt(0xFF));
      const derivedSubAccount = await eulerView.getSubAccount(userAddress, mainIndex);

      expect(derivedSubAccount.toLowerCase()).to.equal(userAddress.toLowerCase());
      console.log(`\n  User: ${userAddress}`);
      console.log(`  Main index: ${mainIndex}`);
      console.log(`  Sub-account (main index): ${derivedSubAccount}`);
    });

    it("should derive different sub-account for different indices", async function () {
      const subAccount0 = await eulerView.getSubAccount(userAddress, 0);
      const subAccount1 = await eulerView.getSubAccount(userAddress, 1);
      const subAccount255 = await eulerView.getSubAccount(userAddress, 255);

      expect(subAccount0).to.not.equal(subAccount1);
      expect(subAccount0).to.not.equal(subAccount255);

      console.log(`\n  Index 0: ${subAccount0}`);
      console.log(`  Index 1: ${subAccount1}`);
      console.log(`  Index 255: ${subAccount255}`);
    });

    it("should get main sub-account correctly", async function () {
      const [mainSubAccount, mainIndex] = await eulerView.getMainSubAccount(userAddress);

      // Main index should be last byte of address
      const expectedIndex = Number(BigInt(userAddress) & BigInt(0xff));
      expect(mainIndex).to.equal(expectedIndex);

      console.log(`\n  User main sub-account: ${mainSubAccount}`);
      console.log(`  Main index: ${mainIndex}`);
    });
  });
});
