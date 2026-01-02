// Deploy KapanRouter v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, getWaitConfirmations } from "../../utils/safeExecute";

/**
 * Router is chain-agnostic; we deploy it always.
 * Balancer vaults and Aave pools are set only if the chain is recognized in the map.
 * For Hardhat (31337), uses FORK_CHAIN env to determine which addresses to use.
 * 
 * IMPORTANT: When adding/removing chains for flash loan providers, also update:
 * - packages/nextjs/utils/chainFeatures.ts (static flash loan provider availability)
 */
const deployKapanRouter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers } = hre;
  const WAIT = getWaitConfirmations(chainId);

  const BALANCER: Record<number, { VAULT_V2?: string; VAULT_V3?: string }> = {
    // Ethereum mainnet
    1: {
      VAULT_V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      VAULT_V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    },
    // Arbitrum
    42161: {
      VAULT_V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      VAULT_V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    },
    // Base
    8453: {
      VAULT_V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      VAULT_V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    },
    // Optimism
    10: {
      VAULT_V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      VAULT_V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    },
  };

  // Aave V3 PoolAddressesProvider map (same as in AaveGatewayWrite deployment)
  const AAVE: Record<number, { PROVIDER: string }> = {
    // Ethereum mainnet v3 Core market
    1: {
      // PoolAddressesProvider for Ethereum V3 Core Market
      PROVIDER: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
    },
    42161: {
      PROVIDER: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb", // Arbitrum v3 PoolAddressesProvider
    },
    8453: {
      PROVIDER: "0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d", // Base v3 PoolAddressesProvider
    },
    10: {
      PROVIDER: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb", // Optimism v3 PoolAddressesProvider
    },
    59144: {
      PROVIDER: "0x89502c3731F69DDC95B65753708A07F8Cd0373F4", // Linea v3 PoolAddressesProvider
    },
    9745: {
      PROVIDER: "0x061D8e131F26512348ee5FA42e2DF1bA9d6505E9", // Plasma v3 PoolAddressesProvider
    },
  };

  // Morpho Blue singleton addresses (for flash loans)
  const MORPHO: Record<number, { MORPHO: string }> = {
    // Ethereum mainnet
    1: {
      MORPHO: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    },
    // Base
    8453: {
      MORPHO: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    },
    // Arbitrum
    42161: {
      MORPHO: "0x6c247b1F6182318877311737BaC0844bAa518F5e",
    },
    // Optimism
    10: {
      MORPHO: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    },
  };

  const kapanRouter = await deploy("KapanRouter", {
    from: deployer,
    args: [deployer], // owner
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "KapanRouter"),
    waitConfirmations: WAIT,
  });

  console.log(`KapanRouter deployed to: ${kapanRouter.address}`);

  const v2 = process.env.BALANCER_VAULT2 || BALANCER[effectiveChainId]?.VAULT_V2;
  const v3 = process.env.BALANCER_VAULT3 || BALANCER[effectiveChainId]?.VAULT_V3;

  if (v2) {
    await safeExecute(hre, deployer, "KapanRouter", "setBalancerV2", [v2], { waitConfirmations: 1 });
    console.log(`Balancer V2 provider set: ${v2}`);
  } else {
    console.warn(`No Balancer V2 for chainId=${chainId}. Skipping setBalancerV2.`);
  }

  if (v3) {
    await safeExecute(hre, deployer, "KapanRouter", "setBalancerV3", [v3], { waitConfirmations: 1 });
    console.log(`Balancer V3 vault set: ${v3}`);
  } else {
    console.warn(`No Balancer V3 for chainId=${chainId}. Skipping setBalancerV3.`);
  }

  // Set Aave V3 pool for flash loans if available
  const aaveEntry = AAVE[effectiveChainId];
  if (aaveEntry) {
    const providerAddress = process.env.AAVE_POOL_ADDRESSES_PROVIDER || aaveEntry.PROVIDER;
    try {
      // Get the pool address from the PoolAddressesProvider
      const provider = await ethers.getContractAt(
        "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol:IPoolAddressesProvider",
        providerAddress
      );
      const poolAddress = await provider.getPool();

      if (poolAddress && poolAddress !== ethers.ZeroAddress) {
        await safeExecute(hre, deployer, "KapanRouter", "setAavePool", [poolAddress], { waitConfirmations: 1 });
        console.log(`Aave pool set: ${poolAddress}`);
      } else {
        console.warn(`Aave pool address is zero for chainId=${chainId}. Skipping setAavePool.`);
      }
    } catch (error) {
      console.warn(`Failed to set Aave pool for chainId=${chainId}:`, error);
    }
  } else {
    console.warn(`No Aave for chainId=${chainId}. Skipping setAavePool.`);
  }

  // Set Morpho Blue for flash loans if available
  const morphoEntry = MORPHO[effectiveChainId];
  if (morphoEntry) {
    const morphoAddress = process.env.MORPHO_BLUE_ADDRESS || morphoEntry.MORPHO;
    try {
      await safeExecute(hre, deployer, "KapanRouter", "setMorphoBluePool", [morphoAddress], { waitConfirmations: 1 });
      console.log(`Morpho Blue pool set: ${morphoAddress}`);
    } catch (error) {
      console.warn(`Failed to set Morpho Blue pool for chainId=${chainId}:`, error);
    }
  } else {
    console.warn(`No Morpho Blue for chainId=${chainId}. Skipping setMorphoBluePool.`);
  }

  // Verification is handled by verifyContract utility (checks DISABLE_VERIFICATION env var)
  await verifyContract(hre, kapanRouter.address, [deployer]);
};

export default deployKapanRouter;

deployKapanRouter.tags = ["KapanRouter", "v2"];
deployKapanRouter.dependencies = [];
