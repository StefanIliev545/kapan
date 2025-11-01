import { expect } from "chai";
import { ethers, network } from "hardhat";

const V2 = (process.env.BALANCER_VAULT2 || "").toLowerCase();
const V3 = (process.env.BALANCER_VAULT3 || "").toLowerCase();
const WETH = (process.env.WETH || process.env.WETH_ARB || "").toLowerCase();
const USDC = (process.env.USDC || process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
const USDC_WHALE = ethers.getAddress("0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D")
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";

describe("KapanRouter flashloan fork callbacks", function () {
  before(function () {
    if (!FORK) {
      throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
    }
  });

  it("v2: real flash loan; router receives WETH and resumes runStack", async function () {
    if (!V2) throw new Error("BALANCER_VAULT2 not set in env");
    if (!WETH) throw new Error("WETH or WETH_ARB not set in env");
    const [deployer] = await ethers.getSigners();

    const Router = await ethers.getContractFactory("TestKapanRouter");
    const router = await Router.deploy(deployer.address);
    await router.waitForDeployment();
    await (await router.setBalancerV2(V2)).wait();

    const MockGateway = await ethers.getContractFactory("MockGateway");
    const mock = await MockGateway.deploy();
    await mock.waitForDeployment();
    await (await router.addGateway("mock", await mock.getAddress())).wait();

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const amount = 10n ** 15n; // 0.001 WETH
    const routerInstr = coder.encode([
      "tuple(uint256 amount,address token,address user,uint8 instructionType)"
    ], [[amount, WETH, await deployer.getAddress(), 0]]); // FlashLoanV2

    const i0 = { protocolName: "router", data: routerInstr };
    const i1 = { protocolName: "mock", data: coder.encode(["uint256"], [1n]) };
    const i2 = { protocolName: "mock", data: coder.encode(["uint256"], [2n]) };

    // Trigger flash loan through router
    const tx = await router.processProtocolInstructions([i0, i1, i2]);
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
    if (!V3) throw new Error("BALANCER_VAULT3 not set in env");
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

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const amount = 1_000_000n; // 1 USDC (6 decimals)
    const routerInstr = coder.encode([
      "tuple(uint256 amount,address token,address user,uint8 instructionType)"
    ], [[amount, USDC, await deployer.getAddress(), 1]]); // FlashLoanV3

    const i0 = { protocolName: "router", data: routerInstr };
    const i1 = { protocolName: "mock", data: coder.encode(["uint256"], [1n]) };
    const i2 = { protocolName: "mock", data: coder.encode(["uint256"], [2n]) };

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
    const tx = await router.processProtocolInstructions([i0, i1, i2]);
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
});


