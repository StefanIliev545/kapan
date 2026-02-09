import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, Signer } from "ethers";

/**
 * EulerGatewayView Fork Tests
 *
 * Tests the getUserAccountData function for ADL/AL triggers.
 * This function returns collateral and debt values in 8 decimals (Chainlink format).
 *
 * To run:
 *   MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/EulerGatewayView.fork.ts
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

/**
 * Get the sub-account index that produces user's own address.
 * In Euler V2, sub-account = user XOR index.
 * So index = 0 gives sub-account = user (the "main" account).
 */
function getMainSubAccountIndex(): number {
  return 0; // XOR with 0 = original address
}

describe("v2 EulerGatewayView (fork)", function () {
  this.timeout(180000);

  let deployer: Signer;
  let user: Signer;
  let userAddress: string;
  let eulerView: Contract;

  before(async function () {
    if (!FORK) {
      console.log("Skipping EulerGatewayView fork tests: MAINNET_FORKING_ENABLED is not true");
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

    // Fund user with ETH for gas
    await deployer.sendTransaction({ to: userAddress, value: ethers.parseEther("1") });

    console.log("\n=== EulerGatewayView Test Setup ===");
    console.log(`EulerGatewayView deployed at: ${await eulerView.getAddress()}`);
    console.log(`User: ${userAddress}`);
  });

  describe("getUserAccountData", function () {
    describe("with no position", function () {
      it("should return (0, 0) for user with no position", async function () {
        const subAccountIndex = getMainSubAccountIndex();

        const [totalCollateralUsd, totalDebtUsd] = await eulerView.getUserAccountData(
          EULER_VAULTS.USDC.vault,
          userAddress,
          subAccountIndex
        );

        expect(totalCollateralUsd).to.equal(0n);
        expect(totalDebtUsd).to.equal(0n);
        console.log(`  No position: collateral=${totalCollateralUsd}, debt=${totalDebtUsd}`);
      });

      it("should return (0, 0) for random address", async function () {
        const randomUser = ethers.Wallet.createRandom();
        const randomAddress = await randomUser.getAddress();
        const subAccountIndex = getMainSubAccountIndex();

        const result = await eulerView.getUserAccountData(
          EULER_VAULTS.USDC.vault,
          randomAddress,
          subAccountIndex
        );

        expect(result.totalCollateralUsd).to.equal(0n);
        expect(result.totalDebtUsd).to.equal(0n);
      });

      it("should return (0, 0) for different sub-account indices", async function () {
        // Test various sub-account indices
        for (const index of [0, 1, 127, 255]) {
          const result = await eulerView.getUserAccountData(EULER_VAULTS.USDC.vault, userAddress, index);

          expect(result.totalCollateralUsd).to.equal(0n);
          expect(result.totalDebtUsd).to.equal(0n);
        }
        console.log(`  All sub-account indices return (0, 0) for empty positions`);
      });
    });

    describe("sub-account calculation", function () {
      it("should derive correct sub-account address with XOR", async function () {
        const subAccountIndex = getMainSubAccountIndex();
        const derivedSubAccount = await eulerView.getSubAccount(userAddress, subAccountIndex);

        // When using index 0, sub-account should equal user address (XOR with 0)
        expect(derivedSubAccount.toLowerCase()).to.equal(userAddress.toLowerCase());
        console.log(`  User: ${userAddress}`);
        console.log(`  Sub-account (index 0): ${derivedSubAccount}`);
      });

      it("should derive different address for non-zero index", async function () {
        const derivedIndex0 = await eulerView.getSubAccount(userAddress, 0);
        const derivedIndex1 = await eulerView.getSubAccount(userAddress, 1);

        expect(derivedIndex0.toLowerCase()).to.not.equal(derivedIndex1.toLowerCase());
        console.log(`  Index 0: ${derivedIndex0}`);
        console.log(`  Index 1: ${derivedIndex1}`);
      });

      it("should share address prefix (first 19 bytes) across sub-accounts", async function () {
        const derived0 = await eulerView.getSubAccount(userAddress, 0);
        const derived1 = await eulerView.getSubAccount(userAddress, 1);
        const derived255 = await eulerView.getSubAccount(userAddress, 255);

        // First 38 hex chars (19 bytes) should be the same (case-insensitive)
        const prefix0 = derived0.slice(0, 40).toLowerCase();
        const prefix1 = derived1.slice(0, 40).toLowerCase();
        const prefix255 = derived255.slice(0, 40).toLowerCase();

        expect(prefix0).to.equal(prefix1);
        expect(prefix0).to.equal(prefix255);
        console.log(`  Shared prefix: ${prefix0}`);
      });
    });

    describe("vault queries", function () {
      it("should get liquidation LTV for vault", async function () {
        const liquidationLtv = await eulerView.getLiquidationLtvBps(EULER_VAULTS.USDC.vault);
        console.log(`  Liquidation LTV: ${liquidationLtv} bps (${Number(liquidationLtv) / 100}%)`);
        // Should return some value (may be 0 if no collaterals configured)
        expect(liquidationLtv).to.be.gte(0);
      });

      it("should get borrow LTV for vault", async function () {
        const borrowLtv = await eulerView.getBorrowLtvBps(EULER_VAULTS.USDC.vault);
        console.log(`  Borrow LTV: ${borrowLtv} bps (${Number(borrowLtv) / 100}%)`);
        expect(borrowLtv).to.be.gte(0);
      });

      it("should get accepted collaterals", async function () {
        const collaterals = await eulerView.getAcceptedCollaterals(EULER_VAULTS.USDC.vault);
        console.log(`  USDC vault accepts ${collaterals.length} collateral vault(s)`);
        expect(collaterals.length).to.be.gte(0);
      });

      it("should get vault asset", async function () {
        const asset = await eulerView.getVaultAsset(EULER_VAULTS.USDC.vault);
        expect(asset.toLowerCase()).to.equal(EULER_VAULTS.USDC.asset.toLowerCase());
      });
    });

    describe("main sub-account helper", function () {
      it("should get main sub-account correctly", async function () {
        const [mainSubAccount, mainIndex] = await eulerView.getMainSubAccount(userAddress);

        // Main index should be last byte of address
        const expectedIndex = Number(BigInt(userAddress) & BigInt(0xff));
        expect(mainIndex).to.equal(expectedIndex);

        // Main sub-account should be user XOR mainIndex
        const expectedSubAccount = await eulerView.getSubAccount(userAddress, mainIndex);
        expect(mainSubAccount.toLowerCase()).to.equal(expectedSubAccount.toLowerCase());

        console.log(`  User: ${userAddress}`);
        console.log(`  Main index: ${mainIndex}`);
        console.log(`  Main sub-account: ${mainSubAccount}`);
      });
    });
  });

  describe("edge cases", function () {
    it("should handle maximum sub-account index", async function () {
      const result = await eulerView.getUserAccountData(EULER_VAULTS.USDC.vault, userAddress, 255);

      expect(result.totalCollateralUsd).to.equal(0n);
      expect(result.totalDebtUsd).to.equal(0n);
    });

    it("should work with wstETH vault", async function () {
      const result = await eulerView.getUserAccountData(EULER_VAULTS.wstETH.vault, userAddress, 0);

      expect(result.totalCollateralUsd).to.equal(0n);
      expect(result.totalDebtUsd).to.equal(0n);
    });
  });
});
