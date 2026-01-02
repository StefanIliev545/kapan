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

// --- Mainnet Configuration ---
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
const USE_DEPLOYED = process.env.USE_DEPLOYED === "true"; // Set to use actual deployed contracts

const MAINNET = {
    // Tokens
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",

    // Flash loan providers
    BALANCER_V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    BALANCER_V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    MORPHO_BLUE: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",

    // Aave V3
    AAVE_POOL_PROVIDER: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",

    // Compound V3 Comets
    COMPOUND_USDC_COMET: "0xc3d688B66703497DAA19211EEdff47f25384cdc3",

    // Whales for funding
    WETH_WHALE: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", // Balancer V2 Vault
    USDC_WHALE: "0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341", // Circle

    // ZeroLend (LRT market on mainnet)
    ZEROLEND_POOL_PROVIDER: "0xFD856E1a33225B86f70D686f9280435E3fF75FCF",

    // DEPLOYED contracts on mainnet (from deployments/mainnet/)
    DEPLOYED: {
        KAPAN_ROUTER: "0xf415edf6F48e5744053Aae9D67317118c3E029d5",
        AAVE_GATEWAY_WRITE: "0x7a0dEE6d416293845c43298A136C7dd0054144b6",
        COMPOUND_GATEWAY_WRITE: "0x730ACC4dece77964321b8BEB861A3943D667033D",
        ZEROLEND_GATEWAY_WRITE: "0x49A5ac50c8418b5D1A7dB2ec9f55C14F932c248F",
        AUTH_HELPER: "0xd4D36d109eAA0b0a49448Af58329Bb904329b228",
    },
};

