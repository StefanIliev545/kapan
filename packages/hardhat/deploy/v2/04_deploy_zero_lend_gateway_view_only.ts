// Deploy ZeroLendGatewayView only (v2)
// Use this script to deploy only the view contract on Linea

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

/**
 * Deploy only the ZeroLendGatewayView contract on Linea
 * This is useful when you only need to redeploy the view contract
 */
const deployZeroLendGatewayViewOnly: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Only deploy on Linea
  if (chainId !== 59144) {
    console.warn(`ZeroLendGatewayView: Only deploying on Linea (chainId 59144), current chainId=${chainId}. Skipping.`);
    return;
  }

  // ---- Address map (Linea only)
  const MAP: Record<number, { PROVIDER: string; UI: string; REFERRAL: number }> = {
    59144: {
      PROVIDER: "0xC44827C51d00381ed4C52646aeAB45b455d200eB", // ZeroLend PoolAddressesProvider (Linea)
      UI:       "0x81b3184A3B5d4612F2c26A53Da8D99474B91B2D2", // ZeroLend UiPoolDataProviderV3 (Linea)
      REFERRAL: 0,
    },
  };

  const entry = MAP[chainId];
  if (!entry) {
    console.warn(`ZeroLend: no address map for chainId=${chainId}. Skipping deployment.`);
    return;
  }

  // Env can override addresses for recognized chains
  const POOL_ADDRESSES_PROVIDER = process.env.ZEROLEND_POOL_ADDRESSES_PROVIDER || entry.PROVIDER;
  const UI_POOL_DATA_PROVIDER  = process.env.ZEROLEND_UI_POOL_DATA_PROVIDER || entry.UI;

  const WAIT = 3;

  // Deploy only the view contract
  const zeroLendGatewayView = await deploy("ZeroLendGatewayView", {
    contract: "AaveGatewayViewBase",
    from: deployer,
    args: [POOL_ADDRESSES_PROVIDER, UI_POOL_DATA_PROVIDER],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "ZeroLendGatewayView"),
    waitConfirmations: WAIT,
  });

  console.log(`ZeroLendGatewayView deployed to: ${zeroLendGatewayView.address}`);

  // Temporarily disable Etherscan verification for v2 deploys
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    await verifyContract(hre, zeroLendGatewayView.address, [
      POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER,
    ]);
  }
};

export default deployZeroLendGatewayViewOnly;

deployZeroLendGatewayViewOnly.tags = ["ZeroLendGatewayViewOnly", "v2"];
deployZeroLendGatewayViewOnly.dependencies = [];

