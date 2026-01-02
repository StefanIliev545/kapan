import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Syncs all deployed gateways with KapanAuthorizationHelper.
 * 
 * This runs AFTER all gateway deployments to avoid nonce race conditions.
 * Each gateway is synced sequentially with confirmation waits.
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

  // Get contract instance directly
  const helper = await ethers.getContractAt("KapanAuthorizationHelper", helperDeployment.address);
  
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
  ];

  let syncedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const { name, deploymentName } of gatewayConfigs) {
    try {
      const gateway = await get(deploymentName);
      const currentAddr = await helper.gateways(name);

      if (currentAddr.toLowerCase() !== gateway.address.toLowerCase()) {
        console.log(`Syncing ${name}: ${currentAddr} -> ${gateway.address}`);
        const tx = await helper.syncGateway(name, gateway.address);
        console.log(`  tx: ${tx.hash}`);
        // Wait for 2 confirmations to be safe
        await tx.wait(2);
        console.log(`  confirmed`);
        syncedCount++;
      } else {
        console.log(`${name}: already synced (${currentAddr.slice(0, 10)}...)`);
        skippedCount++;
      }
    } catch (e: any) {
      // Gateway not deployed or sync failed
      if (e.message?.includes("No deployment found")) {
        console.log(`${name}: not deployed on this chain, skipping`);
        skippedCount++;
      } else {
        const msg = e.message?.substring(0, 150) || String(e);
        console.log(`${name}: FAILED - ${msg}`);
        failedCount++;
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
};

export default func;
func.tags = ["SyncAuthHelper", "v2"];

// Explicit dependencies on all gateway deployments
// This ensures this script runs LAST after all gateways are deployed
func.dependencies = [
  "KapanAuthorizationHelper",
  "AaveGatewayWrite",
  "CompoundGatewayWrite",
  "VenusGatewayWrite",
  "ZeroLendGatewayWrite",
  "OneInchGateway",
  "PendleGateway",
  "SparkGatewayWrite",
  "MorphoBlueGateway",
  "UiHelper",
  "CowOrderManager",
  "CowOrderHandler",
];
