import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../utils/verification";

const deployUiHelper: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  // V1 contracts are deprecated - use v2 deployments instead
  console.log("Skipping v1 UiHelper deployment - use v2 deployment instead");
  return;

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Deploy UiHelper
  const uiHelper = await deploy("UiHelper", {
    from: deployer,
    args: [], // No constructor arguments
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`UiHelper deployed to: ${uiHelper.address}`);
  
  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contract on Etherscan
    await verifyContract(
      hre,
      uiHelper.address,
      [] // No constructor arguments
    );
  }
};

export default deployUiHelper;

deployUiHelper.tags = ["UiHelper"]; 