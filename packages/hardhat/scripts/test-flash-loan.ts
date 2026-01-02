import { ethers } from "hardhat";

async function main() {
  console.log("=== Flash Loan Debugging ===\n");
  
  const WETH = "0x4200000000000000000000000000000000000006";
  const aWETH = "0xd4a0e0b9149bcee3c920d2e00b5de09138fd8bb7";
  const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  // Note: The standard AaveBorrower (0x7d9C4DeE56933151Bc5C909cfe09DEf0d315CB4A) doesn't work on Base
  // Working flash loan settlements use factory-created adapters like this one:
  const borrower = "0xdecc46a4b09162f5369c5c80383aaa9159bcf192";
  
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  
  // Step 1: Basic balance check
  console.log("\n1. Checking balances...");
  const weth = await ethers.getContractAt(
    ["function balanceOf(address) external view returns (uint256)"],
    WETH
  );
  const aWethBalance = await weth.balanceOf(aWETH);
  console.log("   aWETH WETH balance:", ethers.formatEther(aWethBalance));
  
  // Step 2: Try depositing ETH to get WETH and transferring
  console.log("\n2. Testing deposit ETH -> WETH and transfer...");
  try {
    const wethDeposit = await ethers.getContractAt(
      [
        "function deposit() external payable",
        "function transfer(address to, uint256 amount) external returns (bool)",
        "function balanceOf(address) external view returns (uint256)",
      ],
      WETH,
      signer
    );
    
    // Deposit ETH to get WETH
    console.log("   Depositing 0.01 ETH...");
    const depositTx = await wethDeposit.deposit({ value: ethers.parseEther("0.01") });
    await depositTx.wait();
    console.log("   ✅ Deposit succeeded!");
    
    const myBalance = await wethDeposit.balanceOf(signer.address);
    console.log("   Signer WETH balance:", ethers.formatEther(myBalance));
    
    // Now try transfer
    console.log("   Transferring 1000 wei to borrower...");
    const transferTx = await wethDeposit.transfer(borrower, 1000n);
    await transferTx.wait();
    console.log("   ✅ Transfer succeeded!");
    
    const borrowerBalance = await wethDeposit.balanceOf(borrower);
    console.log("   Borrower WETH balance:", borrowerBalance.toString());
    
  } catch (e: any) {
    console.log("   ❌ Failed:", e.message?.slice(0, 300));
  }
  
  // Step 2b: Try impersonating aWETH and transferring WETH
  console.log("\n2b. Testing transfer from aWETH (impersonated)...");
  try {
    await ethers.provider.send("hardhat_impersonateAccount", [aWETH]);
    console.log("   Impersonated aWETH");
    
    // Use setBalance instead of sending ETH
    await ethers.provider.send("hardhat_setBalance", [aWETH, "0x" + (10n ** 18n).toString(16)]);
    console.log("   Set aWETH ETH balance to 1 ETH");
    
    const aWethSigner = await ethers.getSigner(aWETH);
    const ethBalance = await ethers.provider.getBalance(aWETH);
    console.log("   aWETH ETH balance:", ethers.formatEther(ethBalance));
    
    const wethContract = await ethers.getContractAt(
      ["function transfer(address to, uint256 amount) external returns (bool)"],
      WETH,
      aWethSigner
    );
    
    // Static call first
    console.log("   Trying static call...");
    const staticResult = await wethContract.transfer.staticCall(borrower, 1000n);
    console.log("   Static call result:", staticResult);
    
    // Now real tx
    console.log("   Executing transfer...");
    const tx = await wethContract.transfer(borrower, 1000n);
    const receipt = await tx.wait();
    console.log("   ✅ Transfer succeeded! Gas:", receipt?.gasUsed.toString());
    
    const newBalance = await weth.balanceOf(borrower);
    console.log("   Borrower WETH balance:", newBalance.toString());
    
  } catch (e: any) {
    console.log("   ❌ Failed:", e.message?.slice(0, 300));
  }
  
  // Step 3: Test via FlashLoanRouter.flashLoanAndSettle
  console.log("\n3. Testing FlashLoanRouter.flashLoanAndSettle...");
  
  const FLASH_LOAN_ROUTER = "0x9da8b48441583a2b93e2ef8213aad0ec0b392c69";
  const SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  const AUTHENTICATOR = "0x2c4c28DDBdAc9C5E7055b4C863b72eA0149D8aFE";
  
  // First, register ourselves as a solver
  console.log("   Registering as solver...");
  const authenticator = await ethers.getContractAt(
    [
      "function addSolver(address solver) external",
      "function isSolver(address solver) external view returns (bool)",
      "function manager() external view returns (address)",
    ],
    AUTHENTICATOR
  );
  
  const managerAddr = await authenticator.manager();
  console.log("   Authenticator manager:", managerAddr);
  
  await ethers.provider.send("hardhat_impersonateAccount", [managerAddr]);
  await ethers.provider.send("hardhat_setBalance", [managerAddr, "0x" + (10n ** 18n).toString(16)]);
  const managerSigner = await ethers.getSigner(managerAddr);
  
  await authenticator.connect(managerSigner).addSolver(signer.address);
  const isSolver = await authenticator.isSolver(signer.address);
  console.log("   Is solver:", isSolver);
  
  // Build minimal valid settlement calldata
  const settlement = new ethers.Interface([
    "function settle(address[] tokens, uint256[] prices, tuple(uint256 sellTokenIndex, uint256 buyTokenIndex, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, uint256 flags, uint256 executedAmount, bytes signature)[] trades, tuple(address target, uint256 value, bytes callData)[][3] interactions)"
  ]);
  
  const settleCalldata = settlement.encodeFunctionData("settle", [
    [], // tokens
    [], // prices  
    [], // trades
    [[], [], []] // interactions (pre, intra, post)
  ]);
  
  console.log("   Settle calldata length:", settleCalldata.length);
  console.log("   Settle selector:", settleCalldata.slice(0, 10));
  
  // Build flash loan request
  const flashLoanRequest = {
    amount: 1000n,
    borrower: borrower,
    lender: AAVE_POOL,
    token: WETH,
  };
  
  const flashLoanRouter = await ethers.getContractAt(
    [
      "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] calldata loans, bytes calldata settlement) external",
    ],
    FLASH_LOAN_ROUTER,
    signer
  );
  
  console.log("   Calling flashLoanAndSettle...");
  
  // Encode the call manually to verify
  const flashLoanRouterInterface = new ethers.Interface([
    "function flashLoanAndSettle(tuple(uint256 amount, address borrower, address lender, address token)[] loans, bytes settlement) external",
  ]);
  
  const encodedCall = flashLoanRouterInterface.encodeFunctionData("flashLoanAndSettle", [
    [flashLoanRequest],
    settleCalldata
  ]);
  console.log("   Encoded call length:", encodedCall.length);
  console.log("   Selector:", encodedCall.slice(0, 10));
  
  // First let's try with a real execution (not static call) to get better error info
  try {
    const tx = await flashLoanRouter.flashLoanAndSettle(
      [flashLoanRequest],
      settleCalldata,
      { gasLimit: 2000000 }
    );
    const receipt = await tx.wait();
    console.log("   ✅ TX succeeded! Gas:", receipt?.gasUsed.toString());
  } catch (e: any) {
    console.log("   ❌ flashLoanAndSettle failed");
    console.log("   Error message:", e.message?.slice(0, 500));
    
    // Try to trace the transaction
    if (e.receipt) {
      console.log("   TX receipt status:", e.receipt.status);
    }
    
    // Let's debug by checking what the borrower does
    console.log("\n   Debugging borrower...");
    
    const cowBorrower = await ethers.getContractAt(
      [
        "function router() external view returns (address)",
        "function settlementContract() external view returns (address)",
      ],
      borrower
    );
    
    console.log("   Borrower router:", await cowBorrower.router());
    console.log("   Borrower settlement:", await cowBorrower.settlementContract());
    
    // Let's try calling the Aave pool directly as the borrower would
    console.log("\n   Testing Aave flashLoan as borrower...");
    
    await ethers.provider.send("hardhat_impersonateAccount", [borrower]);
    await ethers.provider.send("hardhat_setBalance", [borrower, "0x" + (10n ** 18n).toString(16)]);
    const borrowerSigner = await ethers.getSigner(borrower);
    
    const aavePool = await ethers.getContractAt(
      [
        "function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata interestRateModes, address onBehalfOf, bytes calldata params, uint16 referralCode) external",
      ],
      AAVE_POOL,
      borrowerSigner
    );
    
    try {
      // Call flashLoan as the borrower
      // The borrower will call itself for the callback
      await aavePool.flashLoan.staticCall(
        borrower, // receiver = self
        [WETH],
        [1000n],
        [0], // No debt
        borrower,
        "0x" + "00".repeat(100), // dummy params
        0
      );
      console.log("   ✅ Aave flashLoan static call succeeded!");
    } catch (e2: any) {
      console.log("   ❌ Aave flashLoan failed:", e2.message?.slice(0, 300));
    }
    
    // Try flashLoanSimple instead
    console.log("\n   Testing Aave flashLoanSimple as borrower...");
    const aavePoolSimple = await ethers.getContractAt(
      [
        "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external",
      ],
      AAVE_POOL,
      borrowerSigner
    );
    
    try {
      await aavePoolSimple.flashLoanSimple.staticCall(
        borrower,
        WETH,
        1000n,
        "0x" + "00".repeat(100),
        0
      );
      console.log("   ✅ Aave flashLoanSimple static call succeeded!");
    } catch (e2: any) {
      console.log("   ❌ Aave flashLoanSimple failed:", e2.message?.slice(0, 300));
      
      // Check reserve state
      console.log("\n   Checking reserve state...");
      const aavePoolData = await ethers.getContractAt(
        [
          "function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
          "function getReserveNormalizedIncome(address asset) external view returns (uint256)",
        ],
        AAVE_POOL
      );
      
      try {
        const reserveData = await aavePoolData.getReserveData(WETH);
        console.log("   Reserve liquidityIndex:", reserveData.liquidityIndex.toString());
        console.log("   Reserve lastUpdateTimestamp:", reserveData.lastUpdateTimestamp);
        console.log("   Reserve aToken:", reserveData.aTokenAddress);
        
        const normalizedIncome = await aavePoolData.getReserveNormalizedIncome(WETH);
        console.log("   Normalized income:", normalizedIncome.toString());
      } catch (e3: any) {
        console.log("   ❌ getReserveData failed:", e3.message?.slice(0, 200));
      }
      
      // Check if WETH is a valid flash loan asset
      console.log("\n   Checking flash loan eligibility...");
      // The configuration bitmap has flash loan enabled at bit 63
      try {
        const config = await aavePoolData.getReserveData(WETH);
        const configBits = BigInt(config.configuration.toString());
        const flashEnabled = (configBits >> 63n) & 1n;
        const active = (configBits >> 56n) & 1n;
        const frozen = (configBits >> 57n) & 1n;
        const paused = (configBits >> 60n) & 1n;
        
        console.log("   Flash loans enabled:", flashEnabled === 1n);
        console.log("   Reserve active:", active === 1n);
        console.log("   Reserve frozen:", frozen === 1n);
        console.log("   Reserve paused:", paused === 1n);
      } catch (e3: any) {
        console.log("   ❌ Config check failed:", e3.message?.slice(0, 100));
      }
    }
  }
  
  console.log("\nDone!");
}

main().catch(e => {
  console.error("Script failed:", e.message?.slice(0, 500));
  process.exit(1);
});
