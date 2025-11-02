// Deploy AaveGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";

/**
 * Deploys the AaveGatewayWrite v2 contract using the deployer account and
 * registers it with the KapanRouter
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployAaveGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  const POOL_ADDRESSES_PROVIDER =
    process.env.AAVE_POOL_ADDRESSES_PROVIDER || "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb";
  const UI_POOL_DATA_PROVIDER = process.env.AAVE_UI_POOL_DATA_PROVIDER || "0x5c5228aC8BC1528482514aF3e27E692495148717";
  const REFERRAL_CODE = process.env.AAVE_REFERRAL_CODE || "0";

  const kapanRouter = await get("KapanRouter");

  const aaveGatewayWrite = await deploy("AaveGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, POOL_ADDRESSES_PROVIDER, parseInt(REFERRAL_CODE)],
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`AaveGatewayWrite deployed to: ${aaveGatewayWrite.address}`);

  // Deploy view gateway (not registered to router)
  const aaveGatewayView = await deploy("AaveGatewayView", {
    from: deployer,
    args: [POOL_ADDRESSES_PROVIDER, UI_POOL_DATA_PROVIDER],
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`AaveGatewayView deployed to: ${aaveGatewayView.address}`);

  // Register write gateway with KapanRouter (view gateway is not registered)
  await execute("KapanRouter", { from: deployer }, "addGateway", "aave", aaveGatewayWrite.address);
  console.log(`AaveGatewayWrite registered with KapanRouter as "aave"`);

  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contracts on Etherscan
    await verifyContract(hre, aaveGatewayWrite.address, [
      kapanRouter.address,
      POOL_ADDRESSES_PROVIDER,
      parseInt(REFERRAL_CODE),
    ]);
    await verifyContract(hre, aaveGatewayView.address, [
      POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER,
    ]);
  }
};

export default deployAaveGatewayWrite;

deployAaveGatewayWrite.tags = ["AaveGatewayWrite", "v2"];
deployAaveGatewayWrite.dependencies = ["KapanRouter"];

