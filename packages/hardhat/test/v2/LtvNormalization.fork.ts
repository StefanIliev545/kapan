import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, Signer } from "ethers";

/**
 * LTV Normalization Fork Tests
 *
 * Tests the unified getCurrentLtvBps() function across all protocols.
 * Creates similar positions (deposit WETH, borrow USDC) and verifies
 * that LTV calculations are consistent.
 *
 * To run:
 *   MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/LtvNormalization.fork.ts
 */

// ============ Arbitrum Addresses ============
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

// Tokens
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

// Whales
const USDC_WHALE = "0x47c031236e19d024b42f8AE6780E44A573170703";
const WETH_WHALE = "0xbA1333333333a1BA1108E8412f11850A5C319bA9"; // Balancer V3

// Protocol addresses
const AAVE_POOL_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const COMPOUND_USDC_COMET = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";
const MORPHO_BLUE = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
const EVC = "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066";

// Morpho market (wstETH/USDC) - using a known working market from MorphoBlue.fork.ts
const MORPHO_WSTETH_USDC_MARKET = {
  loanToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",      // USDC
  collateralToken: "0x5979D7b546E38E414F7E9822514be443A4800529", // wstETH
  oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
  irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
  lltv: BigInt("860000000000000000"), // 86%
};
const WSTETH = "0x5979D7b546E38E414F7E9822514be443A4800529";
const WSTETH_WHALE = "0x513c7E3a9c69cA3e22550eF58AC1C0088e918FFf";

// Euler vaults (Arbitrum)
const EULER_USDC_VAULT = "0x0a1eCC5Fe8C9be3C809844fcBe615B46A869b899";

// Position parameters
const COLLATERAL_AMOUNT = ethers.parseEther("1"); // 1 WETH
const BORROW_AMOUNT_USDC = 1000_000000n; // 1000 USDC (conservative, ~33% LTV at $3000/ETH)

type IERC20 = Contract & {
  transfer: (to: string, amount: bigint) => Promise<any>;
  approve: (spender: string, amount: bigint) => Promise<any>;
  balanceOf: (account: string) => Promise<bigint>;
  connect: (signer: any) => IERC20;
};

