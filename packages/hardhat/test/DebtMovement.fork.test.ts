import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, BigNumberish, HDNodeWallet } from "ethers";
import { RouterGateway, AaveGateway, CompoundGateway, IERC20 } from "../typechain-types";

// Skip the entire test suite if not running on forked network
const runOnlyOnFork = process.env.MAINNET_FORKING_ENABLED === "true" 
  ? describe 
  : describe.skip;

// Real addresses on Arbitrum
const RICH_ACCOUNT = ethers.getAddress("0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D"); // Rich USDC holder
const USDC_ADDRESS = ethers.getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
const WETH_ADDRESS = ethers.getAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");

runOnlyOnFork("Debt Movement Integration Tests :fork", function () {
  let router: RouterGateway;
  let aaveGateway: AaveGateway;
  let compoundGateway: CompoundGateway;
  let usdc: IERC20;
  let weth: IERC20;
  let richSigner: any;
  let user: HDNodeWallet;
  let userAddress: string;
  let depositAmount: bigint;
  let borrowAmount: bigint;
  let aaveBorrowBalance: bigint;
  let compoundBorrowBalance: bigint;
  let collaterals: any[];

  before(async function () {
    console.log("\n--- Setting up test accounts and contracts ---");
    
    // Create a new user account
    const wallet = ethers.Wallet.createRandom();
    user = wallet.connect(ethers.provider);
    userAddress = await user.getAddress();
    console.log("Test user address:", userAddress);

    // Impersonate the rich USDC account
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [RICH_ACCOUNT],
    });
    
    richSigner = await ethers.getSigner(RICH_ACCOUNT);
    
    // Connect to tokens
    usdc = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        USDC_ADDRESS
    )) as unknown as IERC20;
    weth = (await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        WETH_ADDRESS
    )) as unknown as IERC20;
  
    // Transfer some USDC from rich account to our test user
    depositAmount = ethers.parseUnits("2000", 6); // 2000 USDC
    await usdc.connect(richSigner).transfer(userAddress, depositAmount);
    console.log(`Transferred ${ethers.formatUnits(depositAmount, 6)} USDC to test user`);
  
    // Send some ETH for gas
    await richSigner.sendTransaction({
      to: userAddress,
      value: ethers.parseEther("1"),
    });
    console.log("Transferred 1 ETH for gas to test user");

    // Deploy RouterGateway
    console.log("\n--- Deploying contracts ---");
    const balancerV3Vault = process.env.BALANCER_VAULT3 || ethers.ZeroAddress;
    const balancerV2Vault = process.env.BALANCER_VAULT2 || ethers.ZeroAddress;
    console.log("Balancer V3 Vault:", balancerV3Vault);
    console.log("Balancer V2 Vault:", balancerV2Vault);
    
    router = await ethers.deployContract("RouterGateway", [
      balancerV3Vault,
      balancerV2Vault,
      userAddress
    ]) as RouterGateway;
    console.log("RouterGateway deployed to:", await router.getAddress());

    // Deploy AaveGateway
    const aavePoolAddressesProvider = process.env.AAVE_POOL_ADDRESSES_PROVIDER || ethers.ZeroAddress;
    const aaveUiPoolDataProvider = process.env.AAVE_UI_POOL_DATA_PROVIDER || ethers.ZeroAddress;
    const aaveReferralCode = process.env.AAVE_REFERRAL_CODE || "0";
    
    aaveGateway = await ethers.deployContract("AaveGateway", [
      await router.getAddress(),
      aavePoolAddressesProvider,
      aaveUiPoolDataProvider,
      aaveReferralCode,
    ]) as AaveGateway;
    console.log("AaveGateway deployed to:", await aaveGateway.getAddress());

    // Deploy CompoundGateway
    const compoundUsdcComet = process.env.COMPOUND_USDC_COMET || ethers.ZeroAddress;
    const compoundWethComet = process.env.COMPOUND_WETH_COMET || ethers.ZeroAddress;
    const chainlinkFeedRegistry = process.env.CHAINLINK_FEED_REGISTRY || ethers.ZeroAddress;
    
    compoundGateway = await ethers.deployContract("CompoundGateway", [
      await router.getAddress(),
      [compoundUsdcComet, compoundWethComet],
      chainlinkFeedRegistry,
      userAddress,
    ]) as CompoundGateway;
    console.log("CompoundGateway deployed to:", await compoundGateway.getAddress());

    // Register gateways with the router
    await router.connect(user).addGateway("aave", await aaveGateway.getAddress());
    await router.connect(user).addGateway("compound", await compoundGateway.getAddress());
    console.log("Gateways registered with router");

    // Initialize variables we'll need for tests
    borrowAmount = ethers.parseUnits("0.05", 18); // 0.05 WETH
    collaterals = [
      {
        token: USDC_ADDRESS,
        amount: depositAmount
      }
    ];
  });

  it("Step 1: Should deposit USDC collateral on Aave", async function () {
    console.log("\n--- Step 1: Depositing collateral on Aave ---");
    
    // Approve USDC for Aave Gateway
    const aaveGatewayAddress = await aaveGateway.getAddress();
    await usdc.connect(user).approve(aaveGatewayAddress, depositAmount);
    console.log(`Approved ${ethers.formatUnits(depositAmount, 6)} USDC for Aave Gateway`);
    
    // Deposit USDC as collateral
    await aaveGateway.connect(user).depositCollateral(WETH_ADDRESS, USDC_ADDRESS, depositAmount, userAddress);
    console.log(`Deposited ${ethers.formatUnits(depositAmount, 6)} USDC as collateral on Aave`);
    
    // Verify USDC was deposited
    const aaveUsdcBalance = await aaveGateway.getBalance(USDC_ADDRESS, userAddress);
    console.log(`USDC balance on Aave: ${ethers.formatUnits(aaveUsdcBalance, 6)}`);
    expect(aaveUsdcBalance).to.be.gte(depositAmount * 99n / 100n, "Collateral should be deposited");
  });

  it("Step 2: Should borrow WETH from Aave", async function () {
    console.log("\n--- Step 2: Borrowing WETH from Aave ---");
    
    // Get and execute approvals for Aave borrowing
    const [aaveApprovals, aaveData] = await aaveGateway.getEncodedDebtApproval(WETH_ADDRESS, borrowAmount);
    console.log("Got debt approval data from Aave Gateway");
    
    for (let i = 0; i < aaveApprovals.length; i++) {
      await user.sendTransaction({
        to: aaveApprovals[i],
        data: aaveData[i],
      });
    }
    console.log("Sent debt approval transaction to Aave");
    
    // Borrow from Aave
    await router.connect(user).borrow("aave", WETH_ADDRESS, userAddress, borrowAmount);
    console.log(`Borrowed ${ethers.formatUnits(borrowAmount, 18)} WETH from Aave`);
    
    // Verify the borrow
    aaveBorrowBalance = await aaveGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    console.log(`WETH borrow balance on Aave: ${ethers.formatUnits(aaveBorrowBalance, 18)}`);
    expect(aaveBorrowBalance).to.be.gte(borrowAmount * 99n / 100n, "WETH should be borrowed");
  });

  it("Step 3: Should move debt from Aave to Compound", async function () {
    console.log("\n--- Step 3: Moving debt from Aave to Compound ---");
    
    // First, get the aToken address that corresponds to our USDC collateral
    // This can be obtained from the Aave gateway
    const aTokenAddress = await aaveGateway.getAToken(USDC_ADDRESS);
    console.log("USDC aToken address:", aTokenAddress);
    
    // Update our collaterals array to use the aToken
    const aaveCollaterals = [
      {
        token: USDC_ADDRESS, // Use aToken address instead of underlying
        amount: depositAmount
      }
    ];
    
    // Get and execute approvals for moving debt from Aave
    const [fromApprovals, fromData] = await aaveGateway.getEncodedCollateralApprovals(WETH_ADDRESS, aaveCollaterals);
    console.log("Got collateral approval data from Aave Gateway");
    
    for (let i = 0; i < fromApprovals.length; i++) {
      await user.sendTransaction({
        to: fromApprovals[i],
        data: fromData[i],
      });
    }
    console.log("Sent collateral approval transactions for Aave");
    
    // Approve WETH for router to repay Aave
    const routerAddress = await router.getAddress();
    await weth.connect(user).approve(routerAddress, ethers.parseUnits("1", 18));
    console.log("Approved WETH for router (for flash loan repayment)");
    
    // Get and execute approvals for moving debt to Compound
    const [toApprovals, toData] = await compoundGateway.getEncodedDebtApproval(WETH_ADDRESS, borrowAmount);
    console.log("Got debt approval data from Compound Gateway");
    
    for (let i = 0; i < toApprovals.length; i++) {
      await user.sendTransaction({
        to: toApprovals[i],
        data: toData[i],
      });
    }
    console.log("Sent debt approval transactions for Compound");
    
    // Move the debt using proper collateral tokens
    try {
      await router.connect(user).moveDebt(
        userAddress,
        WETH_ADDRESS,
        borrowAmount, // Use exact borrowed amount
        true, // Set to true to repay the full amount
        aaveCollaterals, // Use the aToken collaterals
        "aave",
        "compound",
        "v3", // flashLoanVersion
        { gasLimit: 5000000 } // Add gas limit for complex operation
      );
      console.log("Successfully moved debt from Aave to Compound");
    } catch (error: any) {
      console.error("Error moving debt:", error.message || error);
      throw error;
    }
    
    // Verify the debt was moved
    const aaveBorrowBalanceAfterMove = await aaveGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    compoundBorrowBalance = await compoundGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    
    console.log(`Aave borrow balance after move: ${ethers.formatUnits(aaveBorrowBalanceAfterMove, 18)}`);
    console.log(`Compound borrow balance after move: ${ethers.formatUnits(compoundBorrowBalance, 18)}`);
    
    expect(aaveBorrowBalanceAfterMove).to.be.lt(ethers.parseUnits("0.001", 18), "Aave debt should be nearly zero");
    expect(compoundBorrowBalance).to.be.gte(borrowAmount * 99n / 100n, "Debt should be moved to Compound");
  });

  it("Step 4: Should move debt back from Compound to Aave", async function () {
    console.log("\n--- Step 4: Moving debt back from Compound to Aave ---");
    
    // Get and execute approvals for moving from Compound
    const [fromCompoundApprovals, fromCompoundData] = await compoundGateway.getEncodedCollateralApprovals(WETH_ADDRESS, collaterals);
    console.log("Got collateral approval data from Compound Gateway");
    
    for (let i = 0; i < fromCompoundApprovals.length; i++) {
      await user.sendTransaction({
        to: fromCompoundApprovals[i],
        data: fromCompoundData[i],
      });
    }
    console.log("Sent collateral approval transactions for Compound");
    
    // Approve WETH for router to repay Compound
    const routerAddress = await router.getAddress();
    await weth.connect(user).approve(routerAddress, ethers.parseUnits("1", 18));
    console.log("Approved WETH for router (for flash loan repayment)");
    
    // Get and execute approvals for moving to Aave
    const [toAaveApprovals, toAaveData] = await aaveGateway.getEncodedDebtApproval(WETH_ADDRESS, compoundBorrowBalance);
    console.log("Got debt approval data from Aave Gateway");
    
    for (let i = 0; i < toAaveApprovals.length; i++) {
      await user.sendTransaction({
        to: toAaveApprovals[i],
        data: toAaveData[i],
      });
    }
    console.log("Sent debt approval transactions for Aave");
    
    // Use a slightly higher amount to account for interest accrual
    const moveBackAmount = (compoundBorrowBalance * 101n / 100n);
    console.log(`Attempting to move ${ethers.formatUnits(moveBackAmount, 18)} WETH debt back to Aave`);
    
    // Move the debt back
    try {
      await router.connect(user).moveDebt(
        userAddress,
        WETH_ADDRESS,
        moveBackAmount,
        true, // Set to true to repay the full amount
        collaterals,
        "compound",
        "aave",
        "v3", // flashLoanVersion
        { gasLimit: 5000000 } // Add gas limit for complex operation
      );
      console.log("Successfully moved debt from Compound back to Aave");
    } catch (error: any) {
      console.error("Error moving debt back:", error.message || error);
      throw error;
    }
    
    // Verify the debt was moved back
    const aaveBorrowBalanceAfterMoveBack = await aaveGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    const compoundBorrowBalanceAfterMoveBack = await compoundGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    
    console.log(`Aave borrow balance after move back: ${ethers.formatUnits(aaveBorrowBalanceAfterMoveBack, 18)}`);
    console.log(`Compound borrow balance after move back: ${ethers.formatUnits(compoundBorrowBalanceAfterMoveBack, 18)}`);
    
    expect(compoundBorrowBalanceAfterMoveBack).to.be.lt(ethers.parseUnits("0.001", 18), "Compound debt should be nearly zero");
    expect(aaveBorrowBalanceAfterMoveBack).to.be.gte(borrowAmount * 99n / 100n, "Debt should be moved back to Aave");
  });
}); 