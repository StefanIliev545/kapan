import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { waitForPendingTxs } from "../../utils/safeExecute";

/**
 * Final sync script - ensures all contract links are properly configured.
 * 
 * This runs AFTER all deployments to fix any missing links caused by:
 * - Redeployments that don't trigger dependent scripts
 * - Failed transactions during initial deployment
 * - Manual deployments
 * 
 * Links configured:
 * - Router.authorizationHelper → KapanAuthorizationHelper
 * - OrderManager.orderHandler → KapanOrderHandler  
 * - AuthorizationHelper.gateways[name] → Gateway addresses
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { get } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("\n=== Syncing Gateways with KapanAuthorizationHelper ===\n");

  let helperDeployment;
  try {
    helperDeployment = await get("KapanAuthorizationHelper");
  } catch {
    console.log("KapanAuthorizationHelper not deployed, skipping sync");
    return;
  }

  // Get contract instances directly
  const helper = await ethers.getContractAt("KapanAuthorizationHelper", helperDeployment.address);
  
  // First: Ensure Router has AuthorizationHelper set
  const routerDeployment = await get("KapanRouter");
  const router = await ethers.getContractAt("KapanRouter", routerDeployment.address);
  const currentHelper = await router.authorizationHelper();
  
  if (currentHelper.toLowerCase() !== helperDeployment.address.toLowerCase()) {
    console.log(`\n=== Setting AuthorizationHelper on Router ===`);
    console.log(`Current: ${currentHelper}`);
    console.log(`Expected: ${helperDeployment.address}`);
    const setTx = await router.setAuthorizationHelper(helperDeployment.address);
    console.log(`tx: ${setTx.hash}`);
    await setTx.wait(2);
    console.log(`Router.authorizationHelper set successfully`);
  } else {
    console.log(`Router.authorizationHelper already set correctly: ${currentHelper.slice(0, 10)}...`);
  }
  
  // Also ensure OrderManager has OrderHandler set (if both are deployed)
  try {
    const orderManagerDeployment = await get("KapanConditionalOrderManager");
    const orderHandlerDeployment = await get("KapanConditionalOrderHandler");
    const orderManager = await ethers.getContractAt("KapanConditionalOrderManager", orderManagerDeployment.address);
    const currentHandler = await orderManager.orderHandler();
    
    if (currentHandler.toLowerCase() !== orderHandlerDeployment.address.toLowerCase()) {
      console.log(`\n=== Setting OrderHandler on OrderManager ===`);
      console.log(`Current: ${currentHandler}`);
      console.log(`Expected: ${orderHandlerDeployment.address}`);
      const setHandlerTx = await orderManager.setOrderHandler(orderHandlerDeployment.address);
      console.log(`tx: ${setHandlerTx.hash}`);
      await setHandlerTx.wait(2);
      console.log(`OrderManager.orderHandler set successfully`);
    } else {
      console.log(`OrderManager.orderHandler already set correctly: ${currentHandler.slice(0, 10)}...`);
    }
  } catch (e: any) {
    if (!e.message?.includes("No deployment found")) {
      console.log(`Warning: Could not sync OrderManager/Handler: ${e.message?.slice(0, 100)}`);
    }
  }
  
  // Check ownership
  const owner = await helper.owner();
  console.log(`KapanAuthorizationHelper owner: ${owner}`);
  console.log(`Deployer: ${deployer}`);
  if (owner.toLowerCase() !== deployer.toLowerCase()) {
    console.log(`WARNING: Deployer is not the owner! Cannot sync gateways.`);
    return;
  }

  // All gateways that need to be synced
  const gatewayConfigs = [
    { name: "aave", deploymentName: "AaveGatewayWrite" },
    { name: "compound", deploymentName: "CompoundGatewayWrite" },
    { name: "venus", deploymentName: "VenusGatewayWrite" },
    { name: "zerolend", deploymentName: "ZeroLendGatewayWrite" },
    { name: "morpho-blue", deploymentName: "MorphoBlueGatewayWrite" },
    { name: "oneinch", deploymentName: "OneInchGateway" },
    { name: "pendle", deploymentName: "PendleGateway" },
    { name: "spark", deploymentName: "SparkGatewayWrite" },
    { name: "euler", deploymentName: "EulerGatewayWrite" },
  ];

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const { name, deploymentName } of gatewayConfigs) {
    try {
      const gateway = await get(deploymentName);
      const currentAddr = await helper.gateways(name);

      if (currentAddr.toLowerCase() !== gateway.address.toLowerCase()) {
        // Wait for pending txs before sending to avoid nonce conflicts
        await waitForPendingTxs(hre, deployer, 15000);
        console.log(`Syncing ${name}: ${currentAddr} -> ${gateway.address}`);
        const tx = await helper.syncGateway(name, gateway.address);
        console.log(`  tx: ${tx.hash}`);
        await tx.wait(2);
        console.log(`  confirmed`);
        syncedCount++;
      } else {
        console.log(`${name}: already synced (${currentAddr.slice(0, 10)}...)`);
        skippedCount++;
      }
    } catch (e: any) {
      if (e.message?.includes("No deployment found")) {
        console.log(`${name}: not deployed on this chain, skipping`);
        skippedCount++;
      } else {
        const msg = e.message?.substring(0, 150) || String(e);
        console.log(`${name}: FAILED - ${msg}`);
        failedCount++;
        // Wait for pending txs to clear after failure to prevent nonce cascade
        await waitForPendingTxs(hre, deployer, 15000);
      }
    }
  }

  // Summary
  console.log(`\n=== Sync Summary ===`);
  console.log(`Synced: ${syncedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);

  if (failedCount > 0) {
    console.log(`\nWARNING: ${failedCount} gateway(s) failed to sync!`);
  }

  // Verify final state
  console.log("\n=== Final Gateway State ===");
  for (const { name } of gatewayConfigs) {
    try {
      const addr = await helper.gateways(name);
      if (addr !== "0x0000000000000000000000000000000000000000") {
        console.log(`${name}: ${addr}`);
      }
    } catch {
      // Ignore read errors
    }
  }

  console.log("\n=== Gateway Sync Complete ===\n");

  await waitForPendingTxs(hre, deployer);
};

export default func;
func.tags = ["SyncAuthHelper", "v2"];

// Explicit dependencies on all deployments that need linking
// This ensures this script runs LAST after everything is deployed
func.dependencies = [
  "KapanRouter",  // Must link AuthorizationHelper to Router
  "KapanAuthorizationHelper",
  "AaveGatewayWrite",
  "CompoundGatewayWrite",
  "VenusGatewayWrite",
  "ZeroLendGatewayWrite",
  "OneInchGateway",
  "PendleGateway",
  "SparkGatewayWrite",
  "MorphoBlueGateway",
  "EulerGateway",
  "UiHelper",
  "KapanConditionalOrderManager",
  "KapanConditionalOrderHandler",
];
