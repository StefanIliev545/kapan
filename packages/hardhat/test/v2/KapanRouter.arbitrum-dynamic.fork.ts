import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
    setupLendingTest,
    LendingTestConfig,
    TokenConfig,
    GatewayConfig,
} from "./helpers/lendingTestTemplate";
import {
    encodePullToken,
    encodeApprove,
    encodeToOutput,
    encodePushToken,
    createRouterInstruction,
    createProtocolInstruction,
    createGetSupplyBalanceInstruction,
    createGetBorrowBalanceInstruction,
    encodeLendingInstruction,
    LendingOp,
} from "./helpers/instructionHelpers";

// Env vars and config
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
// Arbitrum USDC
const USDC = (process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
// Arbitrum USDC Whale
const USDC_WHALE = process.env.USDC_WHALE_ARB || "0x47c031236e19d024b42f8AE6780E44A573170703";

const USDC_TOKEN: TokenConfig = {
    address: USDC,
    decimals: 6,
    whale: USDC_WHALE,
};

const AAVE_GATEWAY: GatewayConfig = {
    type: "aave",
    protocolName: "aave",
    factoryName: "AaveGatewayWrite",
    deployArgs: [
        process.env.AAVE_POOL_ADDRESSES_PROVIDER_ARB || "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
        1234 // referral code
    ],
};

const COMPOUND_GATEWAY: GatewayConfig = {
    type: "compound",
    protocolName: "compound",
    factoryName: "CompoundGatewayWrite",
    deployArgs: ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"], // Owner (Hardhat default deployer)
};

describe("v2 Arbitrum Dynamic Balance Flow (fork)", function () {
    before(function () {
        if (!FORK) {
            throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
        }
        // Check if we are on Arbitrum (42161)
        const chainId = network.config.chainId;
        if (chainId !== 42161) {
            console.log(`Skipping Arbitrum Dynamic tests: Current chain ID is ${chainId}, expected 42161`);
            this.skip();
        }
    });

    describe("Aave V3 Dynamic withdraw using GetSupplyBalance", function () {
        const config: LendingTestConfig = {
            collateralToken: USDC_TOKEN,
            debtToken: USDC_TOKEN,
            amounts: {
                deposit: 1_000_000_000n, // 1,000 USDC
                borrow: 0n,
            },
            gateway: AAVE_GATEWAY,
            userFunding: {
                collateral: 2_000_000_000n, // 2,000 USDC
            },
        };

        it("should query supply balance and use it for withdraw approval", async function () {
            const setup = await setupLendingTest(config);
            const userAddress = await setup.user.getAddress();

            // Step 1: Setup deposit authorization and deposit
            const depObj = {
                op: LendingOp.DepositCollateral,
                token: config.collateralToken.address,
                user: userAddress,
                amount: config.amounts.deposit,
                context: "0x",
                input: { index: 0 },
            };
            const [depTargets, depDatas] = await setup.gateway.authorize([depObj], userAddress, []);
            console.log("\n=== Deposit Authorization ===");
            for (let i = 0; i < depTargets.length; i++) {
                if (!depTargets[i] || depDatas[i].length === 0) continue;
                await setup.user.sendTransaction({ to: depTargets[i], data: depDatas[i] });
            }

            // Approve router and deposit
            await (setup.collateralToken.connect(setup.user) as any).approve(
                await setup.router.getAddress(),
                config.amounts.deposit
            );

            // ALL instructions must be in ONE transaction for UTXO chaining
            console.log("\n=== Single Transaction: Deposit -> Query -> Withdraw ===");
            const allInstrs = [
                // UTXO[0]: Deposit (Pull 1000 USDC from user)
                createRouterInstruction(encodePullToken(config.amounts.deposit, config.collateralToken.address, userAddress)),
                // UTXO[1]: Approve (empty output)
                createRouterInstruction(encodeApprove(0, config.gateway.protocolName)),
                // No output: Deposit UTXO[0]
                createProtocolInstruction(
                    config.gateway.protocolName,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                        [[LendingOp.DepositCollateral, config.collateralToken.address, userAddress, config.amounts.deposit, "0x", { index: 0 }]]
                    )
                ),
                // UTXO[2]: Query supply balance (returns actual aToken balance in underlying terms)
                createGetSupplyBalanceInstruction(config.gateway.protocolName, config.collateralToken.address, userAddress),
                // UTXO[3]: Withdraw using queried balance from UTXO[2]
                createProtocolInstruction(
                    config.gateway.protocolName,
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                        // inputIndex=2 uses the GetSupplyBalance output
                        [[LendingOp.WithdrawCollateral, config.collateralToken.address, userAddress, 990_000_000n, "0x", { index: 2 }]]
                    )
                ),
                // Push withdrawn amount to user
                createRouterInstruction(encodePushToken(3, userAddress)),
            ];

            // Authorize withdraw (using estimated balance)
            // Note: In a real scenario, we might not know the exact amount, but here we simulate it.
            // The key is that authorize uses the buffer if we pass the instruction.
            // However, for dynamic flows, the frontend might simulate first.
            // Here we just want to verify the on-chain execution works with the buffer.

            // We need to authorize the WithdrawCollateral.
            // Since we are using GetSupplyBalance on-chain, the authorize call should also reflect that if we want to test the buffer in authorize.
            // But authorize is off-chain.

            // Let's just authorize a slightly larger amount to be safe, or rely on the buffer in authorize if we can simulate it.
            // For this test, we'll just authorize explicitly.
            const estimatedBalance = 1_000_000_000n; // Expect full withdrawal
            const witObj = {
                op: LendingOp.WithdrawCollateral,
                token: config.collateralToken.address,
                user: userAddress,
                amount: estimatedBalance,
                context: "0x",
                input: { index: 0 },
            };

            // We need to pass inputs to authorize if we want it to use the buffer from GetSupplyBalance?
            // The test helper setup.gateway.authorize might not support passing inputs easily yet without modification.
            // But we can just call it with the instruction.
            const [witTargets, witDatas] = await setup.gateway.authorize([witObj], userAddress, []);
            console.log("Withdraw authorization:");
            for (let i = 0; i < witTargets.length; i++) {
                if (!witTargets[i] || witDatas[i].length === 0) continue;
                await setup.user.sendTransaction({ to: witTargets[i], data: witDatas[i] });
            }

            await (await setup.router.connect(setup.user).processProtocolInstructions(allInstrs)).wait();
            console.log("✓ Complete flow: Deposit -> Query Balance -> Withdraw");

            const finalBalance = await setup.collateralToken.balanceOf(userAddress);
            console.log(`\nFinal user balance: ${finalBalance / 10n ** 6n} USDC`);
            expect(finalBalance).to.be.closeTo(config.userFunding.collateral, 1000n); // Should be back to original (minus fees/dust)
        });
    });

    describe("Compound V3 Dynamic withdraw using GetSupplyBalance", function () {
        const config: LendingTestConfig = {
            collateralToken: USDC_TOKEN,
            debtToken: USDC_TOKEN,
            amounts: {
                deposit: 1_000_000_000n, // 1,000 USDC
                borrow: 0n,
            },
            gateway: COMPOUND_GATEWAY,
            userFunding: {
                collateral: 2_000_000_000n, // 2,000 USDC
            },
        };

        it("should query supply balance and use it for withdraw approval", async function () {
            const setup = await setupLendingTest(config);
            const userAddress = await setup.user.getAddress();

            // Setup Comet
            const cometAddress = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf"; // Arbitrum Native USDC Comet
            const [owner] = await ethers.getSigners();
            console.log("Setting Comet for base:", USDC, cometAddress);
            console.log("Gateway address:", await setup.gateway.getAddress());
            console.log("Owner address:", await owner.getAddress());

            // Connect gateway to owner to call onlyOwner function
            await setup.gateway.connect(owner).setCometForBase(USDC, cometAddress);

            const comet = await ethers.getContractAt("contracts/v2/interfaces/compound/ICompoundComet.sol:ICompoundComet", cometAddress);
            const code = await ethers.provider.getCode(cometAddress);
            console.log("Comet code length:", code.length);
            if (code === "0x") {
                console.error("ERROR: No code at Comet address!");
            }
            const baseToken = await comet.baseToken();
            console.log("Comet base token:", baseToken);
            console.log("Test USDC:", USDC);
            if (baseToken.toLowerCase() !== USDC.toLowerCase()) {
                console.error("MISMATCH: Comet base token is not USDC!");
            }
            try {
                const assetInfo = await comet.getAssetInfoByAddress(USDC);
                console.log("Asset info for USDC:", assetInfo);
            } catch (e) {
                console.log("USDC not found in asset info (expected for base token?)");
            }

            // Encode market (USDC) in context
            const marketContext = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [USDC]);

            // Step 1: Setup deposit authorization and deposit
            const depObj = {
                op: LendingOp.DepositCollateral,
                token: config.collateralToken.address,
                user: userAddress,
                amount: config.amounts.deposit,
                context: marketContext,
                input: { index: 0 },
            };
            const [depTargets, depDatas] = await setup.gateway.authorize([depObj], userAddress, []);
            for (let i = 0; i < depTargets.length; i++) {
                if (!depTargets[i] || depDatas[i].length === 0) continue;
                await setup.user.sendTransaction({ to: depTargets[i], data: depDatas[i] });
            }

            // Approve router and deposit
            await (setup.collateralToken.connect(setup.user) as any).approve(
                await setup.router.getAddress(),
                config.amounts.deposit
            );

            console.log("\n=== Single Transaction: Deposit -> Query -> Withdraw ===");
            const allInstrs = [
                // UTXO[0]: Deposit
                createRouterInstruction(encodePullToken(config.amounts.deposit, config.collateralToken.address, userAddress)),
                createRouterInstruction(encodeApprove(0, config.gateway.protocolName)),
                createProtocolInstruction(
                    config.gateway.protocolName,
                    encodeLendingInstruction(LendingOp.DepositCollateral, config.collateralToken.address, userAddress, config.amounts.deposit, marketContext, 0)
                ),
                // UTXO[2]: Query supply balance
                createProtocolInstruction(
                    config.gateway.protocolName,
                    encodeLendingInstruction(LendingOp.GetSupplyBalance, config.collateralToken.address, userAddress, 0n, marketContext, 999)
                ),
                // UTXO[3]: Withdraw using queried balance
                createProtocolInstruction(
                    config.gateway.protocolName,
                    encodeLendingInstruction(LendingOp.WithdrawCollateral, config.collateralToken.address, userAddress, 0n, marketContext, 2)
                ),
                // Push withdrawn amount to user
                createRouterInstruction(encodePushToken(3, userAddress)),
            ];

            // Authorize only the protocol instructions (indices 2,3,4 in allInstrs)
            const [witTargets, witDatas] = await setup.router.authorizeInstructions(allInstrs, userAddress);
            for (let i = 0; i < witTargets.length; i++) {
                if (!witTargets[i] || witDatas[i].length === 0) continue;
                if (witTargets[i] == "0x0000000000000000000000000000000000000000") continue;
                console.log("Sending transaction to", witTargets[i], "with data", witDatas[i]);
                await setup.user.sendTransaction({ to: witTargets[i], data: witDatas[i] });
            }

            await (await setup.router.connect(setup.user).processProtocolInstructions(allInstrs)).wait();
            console.log("✓ Complete flow: Deposit -> Query Balance -> Withdraw");

            const finalBalance = await setup.collateralToken.balanceOf(userAddress);
            expect(finalBalance).to.be.closeTo(config.userFunding.collateral, 1000n);
        });
    });
});
