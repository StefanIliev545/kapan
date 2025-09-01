// 0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf ARBI USDC

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import { verifyContract } from "../utils/verification";
import { AAVE_V3_CONFIG } from "../utils/addressMappings";

/**
 * Deploys the Aave Gateway contract using the deployer account and
 * registers it with the Router Gateway and OptimalInterestRateFinder
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployAaveGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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

  const network = hre.network.name as keyof typeof AAVE_V3_CONFIG;
  const cfg = AAVE_V3_CONFIG[network];
  if (!cfg?.enabled) {
    console.log(`Aave not enabled on network ${network}, skipping deployment`);
    return;
  }

  const POOL_ADDRESSES_PROVIDER =
    process.env.AAVE_POOL_ADDRESSES_PROVIDER || cfg.poolAddressesProvider || "0x0000000000000000000000000000000000000000";
  const UI_POOL_DATA_PROVIDER =
    process.env.AAVE_UI_POOL_DATA_PROVIDER || cfg.uiPoolDataProvider || "0x0000000000000000000000000000000000000000";
  const REFERRAL_CODE = process.env.AAVE_REFERRAL_CODE || (cfg.referralCode ?? "0");

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

  console.log(`AaveGateway deployed to: ${aaveGateway.address}`);

  // Register with RouterGateway
  await execute("RouterGateway", { from: deployer }, "addGateway", "aave", aaveGateway.address);
  await execute("RouterGateway", { from: deployer }, "addGateway", "aave v3", aaveGateway.address);
  
  // Also register with OptimalInterestRateFinder
  try {
    const optimalInterestRateFinder = await get("OptimalInterestRateFinder");
    console.log(`Registering AaveGateway with OptimalInterestRateFinder at ${optimalInterestRateFinder.address}`);
    
    await execute(
      "OptimalInterestRateFinder", 
      { from: deployer, log: true }, 
      "registerGateway", 
      "aave", 
      aaveGateway.address
    );
    
    console.log("AaveGateway registered with OptimalInterestRateFinder");
  } catch (error) {
    console.warn("Failed to register with OptimalInterestRateFinder:", error);
  }
  
  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contract on Etherscan
    await verifyContract(
      hre,
      aaveGateway.address,
      [
        routerGateway.address,
        POOL_ADDRESSES_PROVIDER,
        UI_POOL_DATA_PROVIDER,
        REFERRAL_CODE
      ]
    );
  }
};

export default deployAaveGateway;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags AaveGateway
deployAaveGateway.tags = ["AAVEGateway"];
// Now depends on OptimalInterestRateFinder as well
deployAaveGateway.dependencies = ["RouterGateway", "OptimalInterestRateFinder"];
