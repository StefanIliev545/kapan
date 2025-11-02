import { expect } from "chai";
import { ethers } from "hardhat";
import {
  encodePullToken,
  encodeApprove,
  createRouterInstruction,
  createProtocolInstruction,
} from "./helpers/instructionHelpers";

describe("v2 Router Approve Flow", function () {
  it("should approve UTXO for gateway using string protocol name and gateway pulls tokens", async function () {
    const [deployer, user] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const token = await ERC20.deploy("Test Token", "TEST", await deployer.getAddress(), 1000000n * 10n ** 18n);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    // Fund user
    await token.transfer(await user.getAddress(), 1000n * 10n ** 18n);

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // User approval for router PullToken
    const depositAmt = 100n * 10n ** 18n;
    const [rtTargets, rtDatas] = await router.authorizeRouter([
      { amount: depositAmt, token: tokenAddress, user: await user.getAddress(), instructionType: 2 }
    ] as any);
    for (let i = 0; i < rtTargets.length; i++) {
      if (!rtTargets[i] || rtDatas[i].length === 0) continue;
      await user.sendTransaction({ to: rtTargets[i], data: rtDatas[i] });
    }

    // Build instructions:
    // 1. PullToken (user -> router) -> creates UTXO[0]
    // 2. Approve UTXO[0] for "mock" gateway -> creates UTXO[1] (empty, for consistency)
    // 3. Mock gateway pulls from router using UTXO[0]
    const coder = ethers.AbiCoder.defaultAbiCoder();

    // Mock gateway instruction (consumes UTXO[0], doesn't produce output)
    const mockInstr = coder.encode(["bool"], [false]);

    const instrs = [
      createRouterInstruction(encodePullToken(depositAmt, tokenAddress, await user.getAddress())),
      createRouterInstruction(encodeApprove(0, "mock")), // Approves UTXO[0], creates UTXO[1]
      createProtocolInstruction("mock", mockInstr), // Uses UTXO[0]
    ];

    // Execute
    const tx = await router.connect(user).processProtocolInstructions(instrs);
    const receipt = await tx.wait();

    // Verify: gateway should have pulled the tokens from router
    const gatewayBalance = await token.balanceOf(await gateway.getAddress());
    expect(gatewayBalance).to.equal(depositAmt);

    // Verify: router should have no tokens left
    const routerBalance = await token.balanceOf(await router.getAddress());
    expect(routerBalance).to.equal(0n);

    // Verify events
    const pulledEvents = receipt!.logs.filter(
      (log) => {
        try {
          const parsed = gateway.interface.parseLog(log);
          return parsed && parsed.name === "PulledToken";
        } catch {
          return false;
        }
      }
    );
    expect(pulledEvents.length).to.equal(1);
    const parsed = gateway.interface.parseLog(pulledEvents[0]);
    expect(parsed!.args.token).to.equal(tokenAddress);
    expect(parsed!.args.amount).to.equal(depositAmt);
  });

  it("should approve UTXO and gateway can produce output for chaining", async function () {
    const [deployer, user] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const ERC20 = await ethers.getContractFactory("MockERC20");
    const token = await ERC20.deploy("Test Token", "TEST", await deployer.getAddress(), 1000000n * 10n ** 18n);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    // Fund user
    await token.transfer(await user.getAddress(), 1000n * 10n ** 18n);

    // Deploy router
    const Router = await ethers.getContractFactory("KapanRouter");
    const router = await Router.deploy(await deployer.getAddress());
    await router.waitForDeployment();

    // Deploy mock gateway
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();

    // Register gateway
    await router.addGateway("mock", await gateway.getAddress());

    // User approval for router PullToken
    const depositAmt = 100n * 10n ** 18n;
    const [rtTargets, rtDatas] = await router.authorizeRouter([
      { amount: depositAmt, token: tokenAddress, user: await user.getAddress(), instructionType: 2 }
    ] as any);
    for (let i = 0; i < rtTargets.length; i++) {
      if (!rtTargets[i] || rtDatas[i].length === 0) continue;
      await user.sendTransaction({ to: rtTargets[i], data: rtDatas[i] });
    }

    // Build instructions:
    // 1. PullToken (user -> router) -> creates UTXO[0]
    // 2. Approve UTXO[0] for "mock" gateway -> creates UTXO[1] (empty, for consistency)
    // 3. Mock gateway pulls from router and produces output -> creates UTXO[2]
    // 4. Approve UTXO[2] for "mock" gateway -> creates UTXO[3] (empty, for consistency)
    // 5. Another mock gateway instruction that uses UTXO[2]
    const coder = ethers.AbiCoder.defaultAbiCoder();
    
    // First mock instruction: pulls UTXO[0], produces output (UTXO[2])
    const mockInstr1 = coder.encode(["bool"], [true]);
    
    // Second mock instruction: uses UTXO[2]
    const mockInstr2 = coder.encode(["bool"], [false]);

    const instrs = [
      createRouterInstruction(encodePullToken(depositAmt, tokenAddress, await user.getAddress())),
      createRouterInstruction(encodeApprove(0, "mock")), // Approves UTXO[0], creates UTXO[1]
      createProtocolInstruction("mock", mockInstr1), // Uses UTXO[0], creates UTXO[2]
      createRouterInstruction(encodeApprove(2, "mock")), // Approves UTXO[2], creates UTXO[3]
      createProtocolInstruction("mock", mockInstr2), // Uses UTXO[2]
    ];

    // Execute
    const tx = await router.connect(user).processProtocolInstructions(instrs);
    const receipt = await tx.wait();

    // Verify: gateway should have pulled tokens twice (UTXO[0] and UTXO[1])
    const pulledEvents = receipt!.logs.filter(
      (log) => {
        try {
          const parsed = gateway.interface.parseLog(log);
          return parsed && parsed.name === "PulledToken";
        } catch {
          return false;
        }
      }
    );
    expect(pulledEvents.length).to.equal(2);
    
    // Both pulls should be the same amount (UTXO chaining)
    for (const event of pulledEvents) {
      const parsed = gateway.interface.parseLog(event);
      expect(parsed!.args.amount).to.equal(depositAmt);
    }

    // Gateway should have tokens from the second pull only
    // (first pull sent tokens back to router when producing output)
    const gatewayBalance = await token.balanceOf(await gateway.getAddress());
    expect(gatewayBalance).to.equal(depositAmt);
  });
});

