import { expect } from "chai";
import { ethers } from "hardhat";
import {
    encodePullToken,
    createRouterInstruction,
    createProtocolInstruction,
    encodeLendingInstruction,
} from "./helpers/instructionHelpers";

describe("v2 Router Deauthorization Flow", function () {
    it("should NOT generate redundant approvals for PullToken + Deposit flow", async function () {
        const [deployer, user] = await ethers.getSigners();

        // Deploy mock ERC20 token
        const ERC20 = await ethers.getContractFactory("MockERC20");
        const token = await ERC20.deploy("Test Token", "TEST", await deployer.getAddress(), 1000000n * 10n ** 18n);
        await token.waitForDeployment();
        const tokenAddress = await token.getAddress();

        // Deploy router
        const Router = await ethers.getContractFactory("KapanRouter");
        const router = await Router.deploy(await deployer.getAddress());
        await router.waitForDeployment();

        // Deploy Aave gateway (using real one to test logic, but we need to mock dependencies)
        // Actually, let's use a MockGateway that mimics the BAD behavior to prove the test works,
        // OR use the real AaveGatewayWrite if we can deploy it easily.
        // Given the complexity of deploying Aave dependencies, let's use a MockGateway that implements
        // the "bad" logic (revoking on Deposit) and another that implements "good" logic.
        // Wait, the goal is to test the CURRENT codebase.
        // So I should use the REAL AaveGatewayWrite if possible, or at least a Mock that behaves EXACTLY like it.

        // Let's try to deploy the real AaveGatewayWrite. It needs a PoolAddressesProvider.
        const MockProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
        const provider = await MockProvider.deploy(await deployer.getAddress()); // Mock address for pool
        await provider.waitForDeployment();

        const AaveGateway = await ethers.getContractFactory("AaveGatewayWrite");
        const gateway = await AaveGateway.deploy(await router.getAddress(), await provider.getAddress(), 0);
        await gateway.waitForDeployment();

        // Register gateway
        await router.addGateway("aave", await gateway.getAddress());

        // Build instructions:
        // 1. PullToken (user -> router)
        // 2. Aave Deposit (user -> pool, via gateway)

        const depositAmt = 100n * 10n ** 18n;

        // Aave Deposit Instruction
        const depositInstr = encodeLendingInstruction(
            0, // op = Deposit (0)
            tokenAddress,
            await user.getAddress(),
            depositAmt,
            "0x",
            0 // input index (uses UTXO[0] from PullToken)
        );

        const instrs = [
            createRouterInstruction(encodePullToken(depositAmt, tokenAddress, await user.getAddress())),
            createProtocolInstruction("aave", depositInstr),
        ];

        // Call deauthorizeInstructions
        const [targets, data] = await router.deauthorizeInstructions(instrs, await user.getAddress());

        // Filter out empty targets
        const validOps = [];
        for (let i = 0; i < targets.length; i++) {
            if (targets[i] !== ethers.ZeroAddress) {
                validOps.push({ target: targets[i], data: data[i] });
            }
        }

        console.log("Deauth Ops:", validOps);

        // EXPECTATION:
        // 1. Router revoke (PullToken): Token.approve(Router, 0)
        // 2. Gateway revoke (Deposit): SHOULD NOT EXIST if fixed.

        // If it's NOT fixed, we'd see 2 ops.
        // If it IS fixed, we see 1 op.

        // Check for Router revoke
        const routerRevoke = validOps.find(op => op.target === tokenAddress);
        expect(routerRevoke).to.not.be.undefined;

        // Check count. If we have redundant approvals, we might have 2 identical revokes or 2 different ones.
        // In the "bad" case:
        // - Router emits: approve(router, 0)
        // - Gateway emits: approve(gateway, 0) -> Wait, AaveGatewayWrite.deposit emits approve(pool, 0) inside execution, 
        //   but deauthorize would emit approve(gateway, 0) if it was revoking user->gateway allowance?
        //   Actually, let's look at the "bad" logic description again.
        //   "AaveGatewayWrite.deauthorize emits: token.approve(aaveGateway, 0)"
        //   So we look for an approval to the Gateway address? Or is it just a generic approve?
        //   The target is the token. The spender is `address(this)` (the gateway).

        // So we expect:
        // Op 1: Target = Token, Data = approve(Router, 0)
        // Op 2 (Bad): Target = Token, Data = approve(Gateway, 0)

        // If fixed, Op 2 should be missing.

        expect(validOps.length).to.equal(1, "Should only have 1 revocation (Router)");

    });
});