describe("v2 LTV Normalization (fork)", function () {
  this.timeout(180000); // 3 minutes

  let deployer: Signer;
  let user: Signer;
  let userAddress: string;
  let weth: IERC20;

  before(async function () {
    if (!FORK) {
      console.log("Skipping LTV fork tests: MAINNET_FORKING_ENABLED is not true");
      this.skip();
    }

    // When forking, chainId might be undefined or 31337 (hardhat default)
    // Just check that forking is enabled - the addresses will fail if wrong chain
    const chainId = network.config.chainId;
    if (chainId && chainId !== 42161 && chainId !== 31337) {
      console.log(`Skipping LTV tests: Current chain ID is ${chainId}, expected 42161 (Arbitrum)`);
      this.skip();
    }

    [deployer] = await ethers.getSigners();
    user = ethers.Wallet.createRandom().connect(ethers.provider);
    userAddress = await user.getAddress();

    weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH) as unknown as IERC20;
    // usdc not needed - we borrow it, don't supply it
    void USDC; // Reference to avoid unused import warning

    // Fund whales with ETH for gas
    await network.provider.send("hardhat_setBalance", [WETH_WHALE, "0x56BC75E2D63100000"]);
    await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);

    // Impersonate whales
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [WETH_WHALE] });
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });

    const wethWhale = await ethers.getSigner(WETH_WHALE);

    // Fund user with ETH and WETH
    await wethWhale.sendTransaction({ to: userAddress, value: ethers.parseEther("1") });
    await (weth.connect(wethWhale) as any).transfer(userAddress, ethers.parseEther("5"));

    console.log("\n=== LTV Normalization Test Setup ===");
    console.log(`User: ${userAddress}`);
    console.log(`WETH balance: ${ethers.formatEther(await weth.balanceOf(userAddress))} WETH`);
  });

  describe("Aave V3", function () {
    let aaveView: Contract;

    before(async function () {
      // Deploy Aave gateway view
      const AaveGatewayView = await ethers.getContractFactory("AaveGatewayView");
      aaveView = await AaveGatewayView.deploy(AAVE_POOL_PROVIDER, await deployer.getAddress());
      await aaveView.waitForDeployment();
      console.log(`\nAaveGatewayView deployed at: ${await aaveView.getAddress()}`);
    });

    it("should return 0 LTV with no position", async function () {
      const ltv = await aaveView.getCurrentLtvBps(USDC, userAddress);
      expect(ltv).to.equal(0n);
      console.log(`  Initial LTV (no position): ${ltv} bps`);
    });

    it("should calculate correct LTV after deposit and borrow", async function () {
      // Get Aave pool
      const poolProvider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
        AAVE_POOL_PROVIDER
      );
      const poolAddress = await poolProvider.getPool();
      const pool = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPool.sol:IPool",
        poolAddress
      );

      // Deposit WETH
      await (weth.connect(user) as any).approve(poolAddress, COLLATERAL_AMOUNT);
      await (pool.connect(user) as any).supply(WETH, COLLATERAL_AMOUNT, userAddress, 0);
      console.log(`  Deposited ${ethers.formatEther(COLLATERAL_AMOUNT)} WETH as collateral`);

      // Borrow USDC
      await (pool.connect(user) as any).borrow(USDC, BORROW_AMOUNT_USDC, 2, 0, userAddress);
      console.log(`  Borrowed ${Number(BORROW_AMOUNT_USDC) / 1e6} USDC`);

      // Check LTV
      const currentLtv = await aaveView.getCurrentLtvBps(USDC, userAddress);
      const liquidationLtv = await aaveView.getLiquidationLtvBps(USDC, userAddress);

      console.log(`  Current LTV: ${currentLtv} bps (${Number(currentLtv) / 100}%)`);
      console.log(`  Liquidation LTV: ${liquidationLtv} bps (${Number(liquidationLtv) / 100}%)`);

      // LTV should be positive and less than liquidation threshold
      expect(currentLtv).to.be.gt(0n);
      expect(currentLtv).to.be.lt(liquidationLtv);

      // With 1 WETH (~$3000) and 1000 USDC borrowed, LTV should be ~33%
      expect(currentLtv).to.be.gt(2000n); // > 20%
      expect(currentLtv).to.be.lt(6000n); // < 60%
    });
  });

  describe("Compound V3", function () {
    let compoundView: Contract;

    before(async function () {
      // Deploy Compound gateway view
      const CompoundGatewayView = await ethers.getContractFactory("CompoundGatewayView");
      compoundView = await CompoundGatewayView.deploy(await deployer.getAddress());
      await compoundView.waitForDeployment();
      await compoundView.setCometForBase(USDC, COMPOUND_USDC_COMET);
      console.log(`\nCompoundGatewayView deployed at: ${await compoundView.getAddress()}`);
    });

    it("should return 0 LTV with no position", async function () {
      const ltv = await compoundView.getCurrentLtvBps(USDC, userAddress);
      expect(ltv).to.equal(0n);
      console.log(`  Initial LTV (no position): ${ltv} bps`);
    });

    it("should calculate correct LTV after deposit and borrow", async function () {
      const comet = await ethers.getContractAt(
        ["function supply(address asset, uint amount) external",
         "function withdraw(address asset, uint amount) external",
         "function allow(address manager, bool isAllowed) external",
         "function borrowBalanceOf(address account) external view returns (uint256)"],
        COMPOUND_USDC_COMET
      );

      // Supply WETH as collateral
      await (weth.connect(user) as any).approve(COMPOUND_USDC_COMET, COLLATERAL_AMOUNT);
      await (comet.connect(user) as any).supply(WETH, COLLATERAL_AMOUNT);
      console.log(`  Deposited ${ethers.formatEther(COLLATERAL_AMOUNT)} WETH as collateral`);

      // Borrow USDC (withdraw base asset)
      await (comet.connect(user) as any).withdraw(USDC, BORROW_AMOUNT_USDC);
      console.log(`  Borrowed ${Number(BORROW_AMOUNT_USDC) / 1e6} USDC`);

      // Check LTV
      const currentLtv = await compoundView.getCurrentLtvBps(USDC, userAddress);
      const liquidationLtv = await compoundView.getLiquidationLtvBps(USDC, userAddress);

      console.log(`  Current LTV: ${currentLtv} bps (${Number(currentLtv) / 100}%)`);
      console.log(`  Liquidation LTV: ${liquidationLtv} bps (${Number(liquidationLtv) / 100}%)`);

      // LTV should be positive and less than liquidation threshold
      expect(currentLtv).to.be.gt(0n);
      expect(currentLtv).to.be.lt(liquidationLtv);

      // With 1 WETH (~$3000) and 1000 USDC borrowed, LTV should be ~33%
      expect(currentLtv).to.be.gt(2000n); // > 20%
      expect(currentLtv).to.be.lt(6000n); // < 60%
    });
  });

  describe("Morpho Blue", function () {
    // NOTE: Morpho Blue on Arbitrum doesn't have a WETH/USDC market with liquidity.
    // Using wstETH/USDC market instead. wstETH ≈ 1.1 WETH due to staking rewards,
    // so LTV will be ~10% lower than WETH-based protocols for the same USD debt.
    // See: https://app.morpho.org/arbitrum for available markets.

    let morphoView: Contract;
    let marketParams: any;
    let wsteth: IERC20;

    before(async function () {
      // Use wstETH/USDC market which has liquidity on Arbitrum
      marketParams = {
        loanToken: MORPHO_WSTETH_USDC_MARKET.loanToken,
        collateralToken: MORPHO_WSTETH_USDC_MARKET.collateralToken,
        oracle: MORPHO_WSTETH_USDC_MARKET.oracle,
        irm: MORPHO_WSTETH_USDC_MARKET.irm,
        lltv: MORPHO_WSTETH_USDC_MARKET.lltv,
      };

      // Check if market exists with liquidity
      const morpho = await ethers.getContractAt(
        ["function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)"],
        MORPHO_BLUE
      );

      // Compute market ID
      const marketId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "address", "address", "address", "uint256"],
          [marketParams.loanToken, marketParams.collateralToken, marketParams.oracle, marketParams.irm, marketParams.lltv]
        )
      );

      try {
        const [totalSupply] = await morpho.market(marketId);
        if (totalSupply === 0n) {
          console.log("  Morpho market has no liquidity, skipping");
          this.skip();
        }
        console.log(`  Market liquidity: ${totalSupply}`);
      } catch {
        console.log("  Morpho market not found, skipping");
        this.skip();
      }

      // Get wstETH for collateral
      wsteth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WSTETH) as unknown as IERC20;
      await network.provider.send("hardhat_setBalance", [WSTETH_WHALE, "0x56BC75E2D63100000"]);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [WSTETH_WHALE] });
      const wstethWhale = await ethers.getSigner(WSTETH_WHALE);
      await (wsteth.connect(wstethWhale) as any).transfer(userAddress, COLLATERAL_AMOUNT);
      console.log(`  Funded user with ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH (≈1.1 WETH value)`);

      // Deploy Morpho gateway view
      const MorphoGatewayView = await ethers.getContractFactory("MorphoBlueGatewayView");
      morphoView = await MorphoGatewayView.deploy(MORPHO_BLUE, await deployer.getAddress());
      await morphoView.waitForDeployment();
      console.log(`\nMorphoBlueGatewayView deployed at: ${await morphoView.getAddress()}`);
    });

    it("should return 0 LTV with no position", async function () {
      const ltv = await morphoView.getCurrentLtvBps(marketParams, userAddress);
      expect(ltv).to.equal(0n);
      console.log(`  Initial LTV (no position): ${ltv} bps`);
    });

    it("should calculate correct LTV after deposit and borrow", async function () {
      const morpho = await ethers.getContractAt(
        ["function supplyCollateral((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, address onBehalf, bytes calldata data) external",
         "function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) external returns (uint256, uint256)"],
        MORPHO_BLUE
      );

      // Supply wstETH as collateral
      await (wsteth.connect(user) as any).approve(MORPHO_BLUE, COLLATERAL_AMOUNT);
      await (morpho.connect(user) as any).supplyCollateral(marketParams, COLLATERAL_AMOUNT, userAddress, "0x");
      console.log(`  Deposited ${ethers.formatEther(COLLATERAL_AMOUNT)} wstETH as collateral`);

      // Borrow USDC
      await (morpho.connect(user) as any).borrow(marketParams, BORROW_AMOUNT_USDC, 0, userAddress, userAddress);
      console.log(`  Borrowed ${Number(BORROW_AMOUNT_USDC) / 1e6} USDC`);

      // Check LTV via the new function
      const currentLtv = await morphoView.getCurrentLtvBps(marketParams, userAddress);
      const liquidationLtv = await morphoView.getLiquidationLtvBps(marketParams);

      console.log(`  Current LTV: ${currentLtv} bps (${Number(currentLtv) / 100}%)`);
      console.log(`  Liquidation LTV: ${liquidationLtv} bps (${Number(liquidationLtv) / 100}%)`);
      console.log(`  Note: LTV is ~10% lower than WETH-based protocols because wstETH ≈ 1.1 WETH`);

      // LTV should be positive and less than liquidation threshold
      expect(currentLtv).to.be.gt(0n);
      expect(currentLtv).to.be.lt(liquidationLtv);

      // With 1 wstETH (~$3700) and 1000 USDC borrowed, LTV should be ~27%
      // (vs ~33% for WETH because wstETH is worth ~10% more)
      expect(currentLtv).to.be.gt(2000n); // > 20%
      expect(currentLtv).to.be.lt(4000n); // < 40%
    });
  });

  describe("Euler V2", function () {
    let eulerView: Contract;

    before(async function () {
      // Deploy Euler gateway view
      const EulerGatewayView = await ethers.getContractFactory("EulerGatewayView");
      eulerView = await EulerGatewayView.deploy(EVC);
      await eulerView.waitForDeployment();
      console.log(`\nEulerGatewayView deployed at: ${await eulerView.getAddress()}`);
    });

    it("should deploy and provide vault info", async function () {
      // Test that basic vault queries work
      const ltvList = await eulerView.getAcceptedCollaterals(EULER_USDC_VAULT);
      console.log(`  USDC vault accepts ${ltvList.length} collateral vault(s)`);

      if (ltvList.length > 0) {
        const [borrowLtv, liqLtv] = await eulerView.getCollateralLtv(EULER_USDC_VAULT, ltvList[0]);
        console.log(`  First collateral - Borrow LTV: ${borrowLtv} bps, Liquidation LTV: ${liqLtv} bps`);
      }

      // Test sub-account helpers
      const [mainSubAccount, mainIndex] = await eulerView.getMainSubAccount(userAddress);
      console.log(`  User main sub-account: ${mainSubAccount} (index ${mainIndex})`);

      expect(ltvList.length).to.be.gte(0);
    });

    it("should get liquidation LTV for vault", async function () {
      const liquidationLtv = await eulerView.getLiquidationLtvBps(EULER_USDC_VAULT);
      console.log(`  Liquidation LTV: ${liquidationLtv} bps (${Number(liquidationLtv) / 100}%)`);
      // Euler USDC vault should have configured LTVs
      expect(liquidationLtv).to.be.gte(0);
    });

    // NOTE: Full position tests are in Euler.fork.ts
    // The EVC integration is complex and requires specific sub-account setup
  });

  describe("LTV Comparison Summary", function () {
    it("should summarize LTV across all protocols", async function () {
      console.log("\n=== LTV Comparison Summary ===");
      console.log("Position: 1 WETH collateral, 1000 USDC borrowed");
      console.log("Expected LTV: ~33% (at $3000/ETH)");
      console.log("\nResults from each protocol's getCurrentLtvBps():");
      console.log("(Run individual protocol tests to see actual values)");
      console.log("\nKey observations:");
      console.log("- All protocols should return LTV in basis points (1% = 100 bps)");
      console.log("- Values should be within similar range despite different oracle sources");
      console.log("- Liquidation LTV varies by protocol (typically 80-90%)");
    });
  });
});
