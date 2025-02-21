import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, BigNumberish, HDNodeWallet } from "ethers";
import { RouterGateway, AaveGateway, IERC20 } from "../typechain-types";

// Real addresses on Arbitrum
const RICH_ACCOUNT = ethers.getAddress("0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D"); // Rich USDC holder
const USDC_ADDRESS = ethers.getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
const WETH_ADDRESS = ethers.getAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");

describe("AaveGateway: Deposit, Withdraw & Borrow (Forked & Deployed)", function () {
  let router: RouterGateway;
  let aaveGateway: AaveGateway;
  let usdc: IERC20;
  let weth: IERC20;
  let richSigner: any;
  let user: HDNodeWallet;

  before(async function () {
    // Create a new user account
    const wallet = ethers.Wallet.createRandom();
    user = wallet.connect(ethers.provider);

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
    const transferAmount = ethers.parseUnits("2000", 6); // 2000 USDC
    await usdc.connect(richSigner).transfer(await user.getAddress(), transferAmount);

    // Send some ETH for gas
    await richSigner.sendTransaction({
      to: await user.getAddress(),
      value: ethers.parseEther("1"),
    });

    // Deploy RouterGateway
    const balancerV3Vault = process.env.BALANCER_VAULT3 || ethers.ZeroAddress;
    const balancerV2Vault = process.env.BALANCER_VAULT2 || ethers.ZeroAddress;
    router = await ethers.deployContract("RouterGateway", [
      balancerV3Vault,
      balancerV2Vault,
      await user.getAddress()
    ], richSigner) as RouterGateway;
    await router.waitForDeployment();

    // Deploy AaveGateway
    const poolAddressesProvider = process.env.AAVE_POOL_ADDRESSES_PROVIDER || ethers.ZeroAddress;
    const uiPoolDataProvider = process.env.AAVE_UI_POOL_DATA_PROVIDER || ethers.ZeroAddress;
    const referralCode = Number(process.env.AAVE_REFERRAL_CODE || "0");
    
    aaveGateway = await ethers.deployContract("AaveGateway", [
      await router.getAddress(),
      poolAddressesProvider,
      uiPoolDataProvider,
      referralCode
    ], richSigner) as AaveGateway;
    await aaveGateway.waitForDeployment();

    // Register the AaveGateway
    await router.connect(user).addGateway("aave", await aaveGateway.getAddress());
  });

  it("should deposit USDC via RouterGateway", async function () {
    const depositAmount = ethers.parseUnits("1", 1); // 1000 USDC
    const userAddress = await user.getAddress();

    // Approve the RouterGateway to spend USDC
    await usdc.connect(user).approve(await router.getAddress(), depositAmount);

    // Supply USDC
    await router.connect(user).supply("aave", USDC_ADDRESS, userAddress, depositAmount);

    // Verify the deposit
    const deposited = await aaveGateway.getBalance(USDC_ADDRESS, userAddress);
    expect(deposited).to.be.greaterThanOrEqual(depositAmount);
  });

  it("should deposit USDC as collateral for WETH borrowing", async function () {
    const depositAmount = ethers.parseUnits("1000", 6); // 1000 USDC
    const userAddress = await user.getAddress();

    // Approve AaveGateway to spend USDC
    await usdc.connect(user).approve(await aaveGateway.getAddress(), depositAmount);

    // Deposit USDC as collateral
    await aaveGateway.connect(user).depositCollateral(WETH_ADDRESS, USDC_ADDRESS, depositAmount, userAddress);

    const balance = await aaveGateway.getBalance(USDC_ADDRESS, userAddress);
    expect(balance).to.be.closeTo(depositAmount, 100);
  });

  it("should borrow WETH against USDC collateral", async function () {
    const borrowAmount = ethers.parseUnits("0.01", 18); // 0.01 WETH
    const userAddress = await user.getAddress();

    // Get and execute the required approvals for borrowing
    const [approvals, data] = await aaveGateway.getEncodedDebtApproval(WETH_ADDRESS, borrowAmount);

    // Execute the approval transaction
    await user.sendTransaction({
      to: approvals[0],
      data: data[0],
    });

    // Initial WETH balance
    const initialWethBalance = await weth.balanceOf(userAddress);

    // Borrow WETH directly through the gateway
    await router.connect(user).borrow("aave", WETH_ADDRESS, userAddress, borrowAmount);

    // Verify the borrow
    const finalWethBalance = await weth.balanceOf(userAddress);
    expect(finalWethBalance).to.be.closeTo(
      initialWethBalance + borrowAmount,
      ethers.parseUnits("0.0001", 18) // Allow for small rounding differences
    );
  });
}); 