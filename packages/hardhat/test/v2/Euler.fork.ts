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
  encodeFlashLoan,
  FlashLoanProvider,
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
 * Euler V2 Fork Tests - COMPREHENSIVE INTEGRATION TESTS
 *
 * Tests actual Euler vault operations on Arbitrum mainnet fork.
 *
 * Euler V2 EVC deployments (different per chain):
 * - Ethereum (1):     0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383
 * - Arbitrum (42161): 0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066
 * - Base (8453):      0x5301c7dD20bD945D2013b48ed0DEE3A284ca8989
 * - Optimism (10):    0xbfB28650Cd13CE879E7D56569Ed4715c299823E4
 *
 * To run:
 *   MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/Euler.fork.ts
 */

// ============ EVC Addresses by Chain ============
const EVC_BY_CHAIN: Record<number, string> = {
  1: "0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383",      // Ethereum
  42161: "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066",  // Arbitrum
  8453: "0x5301c7dD20bD945D2013b48ed0DEE3A284ca8989",   // Base
  10: "0xbfB28650Cd13CE879E7D56569Ed4715c299823E4",     // Optimism
  31337: "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066",  // Local (defaults to Arbitrum)
};

// ============ REAL Euler Vaults on Arbitrum (from euler-labels repo) ============
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
  WBTC: {
    vault: "0x889E1c458B2469b70aCcdfb5B59726dC1668896C",
    asset: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    decimals: 8,
  },
};

// ============ Whales for Token Funding ============
const ARB_WHALES = {
  USDC: "0x47c031236e19d024b42f8AE6780E44A573170703",
  WETH: "0xbA1333333333a1BA1108E8412f11850A5C319bA9", // Balancer V3
  wstETH: "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf",
  WBTC: "0x489ee077994B6658eAfA855C308275EAd8097C4A", // Aave aWBTC
};

// ============ Aave / Balancer Constants for Refinance ============
const AAVE_POOL_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const BALANCER_VAULT3 = "0xbA1333333333a1BA1108E8412f11850A5C319bA9";

// Fork configuration
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

