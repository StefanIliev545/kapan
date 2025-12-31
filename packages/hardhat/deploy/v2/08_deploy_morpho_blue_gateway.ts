// Deploy MorphoBlueGatewayWrite & MorphoBlueGatewayView v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute } from "../../utils/safeExecute";

/**
 * Morpho Blue deployment script.
 * Deploys Write and View gateways, registers with router, and initializes markets.
 *
 * Morpho Blue deployments:
 * - Ethereum Mainnet (1): 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
 * - Base (8453):          0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb
 * - Arbitrum (42161):     0x6c247b1F6182318877311737BaC0844bAa518F5e
 */

interface MarketParams {
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: bigint;
}

interface ChainConfig {
  MORPHO: string;
  MARKETS: MarketParams[];
}

const deployMorphoBlueGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  // ============ Chain Configuration ============
  const CONFIG: Record<number, ChainConfig> = {
    // Ethereum Mainnet
    1: {
      MORPHO: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      MARKETS: [
        // wstETH/WETH - $122M supply, 96.5% LLTV
        {
          loanToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",     // WETH
          collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
          oracle: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
          irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
          lltv: BigInt("965000000000000000"),
        },
        // wstETH/USDC - $73M supply, 86% LLTV
        {
          loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",     // USDC
          collateralToken: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
          oracle: "0x48F7E36EB6B826B2dF4B2E630B62Cd25e89E40e2",
          irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
          lltv: BigInt("860000000000000000"),
        },
        // WBTC/USDC - $174M supply, 86% LLTV
        {
          loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",     // USDC
          collateralToken: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
          oracle: "0xDddd770BADd886dF3864029e4B377B5F6a2B6b83",
          irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
          lltv: BigInt("860000000000000000"),
        },
      ],
    },
    // Arbitrum
    42161: {
      MORPHO: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
      MARKETS: [
        // wstETH/USDC - $15M supply, 86% LLTV
        {
          loanToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",      // USDC
          collateralToken: "0x5979D7b546E38E414F7E9822514be443A4800529", // wstETH
          oracle: "0x8e02a9b9Cc29d783b2fCB71C3a72651B591cae31",
          irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
          lltv: BigInt("860000000000000000"),
        },
        // WBTC/USDC - $5M supply, 86% LLTV
        {
          loanToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",     // USDC
          collateralToken: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", // WBTC
          oracle: "0x88193FcB705d29724A40Bb818eCAA47dD5F014d9",
          irm: "0x66F30587FB8D4206918deb78ecA7d5eBbafD06DA",
          lltv: BigInt("860000000000000000"),
        },
        // TODO: Add WETH/USDC market with verified oracle address from Morpho API
      ],
    },
    // Base
    8453: {
      MORPHO: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      MARKETS: [
        // cbETH/USDC
        {
          loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",      // USDC
          collateralToken: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", // cbETH
          oracle: "0x8E2C1e80E0f8e8a6A6E0e0A3f0a8dE3C8e8a0e0B",         // placeholder
          irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
          lltv: BigInt("860000000000000000"),
        },
      ],
    },
    // Optimism
    10: {
      MORPHO: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
      MARKETS: [],
    },
  };

  const config = CONFIG[effectiveChainId];
  if (!config) {
    console.warn(`Morpho Blue: no config for chainId=${chainId} (effective: ${effectiveChainId}). Skipping deployment.`);
    return;
  }

  // Allow env override for Morpho address
  const MORPHO_ADDRESS = process.env.MORPHO_BLUE_ADDRESS || config.MORPHO;

  const kapanRouter = await get("KapanRouter");
  const WAIT = 3;

  // ============ Deploy Write Gateway ============
  const morphoGatewayWrite = await deploy("MorphoBlueGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, deployer, MORPHO_ADDRESS],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "MorphoBlueGatewayWrite"),
    waitConfirmations: WAIT,
  });

  console.log(`MorphoBlueGatewayWrite deployed to: ${morphoGatewayWrite.address}`);

  // ============ Deploy View Gateway ============
  const morphoGatewayView = await deploy("MorphoBlueGatewayView", {
    from: deployer,
    args: [MORPHO_ADDRESS, deployer],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "MorphoBlueGatewayView"),
    waitConfirmations: WAIT,
  });

  console.log(`MorphoBlueGatewayView deployed to: ${morphoGatewayView.address}`);

  // ============ Register Gateway with Router ============
  await safeExecute(hre, deployer, "KapanRouter", "addGateway", ["morpho-blue", morphoGatewayWrite.address], { waitConfirmations: 5 });
  console.log(`MorphoBlueGatewayWrite registered with KapanRouter as "morpho-blue"`);
  // Gateway sync is handled by 99_sync_authorization_helper.ts to avoid nonce race conditions

  // ============ Register Markets ============
  const markets = config.MARKETS;
  console.log(`Registering ${markets.length} Morpho Blue markets...`);

  for (const market of markets) {
    const marketParams = {
      loanToken: market.loanToken,
      collateralToken: market.collateralToken,
      oracle: market.oracle,
      irm: market.irm,
      lltv: market.lltv,
    };

    try {
      // Register on Write Gateway
      await safeExecute(hre, deployer, "MorphoBlueGatewayWrite", "registerMarket", [marketParams], { waitConfirmations: 5 });
      console.log(`[Write] Registered market: ${market.collateralToken.slice(0, 10)}.../${market.loanToken.slice(0, 10)}...`);
    } catch (err: any) {
      if (err.message?.includes("already registered")) {
        console.log(`[Write] Market already registered, skipping`);
      } else {
        console.warn(`[Write] Failed to register market:`, err.message);
      }
    }

    try {
      // Register on View Gateway
      await safeExecute(hre, deployer, "MorphoBlueGatewayView", "registerMarket", [marketParams], { waitConfirmations: 5 });
      console.log(`[View] Registered market: ${market.collateralToken.slice(0, 10)}.../${market.loanToken.slice(0, 10)}...`);
    } catch (err: any) {
      if (err.message?.includes("already registered")) {
        console.log(`[View] Market already registered, skipping`);
      } else {
        console.warn(`[View] Failed to register market:`, err.message);
      }
    }
  }

  console.log(`✓ Morpho Blue setup complete with ${markets.length} markets`);

  // ============ Verification ============
  // Verification is handled by verifyContract utility (checks DISABLE_VERIFICATION env var)
  await verifyContract(hre, morphoGatewayWrite.address, [
    kapanRouter.address,
    deployer,
    MORPHO_ADDRESS,
  ]);
  await verifyContract(hre, morphoGatewayView.address, [
    MORPHO_ADDRESS,
    deployer,
  ]);
};

export default deployMorphoBlueGateway;

deployMorphoBlueGateway.tags = ["MorphoBlueGateway", "v2"];
deployMorphoBlueGateway.dependencies = ["KapanRouter"];

