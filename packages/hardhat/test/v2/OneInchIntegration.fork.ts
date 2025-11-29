import { expect } from "chai";
import { ethers, network, deployments } from "hardhat";
import {
    createRouterInstruction,
    createProtocolInstruction,
    encodePullToken,
    encodeApprove,
    encodePushToken,
    encodeFlashLoan,
    LendingOp,
} from "./helpers/instructionHelpers";
import { TokenConfig } from "./helpers/lendingTestTemplate";
import { execSync } from "child_process";

// Env vars and config
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
// Arbitrum USDC
const USDC = (process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
// Arbitrum WETH
const WETH = (process.env.WETH_ARB || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1").toLowerCase();
// Arbitrum USDC Whale
const USDC_WHALE = process.env.USDC_WHALE_ARB || "0x47c031236e19d024b42f8AE6780E44A573170703";

const USDC_TOKEN: TokenConfig = {
    address: USDC,
    decimals: 6,
    whale: USDC_WHALE,
};

describe("v2 OneInch Integration (fork)", function () {
    before(function () {
        if (!FORK) {
            throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
        }
        // Check if we are on Arbitrum (42161)
        // Check if we are on Arbitrum (42161) or Hardhat (31337)
        const chainId = network.config.chainId;
        if (chainId !== 42161 && chainId !== 31337) {
            console.log(`Skipping Arbitrum OneInch tests: Current chain ID is ${chainId}, expected 42161 or 31337`);
            this.skip();
        }
        if (!process.env.ONE_INCH_API_KEY) {
            console.log("Skipping OneInch tests: ONE_INCH_API_KEY not set");
            this.skip();
        }
    });

    it("should swap USDC to WETH via 1inch", async function () {
        const { deployer } = await ethers.getNamedSigners();
        await deployments.fixture(["KapanRouter", "OneInchGateway"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const gateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
        const adapterAddress = await gateway.adapter();

        // Setup User
        const user = deployer; // Use deployer as user for simplicity
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

        const whale = await ethers.getSigner(USDC_WHALE);
        const amountIn = 100_000_000n; // 100 USDC
        await (usdc.connect(whale) as any).transfer(userAddress, amountIn);

        // Approve Router
        await (usdc.connect(user) as any).approve(await router.getAddress(), amountIn);

        // Fetch Quote using FFI (curl)
        // We use a simple curl command to fetch the quote
        // Note: In a real CI environment, we might want a more robust script
        const apiUrl = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${USDC}&dst=${WETH}&amount=${amountIn}&from=${adapterAddress}&slippage=3&disableEstimate=true`;

        console.log("Fetching quote from:", apiUrl);
        const curlCmd = `curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${apiUrl}"`;
        let response;
        try {
            response = execSync(curlCmd).toString();
            console.log("API Response:", response);
        } catch (e: any) {
            console.error("Curl failed:", e.message);
            throw e;
        }
        const json = JSON.parse(response);

        if (json.error) {
            throw new Error(`1inch API Error: ${json.error} - ${json.description}`);
        }

        const txData = json.tx.data;
        const minAmountOut = BigInt(json.dstAmount); // Using dstAmount as minAmountOut for test (slippage applied in API call usually affects minAmountOut field if present, but here we just want to verify execution)
        // Actually, 1inch API returns `dstAmount` as the expected amount. `minAmountOut` is not explicitly returned in top level usually, but encoded in data?
        // Wait, the API response usually has `dstAmount`. We can use a slightly lower amount for minAmountOut check in our contract.
        const minAmountOutCheck = (minAmountOut * 99n) / 100n; // 1% slippage buffer

        console.log("Swap Data Length:", txData.length);
        console.log("Expected Output:", minAmountOut);

        // Encode Swap Context
        const swapContext = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "bytes"],
            [WETH, minAmountOutCheck, txData]
        );

        // Construct Instructions
        const allInstrs = [
            // 1. Pull USDC from User
            createRouterInstruction(encodePullToken(amountIn, USDC, userAddress)),
            // 2. Approve OneInchGateway
            createRouterInstruction(encodeApprove(0, "oneinch")),
            // 3. Execute Swap via Gateway
            createProtocolInstruction(
                "oneinch",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Swap, USDC, userAddress, amountIn, swapContext, { index: 0 }]]
                )
            ),
            // 4. Push WETH to User (Output 0 of Swap -> Index 2)
            createRouterInstruction(encodePushToken(2, userAddress)),
            // 5. Push USDC Refund to User (Output 1 of Swap -> Index 3)
            createRouterInstruction(encodePushToken(3, userAddress)),
        ];

        const balanceBefore = await (weth as any).balanceOf(userAddress);
        const usdcBalanceBefore = await (usdc as any).balanceOf(userAddress);

        // Execute
        await (await router.connect(user).processProtocolInstructions(allInstrs)).wait();

        const balanceAfter = await (weth as any).balanceOf(userAddress);
        const usdcBalanceAfter = await (usdc as any).balanceOf(userAddress);

        const received = balanceAfter - balanceBefore;
        const refund = usdcBalanceAfter - usdcBalanceBefore;

        console.log("Received WETH:", received.toString());
        console.log("Refund USDC:", refund.toString());

        expect(received).to.be.gte(minAmountOutCheck);
        // Refund might be 0 if exact amount was swapped, which is fine.
        // We just verify the instruction didn't revert.
    });
    it("should execute full collateral swap flow (FlashLoan -> Swap -> Deposit -> Withdraw -> Repay)", async function () {
        const { getNamedAccounts } = require("hardhat");
        const { deployer } = await getNamedAccounts();
        await deployments.fixture(["KapanRouter", "OneInchGateway", "AaveGatewayWrite"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const gateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
        const adapterAddress = await gateway.adapter();
        const aaveGateway = await ethers.getContractAt("AaveGatewayWrite", (await deployments.get("AaveGatewayWrite")).address);

        // Setup User
        const userSigner = await ethers.getSigner(deployer);
        const userAddress = deployer;

        // Fund User with USDC (Collateral to Swap From)
        const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
        const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [USDC_WHALE],
        });
        await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x1000000000000000000"]); // 1 ETH

        const whale = await ethers.getSigner(USDC_WHALE);
        const amountIn = 100_000_000n; // 100 USDC
        await (usdc.connect(whale) as any).transfer(userAddress, amountIn);

        // Approve Router for USDC
        await (usdc.connect(userSigner) as any).approve(await router.getAddress(), amountIn);

        // 1. Supply USDC to Aave (Simulate existing position)
        // We need to supply USDC first so we can withdraw it later
        // Actually, the flow is: FlashLoan USDC -> Swap to WETH -> Deposit WETH -> Withdraw USDC -> Repay FlashLoan
        // So the user must have USDC deposited in Aave.

        // Deposit USDC into Aave via Router
        const depositInstrs = [
            createRouterInstruction(encodePullToken(amountIn, USDC, userAddress)),
            createRouterInstruction(encodeApprove(0, "aave")),
            createProtocolInstruction("aave", ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                [[LendingOp.Deposit, USDC, userAddress, 0n, "0x", { index: 0 }]]
            ))
        ];
        await (await router.connect(userSigner).processProtocolInstructions(depositInstrs)).wait();

        console.log("Initial USDC Deposit complete");

        // Fetch Quote for USDC -> WETH
        const apiUrl = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${USDC}&dst=${WETH}&amount=${amountIn}&from=${adapterAddress}&slippage=3&disableEstimate=true`;
        console.log("Fetching quote from:", apiUrl);
        const curlCmd = `curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${apiUrl}"`;
        const response = execSync(curlCmd).toString();
        const json = JSON.parse(response);

        if (json.error) throw new Error(`1inch API Error: ${json.error}`);

        const txData = json.tx.data;
        const minAmountOut = (BigInt(json.dstAmount) * 97n) / 100n; // 3% slippage

        // Encode Swap Context
        const swapContext = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "bytes"],
            [WETH, minAmountOut, txData]
        );

        // Construct Full Flow Instructions
        // 1. Create UTXO for Flash Loan Amount (USDC) -> Output 0
        // 2. Flash Loan USDC (Balancer) -> Output 1
        // 3. Approve OneInchGateway (Output 1)
        // 4. Swap USDC -> WETH (Output 2) + Refund (Output 3)
        // 5. Approve Aave (Output 2 - WETH)
        // 6. Deposit WETH into Aave
        // 7. Withdraw USDC from Aave -> Output 4
        // 8. Repay Flash Loan (Implicitly handled by Router having funds in Output 4?)
        //    Wait, Balancer Flash Loan callback expects funds to be in the contract.
        //    The Withdraw instruction pulls funds to the Router. So it should work.

        const fullFlowInstrs = [
            // 0. Create UTXO for Flash Loan Amount
            createRouterInstruction(ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint256 amount,address token,address user,uint8 instructionType)"],
                [[amountIn, USDC, "0x0000000000000000000000000000000000000000", 3]] // ToOutput
            )),
            // 1. Flash Loan (Balancer)
            createRouterInstruction(encodeFlashLoan(0, 0)), // BalancerV2, Input 0
            // 2. Approve OneInchGateway
            createRouterInstruction(encodeApprove(1, "oneinch")),
            // 3. Swap USDC -> WETH
            createProtocolInstruction(
                "oneinch",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Swap, USDC, userAddress, 0n, swapContext, { index: 1 }]]
                )
            ),
            // 4. Approve Aave (WETH)
            createRouterInstruction(encodeApprove(3, "aave")), // Output 3 is WETH (Swap produces [WETH, Refund])

            // 5. Deposit WETH
            createProtocolInstruction("aave", ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                [[LendingOp.Deposit, WETH, userAddress, 0n, "0x", { index: 3 }]]
            )),

            // 6. Withdraw USDC
            // We withdraw the exact amount we flash loaned to repay it.
            createProtocolInstruction("aave", ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                [[LendingOp.WithdrawCollateral, USDC, userAddress, 0n, "0x", { index: 1 }]]
            ))
        ];

        console.log("Executing Full Flow...");

        // Authorize instructions
        const [targets, data] = await router.authorizeInstructions(fullFlowInstrs, userAddress);
        console.log(`Authorization required: ${targets.length} txs`);
        for (let i = 0; i < targets.length; i++) {
            if (targets[i] !== ethers.ZeroAddress) {
                await (userSigner.sendTransaction({
                    to: targets[i],
                    data: data[i]
                }));
            }
        }

        await (await router.connect(userSigner).processProtocolInstructions(fullFlowInstrs)).wait();
        console.log("Full Flow Executed Successfully");
    });
});
