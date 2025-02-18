import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployRouterGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Get the deployed gateway contracts
  const aaveGateway = await hre.deployments.get("AaveGateway");
  const compoundGateway = await hre.deployments.get("CompoundGateway");

  const BALANCER_VAULT3 = process.env.BALANCER_VAULT3!;
  const BALANCER_VAULT2 = process.env.BALANCER_VAULT2!;

  // Deploy RouterGateway
  const routerGateway = await deploy("RouterGateway", {
    from: deployer,
    args: [
      aaveGateway.address,
      compoundGateway.address,
      BALANCER_VAULT3,
      BALANCER_VAULT2,
    ],
    log: true,
    autoMine: true,
  });

  console.log(`RouterGateway deployed to: ${routerGateway.address}`);
};

export default deployRouterGateway;

deployRouterGateway.tags = ["RouterGateway"];
deployRouterGateway.dependencies = ["AaveGateway", "CompoundGateway"];
