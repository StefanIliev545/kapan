// Deploy SparkGatewayWrite v2
// Note: Spark is an Aave fork, so we use AaveGatewayWrite and AaveGatewayView contracts

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { safeExecute, safeDeploy, waitForPendingTxs, getWaitConfirmations } from "../../utils/safeExecute";

/**
 * Gate deployment by a per-chain address map only.
 * If the current chainId isn't present, we skip deployment.
 * Spark is an Aave fork, so we reuse Aave gateway contracts but deploy separately.
 */
const deploySparkGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  // ---- Address map (Ethereum mainnet only). No chain in map => skip.
  const MAP: Record<number, { PROVIDER: string; UI: string; REFERRAL: number }> = {
    1: {
      PROVIDER: "0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE", // Ethereum mainnet Spark PoolAddressesProvider
      UI:       "0xF028c2F4b19898718fD0F77b9b881CbfdAa5e8Bb", // Ethereum mainnet Spark UiPoolDataProviderV3
      REFERRAL: 0,
    },
  };

  const entry = MAP[chainId];
  if (!entry) {
    console.warn(`Spark: no address map for chainId=${chainId}. Skipping deployment.`);
    return;
  }

  // Env can override addresses for recognized chains
  const POOL_ADDRESSES_PROVIDER = process.env.SPARK_POOL_ADDRESSES_PROVIDER || entry.PROVIDER;
  const UI_POOL_DATA_PROVIDER  = process.env.SPARK_UI_POOL_DATA_PROVIDER || entry.UI;
  const REFERRAL_CODE = Number(process.env.SPARK_REFERRAL_CODE ?? entry.REFERRAL);

  const kapanRouter = await get("KapanRouter");
  const WAIT = getWaitConfirmations(chainId);

  // Use AaveGatewayWrite contract since Spark is an Aave fork
  // Deploy with name "SparkGatewayWrite" to keep it separate from Aave deployments
  const sparkGatewayWrite = await safeDeploy(hre, deployer, "SparkGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, POOL_ADDRESSES_PROVIDER, REFERRAL_CODE],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "SparkGatewayWrite"),
    waitConfirmations: WAIT,
    contract: "AaveGatewayWrite", // Use Aave contract artifact since Spark is a fork
  });

  console.log(`SparkGatewayWrite (using AaveGatewayWrite contract) deployed to: ${sparkGatewayWrite.address}`);

  // Use AaveGatewayViewBase contract since Spark may have UiPoolDataProvider struct differences
  // Deploy with name "SparkGatewayView" to keep it separate from Aave deployments
  const sparkGatewayView = await safeDeploy(hre, deployer, "SparkGatewayView", {
    from: deployer,
    args: [POOL_ADDRESSES_PROVIDER, UI_POOL_DATA_PROVIDER],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "SparkGatewayView"),
    waitConfirmations: WAIT,
    contract: "AaveGatewayViewBase", // Use Base view that reads directly from Pool/Oracle
  });

  console.log(`SparkGatewayView (using AaveGatewayView contract) deployed to: ${sparkGatewayView.address}`);

  await safeExecute(hre, deployer, "KapanRouter", "addGateway", ["spark", sparkGatewayWrite.address], { waitConfirmations: 1 });
  console.log(`SparkGatewayWrite registered with KapanRouter as "spark"`);

  // Temporarily disable Etherscan verification for v2 deploys
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    await verifyContract(hre, sparkGatewayWrite.address, [
      kapanRouter.address,
      POOL_ADDRESSES_PROVIDER,
      REFERRAL_CODE,
    ]);
    await verifyContract(hre, sparkGatewayView.address, [
      POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER,
    ]);
  }

  await waitForPendingTxs(hre, deployer);
};

export default deploySparkGatewayWrite;

deploySparkGatewayWrite.tags = ["SparkGatewayWrite"];
deploySparkGatewayWrite.dependencies = ["KapanRouter"];

