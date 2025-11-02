// Deploy VenusGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";

/**
 * Deploys the VenusGatewayWrite v2 contract using the deployer account and
 * registers it with the KapanRouter
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployVenusGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  const VENUS_COMPTROLLER = process.env.VENUS_COMPTROLLER || "0x0000000000000000000000000000000000000000";
  const VENUS_ORACLE = process.env.VENUS_ORACLE || "0x0000000000000000000000000000000000000000";
  
  if (VENUS_COMPTROLLER === "0x0000000000000000000000000000000000000000") {
    console.warn("VENUS_COMPTROLLER not set, skipping VenusGatewayWrite deployment");
    return;
  }

  const kapanRouter = await get("KapanRouter");

  const venusGatewayWrite = await deploy("VenusGatewayWrite", {
    from: deployer,
    args: [VENUS_COMPTROLLER, kapanRouter.address, deployer], // comptroller, router, owner
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`VenusGatewayWrite deployed to: ${venusGatewayWrite.address}`);

  // Deploy view gateway (not registered to router)
  if (VENUS_ORACLE !== "0x0000000000000000000000000000000000000000") {
    const venusGatewayView = await deploy("VenusGatewayView", {
      from: deployer,
      args: [VENUS_COMPTROLLER, VENUS_ORACLE, deployer], // comptroller, oracle, owner
      log: true,
      autoMine: true,
      deterministicDeployment: "0x4242424242424242424242424242424242424242",
    });

    console.log(`VenusGatewayView deployed to: ${venusGatewayView.address}`);

    // Skip verification on local networks
    if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
      // Verify the view gateway on Etherscan/BscScan
      await verifyContract(hre, venusGatewayView.address, [
        VENUS_COMPTROLLER,
        VENUS_ORACLE,
        deployer,
      ]);
    }
  } else {
    console.warn("VENUS_ORACLE not set, skipping VenusGatewayView deployment");
  }

  // Register write gateway with KapanRouter (view gateway is not registered)
  await execute("KapanRouter", { from: deployer }, "addGateway", "venus", venusGatewayWrite.address);
  console.log(`VenusGatewayWrite registered with KapanRouter as "venus"`);

  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the write gateway on Etherscan/BscScan
    await verifyContract(hre, venusGatewayWrite.address, [
      VENUS_COMPTROLLER,
      kapanRouter.address,
      deployer,
    ]);
  }
};

export default deployVenusGatewayWrite;

deployVenusGatewayWrite.tags = ["VenusGatewayWrite", "v2"];
deployVenusGatewayWrite.dependencies = ["KapanRouter"];

