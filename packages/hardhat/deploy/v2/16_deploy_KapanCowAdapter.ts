import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { safeExecute, getWaitConfirmations } from "../../utils/safeExecute";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";

/**
 * Deploy KapanCowAdapter for CoW Protocol flash loan integration
 * 
 * This adapter allows Kapan to use CoW Protocol's FlashLoanRouter
 * for flash loan orders (multiply, leverage, etc.)
 * 
 * Only deploys on chains where CoW Protocol (ComposableCoW + HooksTrampoline) is available
 * AND we have flash loan providers configured.
 * 
 * Supports:
 * - Morpho Blue (0% fee - RECOMMENDED)
 * - Aave V3 (0.05% fee - fallback)
 */
const deployKapanCowAdapter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  // CoW Protocol FlashLoanRouter (same address on all chains via CREATE2)
  const FLASH_LOAN_ROUTER = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";

  // Morpho Blue addresses by chain (0% flash loan fee!)
  const MORPHO_BLUE: Record<number, string> = {
    1: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",     // Ethereum Mainnet
    8453: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",  // Base
    42161: "0x6c247b1F6182318877311737BaC0844bAa518F5e", // Arbitrum
  };

  // Aave V3 Pool addresses by chain (0.05% flash loan fee - fallback)
  const AAVE_POOLS: Record<number, string> = {
    1: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",     // Ethereum Mainnet
    42161: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", // Arbitrum
    8453: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",  // Base
    59144: "0x2f9bB73a8e98793e26Cb2F6C4ad037BDf1C6B269", // Linea
  };

  const morphoBlue = MORPHO_BLUE[effectiveChainId];
  const aavePool = AAVE_POOLS[effectiveChainId];
  
  if (!morphoBlue && !aavePool) {
    console.log(`⚠️ No flash loan providers configured for chain ${effectiveChainId}, skipping KapanCowAdapter deployment`);
    return;
  }

  const WAIT = getWaitConfirmations(chainId);

  console.log(`\n🐄 Deploying KapanCowAdapter on chain ${effectiveChainId}...`);

  const result = await deploy("KapanCowAdapter", {
    from: deployer,
    args: [FLASH_LOAN_ROUTER, deployer],
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "KapanCowAdapter"),
    waitConfirmations: WAIT,
  });

  console.log(`✅ KapanCowAdapter deployed at ${result.address}`);

  // Configure Morpho Blue as primary lender (0% fee!)
  if (morphoBlue) {
    console.log(`   Setting Morpho Blue ${morphoBlue} as allowed lender (0% fee)...`);
    await safeExecute(hre, deployer, "KapanCowAdapter", "setMorphoLender", [morphoBlue, true], { log: true, gasLimit: 150000, waitConfirmations: WAIT });
    console.log(`   ✅ Morpho Blue configured`);
  }

  // Configure Aave as fallback lender (0.05% fee)
  if (aavePool) {
    console.log(`   Setting Aave pool ${aavePool} as allowed lender (0.05% fee)...`);
    await safeExecute(hre, deployer, "KapanCowAdapter", "setAaveLender", [aavePool, true], { log: true, gasLimit: 150000, waitConfirmations: WAIT });
    console.log(`   ✅ Aave pool configured`);
  }
};

export default deployKapanCowAdapter;
deployKapanCowAdapter.tags = ["KapanCowAdapter", "v2"];
deployKapanCowAdapter.dependencies = [];
