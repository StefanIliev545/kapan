import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { logForkConfig } from "../../utils/forkChain";
import { safeDeploy, waitForPendingTxs } from "../../utils/safeExecute";

const deployAutoLeverageTrigger: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  // Get ViewRouter address
  const viewRouter = await get("KapanViewRouter");

  const result = await safeDeploy(hre, deployer, "AutoLeverageTrigger", {
    from: deployer,
    args: [viewRouter.address],
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "AutoLeverageTrigger"),
  });

  if (result.newlyDeployed) {
    console.log(`AutoLeverageTrigger deployed to: ${result.address}`);
    console.log(`  ViewRouter: ${viewRouter.address}`);
  }

  // Verification
  await verifyContract(hre, result.address, [viewRouter.address]);

  await waitForPendingTxs(hre, deployer);
};

export default deployAutoLeverageTrigger;
deployAutoLeverageTrigger.tags = ["AutoLeverageTrigger", "auto-leverage"];
deployAutoLeverageTrigger.dependencies = ["KapanViewRouter"];
