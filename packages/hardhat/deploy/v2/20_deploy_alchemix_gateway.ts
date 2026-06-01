// Deploy AlchemixGatewayWrite and register all known markets for the active chain.

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, safeDeploy, waitForPendingTxs, getWaitConfirmations } from "../../utils/safeExecute";
import { ALCHEMIX_GATEWAY_NAME } from "../../utils/alchemixConstants";
import { ethers } from "hardhat";

/**
 * Alchemix V3 deployment.
 *
 * The gateway itself is address-agnostic: it stores a registry of `(alchemist, myt, underlying,
 * debtToken, positionNft)` markets, populated via `registerMarket(alchemist)`. The registry
 * pulls every dependent address from the alchemist itself, so the deploy script only needs
 * to know the alchemist instances per chain.
 */

interface ChainConfig {
  /** Alchemist V3 instances to register on this chain. One alchemist per (yieldToken, debtToken) market. */
  alchemists: { id: string; address: string }[];
  /** Aave V3 PoolAddressesProvider — used by AlchemixGatewayView to source underlying USD prices. */
  aavePoolAddressesProvider: string;
}

const CONFIG: Record<number, ChainConfig> = {
  // Arbitrum One
  42161: {
    alchemists: [
      { id: "alusd-mixUSDC", address: "0x930750a3510E703535e943E826ABa3c364fFC1De" },
      { id: "aleth-mixWETH", address: "0xDeD3A04612FF12b57317abE38e68026Fc9D28114" },
    ],
    aavePoolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  },
};

const deployAlchemixGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  const config = CONFIG[effectiveChainId];
  if (!config) {
    console.warn(`Alchemix V3: no config for chainId=${chainId} (effective: ${effectiveChainId}). Skipping.`);
    return;
  }

  const kapanRouter = await get("KapanRouter");
  const WAIT = getWaitConfirmations(chainId);

  // ============ Deploy gateway ============
  const alchemixGatewayWrite = await safeDeploy(hre, deployer, "AlchemixGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, deployer],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "AlchemixGatewayWrite"),
    waitConfirmations: WAIT,
  });
  console.log(`AlchemixGatewayWrite deployed to: ${alchemixGatewayWrite.address}`);

  // ============ Register with router ============
  await safeExecute(hre, deployer, "KapanRouter", "addGateway", [ALCHEMIX_GATEWAY_NAME, alchemixGatewayWrite.address], {
    waitConfirmations: 1,
  });
  console.log(`AlchemixGatewayWrite registered with KapanRouter as "${ALCHEMIX_GATEWAY_NAME}"`);

  // ============ Deploy gateway VIEW + register on KapanViewRouter ============
  // The view is required for trigger dispatch (LimitPriceTrigger ignores it; LtvTrigger and
  // AutoLeverageTrigger query it via KapanViewRouter for LTV / position value / asset prices).
  const alchemixGatewayView = await safeDeploy(hre, deployer, "AlchemixGatewayView", {
    from: deployer,
    args: [alchemixGatewayWrite.address, config.aavePoolAddressesProvider],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "AlchemixGatewayView"),
    waitConfirmations: WAIT,
  });
  console.log(`AlchemixGatewayView deployed to: ${alchemixGatewayView.address}`);

  await safeExecute(hre, deployer, "KapanViewRouter", "setGateway", [ALCHEMIX_GATEWAY_NAME, alchemixGatewayView.address], {
    waitConfirmations: 1,
  });
  console.log(`AlchemixGatewayView registered with KapanViewRouter as "${ALCHEMIX_GATEWAY_NAME}"`);

  // ============ Register markets ============
  // Each registerMarket call pulls MYT/underlying/debtToken/positionNft from the alchemist
  // itself and verifies IERC4626(myt).asset() == underlying — so a misconfigured alchemist
  // simply reverts here. We pre-check alchemistToMarketId so re-deploys against the same
  // (deterministic) gateway address don't try to register an already-registered market and
  // hit MarketAlreadyRegistered — that revert returns custom-error data, not a string the
  // outer try/catch can match against safely.
  const gateway = await ethers.getContractAt("AlchemixGatewayWrite", alchemixGatewayWrite.address);

  for (const market of config.alchemists) {
    const existingId: bigint = await gateway.alchemistToMarketId(market.address);
    if (existingId > 0n) {
      console.log(`• Market "${market.id}" already registered as marketId=${existingId} — skipping`);
      continue;
    }

    await safeExecute(hre, deployer, "AlchemixGatewayWrite", "registerMarket", [market.address], {
      waitConfirmations: 1,
    });
    const newId: bigint = await gateway.alchemistToMarketId(market.address);
    console.log(`✓ Registered market "${market.id}" as marketId=${newId} (alchemist=${market.address})`);
  }

  // ============ Verification ============
  await verifyContract(hre, alchemixGatewayWrite.address, [kapanRouter.address, deployer]);
  await verifyContract(hre, alchemixGatewayView.address, [alchemixGatewayWrite.address, config.aavePoolAddressesProvider]);

  await waitForPendingTxs(hre, deployer);
};

export default deployAlchemixGateway;

deployAlchemixGateway.tags = ["AlchemixGateway", "v2"];
// View depends on the view router being deployed; pull it into the dependency graph.
deployAlchemixGateway.dependencies = ["KapanRouter", "KapanViewRouter"];
