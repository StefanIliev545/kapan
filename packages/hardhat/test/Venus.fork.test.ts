import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, BigNumberish, HDNodeWallet } from "ethers";
import { RouterGateway, VenusGateway, IERC20 } from "../typechain-types";

// Skip the entire test suite if not running on forked network
const runOnlyOnFork = process.env.MAINNET_FORKING_ENABLED === "true" 
  ? describe 
  : describe.skip;

// Real addresses on Arbitrum (same as Aave test)
const RICH_ACCOUNT = ethers.getAddress("0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D"); // Rich USDC holder
const USDC_ADDRESS = ethers.getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
const WETH_ADDRESS = ethers.getAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");
// Use environment variable for Venus Comptroller with fallback to known address
const COMPTROLLER_ADDRESS = process.env.VENUS_COMPTROLLER 
  ? ethers.getAddress(process.env.VENUS_COMPTROLLER)
  : ethers.getAddress("0x317c1A5739F39046E20b08ac9BeEa3f10fD43326"); // Venus Comptroller
// Use environment variable for Venus Oracle with fallback to ZeroAddress (will need to be updated)
const VENUS_ORACLE_ADDRESS = process.env.VENUS_ORACLE
  ? ethers.getAddress(process.env.VENUS_ORACLE)
  : ethers.ZeroAddress; // Default fallback, should be updated with actual address

