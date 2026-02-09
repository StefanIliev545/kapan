/* eslint-disable no-unused-expressions */
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { AutoLeverageTrigger, KapanViewRouter, EulerGatewayView } from "../../typechain-types";
import { Signer, Contract, AbiCoder } from "ethers";

const coder = AbiCoder.defaultAbiCoder();

/**
 * Fork tests for AutoLeverageTrigger with Euler V2 integration
 *
 * Tests the full integration path:
 * AutoLeverageTrigger -> KapanViewRouter -> EulerGatewayView -> Euler V2 vaults
 *
 * Run with:
 *   MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/AutoLeverageTrigger.Euler.fork.ts
 */

// ============ Fork Configuration ============
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// ============ Arbitrum Addresses ============
const EVC = "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066";

// Euler vaults on Arbitrum (from euler-labels repo)
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
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";

// Protocol ID (bytes4)
const EULER_V2 = ethers.keccak256(ethers.toUtf8Bytes("euler-v2")).slice(0, 10);

// Type helper for ERC20
type IERC20 = Contract & {
  transfer: (to: string, amount: bigint) => Promise<any>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  balanceOf: (account: string) => Promise<bigint>;
  connect: (signer: any) => IERC20;
};

/**
 * Encode Euler context for ViewRouter/Trigger
 * Format: (borrowVault, collateralVaults[], subAccountIndex)
 */
function encodeEulerContext(borrowVault: string, collateralVault: string, subAccountIndex: number = 0): string {
  return coder.encode(
    ["address", "address[]", "uint8"],
    [borrowVault, [collateralVault], subAccountIndex]
  );
}

/**
 * Get the user's "main" sub-account index (last byte of address)
 */
function getUserMainAccountIndex(user: string): number {
  return Number(BigInt(user) & BigInt(0xFF));
}

