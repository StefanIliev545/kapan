// Deploy UiHelper v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
// import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

/**
 * Deploys the UiHelper contract
 * This contract provides utility functions for the frontend (e.g., getting token decimals)
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployUiHelper: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const WAIT = 3;

  // Deploy UiHelper (no constructor arguments needed)
  const uiHelper = await deploy("UiHelper", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "UiHelper"),
    waitConfirmations: WAIT,
  });

  console.log(`UiHelper deployed to: ${uiHelper.address}`);

  // Skip verification on local networks
 /* if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    await verifyContract(hre, uiHelper.address, []);
  }*/
};

export default deployUiHelper;

deployUiHelper.tags = ["UiHelper", "v2"];
// No dependencies - UiHelper is independent

