import { expect } from "chai";
import { ethers, network, deployments } from "hardhat";
import {
    createRouterInstruction,
    createProtocolInstruction,
    encodePullToken,
    encodeApprove,
    encodePushToken,
    encodeFlashLoan,
    encodeLendingInstruction,
    LendingOp,
    FlashLoanProvider,
    encodeToOutput,
    encodeDeposit,
} from "./helpers/instructionHelpers";
import { execSync } from "child_process";

// Env vars and config
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
// Arbitrum USDC
const USDC = (process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
// Arbitrum WETH
const WETH = (process.env.WETH_ARB || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1").toLowerCase();
// Arbitrum USDC Whale
const USDC_WHALE = process.env.USDC_WHALE_ARB || "0x47c031236e19d024b42f8AE6780E44A573170703";

describe("v2 Collateral Swap (fork)", function () {
    before(function () {
        if (!FORK) {
            throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
        }
        // Check if we are on Arbitrum (42161)
        const chainId = network.config.chainId;
        if (chainId !== 42161 && chainId !== 31337) {
            console.log(`Skipping Arbitrum Collateral Swap tests: Current chain ID is ${chainId}, expected 42161 or 31337`);
            this.skip();
        }
        if (!process.env.ONE_INCH_API_KEY) {
            console.log("Skipping Collateral Swap tests: ONE_INCH_API_KEY not set");
            this.skip();
        }
    });

    it("should swap USDC collateral to WETH collateral on Aave V3", async function () {
        this.timeout(120000); // 2 minutes timeout for fork test
        const { deployer } = await ethers.getNamedSigners();
        // Deploy Router, OneInchGateway, and AaveGateway
        await deployments.fixture(["KapanRouter", "OneInchGateway", "AaveGatewayWrite"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const oneInchGateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
        const aaveGateway = await ethers.getContractAt("AaveGatewayWrite", (await deployments.get("AaveGatewayWrite")).address);
        const adapterAddress = await oneInchGateway.adapter();

        // DEBUG: Check gateways
        console.log("Checking gateways...");
        console.log("Gateway 'aave':", await router.gateways("aave"));
        console.log("Gateway address string:", await aaveGateway.getAddress());
        console.log("Gateway by address string:", await router.gateways(await aaveGateway.getAddress()));

        // Manual registration to ensure it exists
        if ((await router.gateways("aave")) === ethers.ZeroAddress) {
            console.log("Manually registering 'aave' gateway...");
            await (await router.connect(deployer).addGateway("aave", await aaveGateway.getAddress())).wait();
        }

        // Also register the address string just in case the deposit relied on it (though it shouldn't)
        // REMOVED: We are fixing the usage below to use "aave"

        // Setup User
        const user = deployer;
        const userAddress = await user.getAddress();

        // Fund User with USDC
        const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
        const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [USDC_WHALE],
        });

        // Fund whale with ETH for gas
        await network.provider.send("hardhat_setBalance", [
            USDC_WHALE,
            "0x1000000000000000000", // 1 ETH
        ]);

        const usdcWhaleSigner = await ethers.getImpersonatedSigner(USDC_WHALE);
        const initialAmount = 100_000_000n; // 100 USDC
        await usdc.connect(usdcWhaleSigner).transfer(userAddress, initialAmount);
        await usdc.connect(user).approve(await router.getAddress(), initialAmount);

        // 1. Deposit USDC to Aave
        // We use "aave" for the approve target, which should match the registered gateway
        const depositInstrs = [
            createRouterInstruction(encodePullToken(initialAmount, USDC, userAddress)),
            createRouterInstruction(encodeApprove(0, "aave")),
            createProtocolInstruction("aave", encodeDeposit(USDC, initialAmount, userAddress))
        ];

        console.log("Depositing USDC into Aave V3...");
        await (await router.connect(user).processProtocolInstructions(depositInstrs)).wait();

        // Verify Deposit
        // Get aToken address for USDC
        const poolAddressesProvider = await ethers.getContractAt("@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider", await aaveGateway.poolAddressesProvider());
        const poolDataProvider = await ethers.getContractAt("@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol:IPoolDataProvider", await poolAddressesProvider.getPoolDataProvider());
        const aUSDCAddress = (await poolDataProvider.getReserveTokensAddresses(USDC)).aTokenAddress;
        const aUSDC = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", aUSDCAddress);

        console.log("USDC Address:", USDC);
        console.log("aUSDC Address:", aUSDCAddress);
        console.log("User Address:", userAddress);
        console.log("Gateway Address:", await aaveGateway.getAddress());

        const userAUSDCBalance = await aUSDC.balanceOf(userAddress);
        const gatewayAUSDCBalance = await aUSDC.balanceOf(await aaveGateway.getAddress());

        console.log("User aUSDC Balance:", userAUSDCBalance.toString());
        console.log("Gateway aUSDC Balance:", gatewayAUSDCBalance.toString());

        // Allow for 1-2 wei precision loss
        expect(userAUSDCBalance).to.be.gte(initialAmount - 5n);

        // Approve AaveGateway to spend user's aUSDC (for WithdrawCollateral)
        console.log("Approving AaveGateway to spend aUSDC...");
        await aUSDC.connect(user).approve(await aaveGateway.getAddress(), ethers.MaxUint256);

        // 2. Perform Collateral Swap: USDC -> WETH
        // Amount to swap = initialAmount (or balance if slightly less)
        const amountIn = userAUSDCBalance;

        // Fetch 1inch Quote
        const apiUrl = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${USDC}&dst=${WETH}&amount=${amountIn}&from=${adapterAddress}&slippage=50&disableEstimate=true`;
        console.log("Fetching quote from:", apiUrl);
        const curlCmd = `curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${apiUrl}"`;
        const response = execSync(curlCmd).toString();
        const json = JSON.parse(response);

        if (json.error) {
            throw new Error(`1inch API Error: ${json.error} - ${json.description}`);
        }

        const txData = json.tx.data;
        const minAmountOut = BigInt(json.dstAmount);
        const minAmountOutCheck = (minAmountOut * 99n) / 100n; // 1% slippage

        console.log("Swap Data Length:", txData.length);
        console.log("Expected Output:", minAmountOut);

        // Encode Swap Context
        const swapContext = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "bytes"],
            [WETH, minAmountOutCheck, txData]
        );

        // Construct Collateral Swap Instructions
        // 0. Create UTXO for Flash Loan Amount/Token -> Output 0
        // 1. Flash Loan (uses Output 0) -> Output 1 (Borrowed Funds)
        // 2. Approve TokenIn (Output 1) for OneInchGateway
        // 3. Swap TokenIn (Output 1) -> TokenOut (Output 2) + Refund (Output 3)
        // 4. Approve TokenOut (Output 2) for LendingProtocol
        // 5. Deposit TokenOut (Output 2) into LendingProtocol
        // 6. Withdraw TokenIn from LendingProtocol -> Output 4
        // 7. Repay Flash Loan (Implicit, Router handles it if Output 4 matches Flash Loan amount)

        const swapInstrs = [
            // 0. Seed Flash Loan Input
            createRouterInstruction(encodeToOutput(amountIn, USDC)),

            // 1. Flash Loan (Balancer V2)
            // Uses Output 0 (USDC amount)
            createRouterInstruction(encodeFlashLoan(FlashLoanProvider.BalancerV2, 0)),

            // 2. Approve OneInchGateway to spend USDC (Output 1 from FlashLoan)
            createRouterInstruction(encodeApprove(1, "oneinch")),

            // 3. Swap USDC -> WETH (via 1inch)
            // Uses Output 1 (USDC)
            createProtocolInstruction("oneinch", encodeLendingInstruction(LendingOp.Swap, USDC, userAddress, amountIn, swapContext, 1)),

            // 4. Approve AaveGateway to spend WETH (Output 3 from Swap)
            createRouterInstruction(encodeApprove(3, "aave")),

            // 5. Deposit WETH (Output 3) into Aave
            createProtocolInstruction("aave", encodeLendingInstruction(LendingOp.Deposit, WETH, userAddress, minAmountOutCheck, "0x", 3)),

            // 6. Withdraw TokenIn (USDC) from Aave -> Output 4
            // We need to withdraw exactly amountIn to repay the flash loan
            createProtocolInstruction(
                "aave",
                encodeLendingInstruction(LendingOp.WithdrawCollateral, USDC, userAddress, amountIn, "0x", 999)
            ),
        ];

        console.log("Executing Collateral Swap...");
        await (await router.connect(user).processProtocolInstructions(swapInstrs)).wait();

        // Verify Result
        const aBalanceAfter = await (aUSDC as any).balanceOf(userAddress);
        console.log("User aUSDC Balance After:", aBalanceAfter.toString());
        expect(aBalanceAfter).to.be.lt(initialAmount); // Should be near 0

        // Check aWETH balance
        // Aave V3 Arbitrum aWETH: 0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8
        const aWETH = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", "0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8");
        const aWethBalance = await (aWETH as any).balanceOf(userAddress);
        console.log("User aWETH Balance:", aWethBalance.toString());
        expect(aWethBalance).to.be.gt(0);
    });
});