describe("AutoLeverageTrigger - Euler V2 Integration", function () {
  this.timeout(180000);

  // Test amounts - create a LOW LTV position (~30%) for leverage testing
  const COLLATERAL_AMOUNT = ethers.parseEther("1"); // 1 wstETH (~$3700)
  const BORROW_AMOUNT = 1100_000000n; // 1100 USDC (~30% LTV)

  // Contracts & Signers
  let autoLeverageTrigger: AutoLeverageTrigger;
  let viewRouter: KapanViewRouter;
  let eulerGatewayView: EulerGatewayView;
  let deployer: Signer;
  let user: Signer;
  let userAddress: string;
  let wsteth: IERC20;

  // EVC and vault contracts
  let evc: Contract;
  let usdcVault: Contract;
  let wstEthVault: Contract;

  // Context for trigger params
  let eulerContext: string;
  let subAccountIndex: number;

  before(async function () {
    if (!FORK) {
      console.log("Skipping AutoLeverageTrigger Euler tests: MAINNET_FORKING_ENABLED is not true");
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

    // Fund user with ETH for gas
    await deployer.sendTransaction({ to: userAddress, value: ethers.parseEther("1") });

    // Get EVC contract
    evc = await ethers.getContractAt("IEVC", EVC);

    // Get vault contracts
    usdcVault = await ethers.getContractAt("IEulerVault", EULER_VAULTS.USDC.vault);
    wstEthVault = await ethers.getContractAt("IEulerVault", EULER_VAULTS.wstETH.vault);

    // Check USDC vault has liquidity
    const vaultLiquidity = await usdcVault.totalAssets();
    if (vaultLiquidity < BigInt(2000e6)) {
      console.log(`USDC vault has insufficient liquidity (${ethers.formatUnits(vaultLiquidity, 6)}), skipping`);
      this.skip();
    }

    // Deploy EulerGatewayView
    const EulerGatewayViewFactory = await ethers.getContractFactory("EulerGatewayView");
    eulerGatewayView = await EulerGatewayViewFactory.deploy(EVC) as EulerGatewayView;
    await eulerGatewayView.waitForDeployment();

    // Deploy KapanViewRouter
    const ViewRouterFactory = await ethers.getContractFactory("KapanViewRouter");
    viewRouter = await ViewRouterFactory.deploy(await deployer.getAddress()) as KapanViewRouter;
    await viewRouter.waitForDeployment();

    // Set Euler gateway in router
    await viewRouter.setGateway("euler-v2", await eulerGatewayView.getAddress());

    // Deploy AutoLeverageTrigger
    const AutoLeverageTriggerFactory = await ethers.getContractFactory("AutoLeverageTrigger");
    autoLeverageTrigger = await AutoLeverageTriggerFactory.deploy(await viewRouter.getAddress()) as AutoLeverageTrigger;
    await autoLeverageTrigger.waitForDeployment();

    // Fund user with wstETH from whale
    await network.provider.send("hardhat_setBalance", [WSTETH_WHALE, "0x56BC75E2D63100000"]);
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [WSTETH_WHALE] });
    const whaleSigner = await ethers.getSigner(WSTETH_WHALE);

    wsteth = await ethers.getContractAt(
      "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
      EULER_VAULTS.wstETH.asset
    ) as IERC20;
    await wsteth.connect(whaleSigner).transfer(userAddress, COLLATERAL_AMOUNT);
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [WSTETH_WHALE] });

    // Setup EVC authorization
    const borrowVault = EULER_VAULTS.USDC.vault;
    const collateralVault = EULER_VAULTS.wstETH.vault;

    // Use user's natural sub-account index so sub-account = user.address
    subAccountIndex = getUserMainAccountIndex(userAddress);
    eulerContext = encodeEulerContext(borrowVault, collateralVault, subAccountIndex);

    // Enable collateral, controller, for user
    await evc.connect(user).enableCollateral(userAddress, collateralVault);
    await evc.connect(user).enableController(userAddress, borrowVault);

    // Deposit collateral directly (not through router for simplicity)
    await wsteth.connect(user).approve(collateralVault, COLLATERAL_AMOUNT);
    await wstEthVault.connect(user).deposit(COLLATERAL_AMOUNT, userAddress);

    // Borrow USDC via EVC call (required in Euler V2)
    // Encode the borrow call: borrow(uint256 amount, address receiver)
    const borrowCalldata = usdcVault.interface.encodeFunctionData("borrow", [BORROW_AMOUNT, userAddress]);
    await evc.connect(user).call(
      EULER_VAULTS.USDC.vault,  // target contract
      userAddress,              // on behalf of account
      0,                        // ETH value
      borrowCalldata            // calldata
    );

    console.log("\n=== AutoLeverageTrigger Euler Test Setup Complete ===");
    console.log(`  EulerGatewayView: ${await eulerGatewayView.getAddress()}`);
    console.log(`  KapanViewRouter: ${await viewRouter.getAddress()}`);
    console.log(`  AutoLeverageTrigger: ${await autoLeverageTrigger.getAddress()}`);
    console.log(`  User: ${userAddress}`);
    console.log(`  Sub-account index: ${subAccountIndex}`);
    console.log(`  Collateral: ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH`);
    console.log(`  Debt: ${ethers.formatUnits(BORROW_AMOUNT, 6)} USDC`);
  });

  describe("Full Integration: AutoLeverageTrigger -> KapanViewRouter -> EulerGatewayView", function () {
    it("should verify Euler position was created with low LTV (~30%)", async function () {
      // Check position via EulerGatewayView
      const ltvBps = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      console.log(`  Position LTV: ${ltvBps.toString()} bps (${Number(ltvBps) / 100}%)`);

      // Should have low LTV (position is under-leveraged)
      // ~$3700 collateral (1 wstETH), ~$1100 debt = ~30% LTV
      expect(ltvBps).to.be.gt(2000); // > 20%
      expect(ltvBps).to.be.lt(5000); // < 50%
    });

    it("should return TRUE from shouldExecute() when LTV < triggerLtvBps (60%)", async function () {
      // Set trigger threshold at 60% - since our position is ~30%, trigger should fire
      const triggerLtvBps = 6000n; // 60%
      const targetLtvBps = 7000n; // 70%

      const params = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: EULER_VAULTS.wstETH.asset, // Token to BUY
        debtToken: EULER_VAULTS.USDC.asset, // Token to SELL (borrow)
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, userAddress);

      console.log(`  triggerLtvBps: ${triggerLtvBps} (60%)`);
      console.log(`  shouldExecute: ${shouldExec}`);
      console.log(`  reason: ${reason}`);

      // Position is ~30%, trigger is 60%, so LTV < trigger => should execute
      expect(shouldExec).to.be.true;
      expect(reason).to.equal("LTV below threshold - under-leveraged");
    });

    it("should return non-zero amounts from calculateExecution()", async function () {
      // Get current LTV
      const currentLtv = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      // Set trigger to fire and target higher
      const triggerLtvBps = 6000n; // 60% (above current ~30%)
      const targetLtvBps = 7000n; // 70%

      const params = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: EULER_VAULTS.wstETH.asset,
        debtToken: EULER_VAULTS.USDC.asset,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Current LTV: ${currentLtv.toString()} bps (${Number(currentLtv) / 100}%)`);
      console.log(`  Target LTV: ${targetLtvBps.toString()} bps (70%)`);
      console.log(`  sellAmount (USDC to borrow): ${ethers.formatUnits(sellAmount, 6)} USDC`);
      console.log(`  minBuyAmount (wstETH expected): ${ethers.formatEther(minBuyAmount)} wstETH`);

      // Sell amount should be positive (need to borrow and sell debt)
      expect(sellAmount).to.be.gt(0);

      // Min buy should be positive (will receive collateral tokens)
      expect(minBuyAmount).to.be.gt(0);

      // Verify amounts are reasonable
      // To go from ~30% to 70% LTV with ~$3700 collateral:
      // Current debt: ~$1100
      // Target debt at 70% of current collateral: $3700 * 0.7 = $2590
      // But with leverage formula: ΔD = (targetLTV × C - D) / (1 - targetLTV)
      // This accounts for collateral increasing, so amounts are higher
      expect(sellAmount).to.be.gt(1000_000000n); // > $1000 USDC
      expect(sellAmount).to.be.lt(10000_000000n); // < $10000 USDC (sanity check)

      // Verify the ratio makes sense (wstETH ~$3700, so sellAmount / 3700 ≈ minBuyAmount)
      const effectiveRate = (sellAmount * BigInt(1e18)) / minBuyAmount;
      console.log(`  Effective rate: ${ethers.formatUnits(effectiveRate, 6)} USDC per wstETH`);

      // Should be between $1000 and $10000 per wstETH (sanity check)
      expect(effectiveRate).to.be.gt(1000n * BigInt(1e6));
      expect(effectiveRate).to.be.lt(10000n * BigInt(1e6));
    });

    it("should return FALSE when LTV >= triggerLtvBps", async function () {
      // Get current LTV
      const currentLtv = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      // Set trigger BELOW current LTV so it doesn't fire
      const triggerLtvBps = currentLtv - 500n; // 5% below current

      const params = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: currentLtv,
        collateralToken: EULER_VAULTS.wstETH.asset,
        debtToken: EULER_VAULTS.USDC.asset,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, userAddress);

      console.log(`  Current LTV: ${currentLtv.toString()} bps`);
      console.log(`  triggerLtvBps: ${triggerLtvBps.toString()} bps`);
      console.log(`  shouldExecute: ${shouldExec}`);
      console.log(`  reason: ${reason}`);

      expect(shouldExec).to.be.false;
      expect(reason).to.equal("LTV above threshold");
    });

    it("should return 0 amounts when target LTV <= current LTV", async function () {
      const currentLtv = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      // Set target BELOW current LTV
      const params = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: currentLtv - 100n, // Target below current
        collateralToken: EULER_VAULTS.wstETH.asset,
        debtToken: EULER_VAULTS.USDC.asset,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      expect(sellAmount).to.equal(0n);
      expect(minBuyAmount).to.equal(0n);
    });
  });

  describe("ViewRouter Integration", function () {
    it("should get position value via ViewRouter.getPositionValue()", async function () {
      const [collateralValueUsd, debtValueUsd] = await viewRouter.getPositionValue(
        EULER_V2,
        userAddress,
        eulerContext
      );

      console.log(`  Collateral value: $${ethers.formatUnits(collateralValueUsd, 8)}`);
      console.log(`  Debt value: $${ethers.formatUnits(debtValueUsd, 8)}`);

      // Collateral should be > 0 (we deposited 1 wstETH)
      expect(collateralValueUsd).to.be.gt(0);

      // Debt should be > 0 (we borrowed USDC)
      expect(debtValueUsd).to.be.gt(0);

      // Verify LTV calculation from position values
      const calculatedLtv = (debtValueUsd * 10000n) / collateralValueUsd;
      console.log(`  Calculated LTV from values: ${Number(calculatedLtv) / 100}%`);

      // Should roughly match the gateway's getCurrentLtvBps
      const gatewayLtv = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );
      console.log(`  Gateway LTV: ${Number(gatewayLtv) / 100}%`);

      // Should be within 5% of each other
      const diff = calculatedLtv > gatewayLtv ? calculatedLtv - gatewayLtv : gatewayLtv - calculatedLtv;
      expect(diff).to.be.lt(500n); // Within 5%
    });

    it("should get current LTV via ViewRouter.getCurrentLtv()", async function () {
      const ltvBps = await viewRouter.getCurrentLtv(EULER_V2, userAddress, eulerContext);

      console.log(`  ViewRouter LTV: ${ltvBps.toString()} bps (${Number(ltvBps) / 100}%)`);

      // Should match EulerGatewayView
      const directLtv = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      expect(ltvBps).to.equal(directLtv);
    });
  });

  describe("Edge cases", function () {
    it("should return (0, 0) for user with no position", async function () {
      const randomAddress = ethers.Wallet.createRandom().address;

      const params = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: 6000n,
        targetLtvBps: 7000n,
        collateralToken: EULER_VAULTS.wstETH.asset,
        debtToken: EULER_VAULTS.USDC.asset,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);

      // shouldExecute should return false with "No position"
      const [shouldExec, reason] = await autoLeverageTrigger.shouldExecute(staticData, randomAddress);
      expect(shouldExec).to.be.false;
      expect(reason).to.equal("No position");

      // calculateExecution should return (0, 0)
      const [sellAmount, minBuyAmount] = await autoLeverageTrigger.calculateExecution(staticData, randomAddress);
      expect(sellAmount).to.equal(0n);
      expect(minBuyAmount).to.equal(0n);
    });

    it("should handle chunking correctly", async function () {
      const triggerLtvBps = 6000n;
      const targetLtvBps = 7000n;

      const paramsFullAmount = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: triggerLtvBps,
        targetLtvBps: targetLtvBps,
        collateralToken: EULER_VAULTS.wstETH.asset,
        debtToken: EULER_VAULTS.USDC.asset,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const paramsChunked = {
        ...paramsFullAmount,
        numChunks: 4,
      };

      const staticDataFull = await autoLeverageTrigger.encodeTriggerParams(paramsFullAmount);
      const staticDataChunked = await autoLeverageTrigger.encodeTriggerParams(paramsChunked);

      const [sellAmountFull] = await autoLeverageTrigger.calculateExecution(staticDataFull, userAddress);
      const [sellAmountChunked] = await autoLeverageTrigger.calculateExecution(staticDataChunked, userAddress);

      console.log(`  Full amount: ${ethers.formatUnits(sellAmountFull, 6)} USDC`);
      console.log(`  1/4 amount (4 chunks): ${ethers.formatUnits(sellAmountChunked, 6)} USDC`);

      // Should be 1/4 (accounting for integer division)
      expect(sellAmountChunked).to.equal(sellAmountFull / 4n);
    });

    it("should verify trigger name", async function () {
      const name = await autoLeverageTrigger.triggerName();
      expect(name).to.equal("AutoLeverage");
    });

    it("should verify EULER_V2 protocol ID constant", async function () {
      const expectedId = ethers.keccak256(ethers.toUtf8Bytes("euler-v2")).slice(0, 10);
      const actualId = await autoLeverageTrigger.EULER_V2();
      expect(actualId).to.equal(expectedId);
    });
  });

  describe("Safety: Liquidation prevention", function () {
    it("should verify position is within safe bounds", async function () {
      // Get liquidation LTV from Euler
      const liquidationLtv = await eulerGatewayView.getLiquidationLtvBps(EULER_VAULTS.USDC.vault);
      const currentLtv = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      console.log(`  Current LTV: ${Number(currentLtv) / 100}%`);
      console.log(`  Liquidation LTV: ${Number(liquidationLtv) / 100}%`);

      // Current position should be well below liquidation
      expect(currentLtv).to.be.lt(liquidationLtv);

      // Safety buffer should be > 20% (we're at ~30%, liquidation is likely ~85%)
      const safetyBuffer = liquidationLtv - currentLtv;
      console.log(`  Safety buffer: ${Number(safetyBuffer) / 100}%`);
      expect(safetyBuffer).to.be.gt(2000n); // > 20%
    });

    it("should calculate safe leverage target", async function () {
      const liquidationLtv = await eulerGatewayView.getLiquidationLtvBps(EULER_VAULTS.USDC.vault);
      const currentLtv = await eulerGatewayView.getCurrentLtvBps(
        EULER_VAULTS.USDC.vault,
        userAddress,
        subAccountIndex
      );

      // Safe target: liquidation - 15% buffer
      const safeTargetLtv = liquidationLtv - 1500n;

      console.log(`  Safe target LTV: ${Number(safeTargetLtv) / 100}%`);
      console.log(`  Liquidation LTV: ${Number(liquidationLtv) / 100}%`);

      const params = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: currentLtv + 100n,
        targetLtvBps: safeTargetLtv,
        collateralToken: EULER_VAULTS.wstETH.asset,
        debtToken: EULER_VAULTS.USDC.asset,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);
      const [sellAmount] = await autoLeverageTrigger.calculateExecution(staticData, userAddress);

      console.log(`  Safe leverage amount: ${ethers.formatUnits(sellAmount, 6)} USDC`);

      // Amount should be positive
      expect(sellAmount).to.be.gt(0);

      // Verify target is well below liquidation threshold
      expect(safeTargetLtv).to.be.lt(liquidationLtv - 500n);
    });
  });

  describe("isComplete behavior", function () {
    it("should always return false (continuous trigger)", async function () {
      const params = {
        protocolId: EULER_V2,
        protocolContext: eulerContext,
        triggerLtvBps: 6000n,
        targetLtvBps: 7000n,
        collateralToken: EULER_VAULTS.wstETH.asset,
        debtToken: EULER_VAULTS.USDC.asset,
        collateralDecimals: 18,
        debtDecimals: 6,
        maxSlippageBps: 100,
        numChunks: 1,
      };

      const staticData = await autoLeverageTrigger.encodeTriggerParams(params);

      // isComplete should always return false for AutoLeverage
      // (relies on maxIterations for termination)
      const complete = await autoLeverageTrigger.isComplete(staticData, userAddress, 1);
      expect(complete).to.be.false;

      // Even after many iterations
      const completeAfterMany = await autoLeverageTrigger.isComplete(staticData, userAddress, 100);
      expect(completeAfterMany).to.be.false;
    });
  });
});
