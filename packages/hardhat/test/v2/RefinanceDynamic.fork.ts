import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
    LendingOp,
    encodePullToken,
    encodeApprove,
    encodePushToken,
    encodeFlashLoan,
    encodeToOutput,
    FlashLoanProvider,
    createRouterInstruction,
    createProtocolInstruction,
    encodeLendingInstruction,
} from "./helpers/instructionHelpers";

// --- Configuration ---
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const BALANCER_VAULT3 = "0xbA1333333333a1BA1108E8412f11850A5C319bA9";
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // Arbitrum USDC
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // Arbitrum WETH
const AAVE_POOL_PROVIDER = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
const COMPOUND_USDC_COMET = "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf";

// Whales for funding
const USDC_WHALE = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";
const WETH_WHALE = BALANCER_VAULT3;

describe("v2 Dynamic Refinance Move (fork)", function () {
    this.timeout(300000); // 5 minutes

    let router: any;
    let aaveGateway: any;
    let compoundGateway: any;
    let user: any;
    let weth: any;
    let usdc: any;

    before(async function () {
        if (!FORK) throw new Error("MAINNET_FORKING_ENABLED must be true");
        if (network.config.chainId !== 42161) {
            console.log("Skipping: Arbitrum only");
            this.skip();
        }

        const [deployer] = await ethers.getSigners();

        // 1. Setup User & Tokens
        user = ethers.Wallet.createRandom().connect(ethers.provider);
        await deployer.sendTransaction({ to: user.address, value: ethers.parseEther("1") });
        weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);
        usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);

        // Fund User via Impersonation
        await network.provider.send("hardhat_setBalance", [WETH_WHALE, "0x56BC75E2D63100000"]); // 100 ETH
        await network.provider.request({ method: "hardhat_impersonateAccount", params: [WETH_WHALE] });
        const wethWhaleSigner = await ethers.getSigner(WETH_WHALE);
        await (weth.connect(wethWhaleSigner) as any).transfer(user.address, ethers.parseEther("3"));

        // 2. Deploy Infrastructure
        const Router = await ethers.getContractFactory("KapanRouter");
        router = await Router.deploy(deployer.address);
        await router.waitForDeployment();
        await router.setBalancerV3(BALANCER_VAULT3);

        // Deploy Aave Gateway
        const AaveFactory = await ethers.getContractFactory("AaveGatewayWrite");
        aaveGateway = await AaveFactory.deploy(await router.getAddress(), AAVE_POOL_PROVIDER, 0);
        await router.addGateway("aave", await aaveGateway.getAddress());

        // Deploy Compound Gateway
        const CompFactory = await ethers.getContractFactory("CompoundGatewayWrite");
        compoundGateway = await CompFactory.deploy(await router.getAddress(), deployer.address);
        await compoundGateway.setCometForBase(USDC, COMPOUND_USDC_COMET);
        await router.addGateway("compound", await compoundGateway.getAddress());
    });

    it("should dynamically move a position from Aave to Compound using on-chain balance queries", async function () {
        const userAddr = await user.getAddress();
        const marketContext = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [USDC]);

        // ====================================================
        // Phase 1: Create the "Before" State (Aave Position)
        // ====================================================
        console.log("\n--- Phase 1: Creating Initial Position on Aave ---");
        const depositAmount = ethers.parseEther("2.0");
        const borrowAmount = 100_000_000n; // 100 USDC

        // Direct approval for setup
        await weth.connect(user).approve(await router.getAddress(), depositAmount);

        // Setup Instructions (Static for setup)
        const setupInstrs = [
            createRouterInstruction(encodePullToken(depositAmount, WETH, userAddr)),
            createRouterInstruction(encodeApprove(0, "aave")),
            createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.DepositCollateral, WETH, userAddr, 0n, "0x", 0)),
            createRouterInstruction(encodeToOutput(borrowAmount, USDC)),
            createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Borrow, USDC, userAddr, 0n, "0x", 2)), // Output 3
            createRouterInstruction(encodePushToken(3, userAddr))
        ];

        // Authorize Aave Deposit/Borrow
        const [authTargets, authData] = await router.authorizeInstructions(setupInstrs, userAddr);
        console.log("Auth Targets:", authTargets);
        console.log("Auth Data:", authData);
        for (let i = 0; i < authTargets.length; i++) {
            if (authTargets[i] === ethers.ZeroAddress) continue;
            console.log("Authorizing", authTargets[i], authData[i]);
            await user.sendTransaction({ to: authTargets[i], data: authData[i] });
        }

        await (await router.connect(user).processProtocolInstructions(setupInstrs)).wait();
        console.log("✓ Position Created: 2.0 WETH Collat / 100 USDC Debt on Aave");

        // ====================================================
        // Phase 2: The Dynamic Move (Aave -> Compound)
        // ====================================================
        console.log("\n--- Phase 2: Constructing Dynamic Move Instructions ---");

        /**
         * THE DYNAMIC CHAIN
         * We do NOT hardcode the debt amount. We assume interest has accrued.
         * * UTXO Mapping:
         * 0: Aave.GetBorrowBalance(USDC) -> [Exact Debt Amount]
         * 1: FlashLoan(Balancer, Input=0) -> [RepayAmount, Fee, etc] (Input=0 tells FL to borrow exactly what is in UTXO 0)
         * 2: Router.Approve(Aave, USDC)
         * 3: Aave.Repay(USDC, Input=0) -> Uses [Exact Debt Amount] from UTXO 0 to clear debt
         * 4: Aave.GetSupplyBalance(WETH) -> [Exact Collateral Amount]
         * 5: Aave.Withdraw(WETH, Input=4) -> Withdraws [Exact Collat] from UTXO 4
         * 6: Router.Approve(Compound, WETH)
         * 7: Compound.Deposit(WETH, Input=4) -> Deposits [Exact Collat]
         * 8: Compound.Borrow(USDC, Input=1) -> Borrows [RepayAmount] from UTXO 1 to pay back Flashloan
         */

        const moveInstructions = [
            // 1. Query Debt (Output 0)
            createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetBorrowBalance, USDC, userAddr, 0n, "0x", 999)),

            // 2. Flashloan exact debt amount (Input Index 0 refers to GetBorrowBalance output) -> Output 1
            // Note: encodeFlashLoan(provider, inputIndex)
            createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV3, 0)),

            // 3. Approve Aave to take USDC (Output 2 - empty)
            createRouterInstruction(encodeApprove(1, "aave")),

            // 4. Repay Aave using funds from FL. 
            // IMPORTANT: We use Input Index 0 (The GetBorrowBalance amount) to ensure we pay exactly what is owed
            createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Repay, USDC, userAddr, 0n, "0x", 0)),

            // 5. Query Collateral Balance (Output 4)
            createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetSupplyBalance, WETH, userAddr, 0n, "0x", 999)),

            // 6. Withdraw Collateral using queried balance (Input Index 4) -> Output 5
            createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.WithdrawCollateral, WETH, userAddr, 0n, "0x", 4)),

            // 7. Approve Compound to take WETH (Output 6 - empty)
            createRouterInstruction(encodeApprove(5, "compound")),

            // 8. Deposit Collateral to Compound (Input Index 4 - The amount we queried/withdrew) -> Output 7
            createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.DepositCollateral, WETH, userAddr, 0n, marketContext, 4)),

            // 9. Borrow USDC from Compound to repay Flashloan.
            // We borrow exactly what the Flashloan expects back (Input Index 1 - The Flashloan Output contains repay amount)
            createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.Borrow, USDC, userAddr, 0n, marketContext, 1)),
        ];

        // ====================================================
        // Phase 3: Authorization Simulation
        // ====================================================
        console.log("\n--- Phase 3: Simulating User Authorization ---");

        // In a real app, the hook generates these. We simulate the router calculating required auths.
        // Since instructions are dynamic (amount=0), the gateways should generate approvals for "Max" or rely on delegates.
        const [moveAuthTargets, moveAuthData] = await router.authorizeInstructions(moveInstructions, userAddr);

        let authCount = 0;
        for (let i = 0; i < moveAuthTargets.length; i++) {
            if (moveAuthTargets[i] === ethers.ZeroAddress || moveAuthData[i] === "0x") continue;

            // Log what we are authorizing for debug
            console.log(`Authorizing Target: ${moveAuthTargets[i]} (Tx #${i})`);
            await user.sendTransaction({ to: moveAuthTargets[i], data: moveAuthData[i] });
            authCount++;
        }
        console.log(`✓ Sent ${authCount} authorization transactions`);

        // ====================================================
        // Phase 4: Execution
        // ====================================================
        console.log("\n--- Phase 4: Executing Dynamic Move ---");

        const tx = await router.connect(user).processProtocolInstructions(moveInstructions);
        const receipt = await tx.wait();

        console.log(`✓ Transaction Mined: Gas Used ${receipt.gasUsed}`);

        // ====================================================
        // Phase 5: Verification
        // ====================================================
        console.log("\n--- Phase 5: Verifying Balances ---");

        // 1. Check Aave (Should be empty)
        const aaveWethSupply = await checkBalance("aave", LendingOp.GetSupplyBalance, WETH, userAddr);
        const aaveUsdcDebt = await checkBalance("aave", LendingOp.GetBorrowBalance, USDC, userAddr);

        console.log(`Aave WETH Supply: ${ethers.formatEther(aaveWethSupply)} (Expected ~0)`);
        console.log(`Aave USDC Debt:   ${ethers.formatUnits(aaveUsdcDebt, 6)} (Expected ~0)`);

        expect(aaveWethSupply).to.be.lt(ethers.parseEther("0.0001")); // Dust allowance
        expect(aaveUsdcDebt).to.be.lt(1000n); // Dust allowance (1000 wei USDC is nothing)

        // 2. Check Compound (Should have position)
        // Note: We pass marketContext for Compound
        const compWethSupply = await checkBalance("compound", LendingOp.GetSupplyBalance, WETH, userAddr, marketContext);
        const compUsdcDebt = await checkBalance("compound", LendingOp.GetBorrowBalance, USDC, userAddr, marketContext);

        console.log(`Comp WETH Supply: ${ethers.formatEther(compWethSupply)} (Expected ~2.0)`);
        console.log(`Comp USDC Debt:   ${ethers.formatUnits(compUsdcDebt, 6)} (Expected > 100)`);

        expect(compWethSupply).to.be.closeTo(depositAmount, ethers.parseEther("0.001"));
        // Debt should be Initial Borrow + Flashloan Fee
        expect(compUsdcDebt).to.be.gt(borrowAmount);
    });

    // Helper to query balances using the router view functions (or just protocol logic)
    // Helper to query balances
    async function checkBalance(protocol: string, op: any, token: string, userAddr: string, context: string = "0x") {
        // 1. Define the ABI manually so we don't rely on Hardhat artifacts being perfect
        const manualAbi = [
            "function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
            "function collateralBalanceOf(address account, address asset) external view returns (uint128)",
            "function borrowBalanceOf(address account) external view returns (uint256)"
        ];

        if (protocol === "aave") {
            // For Aave, we need the DataProvider address first
            const poolProvider = await ethers.getContractAt("@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider", AAVE_POOL_PROVIDER);
            const dataProviderAddr = await poolProvider.getPoolDataProvider();

            // Connect to DataProvider using manual ABI
            const dataProvider = new ethers.Contract(dataProviderAddr, manualAbi, ethers.provider);

            const data = await dataProvider.getUserReserveData(token, userAddr);
            if (op === LendingOp.GetSupplyBalance) return data[0]; // currentATokenBalance
            if (op === LendingOp.GetBorrowBalance) return data[1] + data[2]; // stable + var debt
        }

        if (protocol === "compound") {
            // Connect to Comet using manual ABI
            const comet = new ethers.Contract(COMPOUND_USDC_COMET, manualAbi, ethers.provider);

            if (op === LendingOp.GetSupplyBalance) {
                // Cast explicitly or use the contract object which now knows the ABI
                return await comet.collateralBalanceOf(userAddr, token);
            }
            if (op === LendingOp.GetBorrowBalance) {
                return await comet.borrowBalanceOf(userAddr);
            }
        }
        return 0n;
    }
});

// Interfaces for verification (Minimizing import mess)
const abi = [
    "function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
    "function getPoolDataProvider() external view returns (address)",
    "function collateralBalanceOf(address account, address asset) external view returns (uint128)",
    "function borrowBalanceOf(address account) external view returns (uint256)"
];
// Register ABIs for checkBalance
ethers.Interface.from(abi);