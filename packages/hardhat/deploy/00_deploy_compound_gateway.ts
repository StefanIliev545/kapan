// 0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf ARBI USDC

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys a contract named "YourContract" using the deployer account and
 * constructor arguments set to the deployer address
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployYourContract: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
    On localhost, the deployer account is the one that comes with Hardhat, which is already funded.

    When deploying to live networks (e.g `yarn deploy --network sepolia`), the deployer account
    should have sufficient balance to pay for the gas fees for contract creation.

    You can generate a random account with `yarn generate` or `yarn account:import` to import your
    existing PK which will fill DEPLOYER_PRIVATE_KEY_ENCRYPTED in the .env file (then used on hardhat.config.ts)
    You can run the `yarn account` command to check your balance in every network.
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("CompoundGateway", {
    from: deployer,
    // Contract constructor arguments
    args: [
        "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", // ARBI USDC
        "0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07", //USDT
        "0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA", //USDC.e
        "0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486", //WETH
    ],
    log: true,
    // autoMine: can be passed to the deploy function to make the deployment process faster on local networks by
    // automatically mining the contract deployment transaction. There is no effect on live networks.
    autoMine: true,
  });

  // Get the deployed contract to interact with it after deploying.
  const CompoundGateway = await hre.ethers.getContract<Contract>("CompoundGateway", deployer);
  const usdcToken = await CompoundGateway.getBaseToken("0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf");
  console.log("👋 Base Token USDC:", usdcToken);
  const usdtToken = await CompoundGateway.getBaseToken("0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07");
  console.log("👋 Base Token USDT:", usdtToken);
  const usdcEToken = await CompoundGateway.getBaseToken("0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA");
  console.log("👋 Base Token USDC.e:", usdcEToken);
  const wethToken = await CompoundGateway.getBaseToken("0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486");
  console.log("👋 Base Token WETH:", wethToken);
};

export default deployYourContract;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags YourContract
deployYourContract.tags = ["YourContract"];
