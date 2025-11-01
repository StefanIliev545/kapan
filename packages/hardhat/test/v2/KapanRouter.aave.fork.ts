import { expect } from "chai";
import { ethers, network } from "hardhat";

const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const USDC = (process.env.USDC || process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
const WETH = (process.env.WETH || process.env.WETH_ARB || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1").toLowerCase();
const RICH = (process.env.USDC_WHALE || "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D");
const AAVE_PROVIDER = process.env.AAVE_POOL_ADDRESSES_PROVIDER || "";

describe("v2 Aave end-to-end (fork)", function () {
  before(function () {
    if (!FORK) throw new Error("MAINNET_FORKING_ENABLED must be true");
    if (!AAVE_PROVIDER) throw new Error("AAVE_POOL_ADDRESSES_PROVIDER not set");
  });

  it("deposit -> borrow -> repay -> withdraw via router", async function () {
    const [deployer] = await ethers.getSigners();

    // New user wallet
    const user = ethers.Wallet.createRandom().connect(ethers.provider);

    // Impersonate rich USDC holder to fund user
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [RICH] });
    const rich = await ethers.getSigner(RICH);
    await rich.sendTransaction({ to: await user.getAddress(), value: ethers.parseEther("1") });
    const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
    await usdc.connect(rich).transfer(await user.getAddress(), 2_000_000_000n); // 2,000 USDC

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy Aave v2 write gateway
    const AaveWrite = await ethers.getContractFactory("AaveGatewayWrite");
    const gateway = await AaveWrite.deploy(await router.getAddress(), AAVE_PROVIDER, 0);
    await gateway.waitForDeployment();
    await (await router.addGateway("aave", await gateway.getAddress())).wait();

    // Prepare approvals using gateway.authorize
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const liType = "tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)";
    const depositAmt = 1_000_000_000n; // 1,000 USDC
    const borrowAmt  = 100_000_000n;   // 100 USDC
    const depositInstr = coder.encode([liType], [[0, USDC, await user.getAddress(), 0n,     "0x", { index: 0 }]]); // use UTXO[0]
    const borrowInstr  = coder.encode([liType], [[3, USDC, await user.getAddress(), borrowAmt, "0x", { index: 0 }]]);
    const repayInstr   = coder.encode([liType], [[4, USDC, await user.getAddress(), 0n,     "0x", { index: 1 }]]); // use UTXO[1] (borrow output)
    const withdrawInstr= coder.encode([liType], [[2, USDC, await user.getAddress(), depositAmt, "0x", { index: 0 }]]);

    const depObj = { op: 0, token: USDC, user: await user.getAddress(), amount: depositAmt, context: "0x", input: { index: 0 } };
    const borObj = { op: 3, token: USDC, user: await user.getAddress(), amount: borrowAmt,  context: "0x", input: { index: 0 } };
    const repObj = { op: 4, token: USDC, user: await user.getAddress(), amount: 0n,        context: "0x", input: { index: 0 } };
    const witObj = { op: 2, token: USDC, user: await user.getAddress(), amount: depositAmt, context: "0x", input: { index: 0 } };

    const approveTargetsAndData = await gateway.authorize([
      depObj,
      borObj,
      repObj,
      witObj,
    ], await user.getAddress());

    const [targets, datas] = approveTargetsAndData;
    for (let i = 0; i < targets.length; i++) {
      if (!targets[i] || datas[i].length === 0) continue;
      await user.sendTransaction({ to: targets[i], data: datas[i] });
    }

    // User approval for router PullToken
    const [rtTargets, rtDatas] = await router.authorizeRouter([
      { amount: depositAmt, token: USDC, user: await user.getAddress(), instructionType: 2 }
    ] as any);
    for (let i = 0; i < rtTargets.length; i++) {
      if (!rtTargets[i] || rtDatas[i].length === 0) continue;
      await user.sendTransaction({ to: rtTargets[i], data: rtDatas[i] });
    }

    // Build router instructions
    const aave = "aave";
    const toPI = (data: string) => ({ protocolName: aave, data });
    const pullType = "tuple(uint256 amount,address token,address user,uint8 instructionType)";
    const pull = coder.encode([pullType], [[depositAmt, USDC, await user.getAddress(), 2]]); // PullToken
    // Approve UTXO[0] (USDC) for aave gateway
    const riType = "tuple(uint256 amount,address token,address user,uint8 instructionType)";
    const approve0 = ethers.AbiCoder.defaultAbiCoder().encode([
      "tuple(tuple(uint256 amount,address token,address user,uint8 instructionType) ri,string target)"
    ], [[{ amount: 0n, token: ethers.ZeroAddress, user: ethers.ZeroAddress, instructionType: 5 }, "aave"]]);
    // Approve UTXO[1] (borrowed USDC) for aave gateway
    const approve1 = ethers.AbiCoder.defaultAbiCoder().encode([
      "tuple(tuple(uint256 amount,address token,address user,uint8 instructionType) ri,string target)"
    ], [[{ amount: 1n, token: ethers.ZeroAddress, user: ethers.ZeroAddress, instructionType: 5 }, "aave"]]);
    const instrs = [
      { protocolName: "router", data: pull },
      toPI(approve0),
      toPI(depositInstr),
      toPI(borrowInstr),
      toPI(approve1),
      toPI(repayInstr),
      toPI(withdrawInstr),
    ];

    const tx = await router.connect(user).processProtocolInstructions(instrs);
    const receipt = await tx.wait();

    // Router should not hold WETH post-repay (repay uses borrowed output)
    const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);
    const wethBal = await weth.balanceOf(await router.getAddress());
    expect(wethBal).to.equal(0n);

    // Router should hold withdrawn USDC (since withdraw sends to msg.sender=router)
    const usdcBalRouter = await usdc.balanceOf(await router.getAddress());
    expect(usdcBalRouter).to.equal(depositAmt);
  });
});


