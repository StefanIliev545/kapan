// Deploy KapanRouter v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";

/**
 * Deploys the KapanRouter v2 contract using the deployer account
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployKapanRouter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute } = hre.deployments;

  // Deploy KapanRouter
  const kapanRouter = await deploy("KapanRouter", {
    from: deployer,
    args: [deployer], // owner
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`KapanRouter deployed to: ${kapanRouter.address}`);

  // Set Balancer flash loan providers if provided
  const BALANCER_VAULT2 = process.env.BALANCER_VAULT2;
  const BALANCER_VAULT3 = process.env.BALANCER_VAULT3;

  if (BALANCER_VAULT2) {
    await execute("KapanRouter", { from: deployer }, "setBalancerV2", BALANCER_VAULT2);
    console.log(`Balancer V2 provider set to: ${BALANCER_VAULT2}`);
  }

  if (BALANCER_VAULT3) {
    await execute("KapanRouter", { from: deployer }, "setBalancerV3", BALANCER_VAULT3);
    console.log(`Balancer V3 vault set to: ${BALANCER_VAULT3}`);
  }

  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contract on Etherscan
    await verifyContract(hre, kapanRouter.address, [deployer]);
  }
};

export default deployKapanRouter;

deployKapanRouter.tags = ["KapanRouter", "v2"];
deployKapanRouter.dependencies = [];

