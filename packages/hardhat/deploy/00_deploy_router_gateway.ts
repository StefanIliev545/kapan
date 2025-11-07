import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../utils/verification";

const deployRouterGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // V1 contracts are deprecated - use v2 deployments instead
  console.log("Skipping v1 RouterGateway deployment - use v2 KapanRouter instead");
  return;

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
  
  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contract on Etherscan
    await verifyContract(
      hre,
      routerGateway.address,
      [BALANCER_VAULT3, BALANCER_VAULT2, deployer]
    );
  }
};

export default deployRouterGateway;

deployRouterGateway.tags = ["RouterGateway"];
