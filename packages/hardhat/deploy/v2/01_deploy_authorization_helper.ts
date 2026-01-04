import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { deterministicSalt } from "../../utils/deploySalt";
import { safeExecute, safeDeploy, waitForPendingTxs, getWaitConfirmations } from "../../utils/safeExecute";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, get, read } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = Number(await hre.getChainId());
  const WAIT = getWaitConfirmations(chainId);

  const router = await get("KapanRouter");

  const result = await safeDeploy(hre, deployer, "KapanAuthorizationHelper", {
    from: deployer,
    args: [router.address, deployer],
    log: true,
    deterministicDeployment: deterministicSalt(hre, "KapanAuthorizationHelper"),
    waitConfirmations: WAIT,
  });

  if (result.newlyDeployed) {
    console.log(`KapanAuthorizationHelper deployed to: ${result.address}`);
  }

  // Set the helper on the router (if not already set)
  const currentHelper = await read("KapanRouter", "authorizationHelper");
  if (currentHelper !== result.address) {
    await safeExecute(hre, deployer, "KapanRouter", "setAuthorizationHelper", [result.address], { waitConfirmations: WAIT });
    console.log(`KapanRouter.authorizationHelper set to: ${result.address}`);
  }
  // Skip verification for local networks
  if (network.name === "hardhat" || network.name === "localhost") {
    console.log("⚠️  Skipping verification for local network:", network.name);
    await waitForPendingTxs(hre, deployer);
    return;
  }

  await waitForPendingTxs(hre, deployer);
};

export default func;
func.tags = ["KapanAuthorizationHelper"];
func.dependencies = ["KapanRouter"];
