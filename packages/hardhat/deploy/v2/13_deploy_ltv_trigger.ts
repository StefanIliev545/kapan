import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { logForkConfig } from "../../utils/forkChain";
import { safeDeploy, waitForPendingTxs } from "../../utils/safeExecute";

const deployLtvTrigger: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  // Get ViewRouter address
  const viewRouter = await get("KapanViewRouter");

  const result = await safeDeploy(hre, deployer, "LtvTrigger", {
    from: deployer,
    args: [viewRouter.address],
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "LtvTrigger"),
  });

  if (result.newlyDeployed) {
    console.log(`LtvTrigger deployed to: ${result.address}`);
    console.log(`  ViewRouter: ${viewRouter.address}`);
  }

  // Verification
  await verifyContract(hre, result.address, [viewRouter.address]);

  await waitForPendingTxs(hre, deployer);
};

export default deployLtvTrigger;
deployLtvTrigger.tags = ["LtvTrigger", "adl"];
deployLtvTrigger.dependencies = ["KapanViewRouter"];
