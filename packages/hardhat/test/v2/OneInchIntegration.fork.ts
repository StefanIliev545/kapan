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
import { execSync } from "child_process";

// Env vars and config
const FORK = process.env.MAINNET_FORKING_ENABLED === "true";
// Arbitrum USDC
const USDC = (process.env.USDC_ARB || "0xaf88d065e77c8cC2239327C5EDb3A432268e5831").toLowerCase();
// Arbitrum WETH
const WETH = (process.env.WETH_ARB || "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1").toLowerCase();
// Arbitrum USDT
const USDT = (process.env.USDT_ARB || "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9").toLowerCase();
// Arbitrum USDC Whale
const USDC_WHALE = process.env.USDC_WHALE_ARB || "0x47c031236e19d024b42f8AE6780E44A573170703";

// Note: USDC token metadata available via chain, no local TokenConfig needed here

describe("v2 OneInch Integration (fork)", function () {
    this.timeout(120000);
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
        const amountIn = 100_000_000n; // 100 USDC to flash-loan
        const feeBuffer = 100_000n; // ~0.1% buffer (for Balancer V2 fee variability)
        const depositAmount = amountIn + feeBuffer; // deposit a bit more than flash loan
        await (usdc.connect(whale) as any).transfer(userAddress, depositAmount);

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

    it("should swap exact output USDC to WETH via 1inch (simulated with over-supply)", async function () {
        const { deployer } = await ethers.getNamedSigners();
        await deployments.fixture(["KapanRouter", "OneInchGateway"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const gateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
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

        const whale = await ethers.getSigner(USDC_WHALE);

        console.log("Whale Address:", USDC_WHALE);
        await network.provider.send("hardhat_setBalance", [
            USDC_WHALE,
            "0xDE0B6B3A7640000", // 1 ETH
        ]);

        const whaleBalance = await ethers.provider.getBalance(USDC_WHALE);
        console.log("Whale ETH Balance:", whaleBalance.toString());

        // Oversupply input; we'll set exact-out by using quoted output amount
        const maxAmountIn = 100_000_000n; // 100 USDC (plenty for ~0.01 WETH)

        await (usdc.connect(whale) as any).transfer(userAddress, maxAmountIn);

        // Approve Router
        await (usdc.connect(user) as any).approve(await router.getAddress(), maxAmountIn);

        // Strategy: approximate minimal input for a target output using iterative quotes
        // Seed: 0.01 WETH target-ish via an initial quote from 35 USDC
        const seedInput = 35_000_000n; // 35 USDC
        const seedUrl = `https://api.1inch.dev/swap/v6.0/42161/quote?src=${USDC}&dst=${WETH}&amount=${seedInput}`;
        console.log("Seed quote from:", seedUrl);
        const response = execSync(`curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${seedUrl}"`).toString();
        const seedRes = JSON.parse(response);
        if (seedRes.error) throw new Error(`Quote Error: ${seedRes.error}`);
        const targetExactOut = BigInt(seedRes.dstAmount);
        console.log(`TargetOut (from seed ${seedInput}): ${targetExactOut} WETH`);

        // Binary search on input to reach targetExactOut
        let low = 1_000_000n; // 1 USDC
        let high = maxAmountIn;
        let found = high;
        for (let i = 0; i < 6; i++) {
            const mid = (low + high) / 2n;
            const qUrl = `https://api.1inch.dev/swap/v6.0/42161/quote?src=${USDC}&dst=${WETH}&amount=${mid}`;
            const qResp = execSync(`curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${qUrl}"`).toString();
            const q = JSON.parse(qResp);
            if (q.error) break;
            const out = BigInt(q.dstAmount);
            if (out >= targetExactOut) {
                found = mid;
                high = mid - 1n;
            } else {
                low = mid + 1n;
            }
        }

        // Add a small buffer to be safe vs path variance
        const swapInput = (found * 101n) / 100n; // +1%
        const finalInput = swapInput > maxAmountIn ? maxAmountIn : swapInput;

        const apiUrl = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${USDC}&dst=${WETH}&amount=${finalInput}&from=${adapterAddress}&slippage=1&disableEstimate=true`;
        console.log("Fetching swap from:", apiUrl);
        const swapCmd = `curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${apiUrl}"`;
        const swapResponse = execSync(swapCmd).toString();
        const json = JSON.parse(swapResponse);
        if (json.error) throw new Error(`Swap Error: ${json.error}`);

        const txData = json.tx.data;

        // Exact-out target set from seed; safeInput equals finalInput
        const safeInput = finalInput; // For assertion later


        // Encode Swap Context
        // For exact out, we pass the exact target amount we got from the quote
        const swapContext = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "bytes"],
            [WETH, targetExactOut, txData]
        );

        // Construct Instructions
        const allInstrs = [
            // 1. Pull USDC from User (Max Amount)
            createRouterInstruction(encodePullToken(maxAmountIn, USDC, userAddress)),
            // 2. Approve OneInchGateway
            createRouterInstruction(encodeApprove(0, "oneinch")),
            // 3. Execute SwapExactOut via Gateway
            createProtocolInstruction(
                "oneinch",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.SwapExactOut, USDC, userAddress, maxAmountIn, swapContext, { index: 0 }]]
                )
            ),
            // 4. Push WETH to User (Output 0 -> Index 2)
            createRouterInstruction(encodePushToken(2, userAddress)),
            // 5. Push USDC Refund to User (Output 1 -> Index 3)
            createRouterInstruction(encodePushToken(3, userAddress)),
        ];

        const balanceBefore = await (weth as any).balanceOf(userAddress);
        const usdcBalanceBefore = await (usdc as any).balanceOf(userAddress);

        // Execute
        await (await router.connect(user).processProtocolInstructions(allInstrs)).wait();
        const balanceAfter = await (weth as any).balanceOf(userAddress);
        const usdcBalanceAfter = await (usdc as any).balanceOf(userAddress);

        const received = balanceAfter - balanceBefore;
        const netUsdcChange = usdcBalanceAfter - usdcBalanceBefore;
        // Net change = Refund - Pulled
        // Refund = Net change + Pulled
        const actualRefund = BigInt(netUsdcChange) + maxAmountIn;

        console.log("Received WETH:", received.toString());
        console.log("Net USDC Change:", netUsdcChange.toString());
        console.log("Calculated Refund:", actualRefund.toString());
        console.log("Target WETH:", targetExactOut.toString());

        // We expect to receive exactly the target amount (or very close, depending on slippage/rounding)
        // Since we used the exact input from the quote, we should get the quoted output.
        // But in practice, slight variations might happen.
        // The contract enforces received >= targetExactOut.
        expect(received).to.be.gte(targetExactOut);

        // Refund should be positive (maxAmountIn - swapInput)
        // 100 - 35 = 65 USDC
        expect(actualRefund).to.be.closeTo(maxAmountIn - safeInput, 5000000n); // Allow some buffer

        // Verify No Dust in Router
        const routerUsdc = await (usdc as any).balanceOf(await router.getAddress());
        const routerWeth = await (weth as any).balanceOf(await router.getAddress());

        expect(routerUsdc).to.equal(0n, "Router should have 0 USDC left");
        expect(routerWeth).to.equal(0n, "Router should have 0 WETH left");

        // Adapter dust check
        const adapterUsdc = await (usdc as any).balanceOf(adapterAddress);
        const adapterWeth = await (weth as any).balanceOf(adapterAddress);
        expect(adapterUsdc).to.equal(0n, "Adapter should have 0 USDC left");
        expect(adapterWeth).to.equal(0n, "Adapter should have 0 WETH left");
    });

    it("should execute full collateral swap flow (FlashLoan -> Swap -> Deposit -> Withdraw -> Repay)", async function () {
        const { deployer } = await ethers.getNamedSigners();
        await deployments.fixture(["KapanRouter", "OneInchGateway", "AaveGatewayWrite"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const gateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
        const adapterAddress = await gateway.adapter();
        const aaveGateway = await ethers.getContractAt("AaveGatewayWrite", (await deployments.get("AaveGatewayWrite")).address);

        // Setup User
        const userSigner = deployer;
        const userAddress = await deployer.getAddress();

        // Fund User with USDC (Collateral to Swap From)
        const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
        const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [USDC_WHALE],
        });
        await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x1000000000000000000"]); // 1 ETH

        const whale = await ethers.getSigner(USDC_WHALE);
        const amountIn = 100_000_000n; // 100 USDC to flash-loan
        const feeBuffer = 100_000n; // ~0.1% buffer (for Balancer V2 fee variability)
        const depositAmount = amountIn + feeBuffer;
        await (usdc.connect(whale) as any).transfer(userAddress, depositAmount);

        // Approve Router for USDC
        await (usdc.connect(userSigner) as any).approve(await router.getAddress(), depositAmount);

        // 1. Supply USDC to Aave (Simulate existing position)
        // We need to supply USDC first so we can withdraw it later
        // Actually, the flow is: FlashLoan USDC -> Swap to WETH -> Deposit WETH -> Withdraw USDC -> Repay FlashLoan
        // So the user must have USDC deposited in Aave.

        // Deposit USDC into Aave via Router
        const depositInstrs = [
            createRouterInstruction(encodePullToken(depositAmount, USDC, userAddress)),
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
            // 4. Approve Aave (WETH at Output 3)
            createRouterInstruction(encodeApprove(3, "aave")),

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

        // Dust checks post full flow
        const routerAddress2 = await router.getAddress();
        const routerUsdc2 = await (usdc as any).balanceOf(routerAddress2);
        const routerWeth2 = await (weth as any).balanceOf(routerAddress2);
        expect(routerUsdc2).to.equal(0n, "Router should have 0 USDC after full flow");
        expect(routerWeth2).to.equal(0n, "Router should have 0 WETH after full flow");

        const adapterUsdc2 = await (usdc as any).balanceOf(adapterAddress);
        const adapterWeth2 = await (weth as any).balanceOf(adapterAddress);
        expect(adapterUsdc2).to.equal(0n, "Adapter should have 0 USDC after full flow");
        expect(adapterWeth2).to.equal(0n, "Adapter should have 0 WETH after full flow");

        const aaveAddr = await aaveGateway.getAddress();
        const aaveUsdc = await (usdc as any).balanceOf(aaveAddr);
        const aaveWeth = await (weth as any).balanceOf(aaveAddr);
        expect(aaveUsdc).to.equal(0n, "Aave gateway should have 0 USDC after full flow");
        expect(aaveWeth).to.equal(0n, "Aave gateway should have 0 WETH after full flow");
    });

    it("should close Aave USDC debt using WETH collateral via 1inch (no dust, debt zero)", async function () {
        const { deployer } = await ethers.getNamedSigners();
        await deployments.fixture(["KapanRouter", "OneInchGateway", "AaveGatewayWrite"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const gateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
        const adapterAddress = await gateway.adapter();
        const aaveGateway = await ethers.getContractAt("AaveGatewayWrite", (await deployments.get("AaveGatewayWrite")).address);
        const aaveView = await ethers.getContractAt("AaveGatewayView", (await deployments.get("AaveGatewayView")).address);

        const user = deployer;
        const userAddress = await user.getAddress();

        const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
        const weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH);

        // 1) Seed user with WETH by wrapping ETH (no whale dependency)
        const IWETH = new ethers.Interface(["function deposit() payable", "function approve(address,uint256) external returns (bool)"]);
        const wethAsUser = new ethers.Contract(WETH, IWETH, user);
        await (await wethAsUser.deposit({ value: ethers.parseEther("2.0") })).wait();

        // Create initial Aave position: deposit WETH collateral, borrow USDC
        const depositWeth = ethers.parseEther("1.0");
        const borrowUsdc = 50_000_000n; // 50 USDC

        const setupInstrs = [
            // Pull WETH for deposit
            createRouterInstruction(encodePullToken(depositWeth, WETH, userAddress)),
            createRouterInstruction(encodeApprove(0, "aave")),
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Deposit, WETH, userAddress, 0n, "0x", { index: 0 }]]
                )
            ),
            // Borrow USDC (produce output) and push to user to clear router UTXO at end
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Borrow, USDC, userAddress, borrowUsdc, "0x", { index: 999 }]]
                )
            ),
            // Borrow output will be at index 2 (after pull+approve produced indices 0 and 1)
            createRouterInstruction(encodePushToken(2, userAddress)),
        ];

        // Authorize and execute setup (handles credit delegation etc.)
        {
            const [targets, data] = await router.authorizeInstructions(setupInstrs, userAddress);
            for (let i = 0; i < targets.length; i++) {
                if (targets[i] !== ethers.ZeroAddress) {
                    await user.sendTransaction({ to: targets[i], data: data[i] });
                }
            }
            await (await router.connect(user).processProtocolInstructions(setupInstrs)).wait();
        }

        // Move user's USDC away so closure relies solely on collateral
        await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
        const whale = await ethers.getSigner(USDC_WHALE);
        const userUsdcBal = await (usdc as any).balanceOf(userAddress);
        if (userUsdcBal > 0n) {
            await (usdc.connect(user) as any).transfer(await whale.getAddress(), userUsdcBal);
        }

        // 2) Compute target repay and approximate minimal WETH needed via iterative quotes
        const repayTarget = borrowUsdc; // could add +1% buffer if desired
        // Binary-search minimal WETH to reach repayTarget in USDC
        let lowWei = ethers.parseEther("0.001"); // 0.001 WETH
        let highWei = ethers.parseEther("1.0"); // cap at 1 WETH
        let foundWei = highWei;
        for (let i = 0; i < 6; i++) {
            const mid = (lowWei + highWei) / 2n;
            const qUrl = `https://api.1inch.dev/swap/v6.0/42161/quote?src=${WETH}&dst=${USDC}&amount=${mid}`;
            const qResp = execSync(`curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${qUrl}"`).toString();
            const q = JSON.parse(qResp);
            if (q.error) break;
            const out = BigInt(q.dstAmount);
            if (out >= repayTarget) {
                foundWei = mid;
                highWei = mid - 1n;
            } else {
                lowWei = mid + 1n;
            }
        }
        const sellAmountWeth = (foundWei * 101n) / 100n; // +1% buffer

        // Prepare swap data for WETH->USDC
        const swapUrl = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${WETH}&dst=${USDC}&amount=${sellAmountWeth}&from=${adapterAddress}&slippage=1&disableEstimate=true`;
        const swapCmd = `curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${swapUrl}"`;
        const swapResponse = execSync(swapCmd).toString();
        const swapJson = JSON.parse(swapResponse);
        if (swapJson.error) throw new Error(`Swap Error: ${swapJson.error}`);
        const txData = swapJson.tx.data;

        const swapExactOutCtx = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "bytes"],
            [USDC, repayTarget, txData]
        );

        // 3) Build close-with-collateral flow
        const closeInstrs = [
            // 0. Create UTXO for Withdraw amount (WETH sell)
            createRouterInstruction(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint256 amount,address token,address user,uint8 instructionType)"],
                    [[sellAmountWeth, WETH, "0x0000000000000000000000000000000000000000", 3]] // ToOutput
                )
            ),
            // 1. Withdraw WETH from Aave using UTXO[0]
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.WithdrawCollateral, WETH, userAddress, 0n, "0x", { index: 0 }]]
                )
            ),
            // 2. Approve OneInch (input is output[1] WETH)
            createRouterInstruction(encodeApprove(1, "oneinch")),
            // 3. SwapExactOut: WETH -> USDC, target repay amount
            createProtocolInstruction(
                "oneinch",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.SwapExactOut, WETH, userAddress, 0n, swapExactOutCtx, { index: 1 }]]
                )
            ),
            // After Approve (idx2) and Swap (2 outputs), USDC is output[3], WETH refund is output[4]
            // 4. Approve Aave for USDC (output[3])
            createRouterInstruction(encodeApprove(3, "aave")),
            // 5. Repay using USDC output[3]
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Repay, USDC, userAddress, 0n, "0x", { index: 3 }]]
                )
            ),
            // 6. Push WETH refund (output[4]) to user
            createRouterInstruction(encodePushToken(4, userAddress)),
            // 7. Repay may return a USDC refund as a final output; push it if present (index 6)
            createRouterInstruction(encodePushToken(6, userAddress)),
        ];

        // Authorize and execute close flow
        {
            const [targets, data] = await router.authorizeInstructions(closeInstrs, userAddress);
            for (let i = 0; i < targets.length; i++) {
                if (targets[i] !== ethers.ZeroAddress) {
                    await user.sendTransaction({ to: targets[i], data: data[i] });
                }
            }
            await (await router.connect(user).processProtocolInstructions(closeInstrs)).wait();
        }

        // Assertions: debt zero, no dust
        const debtAfter = await (aaveView as any).getBorrowBalance(USDC, userAddress);
        expect(BigInt(debtAfter.toString())).to.equal(0n, "Debt should be fully repaid");

        const routerAddr = await router.getAddress();
        expect(await (usdc as any).balanceOf(routerAddr)).to.equal(0n, "Router USDC dust");
        expect(await (weth as any).balanceOf(routerAddr)).to.equal(0n, "Router WETH dust");
        expect(await (usdc as any).balanceOf(adapterAddress)).to.equal(0n, "Adapter USDC dust");
        expect(await (weth as any).balanceOf(adapterAddress)).to.equal(0n, "Adapter WETH dust");
        const aaveAddr2 = await aaveGateway.getAddress();
        expect(await (usdc as any).balanceOf(aaveAddr2)).to.equal(0n, "Aave gateway USDC dust");
        expect(await (weth as any).balanceOf(aaveAddr2)).to.equal(0n, "Aave gateway WETH dust");
    });

    it("should swap Aave debt from USDC to USDT via 1inch (flash loan, no dust)", async function () {
        const { deployer } = await ethers.getNamedSigners();
        await deployments.fixture(["KapanRouter", "OneInchGateway", "AaveGatewayWrite", "AaveGatewayView"]);

        const router = await ethers.getContractAt("KapanRouter", (await deployments.get("KapanRouter")).address);
        const gateway = await ethers.getContractAt("OneInchGateway", (await deployments.get("OneInchGateway")).address);
        const adapterAddress = await gateway.adapter();
        const aaveGateway = await ethers.getContractAt("AaveGatewayWrite", (await deployments.get("AaveGatewayWrite")).address);
        const aaveView = await ethers.getContractAt("AaveGatewayView", (await deployments.get("AaveGatewayView")).address);

        const user = deployer;
        const userAddress = await user.getAddress();

        const usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC);
        const usdt = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDT);

        // Setup: Create Aave position with USDC debt and WETH collateral
        // Wrap ETH -> WETH
        const IWETH = new ethers.Interface(["function deposit() payable", "function approve(address,uint256) external returns (bool)"]);
        const wethAsUser = new ethers.Contract(WETH, IWETH, user);
        await (await wethAsUser.deposit({ value: ethers.parseEther("2.0") })).wait();

        const depositWeth = ethers.parseEther("1.0");
        const borrowUsdc = 50_000_000n; // 50 USDC

        const setupInstrs = [
            // Pull WETH for deposit
            createRouterInstruction(encodePullToken(depositWeth, WETH, userAddress)),
            createRouterInstruction(encodeApprove(0, "aave")),
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Deposit, WETH, userAddress, 0n, "0x", { index: 0 }]]
                )
            ),
            // Borrow USDC -> output to user
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Borrow, USDC, userAddress, borrowUsdc, "0x", { index: 999 }]]
                )
            ),
            createRouterInstruction(encodePushToken(2, userAddress)),
        ];
        {
            const [targets, data] = await router.authorizeInstructions(setupInstrs, userAddress);
            for (let i = 0; i < targets.length; i++) {
                if (targets[i] !== ethers.ZeroAddress) {
                    await user.sendTransaction({ to: targets[i], data: data[i] });
                }
            }
            await (await router.connect(user).processProtocolInstructions(setupInstrs)).wait();
        }

        // Ensure user doesn't have stray USDT/USDC that would affect dust checks (optional)
        // Move user's USDC out (we will repay USDC via swap during flash)
        await network.provider.request({ method: "hardhat_impersonateAccount", params: [USDC_WHALE] });
        const whale = await ethers.getSigner(USDC_WHALE);
        const userUsdcBal = await (usdc as any).balanceOf(userAddress);
        if (userUsdcBal > 0n) {
            await (usdc.connect(user) as any).transfer(await whale.getAddress(), userUsdcBal);
        }

        // Current USDC debt
        const debtBefore = BigInt((await (aaveView as any).getBorrowBalance(USDC, userAddress)).toString());
        expect(debtBefore).to.be.gt(0n);

        // Approximate minimal USDT needed so that USDT->USDC swap yields >= debtBefore
        const seedIn = 35_000_000n; // 35 USDT seed
        const seedUrl = `https://api.1inch.dev/swap/v6.0/42161/quote?src=${USDT}&dst=${USDC}&amount=${seedIn}`;
        const seedResp = execSync(`curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${seedUrl}"`).toString();
        const seed = JSON.parse(seedResp);
        if (seed.error) throw new Error(`Quote Error: ${seed.error}`);
        const seedOut = BigInt(seed.dstAmount);
        // Scale required input = ceil(debtBefore * seedIn / seedOut)
        let amountInUSDT = (debtBefore * seedIn + (seedOut - 1n)) / seedOut;
        amountInUSDT = (amountInUSDT * 101n) / 100n; // +1% buffer

        // Prepare swap data for USDT->USDC exact-out debtBefore
        const swapUrl = `https://api.1inch.dev/swap/v6.0/42161/swap?src=${USDT}&dst=${USDC}&amount=${amountInUSDT}&from=${adapterAddress}&slippage=1&disableEstimate=true`;
        const swapCmd = `curl -s -H "Authorization: Bearer ${process.env.ONE_INCH_API_KEY}" "${swapUrl}"`;
        const swapResponse = execSync(swapCmd).toString();
        const swapJson = JSON.parse(swapResponse);
        if (swapJson.error) throw new Error(`Swap Error: ${swapJson.error}`);
        const txData = swapJson.tx.data;

        const swapExactOutCtx = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "uint256", "bytes"],
            [USDC, debtBefore, txData]
        );

        // Build debt swap plan (flash USDT -> swap to USDC -> repay USDC debt -> borrow USDT equal to flash repayment)
        const instrs = [
            // 0. Create UTXO for flash USDT input
            createRouterInstruction(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint256 amount,address token,address user,uint8 instructionType)"],
                    [[amountInUSDT, USDT, "0x0000000000000000000000000000000000000000", 3]] // ToOutput
                )
            ),
            // 1. Flash loan USDT using output[0]
            createRouterInstruction(encodeFlashLoan(0, 0)), // BalancerV2
            // 2. Approve OneInch for USDT (use output[0] amount)
            createRouterInstruction(encodeApprove(0, "oneinch")),
            // 3. SwapExactOut USDT->USDC to get exactly debtBefore USDC (input[0] as maxIn)
            createProtocolInstruction(
                "oneinch",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.SwapExactOut, USDT, userAddress, 0n, swapExactOutCtx, { index: 0 }]]
                )
            ),
            // 4. Approve Aave for USDC (swap output USDC at index 3)
            createRouterInstruction(encodeApprove(3, "aave")),
            // 5. Repay USDC debt using swap output[3]
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Repay, USDC, userAddress, 0n, "0x", { index: 3 }]]
                )
            ),
            // 6. Push USDC repay refund (usually tiny) to user (repay produces output at index 6)
            createRouterInstruction(encodePushToken(6, userAddress)),
            // 6. Push USDT refund from swap to user (output[4])
            createRouterInstruction(encodePushToken(4, userAddress)),
            // 7. Borrow USDT equal to flash repayment amount; use flash UTXO [1] as input for amount
            createProtocolInstruction(
                "aave",
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["tuple(uint8 op,address token,address user,uint256 amount,bytes context,tuple(uint256 index) input)"],
                    [[LendingOp.Borrow, USDT, userAddress, 0n, "0x", { index: 1 }]]
                )
            ),
        ];

        // Authorize and execute
        {
            const [targets, data] = await router.authorizeInstructions(instrs, userAddress);
            for (let i = 0; i < targets.length; i++) {
                if (targets[i] !== ethers.ZeroAddress) {
                    await user.sendTransaction({ to: targets[i], data: data[i] });
                }
            }
            await (await router.connect(user).processProtocolInstructions(instrs)).wait();
        }

        // Verify: USDC debt is zero, USDT debt > 0; no dust
        const usdcDebtAfter = BigInt((await (aaveView as any).getBorrowBalance(USDC, userAddress)).toString());
        const usdtDebtAfter = BigInt((await (aaveView as any).getBorrowBalance(USDT, userAddress)).toString());
        expect(usdcDebtAfter).to.equal(0n, "USDC debt should be fully repaid");
        expect(usdtDebtAfter).to.be.gt(0n, "USDT debt should be created");

        const routerAddr = await router.getAddress();
        expect(await (usdc as any).balanceOf(routerAddr)).to.equal(0n, "Router USDC dust");
        expect(await (usdt as any).balanceOf(routerAddr)).to.equal(0n, "Router USDT dust");
        expect(await (usdc as any).balanceOf(adapterAddress)).to.equal(0n, "Adapter USDC dust");
        expect(await (usdt as any).balanceOf(adapterAddress)).to.equal(0n, "Adapter USDT dust");
        const aaveAddr = await aaveGateway.getAddress();
        expect(await (usdc as any).balanceOf(aaveAddr)).to.equal(0n, "Aave gateway USDC dust");
        expect(await (usdt as any).balanceOf(aaveAddr)).to.equal(0n, "Aave gateway USDT dust");
    });
});
