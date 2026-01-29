import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, safeDeploy, waitForPendingTxs } from "../../utils/safeExecute";

/**
 * Chains where CoW Protocol with ComposableCoW + HooksTrampoline is deployed
 */
const COW_SUPPORTED_CHAINS = [
  1, // Ethereum Mainnet
  42161, // Arbitrum One
  8453, // Base
  59144, // Linea
];

const deployKapanConditionalOrderHandler: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  // Check if CoW Protocol is supported on this chain
  if (!COW_SUPPORTED_CHAINS.includes(effectiveChainId)) {
    console.log(
      `⚠️  CoW Protocol not supported on chain ${effectiveChainId}. Skipping KapanConditionalOrderHandler deployment.`,
    );
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { get, read } = hre.deployments;

  // Get ConditionalOrderManager address
  let manager;
  try {
    manager = await get("KapanConditionalOrderManager");
  } catch {
    console.log(`⚠️  KapanConditionalOrderManager not deployed. Skipping KapanConditionalOrderHandler deployment.`);
    return;
  }

  const result = await safeDeploy(hre, deployer, "KapanConditionalOrderHandler", {
    from: deployer,
    args: [manager.address],
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "KapanConditionalOrderHandler"),
  });

  if (result.newlyDeployed) {
    console.log(`KapanConditionalOrderHandler deployed to: ${result.address}`);
  }

  // Wait for RPC node to update nonce if newly deployed
  if (result.newlyDeployed) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Always ensure handler is set on ConditionalOrderManager (idempotent)
  const currentHandler = await read("KapanConditionalOrderManager", "orderHandler");
  if (currentHandler !== result.address) {
    await safeExecute(hre, deployer, "KapanConditionalOrderManager", "setOrderHandler", [result.address], {
      waitConfirmations: 1,
    });
    console.log(`KapanConditionalOrderHandler set on KapanConditionalOrderManager`);
  } else {
    console.log(`KapanConditionalOrderHandler already set correctly`);
  }

  // Verification
  await verifyContract(hre, result.address, [manager.address]);

  await waitForPendingTxs(hre, deployer);
};

export default deployKapanConditionalOrderHandler;
deployKapanConditionalOrderHandler.tags = ["KapanConditionalOrderHandler", "adl", "cow"];
deployKapanConditionalOrderHandler.dependencies = ["KapanConditionalOrderManager"];