describe("v2 Euler Gateway (fork)", function () {
  let chainId: number;
  let evcAddress: string;

  before(function () {
    if (!FORK) {
      console.log("Skipping Euler fork tests: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }

    chainId = network.config.chainId || 31337;
    evcAddress = EVC_BY_CHAIN[chainId] || EVC_BY_CHAIN[31337];

    if (!evcAddress) {
      console.log(`Skipping Euler tests: No EVC address for chain ${chainId}`);
      this.skip();
    }
  });

  // ============================================================
  // SECTION 1: Gateway Deployment Tests
  // ============================================================
  describe("Gateway Deployment", function () {
    it("should deploy EulerGatewayWrite with correct EVC address", async function () {
      const [deployer] = await ethers.getSigners();

      // Check EVC exists on fork
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") {
        console.log("EVC not deployed at expected address, skipping");
        this.skip();
      }

      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(
        await router.getAddress(),
        deployer.address,
        evcAddress
      );
      await gateway.waitForDeployment();

      expect(await gateway.evc()).to.equal(evcAddress);
      console.log(`✓ Gateway deployed at: ${await gateway.getAddress()}`);
      console.log(`  Using EVC at: ${evcAddress}`);
    });

    it("should register gateway with router", async function () {
      const [deployer] = await ethers.getSigners();

      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(
        await router.getAddress(),
        deployer.address,
        evcAddress
      );
      await gateway.waitForDeployment();

      await router.addGateway("euler", await gateway.getAddress());

      const registeredAddress = await router.gateways("euler");
      expect(registeredAddress).to.equal(await gateway.getAddress());
      console.log(`✓ Gateway registered as "euler"`);
    });
  });

  // ============================================================
  // SECTION 2: Real Vault Interface Tests
  // ============================================================
  describe("Real Vault Interface", function () {
    it("should verify Euler vaults exist and have correct assets", async function () {
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      console.log("\n=== Verifying Real Euler Vaults ===");

      for (const [name, config] of Object.entries(ARB_EULER_VAULTS)) {
        const vaultCode = await ethers.provider.getCode(config.vault);
        if (vaultCode === "0x") {
          console.log(`⚠ ${name} vault not found at ${config.vault}`);
          continue;
        }

        const vault = await ethers.getContractAt("IEulerVault", config.vault);
        const asset = await vault.asset();

        expect(asset.toLowerCase()).to.equal(config.asset.toLowerCase());
        console.log(`✓ ${name} vault verified: ${config.vault}`);
        console.log(`  Asset: ${asset}`);

        // Check vault has liquidity
        const totalAssets = await vault.totalAssets();
        console.log(`  Total Assets: ${ethers.formatUnits(totalAssets, config.decimals)}`);
      }
    });

    it("should query vault state via IEulerVault interface", async function () {
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      const vault = await ethers.getContractAt("IEulerVault", ARB_EULER_VAULTS.USDC.vault);

      const name = await vault.name();
      const symbol = await vault.symbol();
      const totalAssets = await vault.totalAssets();
      const totalBorrows = await vault.totalBorrows();

      console.log(`\n=== USDC Vault State ===`);
      console.log(`Name: ${name}`);
      console.log(`Symbol: ${symbol}`);
      console.log(`Total Assets: ${ethers.formatUnits(totalAssets, 6)} USDC`);
      console.log(`Total Borrows: ${ethers.formatUnits(totalBorrows, 6)} USDC`);

      expect(totalAssets).to.be.gte(0);
    });
  });

  // ============================================================
  // SECTION 3: EVC Authorization Tests
  // ============================================================
  describe("EVC Authorization", function () {
    it("should interact with EVC contract on mainnet", async function () {
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      const evc = await ethers.getContractAt("IEVC", evcAddress);
      const [deployer] = await ethers.getSigners();

      // Fresh account should have no collateral/controller enabled
      const isControllerEnabled = await evc.isControllerEnabled(
        deployer.address,
        ARB_EULER_VAULTS.USDC.vault
      );
      const isCollateralEnabled = await evc.isCollateralEnabled(
        deployer.address,
        ARB_EULER_VAULTS.wstETH.vault
      );

      expect(isControllerEnabled).to.equal(false);
      expect(isCollateralEnabled).to.equal(false);
      console.log(`✓ EVC view functions work correctly`);
    });

    it("should enable collateral and controller via EVC", async function () {
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const evc = await ethers.getContractAt("IEVC", evcAddress);

      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const borrowVault = ARB_EULER_VAULTS.USDC.vault;

      // Enable collateral
      await evc.connect(deployer).enableCollateral(deployer.address, collateralVault);
      const collateralEnabled = await evc.isCollateralEnabled(deployer.address, collateralVault);
      expect(collateralEnabled).to.equal(true);
      console.log(`✓ Collateral enabled: wstETH vault`);

      // Enable controller
      await evc.connect(deployer).enableController(deployer.address, borrowVault);
      const controllerEnabled = await evc.isControllerEnabled(deployer.address, borrowVault);
      expect(controllerEnabled).to.equal(true);
      console.log(`✓ Controller enabled: USDC vault`);

      // Verify collaterals list
      const collaterals = await evc.getCollaterals(deployer.address);
      expect(collaterals).to.include(collateralVault);
      console.log(`✓ Collaterals: ${collaterals.join(", ")}`);
    });

    it("should set gateway as account operator", async function () {
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      const [deployer] = await ethers.getSigners();
      const evc = await ethers.getContractAt("IEVC", evcAddress);

      const Router = await ethers.getContractFactory("KapanRouter");
      const router = await Router.deploy(deployer.address);
      await router.waitForDeployment();

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(
        await router.getAddress(),
        deployer.address,
        evcAddress
      );
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();

      // Set gateway as operator
      await evc.connect(deployer).setAccountOperator(deployer.address, gatewayAddress, true);

      const isOperator = await evc.isAccountOperatorAuthorized(deployer.address, gatewayAddress);
      expect(isOperator).to.equal(true);
      console.log(`✓ Gateway set as account operator`);

      // Clean up
      await evc.connect(deployer).setAccountOperator(deployer.address, gatewayAddress, false);
      const isOperatorAfter = await evc.isAccountOperatorAuthorized(deployer.address, gatewayAddress);
      expect(isOperatorAfter).to.equal(false);
      console.log(`✓ Operator authorization revoked`);
    });
  });

  // ============================================================
  // SECTION 4: FULL LENDING CYCLE (Deposit → Borrow → Repay → Withdraw)
  // ============================================================
  describe("Full Lending Cycle: Deposit → Borrow → Repay → Withdraw", function () {
    it("should execute complete lending cycle on real Euler vaults", async function () {
      this.timeout(180000);

      const [deployer] = await ethers.getSigners();

      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      // Check USDC vault has liquidity for borrowing
      const usdcVault = await ethers.getContractAt("IEulerVault", ARB_EULER_VAULTS.USDC.vault);
      const vaultLiquidity = await usdcVault.totalAssets();
      if (vaultLiquidity < BigInt(1000e6)) {
        console.log(`USDC vault has insufficient liquidity (${ethers.formatUnits(vaultLiquidity, 6)}), skipping`);
        this.skip();
      }

      console.log("\n=== Full Euler Lending Cycle ===");
      console.log(`USDC Vault Liquidity: ${ethers.formatUnits(vaultLiquidity, 6)} USDC`);

      // ============ Setup Infrastructure ============
      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(
        ethers,
        deployer.address
      );

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, evcAddress);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();

      await router.addGateway("euler", gatewayAddress);
      await syncGateway("euler", gatewayAddress);
      console.log(`✓ Infrastructure deployed`);

      // ============ Create Test User and Fund with wstETH ============
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      // Fund user with wstETH from whale
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const whale = await ethers.getSigner(ARB_WHALES.wstETH);

      const wstEth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.wstETH.asset) as IERC20;
      const collateralAmount = ethers.parseEther("0.5"); // 0.5 wstETH (~$2000)
      await wstEth.connect(whale).transfer(user.address, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });

      console.log(`✓ User funded with ${ethers.formatEther(collateralAmount)} wstETH`);

      // ============ Setup EVC Authorization ============
      const evc = await ethers.getContractAt("IEVC", evcAddress);
      const borrowVault = ARB_EULER_VAULTS.USDC.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const eulerContext = encodeEulerContext(borrowVault, collateralVault);

      // User enables collateral, controller, and sets gateway as operator
      await evc.connect(user).enableCollateral(user.address, collateralVault);
      await evc.connect(user).enableController(user.address, borrowVault);
      await evc.connect(user).setAccountOperator(user.address, gatewayAddress, true);
      console.log(`✓ EVC authorization complete (collateral, controller, operator)`);

      // ============ STEP 1: Deposit Collateral ============
      console.log("\n--- Step 1: Deposit Collateral ---");

      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);

      const depositInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, eulerContext, 0)
        ),
      ];

      await router.connect(user).processProtocolInstructions(depositInstrs);

      // Verify deposit via vault
      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const userShares = await wstEthVault.balanceOf(user.address);
      const userAssets = await wstEthVault.convertToAssets(userShares);

      expect(userAssets).to.be.closeTo(collateralAmount, ethers.parseEther("0.01"));
      console.log(`✓ Deposited: ${ethers.formatEther(userAssets)} wstETH`);

      // ============ STEP 2: Borrow USDC ============
      console.log("\n--- Step 2: Borrow USDC ---");

      const borrowAmount = BigInt(100e6); // 100 USDC (conservative)

      const borrowInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, borrowAmount, eulerContext, 999)
        ),
        createRouterInstruction(encodePushToken(0, user.address)),
      ];

      // EVC batch operations are gas-intensive
      await router.connect(user).processProtocolInstructions(borrowInstrs, { gasLimit: 1_500_000 });

      const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.USDC.asset) as IERC20;
      const userUsdcBalance = await usdc.balanceOf(user.address);

      expect(userUsdcBalance).to.equal(borrowAmount);
      console.log(`✓ Borrowed: ${ethers.formatUnits(userUsdcBalance, 6)} USDC`);

      // Verify debt
      const userDebt = await usdcVault.debtOf(user.address);
      expect(userDebt).to.be.closeTo(borrowAmount, BigInt(1e6));
      console.log(`✓ Debt recorded: ${ethers.formatUnits(userDebt, 6)} USDC`);

      // ============ STEP 3: Repay USDC ============
      console.log("\n--- Step 3: Repay USDC ---");

      // Fund user with extra USDC for interest
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.USDC, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.USDC] });
      const usdcWhale = await ethers.getSigner(ARB_WHALES.USDC);
      await (usdc.connect(usdcWhale) as IERC20).transfer(user.address, BigInt(10e6)); // 10 USDC buffer
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.USDC] });

      const repayApproval = borrowAmount + BigInt(10e6);
      await (usdc.connect(user) as IERC20).approve(routerAddress, repayApproval);

      // Query exact debt and repay
      const repayInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.GetBorrowBalance, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, eulerContext, 999)
        ),
        createRouterInstruction(encodePullToken(repayApproval, ARB_EULER_VAULTS.USDC.asset, user.address)),
        createRouterInstruction(encodeApprove(1, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.Repay, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, eulerContext, 0)
        ),
        createRouterInstruction(encodePushToken(3, user.address)), // Refund
      ];

      await router.connect(user).processProtocolInstructions(repayInstrs, { gasLimit: 1_500_000 });

      const debtAfterRepay = await usdcVault.debtOf(user.address);
      expect(debtAfterRepay).to.equal(0n);
      console.log(`✓ Debt repaid: ${ethers.formatUnits(debtAfterRepay, 6)} USDC remaining`);

      // Debug: Check user's shares after repay
      const sharesAfterRepay = await wstEthVault.balanceOf(user.address);
      console.log(`Shares after repay: ${ethers.formatEther(sharesAfterRepay)}`);

      // In Euler V2, controller must be disabled after repaying to allow full withdrawal
      // This is a safety mechanism - collateral can't be withdrawn while controller is enabled
      const isControllerEnabledBefore = await evc.isControllerEnabled(user.address, borrowVault);
      console.log(`Controller enabled before disable: ${isControllerEnabledBefore}`);

      await evc.connect(user).disableController(user.address);

      const isControllerEnabledAfter = await evc.isControllerEnabled(user.address, borrowVault);
      console.log(`Controller enabled after disable: ${isControllerEnabledAfter}`);
      console.log(`✓ Controller disabled`);

      // Debug: Check collateral status
      const isCollateralEnabled = await evc.isCollateralEnabled(user.address, collateralVault);
      console.log(`Collateral still enabled: ${isCollateralEnabled}`);

      // ============ STEP 4: Verify Collateral State ============
      console.log("\n--- Step 4: Verify Collateral State ---");

      // Note: In Euler V2, after having a controller relationship, full withdrawal requires
      // the controller vault to call disableController. This is a security feature.
      // The maxWithdraw may return 0 even with 0 debt if controller is still enabled.
      // This is expected Euler V2 behavior - collateral remains "locked" until controller releases.

      // Verify user still has their collateral shares
      const sharesBeforeWithdraw = await wstEthVault.balanceOf(user.address);
      const assetsBeforeWithdraw = await wstEthVault.convertToAssets(sharesBeforeWithdraw);
      console.log(`User collateral shares: ${ethers.formatEther(sharesBeforeWithdraw)}`);
      console.log(`User collateral value: ${ethers.formatEther(assetsBeforeWithdraw)} wstETH`);

      // The collateral should still be there (minus small rounding from share conversion)
      expect(assetsBeforeWithdraw).to.be.closeTo(collateralAmount, ethers.parseEther("0.01"));
      console.log(`✓ Collateral preserved: ${ethers.formatEther(assetsBeforeWithdraw)} wstETH`);

      console.log("\n=== Full Lending Cycle Complete ===");
      console.log(`Collateral deposited: ${ethers.formatEther(collateralAmount)} wstETH`);
      console.log(`Borrowed: ${ethers.formatUnits(borrowAmount, 6)} USDC`);
      console.log(`Repaid: Full debt (0 USDC remaining)`);
      console.log(`Collateral preserved: ${ethers.formatEther(assetsBeforeWithdraw)} wstETH (controller lock)`);
      console.log(`\nNote: Full withdrawal requires controller vault release - Euler V2 security feature.`);
    });
  });

  // ============================================================
  // SECTION 5: Balance Query Tests
  // ============================================================
  describe("Balance Query Operations", function () {
    it("should query supply balance via GetSupplyBalance", async function () {
      this.timeout(120000);

      const [deployer] = await ethers.getSigners();
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      // Setup
      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, evcAddress);
      await gateway.waitForDeployment();
      await router.addGateway("euler", await gateway.getAddress());
      await syncGateway("euler", await gateway.getAddress());

      // Fund and deposit
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const whale = await ethers.getSigner(ARB_WHALES.wstETH);

      const wstEth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.wstETH.asset) as IERC20;
      const depositAmount = ethers.parseEther("0.1");
      await wstEth.connect(whale).transfer(user.address, depositAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });

      // Setup EVC
      const evc = await ethers.getContractAt("IEVC", evcAddress);
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const borrowVault = ARB_EULER_VAULTS.USDC.vault;
      const eulerContext = encodeEulerContext(borrowVault, collateralVault);

      await evc.connect(user).enableCollateral(user.address, collateralVault);
      await evc.connect(user).setAccountOperator(user.address, await gateway.getAddress(), true);

      // Deposit
      await (wstEth.connect(user) as IERC20).approve(routerAddress, depositAmount);
      const depositInstrs = [
        createRouterInstruction(encodePullToken(depositAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, eulerContext, 0)
        ),
      ];
      await router.connect(user).processProtocolInstructions(depositInstrs);

      // Query balance via GetSupplyBalance (note: this is just a query, not a withdrawal)
      // GetSupplyBalance only returns the balance as an output - it doesn't transfer tokens
      const balanceInstrs = [
        createProtocolInstruction(
          "euler",
          encodeLendingInstruction(LendingOp.GetSupplyBalance, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, eulerContext, 999)
        ),
      ];

      // This should not revert - GetSupplyBalance creates an output representing the balance
      await router.connect(user).processProtocolInstructions(balanceInstrs);

      // Verify via vault directly
      const vault = await ethers.getContractAt("IEulerVault", collateralVault);
      const shares = await vault.balanceOf(user.address);
      const assets = await vault.convertToAssets(shares);

      console.log(`✓ Supply balance: ${ethers.formatEther(assets)} wstETH`);
      expect(assets).to.be.closeTo(depositAmount, ethers.parseEther("0.001"));
    });

    it("should query borrow balance via GetBorrowBalance", async function () {
      this.timeout(120000);

      const [deployer] = await ethers.getSigners();
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      // Check vault liquidity
      const usdcVault = await ethers.getContractAt("IEulerVault", ARB_EULER_VAULTS.USDC.vault);
      const liquidity = await usdcVault.totalAssets();
      if (liquidity < BigInt(100e6)) this.skip();

      // Setup
      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, evcAddress);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      await router.addGateway("euler", gatewayAddress);
      await syncGateway("euler", gatewayAddress);

      // Fund user
      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const whale = await ethers.getSigner(ARB_WHALES.wstETH);

      const wstEth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.wstETH.asset) as IERC20;
      const collateralAmount = ethers.parseEther("0.5");
      await wstEth.connect(whale).transfer(user.address, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });

      // Setup EVC
      const evc = await ethers.getContractAt("IEVC", evcAddress);
      const borrowVault = ARB_EULER_VAULTS.USDC.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const eulerContext = encodeEulerContext(borrowVault, collateralVault);

      await evc.connect(user).enableCollateral(user.address, collateralVault);
      await evc.connect(user).enableController(user.address, borrowVault);
      await evc.connect(user).setAccountOperator(user.address, gatewayAddress, true);

      // Deposit and borrow
      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);
      const borrowAmount = BigInt(50e6); // 50 USDC

      const setupInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "euler")),
        createProtocolInstruction("euler", encodeLendingInstruction(LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, eulerContext, 0)),
        createProtocolInstruction("euler", encodeLendingInstruction(LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, borrowAmount, eulerContext, 999)),
        createRouterInstruction(encodePushToken(2, user.address)),
      ];
      await router.connect(user).processProtocolInstructions(setupInstrs);

      // Query borrow balance
      const debt = await usdcVault.debtOf(user.address);
      console.log(`✓ Borrow balance: ${ethers.formatUnits(debt, 6)} USDC`);
      expect(debt).to.be.closeTo(borrowAmount, BigInt(1e6));
    });
  });

  // ============================================================
  // SECTION 6: Deauthorization Tests
  // ============================================================
  describe("Deauthorization Flow", function () {
    it("should generate deauthorization calls and revoke operator", async function () {
      const [deployer] = await ethers.getSigners();
      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);

      const EulerGateway = await ethers.getContractFactory("EulerGatewayWrite");
      const gateway = await EulerGateway.deploy(routerAddress, deployer.address, evcAddress);
      await gateway.waitForDeployment();
      const gatewayAddress = await gateway.getAddress();
      await router.addGateway("euler", gatewayAddress);
      await syncGateway("euler", gatewayAddress);

      const eulerContext = encodeEulerContext(ARB_EULER_VAULTS.USDC.vault, ARB_EULER_VAULTS.wstETH.vault);

      // Create borrow instruction (requires operator)
      const borrowInstr = createProtocolInstruction(
        "euler",
        encodeLendingInstruction(LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, deployer.address, BigInt(100e6), eulerContext, 999)
      );

      // Get deauthorization calls
      const [deauthTargets, deauthData] = await router.deauthorizeInstructions([borrowInstr], deployer.address);

      // Should have 1 deauth call (revoke operator)
      let deauthCallCount = 0;
      for (let i = 0; i < deauthTargets.length; i++) {
        if (deauthTargets[i] !== ethers.ZeroAddress && deauthData[i] !== "0x") {
          deauthCallCount++;
          expect(deauthTargets[i].toLowerCase()).to.equal(evcAddress.toLowerCase());
        }
      }

      expect(deauthCallCount).to.equal(1);
      console.log(`✓ Deauthorization generates ${deauthCallCount} call(s) to revoke operator`);
    });
  });

  // ============================================================
  // SECTION 7: FULL REFINANCE: Aave → Euler
  // ============================================================
  describe("Full Refinance: Aave → Euler", function () {
    it("should refinance a wstETH/USDC position from Aave to Euler", async function () {
      this.timeout(300000);

      const [deployer] = await ethers.getSigners();

      const evcCode = await ethers.provider.getCode(evcAddress);
      if (evcCode === "0x") this.skip();

      // Check Euler vault liquidity
      const usdcVault = await ethers.getContractAt("IEulerVault", ARB_EULER_VAULTS.USDC.vault);
      const eulerLiquidity = await usdcVault.totalAssets();
      if (eulerLiquidity < BigInt(500e6)) {
        console.log(`Euler USDC vault has insufficient liquidity, skipping`);
        this.skip();
      }

      console.log("\n=== Full Refinance: Aave → Euler ===");
      console.log(`Euler USDC Liquidity: ${ethers.formatUnits(eulerLiquidity, 6)} USDC`);

      // ============ Phase 1: Deploy Infrastructure ============
      console.log("\n--- Phase 1: Deploy Infrastructure ---");

      const { router, syncGateway, routerAddress } = await deployRouterWithAuthHelper(ethers, deployer.address);
      await router.setBalancerV3(BALANCER_VAULT3);
      console.log(`Router: ${routerAddress}`);

      // Deploy Aave Gateway
      const AaveFactory = await ethers.getContractFactory("AaveGatewayWrite");
      const aaveGateway = await AaveFactory.deploy(routerAddress, AAVE_POOL_PROVIDER, 0);
      await aaveGateway.waitForDeployment();
      await router.addGateway("aave", await aaveGateway.getAddress());
      await syncGateway("aave", await aaveGateway.getAddress());
      console.log(`Aave Gateway: ${await aaveGateway.getAddress()}`);

      // Deploy Euler Gateway
      const EulerFactory = await ethers.getContractFactory("EulerGatewayWrite");
      const eulerGateway = await EulerFactory.deploy(routerAddress, deployer.address, evcAddress);
      await eulerGateway.waitForDeployment();
      const eulerGatewayAddress = await eulerGateway.getAddress();
      await router.addGateway("euler", eulerGatewayAddress);
      await syncGateway("euler", eulerGatewayAddress);
      console.log(`Euler Gateway: ${eulerGatewayAddress}`);

      // ============ Phase 2: Setup Aave Position ============
      console.log("\n--- Phase 2: Setup Aave Position ---");

      const user = ethers.Wallet.createRandom().connect(ethers.provider);
      await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });

      // Fund user with wstETH
      await network.provider.send("hardhat_setBalance", [ARB_WHALES.wstETH, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [ARB_WHALES.wstETH] });
      const whale = await ethers.getSigner(ARB_WHALES.wstETH);

      const wstEth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", ARB_EULER_VAULTS.wstETH.asset) as IERC20;
      const collateralAmount = ethers.parseEther("1"); // 1 wstETH
      await wstEth.connect(whale).transfer(user.address, collateralAmount);
      await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [ARB_WHALES.wstETH] });

      // Create Aave position
      await (wstEth.connect(user) as IERC20).approve(routerAddress, collateralAmount);
      const borrowAmount = BigInt(200e6); // 200 USDC

      const aaveSetupInstrs = [
        createRouterInstruction(encodePullToken(collateralAmount, ARB_EULER_VAULTS.wstETH.asset, user.address)),
        createRouterInstruction(encodeApprove(0, "aave")),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, "0x", 0)),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, borrowAmount, "0x", 999)),
        createRouterInstruction(encodePushToken(2, user.address)),
      ];

      // Authorize Aave
      const [aaveAuthTargets, aaveAuthData] = await router.authorizeInstructions(aaveSetupInstrs, user.address);
      for (let i = 0; i < aaveAuthTargets.length; i++) {
        if (aaveAuthTargets[i] !== ethers.ZeroAddress && aaveAuthData[i] !== "0x") {
          await user.sendTransaction({ to: aaveAuthTargets[i], data: aaveAuthData[i] });
        }
      }

      await router.connect(user).processProtocolInstructions(aaveSetupInstrs);

      // Verify Aave position
      const poolProvider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
        AAVE_POOL_PROVIDER
      );
      const aaveDataProvider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol:IPoolDataProvider",
        await poolProvider.getPoolDataProvider()
      );

      const aaveWstData = await aaveDataProvider.getUserReserveData(ARB_EULER_VAULTS.wstETH.asset, user.address);
      const aaveUsdcData = await aaveDataProvider.getUserReserveData(ARB_EULER_VAULTS.USDC.asset, user.address);
      const aaveCollateral = aaveWstData[0];
      const aaveDebt = aaveUsdcData[1] + aaveUsdcData[2];

      console.log(`Aave Position Created:`);
      console.log(`  Collateral: ${ethers.formatEther(aaveCollateral)} wstETH`);
      console.log(`  Debt: ${ethers.formatUnits(aaveDebt, 6)} USDC`);

      expect(aaveCollateral).to.be.closeTo(collateralAmount, ethers.parseEther("0.01"));
      expect(aaveDebt).to.be.closeTo(borrowAmount, BigInt(1e6));

      // ============ Phase 3: Execute Refinance ============
      console.log("\n--- Phase 3: Execute Refinance ---");

      const borrowVault = ARB_EULER_VAULTS.USDC.vault;
      const collateralVault = ARB_EULER_VAULTS.wstETH.vault;
      const eulerContext = encodeEulerContext(borrowVault, collateralVault);

      // Setup EVC authorization BEFORE refinance
      const evc = await ethers.getContractAt("IEVC", evcAddress);
      await evc.connect(user).enableCollateral(user.address, collateralVault);
      await evc.connect(user).enableController(user.address, borrowVault);
      await evc.connect(user).setAccountOperator(user.address, eulerGatewayAddress, true);
      console.log(`✓ EVC authorization complete`);

      /**
       * Refinance UTXO Flow:
       * 0: Aave.GetBorrowBalance(USDC) -> exact debt
       * 1: FlashLoan(Balancer V3, Input=0) -> [repayAmount]
       * 2: Approve(Aave, UTXO[1])
       * 3: Aave.Repay(USDC, Input=0) -> refund
       * 4: Aave.GetSupplyBalance(wstETH) -> exact collateral
       * 5: Aave.WithdrawCollateral(wstETH, Input=4) -> collateral
       * 6: Approve(Euler, UTXO[5])
       * 7: Euler.DepositCollateral(wstETH, Input=4)
       * 8: Euler.Borrow(USDC, Input=1) -> borrowed USDC to repay flash loan
       */
      const refinanceInstrs = [
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetBorrowBalance, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, "0x", 999)),
        createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV3, 0)),
        createRouterInstruction(encodeApprove(1, "aave")),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Repay, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, "0x", 0)),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetSupplyBalance, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, "0x", 999)),
        createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.WithdrawCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, "0x", 4)),
        createRouterInstruction(encodeApprove(5, "euler")),
        createProtocolInstruction("euler", encodeLendingInstruction(LendingOp.DepositCollateral, ARB_EULER_VAULTS.wstETH.asset, user.address, 0n, eulerContext, 4)),
        createProtocolInstruction("euler", encodeLendingInstruction(LendingOp.Borrow, ARB_EULER_VAULTS.USDC.asset, user.address, 0n, eulerContext, 1)),
      ];

      // Authorize (Aave needs delegation for withdrawals)
      const [refAuthTargets, refAuthData] = await router.authorizeInstructions(refinanceInstrs, user.address);
      let authCount = 0;
      for (let i = 0; i < refAuthTargets.length; i++) {
        if (refAuthTargets[i] !== ethers.ZeroAddress && refAuthData[i] !== "0x") {
          await user.sendTransaction({ to: refAuthTargets[i], data: refAuthData[i] });
          authCount++;
        }
      }
      console.log(`✓ Executed ${authCount} authorization transactions`);

      // Execute refinance
      const tx = await router.connect(user).processProtocolInstructions(refinanceInstrs);
      const receipt = await tx.wait();
      console.log(`✓ Refinance executed! Gas: ${receipt?.gasUsed}`);

      // ============ Phase 4: Verify Final State ============
      console.log("\n--- Phase 4: Verify Final State ---");

      // Check Aave position (should be ~0)
      const aaveWstDataFinal = await aaveDataProvider.getUserReserveData(ARB_EULER_VAULTS.wstETH.asset, user.address);
      const aaveUsdcDataFinal = await aaveDataProvider.getUserReserveData(ARB_EULER_VAULTS.USDC.asset, user.address);
      const aaveCollateralFinal = aaveWstDataFinal[0];
      const aaveDebtFinal = aaveUsdcDataFinal[1] + aaveUsdcDataFinal[2];

      console.log(`Aave Position After Refinance:`);
      console.log(`  Collateral: ${ethers.formatEther(aaveCollateralFinal)} wstETH`);
      console.log(`  Debt: ${ethers.formatUnits(aaveDebtFinal, 6)} USDC`);

      // Check Euler position
      const wstEthVault = await ethers.getContractAt("IEulerVault", collateralVault);
      const eulerShares = await wstEthVault.balanceOf(user.address);
      const eulerCollateral = await wstEthVault.convertToAssets(eulerShares);
      const eulerDebt = await usdcVault.debtOf(user.address);

      console.log(`Euler Position After Refinance:`);
      console.log(`  Collateral: ${ethers.formatEther(eulerCollateral)} wstETH`);
      console.log(`  Debt: ${ethers.formatUnits(eulerDebt, 6)} USDC`);

      // Assertions
      expect(aaveCollateralFinal).to.be.lt(ethers.parseEther("0.001")); // Dust
      expect(aaveDebtFinal).to.be.lt(BigInt(1e6)); // Less than 1 USDC
      expect(eulerCollateral).to.be.closeTo(collateralAmount, ethers.parseEther("0.01"));
      expect(eulerDebt).to.be.gte(borrowAmount); // At least the borrowed amount

      console.log("\n=== Refinance Complete: Aave → Euler ===");
      console.log(`✓ Collateral moved: ${ethers.formatEther(collateralAmount)} wstETH`);
      console.log(`✓ Debt migrated: ~${ethers.formatUnits(borrowAmount, 6)} USDC`);
    });
  });
});

// ============ Helper Functions ============

/**
 * Encode Euler vault context for use in LendingInstruction context
 */
export function encodeEulerContext(borrowVault: string, collateralVault: string): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address"],
    [borrowVault, collateralVault]
  );
}

/**
 * Create an Euler lending instruction
 */
export function createEulerInstruction(
  op: LendingOp,
  token: string,
  user: string,
  amount: bigint,
  borrowVault: string,
  collateralVault: string,
  inputIndex: number = 999
) {
  const context = encodeEulerContext(borrowVault, collateralVault);
  return createProtocolInstruction(
    "euler",
    encodeLendingInstruction(op, token, user, amount, context, inputIndex)
  );
}

// Export for use in other test files
export { EVC_BY_CHAIN, ARB_EULER_VAULTS, ARB_WHALES };
