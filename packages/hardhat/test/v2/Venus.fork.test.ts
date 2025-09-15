import { expect } from "chai";
import { ethers, network } from "hardhat";
import { HDNodeWallet } from "ethers";

const runOnlyOnFork = process.env.MAINNET_FORKING_ENABLED === "true" ? describe : describe.skip;

const RICH_ACCOUNT = ethers.getAddress("0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D");
const USDC_ADDRESS = ethers.getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831");

runOnlyOnFork("VenusGateway V2: deposit and withdraw :fork", function () {
  let router: any;
  let routerView: any;
  let venusGateway: any;
  let venusView: any;
  let usdc: any;
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

    const comptroller = process.env.VENUS_COMPTROLLER || ethers.ZeroAddress;
    venusGateway = await ethers.deployContract(
      "contracts/v2/gateways/VenusGateway.sol:VenusGateway",
      [await router.getAddress(), comptroller],
      richSigner,
    );

    venusView = await ethers.deployContract(
      "contracts/v2/gateways/VenusGatewayView.sol:VenusGatewayView",
      [await venusGateway.getAddress()],
      richSigner,
    );

    await router.connect(user).addGateway("venus", await venusGateway.getAddress());
    await routerView.connect(user).addGateway("venus", await venusView.getAddress());
  });

  it("should deposit and withdraw all USDC", async function () {
    const userAddress = await user.getAddress();
    const depositAmount = ethers.parseUnits("100", 6);

    // Approvals for deposit
    {
      const approvals = await router
        .connect(user)
        .getAuthorizationsForInstructions([
          {
            protocolName: "venus",
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
      const targets: string[] = approvals[0];
      const datas: string[] = approvals[1];
      for (let i = 0; i < targets.length; i++) {
        await user.sendTransaction({ to: targets[i], data: datas[i] });
      }
    }

    await router.connect(user).processProtocolInstructions([
      {
        protocolName: "venus",
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

    expect(await routerView.getBalance("venus", USDC_ADDRESS, userAddress)).to.be.greaterThanOrEqual(depositAmount - 1n);

    // Approvals for withdrawAll (delegate update not needed here, withdraw uses internal balance)
    {
      const approvals = await router
        .connect(user)
        .getAuthorizationsForInstructions([
          {
            protocolName: "venus",
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
      const targets: string[] = approvals[0];
      const datas: string[] = approvals[1];
      for (let i = 0; i < targets.length; i++) {
        await user.sendTransaction({ to: targets[i], data: datas[i] });
      }
    }

    await router.connect(user).processProtocolInstructions([
      {
        protocolName: "venus",
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

    expect(await routerView.getBalance("venus", USDC_ADDRESS, userAddress)).to.equal(0n);
  });
});
