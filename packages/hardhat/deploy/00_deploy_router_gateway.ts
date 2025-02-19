import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployRouterGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const BALANCER_VAULT3 = process.env.BALANCER_VAULT3!;
  const BALANCER_VAULT2 = process.env.BALANCER_VAULT2!;

  // Deploy RouterGateway
  const routerGateway = await deploy("RouterGateway", {
    from: deployer,
    args: [
      BALANCER_VAULT3,
      BALANCER_VAULT2,
      deployer,
    ],
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`RouterGateway deployed to: ${routerGateway.address}`);
};

export default deployRouterGateway;

deployRouterGateway.tags = ["RouterGateway"];
