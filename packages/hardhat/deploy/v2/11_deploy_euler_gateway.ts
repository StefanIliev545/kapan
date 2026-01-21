// Deploy EulerGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, safeDeploy, waitForPendingTxs, getWaitConfirmations } from "../../utils/safeExecute";

/**
 * Euler V2 deployment script.
 * Deploys Write gateway only (positions fetched via subgraph, no View gateway needed).
 *
 * Euler V2 EVC deployments (different per chain):
 * - Ethereum (1):     0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383
 * - Optimism (10):    0xbfB28650Cd13CE879E7D56569Ed4715c299823E4
 * - Unichain (130):   0x2A1176964F5D7caE5406B627Bf6166664FE83c60
 * - Base (8453):      0x5301c7dD20bD945D2013b48ed0DEE3A284ca8989
 * - Plasma (9745):    0x7bdbd0A7114aA42CA957F292145F6a931a345583
 * - Arbitrum (42161): 0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066
 * - Linea (59144):    0xd8CeCEe9A04eA3d941a959F68fb4486f23271d09
 *
 * Note: Vaults are discovered via Euler's subgraph - no on-chain market registration needed.
 */

interface ChainConfig {
  EVC: string;
}

const CONFIG: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    EVC: "0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383",
  },
  // Optimism
  10: {
    EVC: "0xbfB28650Cd13CE879E7D56569Ed4715c299823E4",
  },
  // Unichain
  130: {
    EVC: "0x2A1176964F5D7caE5406B627Bf6166664FE83c60",
  },
  // Base
  8453: {
    EVC: "0x5301c7dD20bD945D2013b48ed0DEE3A284ca8989",
  },
  // Plasma
  9745: {
    EVC: "0x7bdbd0A7114aA42CA957F292145F6a931a345583",
  },
  // Arbitrum
  42161: {
    EVC: "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066",
  },
  // Linea
  59144: {
    EVC: "0xd8CeCEe9A04eA3d941a959F68fb4486f23271d09",
  },
};

const deployEulerGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  const config = CONFIG[effectiveChainId];
  if (!config) {
    console.warn(`Euler V2: no config for chainId=${chainId} (effective: ${effectiveChainId}). Skipping deployment.`);
    return;
  }

  // Allow env override for EVC address
  const EVC_ADDRESS = process.env.EULER_EVC_ADDRESS || config.EVC;

  const kapanRouter = await get("KapanRouter");
  const WAIT = getWaitConfirmations(chainId);

  // ============ Deploy Write Gateway ============
  const eulerGatewayWrite = await safeDeploy(hre, deployer, "EulerGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, deployer, EVC_ADDRESS],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "EulerGatewayWrite"),
    waitConfirmations: WAIT,
  });

  console.log(`EulerGatewayWrite deployed to: ${eulerGatewayWrite.address}`);

  // ============ Register Gateway with Router ============
  await safeExecute(hre, deployer, "KapanRouter", "addGateway", ["euler", eulerGatewayWrite.address], { waitConfirmations: 1 });
  console.log(`EulerGatewayWrite registered with KapanRouter as "euler"`);
  // Gateway sync with AuthorizationHelper is handled by 99_sync_authorization_helper.ts to avoid nonce race conditions

  // No market registration needed - vaults are discovered via Euler's subgraph
  console.log(`✓ Euler V2 setup complete (vaults discovered via subgraph)`);

  // ============ Verification ============
  await verifyContract(hre, eulerGatewayWrite.address, [
    kapanRouter.address,
    deployer,
    EVC_ADDRESS,
  ]);

  await waitForPendingTxs(hre, deployer);
};

export default deployEulerGateway;

deployEulerGateway.tags = ["EulerGateway", "v2"];
deployEulerGateway.dependencies = ["KapanRouter"];
