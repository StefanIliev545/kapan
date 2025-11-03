// Deploy Venus Gateway for BNB Chain

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../utils/verification";

/**
 * Deploys the Venus Gateway contract using the deployer account and
 * registers it with the Router Gateway and OptimalInterestRateFinder
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployVenusGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // V1 contracts are deprecated - use v2 deployments instead
  console.log("Skipping v1 VenusGateway deployment - use v2 VenusGatewayWrite/View instead");
  return;

  /*
    On localhost, the deployer account is the one that comes with Hardhat, which is already funded.

    When deploying to live networks (e.g `yarn deploy --network bnb`), the deployer account
    should have sufficient balance to pay for the gas fees for contract creation.

    You can generate a random account with `yarn generate` or `yarn account:import` to import your
    existing PK which will fill DEPLOYER_PRIVATE_KEY_ENCRYPTED in the .env file (then used on hardhat.config.ts)
    You can run the `yarn account` command to check your balance in every network.
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  // Venus Unitroller (Comptroller Proxy) on BNB Chain
  // This is the main entry point to the Venus Protocol
  const VENUS_COMPTROLLER = process.env.VENUS_COMPTROLLER!;
  const VENUS_ORACLE = process.env.VENUS_ORACLE!;
  // Get the router gateway address from previous deployment
  const routerGateway = await get("RouterGateway");

  // Deploy VenusGateway
  const venusGateway = await deploy("VenusGateway", {
    from: deployer,
    args: [
      VENUS_COMPTROLLER,  // Comptroller
      VENUS_ORACLE,       // Oracle
      routerGateway.address  // Router
    ],
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`VenusGateway deployed to: ${venusGateway.address}`);

  // Register the gateway with the router
  await execute("RouterGateway", { from: deployer }, "addGateway", "venus", venusGateway.address);
  
  // Also register the gateway with the OptimalInterestRateFinder
  // Try to use v2 view gateway if it exists, otherwise use v1 gateway
  try {
    const optimalInterestRateFinder = await get("OptimalInterestRateFinder");
    let gatewayToRegister = venusGateway.address;
    
    // Check if v2 view gateway exists and use it instead
    try {
      const venusGatewayView = await get("VenusGatewayView");
      gatewayToRegister = venusGatewayView.address;
      console.log(`Using v2 VenusGatewayView for OptimalInterestRateFinder: ${gatewayToRegister}`);
    } catch {
      console.log(`Using v1 VenusGateway for OptimalInterestRateFinder: ${gatewayToRegister}`);
    }

    console.log(`Registering gateway with OptimalInterestRateFinder at ${optimalInterestRateFinder.address}`);
    
    await execute(
      "OptimalInterestRateFinder", 
      { from: deployer, log: true }, 
      "registerGateway", 
      "venus", 
      gatewayToRegister
    );
    
    console.log("Gateway registered with OptimalInterestRateFinder");
  } catch (error) {
    console.warn("Failed to register with OptimalInterestRateFinder:", error);
  }
  
  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contract on BscScan
    await verifyContract(
      hre,
      venusGateway.address,
      [
        VENUS_COMPTROLLER,
        VENUS_ORACLE,
        routerGateway.address
      ]
    );
  }
};

export default deployVenusGateway;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags VenusGateway
deployVenusGateway.tags = ["VenusGateway"];
// Now depends on OptimalInterestRateFinder as well
deployVenusGateway.dependencies = ["RouterGateway", "OptimalInterestRateFinder"]; 