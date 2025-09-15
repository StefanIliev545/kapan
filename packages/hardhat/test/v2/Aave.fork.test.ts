import { expect } from "chai";
import { ethers, network } from "hardhat";
import { HDNodeWallet } from "ethers";

const runOnlyOnFork = process.env.MAINNET_FORKING_ENABLED === "true" ? describe : describe.skip;

const RICH_ACCOUNT = ethers.getAddress("0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D");
const USDC_ADDRESS = ethers.getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");
const WETH_ADDRESS = ethers.getAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1");

runOnlyOnFork("AaveGateway V2: full flow :fork", function () {
  let router: any;
  let routerView: any;
  let aaveGateway: any;
  let aaveView: any;
  let usdc: any;
  let weth: any;
  let richSigner: any;
  let user: HDNodeWallet;

  before(async function () {
    const wallet = ethers.Wallet.createRandom();
    user = wallet.connect(ethers.provider);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [RICH_ACCOUNT],
    });
    richSigner = await ethers.getSigner(RICH_ACCOUNT);

    usdc = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", USDC_ADDRESS);
    weth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WETH_ADDRESS);

    const transferAmount = ethers.parseUnits("2000", 6);
    await usdc.connect(richSigner).transfer(await user.getAddress(), transferAmount);
    await richSigner.sendTransaction({ to: await user.getAddress(), value: ethers.parseEther("1") });

    router = await ethers.deployContract(
      "contracts/v2/RouterGateway.sol:RouterGateway",
      [await user.getAddress()],
      richSigner,
    );

    routerView = await ethers.deployContract(
      "contracts/v2/RouterView.sol:RouterView",
      [await user.getAddress()],
      richSigner,
    );

    const poolAddressesProvider = process.env.AAVE_POOL_ADDRESSES_PROVIDER || ethers.ZeroAddress;
    const uiPoolDataProvider = process.env.AAVE_UI_POOL_DATA_PROVIDER || ethers.ZeroAddress;
    const referralCode = Number(process.env.AAVE_REFERRAL_CODE || "0");
    aaveGateway = await ethers.deployContract(
      "contracts/v2/gateways/AaveGateway.sol:AaveGateway",
      [await router.getAddress(), poolAddressesProvider, uiPoolDataProvider, referralCode],
      richSigner,
    );

    aaveView = await ethers.deployContract(
      "contracts/v2/gateways/AaveGatewayView.sol:AaveGatewayView",
      [poolAddressesProvider, uiPoolDataProvider],
      richSigner,
    );

    await router.connect(user).addGateway("aave", await aaveGateway.getAddress());
    await routerView.connect(user).addGateway("aave", await aaveView.getAddress());
  });

  it("should deposit, borrow, repayAll and withdrawAll", async function () {
    const userAddress = await user.getAddress();
    const depositAmount = ethers.parseUnits("1000", 6);

    await usdc.connect(user).approve(await router.getAddress(), depositAmount);
    await router.connect(user).processProtocolInstructions([
      {
        protocolName: "aave",
        instructions: [
          {
            instructionType: 0,
            basic: { token: USDC_ADDRESS, amount: depositAmount, user: userAddress },
            repayAll: false,
            withdrawAll: false,
          },
        ],
      },
    ]);

    expect(await routerView.getBalance("aave", USDC_ADDRESS, userAddress)).to.be.greaterThanOrEqual(depositAmount);

    const providerAddr = await aaveGateway.poolAddressesProvider();
    const provider = await ethers.getContractAt("IPoolAddressesProvider", providerAddr);
    const poolAddr = await provider.getPool();
    const pool = await ethers.getContractAt("IPool", poolAddr);
    const reserveData = await pool.getReserveData(WETH_ADDRESS);
    const debtToken = await ethers.getContractAt(
      ["function approveDelegation(address,uint256)"],
      reserveData.variableDebtTokenAddress,
      user,
    );

    const borrowAmount = ethers.parseUnits("0.01", 18);
    await debtToken.approveDelegation(await aaveGateway.getAddress(), borrowAmount);

    await router.connect(user).processProtocolInstructions([
      {
        protocolName: "aave",
        instructions: [
          {
            instructionType: 1,
            basic: { token: WETH_ADDRESS, amount: borrowAmount, user: userAddress },
            repayAll: false,
            withdrawAll: false,
          },
        ],
      },
    ]);

    await weth.connect(user).approve(await router.getAddress(), borrowAmount);
    await router.connect(user).processProtocolInstructions([
      {
        protocolName: "aave",
        instructions: [
          {
            instructionType: 2,
            basic: { token: WETH_ADDRESS, amount: borrowAmount, user: userAddress },
            repayAll: true,
            withdrawAll: false,
          },
        ],
      },
    ]);

    expect(await routerView.getBorrowBalance("aave", WETH_ADDRESS, userAddress)).to.equal(0n);

    await router.connect(user).processProtocolInstructions([
      {
        protocolName: "aave",
        instructions: [
          {
            instructionType: 3,
            basic: { token: USDC_ADDRESS, amount: 0n, user: userAddress },
            repayAll: false,
            withdrawAll: true,
          },
        ],
      },
    ]);

    expect(await routerView.getBalance("aave", USDC_ADDRESS, userAddress)).to.equal(0n);
  });
});
