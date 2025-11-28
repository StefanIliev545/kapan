// Deploy AaveGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

/**
 * Gate deployment by a per-chain address map only.
 * If the current chainId isn't present, we skip deployment.
 */
const deployAaveGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  // ---- Address map (Arbitrum + Base + Optimism + Linea). No chain in map => skip.
  const MAP: Record<number, { PROVIDER: string; UI: string; REFERRAL: number }> = {
    42161: {
      PROVIDER: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb", // Arbitrum v3 PoolAddressesProvider
      UI: "0x5c5228aC8BC1528482514aF3e27E692495148717", // Arbitrum UiPoolDataProviderV3
      REFERRAL: 0,
    },
    8453: {
      PROVIDER: "0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d", // Base v3 PoolAddressesProvider
      UI: "0x174446a6741300cD2E7C1b1A636Fee99c8F83502", // Base UiPoolDataProviderV3
      REFERRAL: 0,
    },
    10: {
      PROVIDER: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb", // Optimism v3 PoolAddressesProvider
      UI: "0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4", // Optimism UiPoolDataProviderV3
      REFERRAL: 0,
    },
    59144: {
      PROVIDER: "0x89502c3731F69DDC95B65753708A07F8Cd0373F4", // Linea v3 PoolAddressesProvider
      UI: "0xf751969521E20A972A0776CDB0497Fad0F773F1F", // Linea UiPoolDataProviderV3
      REFERRAL: 0,
    },
    31337: { // hardhat
      PROVIDER: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb", // hh v3 PoolAddressesProvider (Arbitrum)
      UI: "0x5c5228aC8BC1528482514aF3e27E692495148717", // hh UiPoolDataProviderV3 (Arbitrum)
      REFERRAL: 0,
    },
  };

  const entry = MAP[chainId];
  if (!entry) {
    console.warn(`Aave: no address map for chainId=${chainId}. Skipping deployment.`);
    return;
  }

  // Env can override addresses for recognized chains
  const POOL_ADDRESSES_PROVIDER = process.env.AAVE_POOL_ADDRESSES_PROVIDER || entry.PROVIDER;
  const UI_POOL_DATA_PROVIDER = process.env.AAVE_UI_POOL_DATA_PROVIDER || entry.UI;
  const REFERRAL_CODE = Number(process.env.AAVE_REFERRAL_CODE ?? entry.REFERRAL);

  const kapanRouter = await get("KapanRouter");
  const WAIT = 3;

  const aaveGatewayWrite = await deploy("AaveGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, POOL_ADDRESSES_PROVIDER, REFERRAL_CODE],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "AaveGatewayWrite"),
    waitConfirmations: WAIT,
  });

  console.log(`AaveGatewayWrite deployed to: ${aaveGatewayWrite.address}`);

  // On Base, deploy the Base-specific view implementation but keep the deployment name "AaveGatewayView"
  const isBaseChain = chainId === 8453 || chainId === 84532;
  const aaveGatewayView = await deploy("AaveGatewayView", {
    from: deployer,
    args: [POOL_ADDRESSES_PROVIDER, UI_POOL_DATA_PROVIDER],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "AaveGatewayView"),
    waitConfirmations: WAIT,
    // Use Base-specific contract artifact on Base chains
    ...(isBaseChain ? { contract: "AaveGatewayViewBase" } : {}),
  });

  console.log(`AaveGatewayView deployed to: ${aaveGatewayView.address}`);

  await execute("KapanRouter", { from: deployer, waitConfirmations: 5 }, "addGateway", "aave", aaveGatewayWrite.address);
  console.log(`AaveGatewayWrite registered with KapanRouter as "aave"`);

  // Temporarily disable Etherscan verification for v2 deploys
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    await verifyContract(hre, aaveGatewayWrite.address, [
      kapanRouter.address,
      POOL_ADDRESSES_PROVIDER,
      REFERRAL_CODE,
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