runOnlyOnFork("VenusGateway: Deposit, Withdraw & Borrow (Forked & Deployed) :fork", function () {
  let router: RouterGateway;
  let venusGateway: VenusGateway;
  let usdc: IERC20;
  let weth: IERC20;
  let richSigner: any;
  let user: HDNodeWallet;

  before(async function () {
    console.log("Using Venus Comptroller at:", COMPTROLLER_ADDRESS);
    
    // Create a new user account
    const wallet = ethers.Wallet.createRandom();
    user = wallet.connect(ethers.provider);

    // Impersonate the rich account
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

    console.log("Prefunding user with USDC...");
    // Transfer some USDC from rich account to our test user
    const transferAmount = ethers.parseUnits("2000", 6); // 2000 USDC (6 decimals)
    await usdc.connect(richSigner).transfer(await user.getAddress(), transferAmount);

    // Send some ETH for gas
    console.log("Prefunding user with ETH...");
    await richSigner.sendTransaction({
      to: await user.getAddress(),
      value: ethers.parseEther("1"),
    });

    // Deploy RouterGateway
    console.log("Deploying RouterGateway...");
    const balancerV3Vault = process.env.BALANCER_VAULT3 || ethers.ZeroAddress;
    const balancerV2Vault = process.env.BALANCER_VAULT2 || ethers.ZeroAddress;
    router = await ethers.deployContract("RouterGateway", [
      balancerV3Vault,
      balancerV2Vault,
      await user.getAddress()
    ], richSigner) as RouterGateway;
    await router.waitForDeployment();

    // Deploy VenusGateway
    console.log("Deploying VenusGateway...");
    venusGateway = await ethers.deployContract("VenusGateway", [
      COMPTROLLER_ADDRESS,
      VENUS_ORACLE_ADDRESS,
      await router.getAddress()
    ], richSigner) as VenusGateway;
    await venusGateway.waitForDeployment();

    // Register the VenusGateway
    console.log("Registering VenusGateway...");
    await router.connect(user).addGateway("venus", await venusGateway.getAddress());

    console.log("Setup complete. Router:", await router.getAddress());
    console.log("VenusGateway:", await venusGateway.getAddress());
  });

  it("should get all Venus markets", async function() {
    const markets = await venusGateway.getAllVenusMarkets();
    console.log("Venus Markets Count:", markets.vTokens.length);
    expect(markets.vTokens.length).to.be.gt(0, "Should have Venus markets");    
  });

  it("should deposit USDC via RouterGateway", async function () {
    const depositAmount = ethers.parseUnits("100", 6); // 100 USDC
    const userAddress = await user.getAddress();

    // Approve the RouterGateway to spend USDC
    await usdc.connect(user).approve(await router.getAddress(), depositAmount);

    // Get initial balance for verification
    const initialBalance = await venusGateway.getBalance(USDC_ADDRESS, userAddress);
    console.log("Initial USDC supply balance:", initialBalance);

    // Supply USDC
    await router.connect(user).supply("venus", USDC_ADDRESS, userAddress, depositAmount);

    // Verify the deposit
    const finalBalance = await venusGateway.getBalance(USDC_ADDRESS, userAddress);
    console.log("Final USDC supply balance:", finalBalance);
    
    expect(finalBalance).to.be.greaterThan(initialBalance);
    expect(finalBalance).to.be.closeTo(initialBalance + depositAmount, ethers.parseUnits("1", 6)); // Allow for small differences
  });

  it("should approve and enter market for WETH borrowing", async function () {
    const userAddress = await user.getAddress();

    // Get the vTokens for USDC
    const vTokenAddress = await venusGateway.getVTokenForUnderlying(USDC_ADDRESS);
    console.log("vToken address for USDC:", vTokenAddress);
    
    // Enter markets to use USDC as collateral
    const marketsToEnter = [vTokenAddress];
    
    // Get the Comptroller interface directly to call enter markets from the user
    const comptroller = await ethers.getContractAt("ComptrollerInterface", COMPTROLLER_ADDRESS);
    
    // First check the expected return value with callStatic (simulation)
    const resultCodes = await comptroller.connect(user).enterMarkets.staticCall(marketsToEnter);
    console.log("Enter markets expected result codes:", resultCodes);
    
    // Check that all result codes are 0 (success)
    for (let i = 0; i < resultCodes.length; i++) {
      expect(resultCodes[i]).to.equal(0, `enterMarkets should return 0 (success) for market at index ${i}`);
    }
    
    // Now actually execute the transaction
    const tx = await comptroller.connect(user).enterMarkets(marketsToEnter);
    const receipt = await tx.wait(); // Wait for transaction to be mined
    expect(receipt?.status).to.equal(1, "Transaction should succeed");

    console.log("Enter markets transaction completed");
    
    // Verify market entry was successful
    // Direct verification using checkMembership
    const isMember = await venusGateway.checkMembership(userAddress, vTokenAddress);
    console.log("Is member of market via checkMembership:", isMember);
    expect(isMember).to.be.true;
  });

  it("should approve gateway as delegate for borrowing", async function () {
    const userAddress = await user.getAddress();
    
    // Get encoded approval data for the delegate using the updated approach
    const [targets, approvalData] = await venusGateway.getEncodedDebtApproval(WETH_ADDRESS, ethers.parseUnits("0.01", 18), userAddress);
    
    if (targets.length === 0) {
      console.log("User is already approved as delegate, no approval needed");
      return;
    }
    
    // Execute the delegate approval
    await user.sendTransaction({
      to: targets[0],
      data: approvalData[0],
    });
    
    console.log("Delegate approval transaction executed");
  });

  it("should borrow WETH against USDC collateral", async function () {
    const borrowAmount = ethers.parseUnits("0.01", 18); // 0.01 WETH
    const userAddress = await user.getAddress();

    // Get the required encoded approvals for borrowing
    const [targets, approvalData] = await venusGateway.getEncodedDebtApproval(WETH_ADDRESS, borrowAmount, userAddress);
    
    console.log(`Debt approval requires ${targets.length} transactions:`);
    
    // Execute all required approval transactions
    for (let i = 0; i < targets.length - 1; i++) {
      console.log(`Executing approval ${i+1}/${targets.length} - Target: ${targets[i]}`);
      const tx =await user.sendTransaction({
        to: targets[i],
        data: approvalData[i],
      });
      const receipt = await tx.wait();
      expect(receipt?.status).to.be.equal(1);
    }

    // Initial WETH balance
    const initialWethBalance = await weth.balanceOf(userAddress);
    console.log("Initial WETH balance:", initialWethBalance);

    // Get account liquidity before borrowing
    const [error, liquidity, shortfall] = await venusGateway.getAccountLiquidity(userAddress);
    console.log("Account liquidity before borrow:", {
      error, 
      liquidity: liquidity.toString(), 
      shortfall: shortfall.toString()
    });

    // Borrow WETH directly through the gateway
    console.log("Attempting to borrow WETH...");
    await router.connect(user).borrow("venus", WETH_ADDRESS, userAddress, borrowAmount);

    // Verify the borrow
    const finalWethBalance = await weth.balanceOf(userAddress);
    console.log("Final WETH balance:", finalWethBalance);
    
    expect(finalWethBalance).to.be.greaterThan(initialWethBalance);
    expect(finalWethBalance).to.be.closeTo(
      initialWethBalance + borrowAmount,
      ethers.parseUnits("0.0001", 18) // Allow for small rounding differences
    );

    // Get borrow balance
    const borrowBalance = await venusGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    console.log("WETH borrow balance:", borrowBalance);
    expect(borrowBalance).to.be.closeTo(borrowAmount, ethers.parseUnits("0.0001", 18));
  });

  it("should repay part of the WETH debt", async function () {
    const repayAmount = ethers.parseUnits("0.005", 18); // Repay 0.005 WETH
    const userAddress = await user.getAddress();

    // Get initial borrow balance
    const initialBorrowBalance = await venusGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    console.log("Initial WETH borrow balance:", initialBorrowBalance);
    expect(initialBorrowBalance).to.be.gt(0, "Should have existing debt");

    // Approve the RouterGateway to spend WETH
    await weth.connect(user).approve(await router.getAddress(), repayAmount);

    // Repay WETH
    await router.connect(user).repay("venus", WETH_ADDRESS, userAddress, repayAmount);

    // Verify the repayment
    const finalBorrowBalance = await venusGateway.getBorrowBalance(WETH_ADDRESS, userAddress);
    console.log("Final WETH borrow balance:", finalBorrowBalance);
    
    expect(finalBorrowBalance).to.be.closeTo(
      initialBorrowBalance - repayAmount,
      ethers.parseUnits("0.0001", 18) // Allow for small rounding differences
    );
  });
}); 