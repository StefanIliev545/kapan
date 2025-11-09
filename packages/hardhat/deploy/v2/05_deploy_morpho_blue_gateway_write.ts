// Deploy MorphoBlueGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

/**
 * Gate deployment by a per-chain address map only.
 * If the current chainId isn't present, we skip deployment.
 * Morpho Blue requires market context (morpho address + marketId) which is passed via instruction context.
 */
const deployMorphoBlueGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  return;
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  // ---- Address map (Ethereum mainnet, Arbitrum, Base, Optimism). No chain in map => skip.
  // Note: Morpho Blue deployments are per-market, so we don't need specific addresses here
  // The morpho address and marketId are passed via instruction context
  const MAP: Record<number, boolean> = {
    1: true,      // Ethereum mainnet
    42161: true,  // Arbitrum
    8453: true,   // Base
    10: true,     // Optimism
  };

  if (!MAP[chainId]) {
    console.warn(`MorphoBlue: no deployment for chainId=${chainId}. Skipping deployment.`);
    return;
  }

  const kapanRouter = await get("KapanRouter");
  const WAIT = 3;

  const morphoBlueGatewayWrite = await deploy("MorphoBlueWrite", {
    from: deployer,
    args: [kapanRouter.address],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "MorphoBlueWrite"),
    waitConfirmations: WAIT,
  });

  console.log(`MorphoBlueWrite deployed to: ${morphoBlueGatewayWrite.address}`);

  const morphoBlueGatewayView = await deploy("MorphoBlueView", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "MorphoBlueView"),
    waitConfirmations: WAIT,
  });

  console.log(`MorphoBlueView deployed to: ${morphoBlueGatewayView.address}`);

  await execute("KapanRouter", { from: deployer, waitConfirmations: 5 }, "addGateway", "morpho", morphoBlueGatewayWrite.address);
  console.log(`MorphoBlueWrite registered with KapanRouter as "morpho"`);

  // Temporarily disable Etherscan verification for v2 deploys
  if (!["hardhat", "localhost"].includes(hre.network.name)) {
    await verifyContract(hre, morphoBlueGatewayWrite.address, [
      kapanRouter.address,
    ]);
    await verifyContract(hre, morphoBlueGatewayView.address, []);
  }
};

export default deployMorphoBlueGatewayWrite;

deployMorphoBlueGatewayWrite.tags = ["MorphoBlueWrite", "v2"];
deployMorphoBlueGatewayWrite.dependencies = ["KapanRouter"];

