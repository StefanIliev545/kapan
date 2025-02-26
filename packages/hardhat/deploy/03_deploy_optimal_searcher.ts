// 0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf ARBI USDC

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../utils/verification";

/**
 * Deploys the OptimalInterestRateFinder contract
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployOptimalInterestRateFinder: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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

  const aaveGateway = await hre.deployments.get("AaveGateway");
  const compoundGateway = await hre.deployments.get("CompoundGateway");

  const optimalFinder = await deploy("OptimalInterestRateFinder", {
    from: deployer,
    // Contract constructor arguments
    args: [
        aaveGateway.address,
        compoundGateway.address,
    ],
    log: true,
    // autoMine: can be passed to the deploy function to make the deployment process faster on local networks by
    // automatically mining the contract deployment transaction. There is no effect on live networks.
    autoMine: true,
  });
  
  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contract on Etherscan
    await verifyContract(
      hre,
      optimalFinder.address,
      [
        aaveGateway.address,
        compoundGateway.address,
      ]
    );
  }
};

export default deployOptimalInterestRateFinder;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags OptimalInterestRateFinder
deployOptimalInterestRateFinder.tags = ["OptimalInterestRateFinder"];
deployOptimalInterestRateFinder.dependencies = ["AAVEGateway", "CompoundGateway"];
