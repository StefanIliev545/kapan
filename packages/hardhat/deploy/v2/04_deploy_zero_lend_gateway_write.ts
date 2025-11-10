// Deploy ZeroLendGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

/**
 * Gate deployment by a per-chain address map only.
 * If the current chainId isn't present, we skip deployment.
 * ZeroLend reuses Aave contracts for now.
 */
const deployZeroLendGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  // ---- Address map (Linea + Base). No chain in map => skip.
  const MAP: Record<number, { PROVIDER: string; UI: string; REFERRAL: number }> = {
    59144: {
      PROVIDER: "0xC44827C51d00381ed4C52646aeAB45b455d200eB", // ZeroLend PoolAddressesProvider (Linea)
      UI:       "0x81b3184A3B5d4612F2c26A53Da8D99474B91B2D2", // ZeroLend UiPoolDataProviderV3 (Linea)
      REFERRAL: 0,
    },
    8453: {
      PROVIDER: "0x5213ab3997a596c75Ac6ebF81f8aEb9cf9A31007", // ZeroLend PoolAddressesProvider (Base)
      UI:       "0x0A1198DDb5247a283F76077Bb1E45e5858ee100b", // ZeroLend UiPoolDataProviderV3 (Base)
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
  const REFERRAL_CODE = Number(process.env.ZEROLEND_REFERRAL_CODE ?? entry.REFERRAL);

  const kapanRouter = await get("KapanRouter");
  const WAIT = 3;

  // Reusing AaveGatewayWrite contract for now, but naming the deployment ZeroLendGatewayWrite
  const zeroLendGatewayWrite = await deploy("ZeroLendGatewayWrite", {
    contract: "AaveGatewayWrite",
    from: deployer,
    args: [kapanRouter.address, POOL_ADDRESSES_PROVIDER, REFERRAL_CODE],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "ZeroLendGatewayWrite"),
    waitConfirmations: WAIT,
  });

  console.log(`ZeroLendGatewayWrite deployed to: ${zeroLendGatewayWrite.address}`);

  // Reusing AaveGatewayView contract for now, but naming the deployment ZeroLendGatewayView
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

  await execute("KapanRouter", { from: deployer, waitConfirmations: 5 }, "addGateway", "zerolend", zeroLendGatewayWrite.address);
  console.log(`ZeroLendGatewayWrite registered with KapanRouter as "zerolend"`);

  // Temporarily disable Etherscan verification for v2 deploys
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    await verifyContract(hre, zeroLendGatewayWrite.address, [
      kapanRouter.address,
      POOL_ADDRESSES_PROVIDER,
      REFERRAL_CODE,
    ]);
    await verifyContract(hre, zeroLendGatewayView.address, [
      POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER,
    ]);
  }
};

export default deployZeroLendGatewayWrite;

deployZeroLendGatewayWrite.tags = ["ZeroLendGatewayWrite", "v2"];
deployZeroLendGatewayWrite.dependencies = ["KapanRouter"];

