import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { safeExecute } from "../../utils/safeExecute";

/**
 * Deploy KapanCowAdapter for CoW Protocol flash loan integration
 * 
 * This adapter allows Kapan to use CoW Protocol's FlashLoanRouter
 * for flash loan orders (multiply, leverage, etc.)
 * 
 * Supports:
 * - Morpho Blue (0% fee - RECOMMENDED)
 * - Aave V3 (0.05% fee - fallback)
 */
const deployKapanCowAdapter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const chainId = await hre.getChainId();

  // CoW Protocol FlashLoanRouter (same address on all chains via CREATE2)
  const FLASH_LOAN_ROUTER = "0x9da8B48441583a2b93e2eF8213aAD0EC0b392C69";

  // Morpho Blue addresses by chain (0% flash loan fee!)
  const MORPHO_BLUE: Record<string, string> = {
    "1": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",     // Ethereum Mainnet
    "8453": "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",  // Base
  };

  // Aave V3 Pool addresses by chain (0.05% flash loan fee - fallback)
  const AAVE_POOLS: Record<string, string> = {
    "1": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",     // Ethereum Mainnet
    "42161": "0x794a61358D6845594F94dc1DB02A252b5b4814aD", // Arbitrum
    "8453": "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",  // Base
    "10": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",    // Optimism
    "59144": "0x2f9bB73a8e98793e26Cb2F6C4ad037BDf1C6B269", // Linea
    // Hardhat fork (uses Arbitrum addresses when forking Arbitrum)
    "31337": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  };

  const morphoBlue = MORPHO_BLUE[chainId];
  const aavePool = AAVE_POOLS[chainId];
  
  if (!morphoBlue && !aavePool) {
    console.log(`⚠️ No flash loan providers configured for chain ${chainId}, skipping KapanCowAdapter deployment`);
    return;
  }

  console.log(`\n🐄 Deploying KapanCowAdapter on chain ${chainId}...`);

  const result = await deploy("KapanCowAdapter", {
    from: deployer,
    args: [FLASH_LOAN_ROUTER, deployer],
    log: true,
    autoMine: true,
  });

  console.log(`✅ KapanCowAdapter deployed at ${result.address}`);

  // Configure Morpho Blue as primary lender (0% fee!)
  if (morphoBlue) {
    console.log(`   Setting Morpho Blue ${morphoBlue} as allowed lender (0% fee)...`);
    await safeExecute(hre, deployer, "KapanCowAdapter", "setMorphoLender", [morphoBlue, true], { log: true, gasLimit: 150000 });
    console.log(`   ✅ Morpho Blue configured`);
  }

  // Configure Aave as fallback lender (0.05% fee)
  if (aavePool) {
    console.log(`   Setting Aave pool ${aavePool} as allowed lender (0.05% fee)...`);
    await safeExecute(hre, deployer, "KapanCowAdapter", "setAaveLender", [aavePool, true], { log: true, gasLimit: 150000 });
    console.log(`   ✅ Aave pool configured`);
  }
};

export default deployKapanCowAdapter;
deployKapanCowAdapter.tags = ["KapanCowAdapter", "v2"];
deployKapanCowAdapter.dependencies = [];