describe("Mainnet Refinance Debug (fork)", function () {
    this.timeout(300000); // 5 minutes

    let router: any;
    let aaveGateway: any;
    let compoundGateway: any;
    let user: any;
    let weth: any;
    let usdc: any;

    before(async function () {
        if (!FORK) throw new Error("MAINNET_FORKING_ENABLED must be true");
        
        // When forking, Hardhat still reports chainId 31337, but we're actually on the forked chain
        // Check FORK_CHAIN env to ensure we're forking mainnet
        const forkChain = (process.env.FORK_CHAIN || "").toLowerCase();
        if (!["ethereum", "eth", "mainnet"].includes(forkChain)) {
            console.log("Skipping: Set FORK_CHAIN=ethereum to run this test");
            this.skip();
        }
        console.log("Fork chain:", forkChain);

        const [deployer] = await ethers.getSigners();
        console.log("Deployer:", deployer.address);
        console.log("USE_DEPLOYED:", USE_DEPLOYED);

        // 1. Setup User & Tokens
        user = ethers.Wallet.createRandom().connect(ethers.provider);
        console.log("Test user:", user.address);
        
        // Use hardhat_setBalance to avoid gas price issues on mainnet fork
        await network.provider.send("hardhat_setBalance", [user.address, "0x8AC7230489E80000"]); // 10 ETH
        weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", MAINNET.WETH);
        usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", MAINNET.USDC);

        // Fund User with WETH via Impersonation (Balancer V2 Vault has lots of WETH)
        console.log("\n--- Funding test user ---");
        
        // Reset base fee by mining empty blocks
        await network.provider.send("hardhat_setNextBlockBaseFeePerGas", ["0x1"]);
        
        await network.provider.send("hardhat_setBalance", [MAINNET.WETH_WHALE, "0x56BC75E2D63100000"]); // 100 ETH
        await network.provider.request({ method: "hardhat_impersonateAccount", params: [MAINNET.WETH_WHALE] });
        const wethWhaleSigner = await ethers.getSigner(MAINNET.WETH_WHALE);
        
        const wethAmount = ethers.parseEther("5");
        await (weth.connect(wethWhaleSigner) as any).transfer(user.address, wethAmount, { gasPrice: ethers.parseUnits("200", "gwei") });
        console.log("Funded user with", ethers.formatEther(wethAmount), "WETH");

        if (USE_DEPLOYED) {
            // Use actually deployed contracts on mainnet
            console.log("\n--- Using DEPLOYED contracts ---");
            
            router = await ethers.getContractAt("KapanRouter", MAINNET.DEPLOYED.KAPAN_ROUTER);
            aaveGateway = await ethers.getContractAt("AaveGatewayWrite", MAINNET.DEPLOYED.AAVE_GATEWAY_WRITE);
            compoundGateway = await ethers.getContractAt("CompoundGatewayWrite", MAINNET.DEPLOYED.COMPOUND_GATEWAY_WRITE);
            
            console.log("KapanRouter:", MAINNET.DEPLOYED.KAPAN_ROUTER);
            console.log("AaveGatewayWrite:", MAINNET.DEPLOYED.AAVE_GATEWAY_WRITE);
            console.log("CompoundGatewayWrite:", MAINNET.DEPLOYED.COMPOUND_GATEWAY_WRITE);
            console.log("AuthHelper:", MAINNET.DEPLOYED.AUTH_HELPER);

        } else {
            // 2. Deploy Infrastructure (fresh deploy like Arbitrum test)
            console.log("\n--- Deploying FRESH contracts ---");
            
            const Router = await ethers.getContractFactory("KapanRouter");
            router = await Router.deploy(deployer.address);
            await router.waitForDeployment();
            console.log("KapanRouter deployed:", await router.getAddress());

            // Configure flash loan providers
            await router.setBalancerV2(MAINNET.BALANCER_V2);
            console.log("Balancer V2 set:", MAINNET.BALANCER_V2);
            
            await router.setBalancerV3(MAINNET.BALANCER_V3);
            console.log("Balancer V3 set:", MAINNET.BALANCER_V3);

            await router.setMorphoBluePool(MAINNET.MORPHO_BLUE);
            console.log("Morpho Blue set:", MAINNET.MORPHO_BLUE);

            // Get Aave pool address from provider
            const aaveProvider = await ethers.getContractAt(
                "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
                MAINNET.AAVE_POOL_PROVIDER
            );
            const aavePoolAddress = await aaveProvider.getPool();
            await router.setAavePool(aavePoolAddress);
            console.log("Aave pool set:", aavePoolAddress);

            // Deploy Aave Gateway
            const AaveFactory = await ethers.getContractFactory("AaveGatewayWrite");
            aaveGateway = await AaveFactory.deploy(await router.getAddress(), MAINNET.AAVE_POOL_PROVIDER, 0);
            await aaveGateway.waitForDeployment();
            await router.addGateway("aave", await aaveGateway.getAddress());
            console.log("AaveGatewayWrite deployed:", await aaveGateway.getAddress());

            // Deploy Compound Gateway
            const CompFactory = await ethers.getContractFactory("CompoundGatewayWrite");
            compoundGateway = await CompFactory.deploy(await router.getAddress(), deployer.address);
            await compoundGateway.waitForDeployment();
            await compoundGateway.setCometForBase(MAINNET.USDC, MAINNET.COMPOUND_USDC_COMET);
            await router.addGateway("compound", await compoundGateway.getAddress());
            console.log("CompoundGatewayWrite deployed:", await compoundGateway.getAddress());

            // Deploy Authorization Helper
            const AuthHelper = await ethers.getContractFactory("KapanAuthorizationHelper");
            const authHelper = await AuthHelper.deploy(await router.getAddress(), deployer.address);
            await authHelper.waitForDeployment();
            await router.setAuthorizationHelper(await authHelper.getAddress());
            console.log("AuthorizationHelper deployed:", await authHelper.getAddress());

            // Sync gateways with auth helper
            await authHelper.syncGateway("aave", await aaveGateway.getAddress());
            await authHelper.syncGateway("compound", await compoundGateway.getAddress());
            console.log("Gateways synced with auth helper");
        }

        console.log("\n--- Setup complete ---\n");
    });

    describe("Step-by-step debugging", function () {

        it("Step 1: Verify router configuration", async function () {
            console.log("\n=== Router Configuration ===");
            console.log("Router address:", await router.getAddress());
            console.log("Balancer V2:", await router.balancerV2Vault());
            console.log("Balancer V3:", await router.balancerV3Vault());
            console.log("Morpho Blue:", await router.morphoBlue());
            console.log("Aave Gateway:", await router.gateways("aave"));
            console.log("Compound Gateway:", await router.gateways("compound"));
            
            // Verify gateways are set
            expect(await router.gateways("aave")).to.not.equal(ethers.ZeroAddress);
            expect(await router.gateways("compound")).to.not.equal(ethers.ZeroAddress);
        });

        it("Step 2: Simple WETH deposit on Aave (no flash loan)", async function () {
            console.log("\n=== Step 2: Simple Aave Deposit ===");
            
            const userAddr = user.address;
            const depositAmount = ethers.parseEther("1.0");
            
            console.log("User WETH balance before:", ethers.formatEther(await weth.balanceOf(userAddr)));
            
            // Approve router
            await weth.connect(user).approve(await router.getAddress(), depositAmount);
            console.log("Approved router for", ethers.formatEther(depositAmount), "WETH");

            // Build instructions
            const instructions = [
                createRouterInstruction(encodePullToken(depositAmount, MAINNET.WETH, userAddr)),
                createRouterInstruction(encodeApprove(0, "aave")),
                createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.DepositCollateral, MAINNET.WETH, userAddr, 0n, "0x", 0)),
            ];

            console.log("Instructions built, count:", instructions.length);

            // Get and execute authorizations
            const [authTargets, authData] = await router.authorizeInstructions(instructions, userAddr);
            console.log("Auth targets:", authTargets.length);
            
            for (let i = 0; i < authTargets.length; i++) {
                if (authTargets[i] === ethers.ZeroAddress) continue;
                console.log("Authorizing target:", authTargets[i]);
                await user.sendTransaction({ to: authTargets[i], data: authData[i] });
            }

            // Execute
            console.log("Executing deposit...");
            const tx = await router.connect(user).processProtocolInstructions(instructions);
            const receipt = await tx.wait();
            console.log("Gas used:", receipt.gasUsed.toString());

            // Verify
            const aaveSupply = await getAaveSupplyBalance(MAINNET.WETH, userAddr);
            console.log("Aave WETH supply after:", ethers.formatEther(aaveSupply));
            
            expect(aaveSupply).to.be.closeTo(depositAmount, ethers.parseEther("0.001"));
            console.log("SUCCESS: Simple Aave deposit works");
        });

        it("Step 3: Borrow USDC on Aave", async function () {
            console.log("\n=== Step 3: Borrow USDC on Aave ===");
            
            const userAddr = user.address;
            const borrowAmount = 500_000_000n; // 500 USDC

            console.log("User USDC balance before:", ethers.formatUnits(await usdc.balanceOf(userAddr), 6));

            const instructions = [
                createRouterInstruction(encodeToOutput(borrowAmount, MAINNET.USDC)),
                createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Borrow, MAINNET.USDC, userAddr, 0n, "0x", 0)),
                createRouterInstruction(encodePushToken(1, userAddr)),
            ];

            // Authorizations (for borrow delegation)
            const [authTargets, authData] = await router.authorizeInstructions(instructions, userAddr);
            for (let i = 0; i < authTargets.length; i++) {
                if (authTargets[i] === ethers.ZeroAddress) continue;
                console.log("Authorizing target:", authTargets[i]);
                await user.sendTransaction({ to: authTargets[i], data: authData[i] });
            }

            console.log("Executing borrow...");
            const tx = await router.connect(user).processProtocolInstructions(instructions);
            const receipt = await tx.wait();
            console.log("Gas used:", receipt.gasUsed.toString());

            const userUsdcAfter = await usdc.balanceOf(userAddr);
            console.log("User USDC balance after:", ethers.formatUnits(userUsdcAfter, 6));

            expect(userUsdcAfter).to.be.gte(borrowAmount);
            console.log("SUCCESS: Borrow works");
        });

        it("Step 4: Flash loan only (Balancer V2)", async function () {
            console.log("\n=== Step 4: Flash Loan Test ===");

            const userAddr = user.address;
            const flashAmount = ethers.parseEther("0.1"); // 0.1 WETH

            // Simple flash loan that does nothing - just borrows and repays
            const instructions = [
                createRouterInstruction(encodeToOutput(flashAmount, MAINNET.WETH)),
                createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),
                // The flash loan will auto-repay, nothing else needed
            ];

            console.log("Executing flash loan...");
            try {
                const tx = await router.connect(user).processProtocolInstructions(instructions);
                const receipt = await tx.wait();
                console.log("Gas used:", receipt.gasUsed.toString());
                console.log("SUCCESS: Flash loan works");
            } catch (e: any) {
                console.log("FAILED: Flash loan error:", e.message);
                throw e;
            }
        });

        it("Step 5: Full refinance Aave -> Compound", async function () {
            console.log("\n=== Step 5: Full Refinance ===");

            const userAddr = user.address;
            const marketContext = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [MAINNET.USDC]);

            // Check current state
            const aaveWethBefore = await getAaveSupplyBalance(MAINNET.WETH, userAddr);
            const aaveUsdcDebtBefore = await getAaveBorrowBalance(MAINNET.USDC, userAddr);
            
            console.log("=== Before Refinance ===");
            console.log("Aave WETH supply:", ethers.formatEther(aaveWethBefore));
            console.log("Aave USDC debt:", ethers.formatUnits(aaveUsdcDebtBefore, 6));

            /**
             * DYNAMIC REFINANCE CHAIN (same as Arbitrum test):
             * 0: Aave.GetBorrowBalance(USDC) -> [Exact Debt Amount]
             * 1: FlashLoan(Balancer, Input=0) -> [RepayAmount with fee]
             * 2: Router.Approve(Aave, USDC)
             * 3: Aave.Repay(USDC, Input=0) -> Clear debt
             * 4: Aave.GetSupplyBalance(WETH) -> [Exact Collateral Amount]
             * 5: Aave.Withdraw(WETH, Input=4) -> Withdraw collateral
             * 6: Router.Approve(Compound, WETH)
             * 7: Compound.DepositCollateral(WETH, Input=4) -> Deposit to Compound
             * 8: Compound.Borrow(USDC, Input=1) -> Borrow to repay flash loan
             */

            const moveInstructions = [
                // 1. Query Debt (Output 0)
                createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetBorrowBalance, MAINNET.USDC, userAddr, 0n, "0x", 999)),

                // 2. Flashloan exact debt amount (Input Index 0) -> Output 1
                createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),

                // 3. Approve Aave to take USDC (Output 2 - empty)
                createRouterInstruction(encodeApprove(1, "aave")),

                // 4. Repay Aave using Input Index 0 (exact debt)
                createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Repay, MAINNET.USDC, userAddr, 0n, "0x", 0)),

                // 5. Query Collateral Balance (Output 4)
                createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.GetSupplyBalance, MAINNET.WETH, userAddr, 0n, "0x", 999)),

                // 6. Withdraw Collateral using Input Index 4 -> Output 5
                createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.WithdrawCollateral, MAINNET.WETH, userAddr, 0n, "0x", 4)),

                // 7. Approve Compound to take WETH (Output 6 - empty)
                createRouterInstruction(encodeApprove(5, "compound")),

                // 8. Deposit Collateral to Compound using Input Index 4
                createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.DepositCollateral, MAINNET.WETH, userAddr, 0n, marketContext, 4)),

                // 9. Borrow USDC from Compound using Input Index 1 (flash loan repay amount)
                createProtocolInstruction("compound", encodeLendingInstruction(LendingOp.Borrow, MAINNET.USDC, userAddr, 0n, marketContext, 1)),
            ];

            console.log("Instructions built:", moveInstructions.length);

            // Authorizations
            console.log("\n--- Getting authorizations ---");
            const [authTargets, authData] = await router.authorizeInstructions(moveInstructions, userAddr);
            
            let authCount = 0;
            for (let i = 0; i < authTargets.length; i++) {
                if (authTargets[i] === ethers.ZeroAddress || authData[i] === "0x") continue;
                console.log(`Auth ${i}: target=${authTargets[i]}`);
                await user.sendTransaction({ to: authTargets[i], data: authData[i] });
                authCount++;
            }
            console.log(`Sent ${authCount} authorization transactions`);

            // Execute
            console.log("\n--- Executing refinance ---");
            try {
                // First try to estimate gas
                console.log("Estimating gas...");
                const gasEstimate = await router.connect(user).processProtocolInstructions.estimateGas(moveInstructions);
                console.log("Gas estimate:", gasEstimate.toString());

                const tx = await router.connect(user).processProtocolInstructions(moveInstructions);
                const receipt = await tx.wait();
                console.log("Transaction mined! Gas used:", receipt.gasUsed.toString());

                // Verify final state
                console.log("\n=== After Refinance ===");
                const aaveWethAfter = await getAaveSupplyBalance(MAINNET.WETH, userAddr);
                const aaveUsdcDebtAfter = await getAaveBorrowBalance(MAINNET.USDC, userAddr);
                const compWethAfter = await getCompoundCollateralBalance(MAINNET.WETH, userAddr);
                const compUsdcDebtAfter = await getCompoundBorrowBalance(userAddr);

                console.log("Aave WETH supply:", ethers.formatEther(aaveWethAfter), "(expected ~0)");
                console.log("Aave USDC debt:", ethers.formatUnits(aaveUsdcDebtAfter, 6), "(expected ~0)");
                console.log("Compound WETH collateral:", ethers.formatEther(compWethAfter), "(expected ~1.0)");
                console.log("Compound USDC debt:", ethers.formatUnits(compUsdcDebtAfter, 6), "(expected > 500)");

                expect(aaveWethAfter).to.be.lt(ethers.parseEther("0.001")); // Dust
                expect(aaveUsdcDebtAfter).to.be.lt(1000n); // Dust
                expect(compWethAfter).to.be.gt(ethers.parseEther("0.9"));
                expect(compUsdcDebtAfter).to.be.gt(500_000_000n);

                console.log("\nSUCCESS: Full refinance completed!");

            } catch (e: any) {
                console.log("\n!!! REFINANCE FAILED !!!");
                console.log("Error:", e.message);
                
                // Try to get more details
                if (e.data) {
                    console.log("Error data:", e.data);
                }
                if (e.reason) {
                    console.log("Reason:", e.reason);
                }
                if (e.transaction) {
                    console.log("Transaction data length:", e.transaction.data?.length);
                }
                
                throw e;
            }
        });

        it("Step 6: ZeroLend USDC deposit (mainnet LRT market)", async function () {
            if (!USE_DEPLOYED) {
                console.log("Skipping ZeroLend test - only works with deployed contracts");
                this.skip();
                return;
            }

            console.log("\n=== Step 6: ZeroLend USDC Deposit ===");
            
            const userAddr = user.address;

            // First, get some USDC for the user by impersonating a whale
            console.log("Funding user with USDC...");
            await network.provider.send("hardhat_setBalance", [MAINNET.USDC_WHALE, "0x56BC75E2D63100000"]);
            await network.provider.request({ method: "hardhat_impersonateAccount", params: [MAINNET.USDC_WHALE] });
            const usdcWhaleSigner = await ethers.getSigner(MAINNET.USDC_WHALE);
            
            const depositAmount = 1000_000_000n; // 1000 USDC
            await (usdc.connect(usdcWhaleSigner) as any).transfer(userAddr, depositAmount, { gasPrice: ethers.parseUnits("200", "gwei") });
            console.log("Funded user with", ethers.formatUnits(depositAmount, 6), "USDC");

            const userUsdcBefore = await usdc.balanceOf(userAddr);
            console.log("User USDC balance before deposit:", ethers.formatUnits(userUsdcBefore, 6));

            // Check if ZeroLend gateway is registered
            const zerolendGateway = await router.gateways("zerolend");
            console.log("ZeroLend gateway:", zerolendGateway);
            
            if (zerolendGateway === ethers.ZeroAddress) {
                console.log("ZeroLend gateway not registered, skipping test");
                this.skip();
                return;
            }

            // Approve router to pull USDC
            await usdc.connect(user).approve(await router.getAddress(), depositAmount);
            console.log("Approved router for", ethers.formatUnits(depositAmount, 6), "USDC");

            // Build deposit instructions for ZeroLend
            const instructions = [
                createRouterInstruction(encodePullToken(depositAmount, MAINNET.USDC, userAddr)),
                createRouterInstruction(encodeApprove(0, "zerolend")),
                createProtocolInstruction("zerolend", encodeLendingInstruction(LendingOp.Deposit, MAINNET.USDC, userAddr, 0n, "0x", 0)),
            ];

            console.log("Instructions built, count:", instructions.length);

            // Get and execute authorizations
            console.log("Getting authorizations...");
            const [authTargets, authData] = await router.authorizeInstructions(instructions, userAddr);
            console.log("Auth targets count:", authTargets.length);
            
            for (let i = 0; i < authTargets.length; i++) {
                if (authTargets[i] === ethers.ZeroAddress || authData[i] === "0x") continue;
                console.log(`Authorizing target ${i}:`, authTargets[i]);
                await user.sendTransaction({ to: authTargets[i], data: authData[i] });
            }

            // Try to estimate gas first
            console.log("Estimating gas...");
            try {
                const gasEstimate = await router.connect(user).processProtocolInstructions.estimateGas(instructions);
                console.log("Gas estimate:", gasEstimate.toString());
            } catch (e: any) {
                console.log("!!! Gas estimation FAILED !!!");
                console.log("Error:", e.message);
                if (e.data) console.log("Error data:", e.data);
                throw e;
            }

            // Execute deposit
            console.log("Executing ZeroLend deposit...");
            try {
                const tx = await router.connect(user).processProtocolInstructions(instructions);
                const receipt = await tx.wait();
                console.log("Gas used:", receipt.gasUsed.toString());

                // Verify - check ZeroLend aToken balance
                const zeroLendSupply = await getZeroLendSupplyBalance(MAINNET.USDC, userAddr);
                console.log("ZeroLend USDC supply after:", ethers.formatUnits(zeroLendSupply, 6));

                const userUsdcAfter = await usdc.balanceOf(userAddr);
                console.log("User USDC balance after:", ethers.formatUnits(userUsdcAfter, 6));

                expect(zeroLendSupply).to.be.closeTo(depositAmount, 1_000_000n); // Allow 1 USDC tolerance
                console.log("SUCCESS: ZeroLend USDC deposit works!");

            } catch (e: any) {
                console.log("\n!!! ZEROLEND DEPOSIT FAILED !!!");
                console.log("Error:", e.message);
                if (e.data) console.log("Error data:", e.data);
                if (e.reason) console.log("Reason:", e.reason);
                throw e;
            }
        });
    });

    // Helper functions to query balances
    async function getZeroLendSupplyBalance(token: string, userAddr: string): Promise<bigint> {
        const poolProvider = await ethers.getContractAt(
            "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
            MAINNET.ZEROLEND_POOL_PROVIDER
        );
        const dataProviderAddr = await poolProvider.getPoolDataProvider();
        const dataProvider = new ethers.Contract(dataProviderAddr, [
            "function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)"
        ], ethers.provider);
        const data = await dataProvider.getUserReserveData(token, userAddr);
        return data[0]; // currentATokenBalance
    }
    async function getAaveSupplyBalance(token: string, userAddr: string): Promise<bigint> {
        const poolProvider = await ethers.getContractAt(
            "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
            MAINNET.AAVE_POOL_PROVIDER
        );
        const dataProviderAddr = await poolProvider.getPoolDataProvider();
        const dataProvider = new ethers.Contract(dataProviderAddr, [
            "function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)"
        ], ethers.provider);
        const data = await dataProvider.getUserReserveData(token, userAddr);
        return data[0]; // currentATokenBalance
    }

    async function getAaveBorrowBalance(token: string, userAddr: string): Promise<bigint> {
        const poolProvider = await ethers.getContractAt(
            "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
            MAINNET.AAVE_POOL_PROVIDER
        );
        const dataProviderAddr = await poolProvider.getPoolDataProvider();
        const dataProvider = new ethers.Contract(dataProviderAddr, [
            "function getUserReserveData(address asset, address user) external view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)"
        ], ethers.provider);
        const data = await dataProvider.getUserReserveData(token, userAddr);
        return data[1] + data[2]; // stableDebt + variableDebt
    }

    async function getCompoundCollateralBalance(token: string, userAddr: string): Promise<bigint> {
        const comet = new ethers.Contract(MAINNET.COMPOUND_USDC_COMET, [
            "function collateralBalanceOf(address account, address asset) external view returns (uint128)"
        ], ethers.provider);
        return await comet.collateralBalanceOf(userAddr, token);
    }

    async function getCompoundBorrowBalance(userAddr: string): Promise<bigint> {
        const comet = new ethers.Contract(MAINNET.COMPOUND_USDC_COMET, [
            "function borrowBalanceOf(address account) external view returns (uint256)"
        ], ethers.provider);
        return await comet.borrowBalanceOf(userAddr);
    }
});
