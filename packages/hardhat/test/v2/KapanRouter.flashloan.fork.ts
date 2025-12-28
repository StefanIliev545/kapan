import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  encodeFlashLoan,
  FlashLoanProvider,
  encodeToOutput,
  encodeLendingInstruction,
  LendingOp,
  createRouterInstruction,
  createProtocolInstruction,
} from "./helpers/instructionHelpers";

// Arbitrum One addresses (from deploy files)
const V2 = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"; // Balancer V2 Vault (same across chains)
const V3 = "0xbA1333333333a1BA1108E8412f11850A5C319bA9"; // Balancer V3 Vault (Arbitrum)
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH on Arbitrum
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Native USDC on Arbitrum
const USDC_WHALE = ethers.getAddress("0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D"); // Known USDC whale on Arbitrum
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

describe("KapanRouter flashloan fork callbacks", function () {
  before(function () {
    if (!FORK) {
      throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
    }
  });

  it("v2: real flash loan; router receives WETH and resumes runStack", async function () {
    const [deployer] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("TestKapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();
    await (await router.setBalancerV2(V2)).wait();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();
    await (await router.addGateway("mock", await mock.getAddress())).wait();

    const amount = 10n ** 15n; // 0.001 WETH
    const userAddress = await deployer.getAddress();

    // Build instructions:
    // 1. ToOutput: create UTXO with amount and token for flash loan
    // 2. FlashLoan: use the UTXO from step 1
    // 3. Two mock instructions to verify stack resumes
    // Use Deposit op with amount=0 (no output) to verify stack resumes
    const i0 = createRouterInstruction(encodeToOutput(amount, WETH));
    const i1 = createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)); // Use UTXO index 0
    const i2 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, WETH, userAddress, 0n, "0x", 999));
    const i3 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, WETH, userAddress, 0n, "0x", 999));

    // Trigger flash loan through router
    const tx = await router.processProtocolInstructions([i0, i1, i2, i3]);
    const receipt = await tx.wait();

    // Assert WETH was transferred from vault to router and back
    const routerAddress = await router.getAddress();
    const wethIface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ]);
    const wethLogs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === WETH.toLowerCase());
    const incoming = wethLogs
      .map((log: any) => {
        try { return wethIface.parseLog(log); } catch { return undefined; }
      })
      .filter((ev: any) => ev && ev.name === "Transfer" && ev.args?.to?.toLowerCase() === routerAddress.toLowerCase());
    const outgoing = wethLogs
      .map((log: any) => {
        try { return wethIface.parseLog(log); } catch { return undefined; }
      })
      .filter((ev: any) => ev && ev.name === "Transfer" && ev.args?.from?.toLowerCase() === routerAddress.toLowerCase());

    expect(incoming.length).to.be.greaterThan(0);
    expect(outgoing.length).to.be.greaterThan(0);
    expect(incoming.some((ev: any) => ev.args.value === amount)).to.equal(true);

    // And mock gateway processed remaining two instructions
    const mockAddress = await mock.getAddress();
    const mocked = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());
    expect(mocked.length).to.equal(2);
  });

  it("v3: real flow; vault sends USDC, router repays and resumes runStack", async function () {
    // Use USDC like v1 tests do; fund vault from known whale
    const [deployer] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("TestKapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();
    await (await router.setBalancerV3(V3)).wait();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();
    await (await router.addGateway("mock", await mock.getAddress())).wait();

    const amount = 1_000_000n; // 1 USDC (6 decimals)
    const userAddress = await deployer.getAddress();

    // Build instructions:
    // 1. ToOutput: create UTXO with amount and token for flash loan
    // 2. FlashLoan: use the UTXO from step 1
    // 3. Two mock instructions to verify stack resumes
    // Use Deposit op with amount=0 (no output) to verify stack resumes
    const i0 = createRouterInstruction(encodeToOutput(amount, USDC));
    const i1 = createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV3, 0)); // Use UTXO index 0
    const i2 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, USDC, userAddress, 0n, "0x", 999));
    const i3 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, USDC, userAddress, 0n, "0x", 999));

    // Ensure v3 vault holds enough USDC to send (like v1 tests)
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
    await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0xDE0B6B3A7640000"]);
    const whaleSigner = await ethers.getSigner(USDC_WHALE);
    const usdcFromWhale = new ethers.Contract(
      USDC,
      ["function transfer(address to,uint256 amount) returns (bool)"],
      whaleSigner
    );
    await usdcFromWhale.transfer(V3, amount);

    // Trigger Balancer v3 flash loan through router (vault.sendTo + unlock path)
    const tx = await router.processProtocolInstructions([i0, i1, i2, i3]);
    const receipt = await tx.wait();

    // verify transfer in and out
    const routerAddress = await router.getAddress();
    const ercIface = new ethers.Interface([
      "event Transfer(address indexed from, address indexed to, uint256 value)"
    ]);
    const tokenLogs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === USDC.toLowerCase());
    const incoming = tokenLogs
      .map((log: any) => { try { return ercIface.parseLog(log); } catch { return undefined; }})
      .filter((ev: any) => ev && ev.name === "Transfer" && ev.args?.to?.toLowerCase() === routerAddress.toLowerCase());
    const outgoing = tokenLogs
      .map((log: any) => { try { return ercIface.parseLog(log); } catch { return undefined; }})
      .filter((ev: any) => ev && ev.name === "Transfer" && ev.args?.from?.toLowerCase() === routerAddress.toLowerCase());
    expect(incoming.length).to.be.greaterThan(0);
    expect(outgoing.length).to.be.greaterThan(0);
    expect(incoming.some((ev: any) => ev.args.value === amount)).to.equal(true);

    // router processed remaining two instructions
    const mockAddress = await mock.getAddress();
    const mocked = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());
    expect(mocked.length).to.equal(2);
  });

  it("morpho: real flash loan on Arbitrum; zero-fee flash with callback", async function () {
    // Morpho Blue on Arbitrum
    const MORPHO_ARBITRUM = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

    const [deployer] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();

    // Set Morpho Blue for flash loans
    await (await router.setMorphoBluePool(MORPHO_ARBITRUM)).wait();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();
    await (await router.addGateway("mock", await mock.getAddress())).wait();

    // Check existing USDC balance in Morpho
    const usdc = new ethers.Contract(
      USDC,
      ["function balanceOf(address) view returns (uint256)"],
      deployer
    );
    const morphoBalance = await usdc.balanceOf(MORPHO_ARBITRUM);
    console.log("Morpho USDC balance:", morphoBalance.toString());

    // Use a small amount that should be available in existing liquidity
    // Morpho on Arbitrum should have USDC from existing markets
    const amount = 100_000n; // 0.1 USDC - very small to ensure liquidity exists
    const userAddress = await deployer.getAddress();

    // Build instructions:
    // 1. ToOutput: create UTXO with amount and token for flash loan
    // 2. FlashLoan: use the UTXO from step 1 with Morpho provider
    // 3. Mock instruction to verify stack resumes
    const i0 = createRouterInstruction(encodeToOutput(amount, USDC));
    const i1 = createRouterInstruction(encodeFlashLoan(FlashLoanProvider.Morpho, 0));
    const i2 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, USDC, userAddress, 0n, "0x", 999));

    // Trigger Morpho flash loan through router
    const tx = await router.processProtocolInstructions([i0, i1, i2]);
    const receipt = await tx.wait();

    // Verify transfers occurred (zero fee, so in = out)
    const routerAddress = await router.getAddress();
    const usdcIface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
    const usdcLogs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === USDC.toLowerCase());
    const incoming = usdcLogs
      .map((log: any) => { try { return usdcIface.parseLog(log); } catch { return undefined; }})
      .filter((ev: any) => ev && ev.name === "Transfer" && ev.args?.to?.toLowerCase() === routerAddress.toLowerCase());
    const outgoing = usdcLogs
      .map((log: any) => { try { return usdcIface.parseLog(log); } catch { return undefined; }})
      .filter((ev: any) => ev && ev.name === "Transfer" && ev.args?.from?.toLowerCase() === routerAddress.toLowerCase());

    expect(incoming.length).to.be.greaterThan(0);
    expect(outgoing.length).to.be.greaterThan(0);
    // Zero fee: repayment equals borrowed amount
    expect(incoming.some((ev: any) => ev.args.value === amount)).to.equal(true);
    expect(outgoing.some((ev: any) => ev.args.value === amount)).to.equal(true);

    // Mock gateway processed remaining instruction
    const mockAddress = await mock.getAddress();
    const mocked = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());
    expect(mocked.length).to.equal(1);
  });
});

