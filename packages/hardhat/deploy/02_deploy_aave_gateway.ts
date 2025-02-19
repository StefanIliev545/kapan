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
  const { deploy, execute, get } = hre.deployments;

  const POOL_ADDRESSES_PROVIDER = process.env.AAVE_POOL_ADDRESSES_PROVIDER || "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
  const UI_POOL_DATA_PROVIDER = process.env.AAVE_UI_POOL_DATA_PROVIDER || "0x5c5228aC8BC1528482514aF3e27E692495148717";
  const REFERRAL_CODE = process.env.AAVE_REFERRAL_CODE || "0";

  const routerGateway = await get("RouterGateway");

  const aaveGateway = await deploy("AaveGateway", {
    from: deployer,
    args: [
      routerGateway.address,
      POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER,
      REFERRAL_CODE
    ],
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  await execute("RouterGateway", { from: deployer }, "addGateway", "aave", aaveGateway.address);
  await execute("RouterGateway", { from: deployer }, "addGateway", "aave v3", aaveGateway.address);
};

export default deployYourContract;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags YourContract
deployYourContract.tags = ["AAVEGateway"];
deployYourContract.dependencies = ["RouterGateway"];