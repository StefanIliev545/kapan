import { expect } from "chai";
import { ethers, network, deployments } from "hardhat";
import {
    createRouterInstruction,
    createProtocolInstruction,
    encodePullToken,
    encodeApprove,
    encodePushToken,
    LendingOp,
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

// Kyber chain name for Arbitrum
const KYBER_CHAIN = "arbitrum";

describe("v2 Kyber Integration (fork)", function () {
    this.timeout(120000);
    before(function () {
        if (!FORK) {
            throw new Error("MAINNET_FORKING_ENABLED must be true to run fork tests");
        }
        const chainId = network.config.chainId;
        if (chainId !== 42161 && chainId !== 31337) {
            console.log(`Skipping Arbitrum Kyber tests: Current chain ID is ${chainId}, expected 42161 or 31337`);
            this.skip();
        }
    });

    it("should swap USDC to WETH via Kyber", async function () {
        const { deployer } = await ethers.getNamedSigners();
        await deployments.fixture(["KapanRouter", "KyberGateway"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const gateway = await ethers.getContractAt("KyberGateway", (await deployments.get("KyberGateway")).address);
        const adapterAddress = await gateway.adapter();

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

        const whale = await ethers.getSigner(USDC_WHALE);
        const amountIn = 100_000_000n; // 100 USDC
        const feeBuffer = 100_000n;
        const depositAmount = amountIn + feeBuffer;
        await (usdc.connect(whale) as any).transfer(userAddress, depositAmount);

        // Approve Router
        await (usdc.connect(user) as any).approve(await router.getAddress(), amountIn);

        // Step 1: Get route from Kyber
        const routeUrl = `https://aggregator-api.kyberswap.com/${KYBER_CHAIN}/api/v1/routes?tokenIn=${USDC}&tokenOut=${WETH}&amountIn=${amountIn}`;
        console.log("Fetching route from:", routeUrl);

        const routeResponse = execSync(`curl -s "${routeUrl}"`).toString();
        console.log("Route Response:", routeResponse.slice(0, 500));
        const routeJson = JSON.parse(routeResponse);

        if (routeJson.code !== 0 || !routeJson.data?.routeSummary) {
            throw new Error(`Kyber route error: ${routeJson.message || "No route found"}`);
        }

        const routeSummary = routeJson.data.routeSummary;
        const minAmountOut = BigInt(routeSummary.amountOut);
        const minAmountOutCheck = (minAmountOut * 97n) / 100n; // 3% slippage buffer

        // Step 2: Build swap transaction
        const buildUrl = `https://aggregator-api.kyberswap.com/${KYBER_CHAIN}/api/v1/route/build`;
        const buildBody = JSON.stringify({
            routeSummary,
            sender: adapterAddress,
            recipient: adapterAddress,
            slippageTolerance: 300, // 3% in bps
            enableGasEstimation: false, // Disable - adapter doesn't have tokens yet
        });

        console.log("Building swap with body:", buildBody.slice(0, 200));
        const buildResponse = execSync(`curl -s -X POST "${buildUrl}" -H "Content-Type: application/json" -d '${buildBody}'`).toString();
        console.log("Build Response:", buildResponse.slice(0, 500));
        const buildJson = JSON.parse(buildResponse);

        if (buildJson.code !== 0 || !buildJson.data?.data) {
            throw new Error(`Kyber build error: ${buildJson.message || "Build failed"}`);
        }

        const txData = buildJson.data.data;
        console.log("Swap Data Length:", txData.length);
        console.log("Expected Output:", minAmountOut.toString());

        // Encode Swap Context
        const swapContext = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "bytes"],
            [WETH, minAmountOutCheck, txData]
        );

        // Construct Instructions
        const allInstrs = [
            // 1. Pull USDC from User
            createRouterInstruction(encodePullToken(amountIn, USDC, userAddress)),
            // 2. Approve KyberGateway
            createRouterInstruction(encodeApprove(0, "kyber")),
            // 3. Execute Swap via Gateway
            createProtocolInstruction(
                "kyber",
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

        // Dust checks: Router and Adapter should not retain balances
        const routerAddress = await router.getAddress();
        const routerUsdcBal = await (usdc as any).balanceOf(routerAddress);
        const routerWethBal = await (weth as any).balanceOf(routerAddress);
        expect(routerUsdcBal).to.equal(0n, "Router should have 0 USDC left after simple swap");
        expect(routerWethBal).to.equal(0n, "Router should have 0 WETH left after simple swap");

        const adapterUsdcBal = await (usdc as any).balanceOf(adapterAddress);
        const adapterWethBal = await (weth as any).balanceOf(adapterAddress);
        expect(adapterUsdcBal).to.equal(0n, "Adapter should have 0 USDC left");
        expect(adapterWethBal).to.equal(0n, "Adapter should have 0 WETH left");
    });
});
