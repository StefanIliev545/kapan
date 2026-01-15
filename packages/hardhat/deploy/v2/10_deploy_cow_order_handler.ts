import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, safeDeploy, waitForPendingTxs } from "../../utils/safeExecute";

/**
 * Chains where CoW Protocol with hooks is supported
 */
const COW_SUPPORTED_CHAINS = [
  1,      // Ethereum Mainnet
  42161,  // Arbitrum One
  8453,   // Base
  10,     // Optimism
  100,    // Gnosis
  137,    // Polygon
  43114,  // Avalanche
  56,     // BNB Chain
  59144,  // Linea
  9745,   // Plasma
];

const deployKapanOrderHandler: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  // Check if CoW Protocol is supported on this chain
  if (!COW_SUPPORTED_CHAINS.includes(effectiveChainId)) {
    console.log(`⚠️  CoW Protocol not supported on chain ${effectiveChainId}. Skipping KapanOrderHandler deployment.`);
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get, read } = hre.deployments;

  // Get OrderManager address
  let orderManager;
  try {
    orderManager = await get("KapanOrderManager");
  } catch (e) {
    console.log(`⚠️  KapanOrderManager not deployed. Skipping KapanOrderHandler deployment.`);
    return;
  }

  const result = await safeDeploy(hre, deployer, "KapanOrderHandler", {
    from: deployer,
    args: [orderManager.address],
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "KapanOrderHandler"),
  });

  if (result.newlyDeployed) {
    console.log(`KapanOrderHandler deployed to: ${result.address}`);
  }

  // Always ensure handler is set on OrderManager (idempotent)
  const currentHandler = await read("KapanOrderManager", "orderHandler");
  if (currentHandler !== result.address) {
    await safeExecute(hre, deployer, "KapanOrderManager", "setOrderHandler", [result.address], { waitConfirmations: 1 });
    console.log(`KapanOrderHandler set on KapanOrderManager`);
  } else {
    console.log(`KapanOrderHandler already set correctly`);
  }

  // Verification
  await verifyContract(hre, result.address, [orderManager.address]);

  await waitForPendingTxs(hre, deployer);
};

export default deployKapanOrderHandler;
deployKapanOrderHandler.tags = ["KapanOrderHandler", "cow"];
deployKapanOrderHandler.dependencies = ["KapanOrderManager"];
