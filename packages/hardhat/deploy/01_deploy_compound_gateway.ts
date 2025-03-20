// 0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf ARBI USDC

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";
import { verifyContract } from "../utils/verification";

/**
 * Deploys the Compound Gateway contract using the deployer account,
 * registers it with the Router Gateway and OptimalInterestRateFinder
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployCompoundGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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

  const USDC_COMET = process.env.COMPOUND_USDC_COMET || "0x0000000000000000000000000000000000000000";
  const USDT_COMET = process.env.COMPOUND_USDT_COMET || "0x0000000000000000000000000000000000000000";
  const USDC_E_COMET = process.env.COMPOUND_USDC_E_COMET || "0x0000000000000000000000000000000000000000";
  const WETH_COMET = process.env.COMPOUND_WETH_COMET || "0x0000000000000000000000000000000000000000";
  const CHAINLINK_FEED = process.env.CHAINLINK_FEED_REGISTRY || "0x0000000000000000000000000000000000000000";
  const WETH_ADDRESS = process.env.WETH_ADDRESS || "0x0000000000000000000000000000000000000000";
  const WETH_PRICE_FEED = process.env.WETH_PRICE_FEED || "0x0000000000000000000000000000000000000000";

  const COMET_ADDRESSES = [USDC_COMET, USDT_COMET, USDC_E_COMET, WETH_COMET].filter((address) => address !== "0x0000000000000000000000000000000000000000");

  const routerGateway = await get("RouterGateway");

  const compoundGateway = await deploy("CompoundGateway", {
    from: deployer,
    args: [
      routerGateway.address,
      COMET_ADDRESSES,
      CHAINLINK_FEED,
      deployer, // owner
    ],
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`CompoundGateway deployed to: ${compoundGateway.address}`);

  await hre.deployments.execute("CompoundGateway", { from: deployer }, "overrideFeed",
    WETH_ADDRESS,
    WETH_PRICE_FEED,
  );

  // Register the gateway with the router
  await execute("RouterGateway", { from: deployer }, "addGateway", "compound", compoundGateway.address);
  await execute("RouterGateway", { from: deployer }, "addGateway", "compound v3", compoundGateway.address);
  
  // Also register the gateway with the OptimalInterestRateFinder
  try {
    const optimalInterestRateFinder = await get("OptimalInterestRateFinder");
    console.log(`Registering CompoundGateway with OptimalInterestRateFinder at ${optimalInterestRateFinder.address}`);
    
    await execute(
      "OptimalInterestRateFinder", 
      { from: deployer, log: true }, 
      "registerGateway", 
      "compound", 
      compoundGateway.address
    );
    
    console.log("CompoundGateway registered with OptimalInterestRateFinder");
  } catch (error) {
    console.warn("Failed to register with OptimalInterestRateFinder:", error);
  }
  
  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contract on Etherscan
    await verifyContract(
      hre,
      compoundGateway.address,
      [
        routerGateway.address,
        COMET_ADDRESSES,
        CHAINLINK_FEED,
        deployer
      ]
    );
  }
};

export default deployCompoundGateway;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags CompoundGateway
deployCompoundGateway.tags = ["CompoundGateway"];
// Now depends on OptimalInterestRateFinder as well
deployCompoundGateway.dependencies = ["RouterGateway", "OptimalInterestRateFinder"];
