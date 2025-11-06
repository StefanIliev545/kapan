// Deploy OptimalInterestRateFinder v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
// import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

/**
 * Deploys the OptimalInterestRateFinder contract
 * This contract finds optimal interest rates across all registered gateways
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployOptimalInterestRateFinder: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;
  const WAIT = 3;

  // Deploy OptimalInterestRateFinder (no constructor arguments needed)
  const optimalFinder = await deploy("OptimalInterestRateFinder", {
    from: deployer,
    args: [deployer],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "OptimalInterestRateFinder"),
    waitConfirmations: WAIT,
  });

  console.log(`OptimalInterestRateFinder deployed to: ${optimalFinder.address}`);

  // Register v2 view gateways if they exist
  const protocols = [
    { name: "aave", viewGateway: "AaveGatewayView" },
    { name: "compound", viewGateway: "CompoundGatewayView" },
    { name: "venus", viewGateway: "VenusGatewayView" },
    { name: "aave v3", viewGateway: "AaveGatewayView" },
    { name: "compound v3", viewGateway: "CompoundGatewayView" },
  ];

  for (const { name, viewGateway } of protocols) {
    try {
      const gateway = await get(viewGateway);
      console.log(`Registering ${viewGateway} with address ${gateway.address} with OptimalInterestRateFinder as "${name}"`);
      await execute(
        "OptimalInterestRateFinder",
        { from: deployer, log: true, waitConfirmations: 5 },
        "registerGateway",
        name,
        gateway.address,
      );
      console.log(`${viewGateway} registered with OptimalInterestRateFinder as "${name}"`);
    } catch (error) {
      console.warn(`Failed to register ${viewGateway} with OptimalInterestRateFinder:`, error);
    }
  }

  // Skip verification on local networks
  /*if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    await verifyContract(hre, optimalFinder.address, []);
  }*/
};

export default deployOptimalInterestRateFinder;

deployOptimalInterestRateFinder.tags = ["OptimalInterestRateFinder", "v2"];
// Dependencies: wait for gateway deployments (which deploy both Write and View contracts)
deployOptimalInterestRateFinder.dependencies = ["AaveGatewayWrite", "CompoundGatewayWrite", "VenusGatewayWrite"];

