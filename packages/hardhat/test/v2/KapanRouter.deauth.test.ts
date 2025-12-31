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
        const MockProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
        const provider = await MockProvider.deploy(await deployer.getAddress()); // Mock address for pool
        await provider.waitForDeployment();

        const AaveGateway = await ethers.getContractFactory("AaveGatewayWrite");
        const gateway = await AaveGateway.deploy(await router.getAddress(), await provider.getAddress(), 0);
        await gateway.waitForDeployment();

        // Register gateway with router
        await router.addGateway("aave", await gateway.getAddress());

        // Deploy authorization helper
        const AuthHelper = await ethers.getContractFactory("KapanAuthorizationHelper");
        const authHelper = await AuthHelper.deploy(await router.getAddress());
        await authHelper.waitForDeployment();

        // Sync gateway with auth helper
        await authHelper.syncGateway("aave", await gateway.getAddress());

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

        // Call deauthorizeInstructions via helper contract
        const [targets, data] = await authHelper.deauthorizeInstructions(instrs, await user.getAddress());

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

        // Check count - should only have 1 revocation (Router), not 2
        expect(validOps.length).to.equal(1, "Should only have 1 revocation (Router)");

    });
});