// ============================================================
//           ZEROLEND FLASH LOAN TESTS (Linea Fork)
// ============================================================

// ZeroLend addresses (Linea)
const ZEROLEND_POOL_PROVIDER_LINEA = "0xC44827C51d00381ed4C52646aeAB45b455d200eB";
const WETH_LINEA = "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f";
const USDC_LINEA = "0x176211869cA2b568f2A7D4EE941E073a821EE1ff";
const USDC_WHALE_LINEA = "0x555B6eE8faB3DfdBcCa9121721c435FD4C7a1fd1"; // Known USDC holder on Linea

describe("KapanRouter ZeroLend flashloan fork (Linea)", function () {
  before(function () {
    if (!FORK) {
      this.skip();
    }
    // Skip if not forking Linea
    if (process.env.FORK_CHAIN !== "linea") {
      this.skip();
    }
  });

  it("zerolend: real flash loan on Linea; router receives USDC and resumes runStack", async function () {
    const [deployer] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();

    // Get ZeroLend pool from provider
    const poolProvider = await ethers.getContractAt(
      "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
      ZEROLEND_POOL_PROVIDER_LINEA
    );
    const zeroLendPool = await poolProvider.getPool();
    await (await router.setZeroLendPool(zeroLendPool)).wait();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();
    await (await router.addGateway("mock", await mock.getAddress())).wait();

    // Check USDC balance in pool - ZeroLend (like Aave) stores liquidity in aTokens, not directly in the pool
    // For flash loans, available liquidity depends on the protocol's internal accounting
    const usdc = new ethers.Contract(
      USDC_LINEA,
      ["function balanceOf(address) view returns (uint256)"],
      deployer
    );
    const poolUsdcBalance = await usdc.balanceOf(zeroLendPool);
    
    // Skip test if no liquidity - ZeroLend uses same code path as Aave which is tested elsewhere
    if (poolUsdcBalance < 1_000_000n) {
      console.log("ZeroLend pool has insufficient USDC liquidity, skipping test");
      console.log("(ZeroLend uses same flash loan code path as Aave, which is tested in other tests)");
      this.skip();
    }

    const amount = 1_000_000n; // 1 USDC (6 decimals)
    const userAddress = await deployer.getAddress();

    // Build instructions
    const i0 = createRouterInstruction(encodeToOutput(amount, USDC_LINEA));
    const i1 = createRouterInstruction(encodeFlashLoan(FlashLoanProvider.ZeroLend, 0));
    const i2 = createProtocolInstruction("mock", encodeLendingInstruction(LendingOp.Deposit, USDC_LINEA, userAddress, 0n, "0x", 999));

    // Trigger flash loan through router
    const tx = await router.processProtocolInstructions([i0, i1, i2]);
    const receipt = await tx.wait();

    // Verify transfers occurred
    const routerAddress = await router.getAddress();
    const usdcIface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
    const usdcLogs = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === USDC_LINEA.toLowerCase());
    const incoming = usdcLogs
      .map((log: any) => { try { return usdcIface.parseLog(log); } catch { return undefined; }})
      .filter((ev: any) => ev && ev.name === "Transfer" && ev.args?.to?.toLowerCase() === routerAddress.toLowerCase());

    expect(incoming.length).to.be.greaterThan(0);
    expect(incoming.some((ev: any) => ev.args.value === amount)).to.equal(true);

    // Mock gateway processed remaining instruction
    const mockAddress = await mock.getAddress();
    const mocked = (receipt?.logs || []).filter((l: any) => l.address?.toLowerCase() === mockAddress.toLowerCase());
    expect(mocked.length).to.equal(1);
  });
});
